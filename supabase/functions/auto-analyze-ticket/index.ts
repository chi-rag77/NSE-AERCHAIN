// ============================================================================
// auto-analyze-ticket — Supabase Edge Function (Deno)
//
// The proactive counterpart to analyze-ticket. Freshdesk fires a webhook the
// moment a ticket gets its FIRST customer reply; this function finds the most
// semantically similar tickets that were ALREADY RESOLVED, and posts a private
// internal note on the new ticket saying how those were solved, how long they
// took, and who solved them — so the agent starts from prior art instead of
// from scratch.
//
// Design principle (inherited from analyze-ticket): the model never invents a
// number. Similarity, time-to-resolve, the median, and the recommended
// assignee are all computed here from real rows BEFORE the prompt is built.
// Gemini only turns those facts into prose. Every ticket number in the note is
// a real ticket the agent can open.
//
// Cost + duplicate control: the very first thing this does after cheap
// validation is INSERT the ticket id into ticket_auto_analysis. That table's
// PRIMARY KEY is the rate limit — a replayed or duplicated webhook loses the
// race, gets a 200, and costs nothing. One analysis per ticket, ever (a run
// that genuinely failed is retryable under a cooldown; see claimTicket).
//
// Always returns HTTP 200 to Freshdesk (except on a bad shared secret) so a
// failure on our side never turns into a Freshdesk webhook retry storm. The
// real outcome is in the JSON body and in the ticket_auto_analysis row.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY,
//                   FRESHDESK_DOMAIN, FRESHDESK_API_KEY
// Optional secrets: GEMINI_MODEL                  (default "gemini-3.6-flash")
//                   GEMINI_EMBED_MODEL            (default "gemini-embedding-001")
//                   AUTO_ANALYZE_WEBHOOK_SECRET   (if set, required on every call)
//                   AUTO_ANALYZE_MIN_SIMILARITY   (default 0.68)
//                   AUTO_ANALYZE_MAX_MATCHES      (default 5)
//
// Modes:
//   POST {...freshdesk webhook...}   → analyse one ticket (the normal path)
//   POST {"mode":"backfill"}         → embed resolved tickets only, no
//                                      analysis, no Freshdesk writes. Run once
//                                      after deploying, then on a slow cron.
//   POST {..., "dry_run": true}      → run the full pipeline (embed, search,
//                                      synthesise) for one ticket but skip the
//                                      claim AND the Freshdesk note — the
//                                      would-be note comes back in the JSON
//                                      response instead. For manually testing
//                                      against a real ticket with zero risk of
//                                      writing to Freshdesk or burning the
//                                      one-shot rate limit on that ticket.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-auto-analyze-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ─── Domain constants (mirrors src/lib/tickets.ts STATUS_META /
// SLA_DONE_STATUSES — kept local because edge functions can't import frontend
// code; analyze-ticket does exactly the same) ───────────────────────────────
const DONE_STATUSES = [4, 5];
const STATUS_LABEL: Record<number, string> = {
  2: "Open", 3: "Pending", 4: "Resolved", 5: "Closed",
  7: "On Tech", 8: "Waiting on Customer", 9: "On Product",
};
const statusLabel = (s: number) => STATUS_LABEL[s] ?? `Status ${s}`;

// Freshdesk gives webhooks ~30s before it considers the delivery failed. We
// budget below that and drop optional work (corpus backfill) as we approach it.
const WALL_CLOCK_BUDGET_MS = 25_000;

// Embedding geometry — must stay in lockstep with migration 0009's vector(768).
const EMBED_DIMS = 768;
// One webhook should never turn into an unbounded embedding bill. The corpus is
// topped up a slice at a time here; `mode: "backfill"` does the bulk work.
const WEBHOOK_BACKFILL_LIMIT = 24;
const BACKFILL_BATCH = 24;
const BACKFILL_MODE_LIMIT = 400;

// A failed run leaves its claim row behind. Without this, one transient Gemini
// 503 would blacklist the ticket forever; with it, a later webhook (or a manual
// re-fire) can re-claim a failed row up to MAX_ATTEMPTS times.
const RETRY_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

// ─── Small helpers ──────────────────────────────────────────────────────────
const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const snippet = (text: string | null | undefined, max = 600) => clean(text).slice(0, max);
const round2 = (n: number) => Math.round(n * 100) / 100;

const fmtDuration = (mins: number) => {
  const m = Math.max(0, Math.round(mins));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
};

const median = (nums: number[]): number | null => {
  const sorted = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Webhook payload parsing ────────────────────────────────────────────────
// Freshdesk webhook bodies are authored by whoever configured the automation
// rule, so the shape is only a convention, not a contract. The documented
// template nests everything under `freshdesk_webhook`, but people flatten it,
// and the id key gets named half a dozen ways. Accept all of them rather than
// silently no-op'ing on a ticket because someone typed `id` instead of
// `ticket_id`.
interface ParsedWebhook {
  ticketId: number | null;
  statusHint: number | null;
  conversationIdHint: number | null;
}

const TICKET_ID_KEYS = ["ticket_id", "ticketId", "id", "freshdesk_ticket_id", "ticket_ID"];
const STATUS_KEYS = ["ticket_status", "status", "ticket_status_id"];
const CONVO_KEYS = ["first_customer_reply_id", "conversation_id", "note_id", "latest_public_comment_id"];

function pickNumber(bag: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const raw = bag?.[k];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function parseWebhook(body: any): ParsedWebhook {
  const bag = (body && typeof body === "object" && typeof body.freshdesk_webhook === "object" && body.freshdesk_webhook)
    ? { ...body.freshdesk_webhook, ...body }
    : (body ?? {});
  // Freshdesk can send the status as a label ("Open") rather than a code.
  let statusHint = pickNumber(bag, STATUS_KEYS);
  if (statusHint === null) {
    const label = String(bag?.ticket_status ?? bag?.status ?? "").trim().toLowerCase();
    const found = Object.entries(STATUS_LABEL).find(([, v]) => v.toLowerCase() === label);
    if (found) statusHint = Number(found[0]);
  }
  return {
    ticketId: pickNumber(bag, TICKET_ID_KEYS),
    statusHint,
    conversationIdHint: pickNumber(bag, CONVO_KEYS),
  };
}

// ─── Freshdesk API (same auth/pagination shape as sync-freshdesk) ───────────
class Freshdesk {
  private headers: Record<string, string>;
  private base: string;

  constructor(domain: string, apiKey: string) {
    const host = domain.includes(".") ? domain : `${domain}.freshdesk.com`;
    this.base = `https://${host}/api/v2`;
    this.headers = { Authorization: "Basic " + btoa(`${apiKey}:X`), "Content-Type": "application/json" };
  }

  async ticket(id: number) {
    const res = await fetch(`${this.base}/tickets/${id}?include=requester,company,stats`, { headers: this.headers });
    if (!res.ok) throw new Error(`Freshdesk ticket ${id}: ${res.status} ${await res.text()}`);
    return await res.json();
  }

  /** Whole thread, every page — a truncated thread silently loses the reply we're triggering on. */
  async conversations(id: number, maxPages = 5) {
    const out: any[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(`${this.base}/tickets/${id}/conversations?per_page=100&page=${page}`, { headers: this.headers });
      if (!res.ok) throw new Error(`Freshdesk conversations ${id}: ${res.status} ${await res.text()}`);
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  /** Private note — visible to agents, never to the requester. */
  async addPrivateNote(id: number, html: string): Promise<number | null> {
    const res = await fetch(`${this.base}/tickets/${id}/notes`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ body: html, private: true, incoming: false }),
    });
    if (!res.ok) throw new Error(`Freshdesk note ${id}: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data?.id ?? null;
  }
}

// ─── Gemini embeddings ──────────────────────────────────────────────────────
// gemini-embedding-001 only returns unit-length vectors at its native 3072
// dims. At any truncated outputDimensionality (768 here) Google's own guidance
// is that the caller must L2-normalise — skip this and cosine distance in
// Postgres is quietly, subtly wrong rather than obviously broken.
function l2normalize(values: number[]): number[] {
  let sum = 0;
  for (const v of values) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!norm || !Number.isFinite(norm)) return values;
  return values.map((v) => v / norm);
}

const toVectorLiteral = (values: number[]) => `[${values.join(",")}]`;

async function embedTexts(apiKey: string, model: string, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        // SEMANTIC_SIMILARITY (not RETRIEVAL_*) — both sides of this comparison
        // are the same kind of object (a support ticket), and both are embedded
        // from the same template, so it is symmetric similarity, not asymmetric
        // query→document retrieval.
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: EMBED_DIMS,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data?.embeddings ?? [];
  if (raw.length !== texts.length) throw new Error(`Gemini embed returned ${raw.length} vectors for ${texts.length} inputs`);
  return raw.map((e: any) => l2normalize(e?.values ?? []));
}

/**
 * The exact text that gets embedded. Identical template for the probe ticket
 * and for every ticket in the corpus — comparing differently-composed texts is
 * the classic way to get a semantic search that "works" but ranks badly.
 * Conversation replies are deliberately NOT included: the description is the
 * customer's actual problem statement, while replies are mostly logistics
 * ("any update?"), and keeping the text a pure function of the ticket row is
 * what makes content_hash a reliable "needs re-embedding" signal.
 */
function embeddingText(t: { subject?: string; description?: string; ticket_type?: string | null; module?: string | null; sub_type?: string | null }) {
  return [
    `Subject: ${clean(t.subject) || "(none)"}`,
    `Type: ${clean(t.ticket_type) || "Unclassified"}`,
    `Module: ${clean(t.module) || "Unspecified"}`,
    `Issue type: ${clean(t.sub_type) || "Unspecified"}`,
    `Description: ${snippet(t.description, 4000) || "(none)"}`,
  ].join("\n");
}

/** Embed one ticket if its text changed (or it was never embedded). Returns true if a Gemini call happened. */
async function ensureEmbedding(admin: any, apiKey: string, model: string, ticket: any): Promise<boolean> {
  const text = embeddingText(ticket);
  const hash = await sha256(`${model}|${EMBED_DIMS}|${text}`);
  const { data: existing } = await admin
    .from("ticket_embeddings").select("content_hash").eq("ticket_id", ticket.id).maybeSingle();
  if (existing?.content_hash === hash) return false;

  const [vector] = await embedTexts(apiKey, model, [text]);
  await admin.from("ticket_embeddings").upsert({
    ticket_id: ticket.id,
    embedding: toVectorLiteral(vector),
    content_hash: hash,
    char_count: text.length,
    model,
    embedded_at: new Date().toISOString(),
  }, { onConflict: "ticket_id" });
  return true;
}

/**
 * Top up the searchable corpus: resolved tickets with no (or a stale)
 * embedding. Bounded by both a row cap and the wall-clock deadline, because
 * this runs inside a webhook whose response Freshdesk is timing.
 */
async function backfillEmbeddings(
  admin: any, apiKey: string, model: string, limit: number, deadline: number,
): Promise<{ embedded: number; remaining: number }> {
  const { data: candidates } = await admin
    .from("tickets")
    .select("id, subject, description, ticket_type, module, sub_type")
    .in("status", DONE_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(BACKFILL_MODE_LIMIT);

  const rows = candidates ?? [];
  if (!rows.length) return { embedded: 0, remaining: 0 };

  // Fetch the whole hash index rather than an `.in(...)` over 400 ids — that
  // filter goes into the URL, and a few thousand characters of bigints is a
  // needless flirtation with the request-line limit. One row per ticket makes
  // this table small enough to read outright.
  const { data: known } = await admin
    .from("ticket_embeddings").select("ticket_id, content_hash").limit(20_000);
  const knownHash = new Map<number, string>((known ?? []).map((k: any) => [k.ticket_id, k.content_hash]));

  const pending: { row: any; text: string; hash: string }[] = [];
  for (const row of rows) {
    const text = embeddingText(row);
    const hash = await sha256(`${model}|${EMBED_DIMS}|${text}`);
    if (knownHash.get(row.id) === hash) continue;
    pending.push({ row, text, hash });
  }

  let embedded = 0;
  const target = pending.slice(0, limit);
  for (let i = 0; i < target.length; i += BACKFILL_BATCH) {
    if (Date.now() > deadline) break;
    const batch = target.slice(i, i + BACKFILL_BATCH);
    const vectors = await embedTexts(apiKey, model, batch.map((b) => b.text));
    const now = new Date().toISOString();
    const { error } = await admin.from("ticket_embeddings").upsert(
      batch.map((b, j) => ({
        ticket_id: b.row.id,
        embedding: toVectorLiteral(vectors[j]),
        content_hash: b.hash,
        char_count: b.text.length,
        model,
        embedded_at: now,
      })),
      { onConflict: "ticket_id" },
    );
    if (error) throw error;
    embedded += batch.length;
  }
  return { embedded, remaining: Math.max(0, pending.length - embedded) };
}

// ─── Deterministic facts (no model involved) ────────────────────────────────
interface SimilarTicket {
  ticket_id: number;
  subject: string;
  similarity: number;
  status: number;
  priority: number;
  ticket_type: string | null;
  module: string | null;
  sub_type: string | null;
  responder_id: number | null;
  responder_name: string | null;
  created_at: string;
  resolved_at: string;
  resolve_minutes: number;
}

/**
 * Who to hand this to: the agent who actually closed the most similar tickets,
 * scored by summed similarity (so one 0.9 match outweighs two 0.6 matches)
 * rather than a raw headcount. Computed, never asked of the model — the model
 * only writes the sentence explaining it.
 */
function recommendAssignee(similar: SimilarTicket[]) {
  const byAgent = new Map<number, { id: number; name: string; count: number; score: number; tickets: number[] }>();
  for (const s of similar) {
    if (!s.responder_id) continue;
    const entry = byAgent.get(s.responder_id) ?? {
      id: s.responder_id, name: s.responder_name ?? `Agent ${s.responder_id}`, count: 0, score: 0, tickets: [],
    };
    entry.count += 1;
    entry.score += s.similarity;
    entry.tickets.push(s.ticket_id);
    byAgent.set(s.responder_id, entry);
  }
  const ranked = [...byAgent.values()].sort((a, b) => b.score - a.score || b.count - a.count);
  return ranked[0] ?? null;
}

/**
 * Confidence is a function of how much evidence there actually is, not a
 * number the model felt like emitting. Three inputs: how many matches cleared
 * the similarity floor, how close they are on average, and whether one agent
 * genuinely dominates the resolutions.
 */
function confidenceOf(similar: SimilarTicket[], meanSimilarity: number, assignee: { count: number } | null): "high" | "medium" | "low" {
  const n = similar.length;
  const dominant = assignee ? assignee.count / n : 0;
  if (n >= 4 && meanSimilarity >= 0.78 && dominant >= 0.5) return "high";
  if (n >= 3 && meanSimilarity >= 0.7) return "medium";
  return "low";
}

// ─── Gemini synthesis ───────────────────────────────────────────────────────
// Bump when the instructions below change meaningfully — it lands in the note
// footer so an old note is distinguishable from a new one at a glance.
const PROMPT_VERSION = "1-auto-analysis";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    root_causes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { cause: { type: "STRING" }, evidence: { type: "STRING" } },
        required: ["cause", "evidence"],
      },
    },
    resolution_steps: { type: "ARRAY", items: { type: "STRING" } },
    assignee_rationale: { type: "STRING" },
    caveat: { type: "STRING" },
  },
  required: ["headline", "root_causes", "resolution_steps", "assignee_rationale", "caveat"],
};

interface MatchContext {
  similar: SimilarTicket;
  primaryCause: string | null;
  narrative: string | null;
  preventionTip: string | null;
  agentNotes: string[];
}

function buildPrompt(
  ticket: any, firstReply: string, matches: MatchContext[],
  medianMinutes: number | null, assignee: ReturnType<typeof recommendAssignee>, confidence: string,
) {
  const lines: string[] = [];
  lines.push(`You write the opening internal note an Aerchain support agent reads when a ticket lands on their desk. Audience: agents ONLY — this note is private and the customer (NSE, a stock exchange) never sees it. Be blunt and operational, not diplomatic.`);
  lines.push(`Your entire job is to compress the resolved tickets below into "here is what this probably is and what worked last time". You are NOT solving the ticket and NOT talking to the customer.`);
  lines.push(`HARD RULES:`);
  lines.push(`  • Use ONLY the tickets, notes and numbers given below. Never invent a ticket number, an agent name, a duration, a config value, or a system name that does not appear here.`);
  lines.push(`  • Every root cause and every step must be traceable to at least one listed ticket. Cite them as #<id> inline.`);
  lines.push(`  • If the listed tickets genuinely do not agree on a cause, say so plainly in the caveat instead of manufacturing a consensus.`);
  lines.push(`  • Do not restate the similarity percentages, the median time, or the assignee name as if they were your findings — those are already printed elsewhere in the note.`);
  lines.push(``);
  lines.push(`NEW TICKET #${ticket.id} — "${clean(ticket.subject)}"`);
  lines.push(`  Type: ${clean(ticket.ticket_type) || "Unclassified"} · Module: ${clean(ticket.module) || "Unspecified"} · Issue type: ${clean(ticket.sub_type) || "Unspecified"} · Priority code: ${ticket.priority} · Status: ${statusLabel(ticket.status)}`);
  lines.push(`  Description: "${snippet(ticket.description, 1500)}"`);
  if (firstReply) lines.push(`  First customer reply (the event that triggered this): "${snippet(firstReply, 1000)}"`);
  lines.push(``);
  lines.push(`${matches.length} SIMILAR RESOLVED TICKETS (ranked by cosine similarity on Gemini embeddings — all already Resolved or Closed):`);
  matches.forEach((m, i) => {
    const s = m.similar;
    lines.push(`  T${i + 1}. Ticket #${s.ticket_id} — "${clean(s.subject)}"`);
    lines.push(`      similarity ${Math.round(s.similarity * 100)}% · ${clean(s.ticket_type) || "Unclassified"}/${clean(s.module) || "—"}/${clean(s.sub_type) || "—"} · resolved in ${fmtDuration(s.resolve_minutes)} by ${s.responder_name ?? "an unassigned agent"}`);
    if (m.primaryCause) lines.push(`      recorded primary cause: "${m.primaryCause}"`);
    if (m.narrative) lines.push(`      recorded analysis: "${snippet(m.narrative, 700)}"`);
    if (m.preventionTip) lines.push(`      recorded prevention tip: "${snippet(m.preventionTip, 300)}"`);
    m.agentNotes.forEach((n, j) => lines.push(`      agent note ${j + 1}: "${n}"`));
    if (!m.primaryCause && !m.narrative && !m.agentNotes.length) {
      lines.push(`      (no written analysis or agent notes on record — you may only use its subject/classification/duration)`);
    }
  });
  lines.push(``);
  lines.push(`ALREADY-COMPUTED FACTS (context for your wording; do not recompute or contradict): median time to resolve across these ${matches.length} tickets is ${medianMinutes === null ? "unknown" : fmtDuration(medianMinutes)}; the suggested assignee is ${assignee ? `${assignee.name} (closed ${assignee.count} of them)` : "undetermined — none of the matches has a recorded assignee"}; evidence strength is rated ${confidence}.`);
  lines.push(``);
  lines.push(`Produce five fields:`);
  lines.push(`1. headline — ONE sentence, max 25 words, naming what this ticket most likely is, based on the matches. Start with the substance, not "Based on similar tickets".`);
  lines.push(`2. root_causes — 1 to 3 items, most likely first. "cause" is a 3-8 word specific label (e.g. "GRN posting blocked by closed period", not "Configuration issue"). "evidence" is one sentence citing the ticket(s) it came from as #<id>.`);
  lines.push(`3. resolution_steps — 2 to 6 imperative steps in the order an agent should actually try them, drawn from what worked on the listed tickets. Cite #<id> where a step comes from a specific one. Skip generic advice like "investigate the issue" or "contact the customer" unless a listed ticket shows that was the actual fix.`);
  lines.push(`4. assignee_rationale — ONE sentence on why that agent is the right first call (what they specifically handled), or, if none is suggested, one sentence on what to route by instead. Do not repeat their name more than once.`);
  lines.push(`5. caveat — ONE honest sentence on the weakest part of this suggestion (thin evidence, matches that disagree, a match that is close in wording but may differ in cause). Never write a reassuring non-caveat.`);
  if (confidence === "low") lines.push(`Evidence here is thin — keep every field hedged and make the caveat the most important thing you write.`);
  return lines.join("\n");
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        // Same reasoning as analyze-ticket: this is "compress supplied facts",
        // not a reasoning-heavy task, so a full thinking budget is wasted spend.
        thinkingConfig: { thinkingLevel: "LOW" },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return JSON.parse(text);
}

// ─── Note rendering ─────────────────────────────────────────────────────────
// The canonical note is markdown (that's what we store in note_body, and what
// reads well in the ticket_auto_analysis row and in logs). Freshdesk's notes
// API takes HTML, so we convert the small, known subset we emit — headings via
// **bold**, `- ` bullets, `1. ` steps, `---` rules. No general markdown
// library: we control every line that goes in here.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inlineHtml = (s: string) =>
  escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const openList = (kind: "ul" | "ol") => { if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; } };

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    if (/^---+$/.test(line.trim())) { closeList(); out.push("<hr />"); continue; }
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) { openList("ul"); out.push(`<li>${inlineHtml(bullet[1])}</li>`); continue; }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) { openList("ol"); out.push(`<li>${inlineHtml(numbered[1])}</li>`); continue; }
    closeList();
    out.push(`<p>${inlineHtml(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

function buildNoteMarkdown(opts: {
  ai: any;
  matches: MatchContext[];
  medianMinutes: number | null;
  resolveRange: [number, number] | null;
  assignee: ReturnType<typeof recommendAssignee>;
  confidence: string;
  meanSimilarity: number;
  model: string;
}): string {
  const { ai, matches, medianMinutes, resolveRange, assignee, confidence, meanSimilarity, model } = opts;
  const n = matches.length;
  const L: string[] = [];

  L.push(`**Auto-analysis — ${n} similar resolved ${n === 1 ? "ticket" : "tickets"} found**`);
  L.push("");
  L.push(clean(ai.headline));
  L.push("");

  L.push(`**Common root causes**`);
  const causes = Array.isArray(ai.root_causes) ? ai.root_causes.slice(0, 3) : [];
  if (causes.length) {
    for (const c of causes) L.push(`- **${clean(c?.cause)}** — ${clean(c?.evidence)}`);
  } else {
    L.push(`- No consistent cause emerged across the matched tickets.`);
  }
  L.push("");

  L.push(`**Typical resolution steps**`);
  const steps = (Array.isArray(ai.resolution_steps) ? ai.resolution_steps : []).slice(0, 6).map(clean).filter(Boolean);
  if (steps.length) {
    steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
  } else {
    L.push(`1. No repeatable resolution path is on record for these matches — treat this one from first principles.`);
  }
  L.push("");

  L.push(`**Time to resolve**`);
  if (medianMinutes !== null) {
    const range = resolveRange && resolveRange[0] !== resolveRange[1]
      ? ` (range ${fmtDuration(resolveRange[0])} – ${fmtDuration(resolveRange[1])})`
      : "";
    L.push(`Median across the ${n} matched ${n === 1 ? "ticket" : "tickets"}: **${fmtDuration(medianMinutes)}**${range}.`);
  } else {
    L.push(`Not available — none of the matched tickets has a usable resolution timestamp.`);
  }
  L.push("");

  L.push(`**Recommended assignee**`);
  if (assignee) {
    L.push(`**${assignee.name}** — resolved ${assignee.count} of the ${n} closest ${n === 1 ? "match" : "matches"} (${assignee.tickets.map((t) => `#${t}`).join(", ")}).`);
    L.push(clean(ai.assignee_rationale));
  } else {
    L.push(`No recommendation — none of the matched tickets has a recorded assignee. ${clean(ai.assignee_rationale)}`);
  }
  L.push("");

  L.push(`**Matched tickets**`);
  for (const m of matches) {
    const s = m.similar;
    L.push(`- #${s.ticket_id} — "${clean(s.subject)}" · ${Math.round(s.similarity * 100)}% match · ${statusLabel(s.status)} in ${fmtDuration(s.resolve_minutes)} · ${s.responder_name ?? "unassigned"}`);
  }
  L.push("");

  L.push(`**Worth knowing**`);
  L.push(clean(ai.caveat));
  L.push("");
  L.push("---");
  L.push(`Confidence: **${confidence}** (${n} ${n === 1 ? "match" : "matches"}, average similarity ${Math.round(meanSimilarity * 100)}%). Generated automatically from resolved-ticket history by ${model} · ${PROMPT_VERSION}. Suggestions only — not a substitute for reading the ticket.`);

  return L.join("\n");
}

// ─── The dedup claim ────────────────────────────────────────────────────────
// This is the whole rate limit, and it runs BEFORE anything billable. Insert
// wins → we own this ticket. Insert hits 23505 (unique violation) → someone
// already has it; the only case we take it back is a run that genuinely failed,
// has cooled off, and has attempts left.
type ClaimResult = { claimed: boolean; reason?: string; attempts?: number };

async function claimTicket(admin: any, ticketId: number, conversationId: number | null): Promise<ClaimResult> {
  const { error } = await admin.from("ticket_auto_analysis").insert({
    ticket_id: ticketId,
    status: "in_progress",
    trigger_source: "freshdesk_webhook",
    trigger_conversation_id: conversationId,
    attempts: 1,
  });
  if (!error) return { claimed: true, attempts: 1 };
  if (error.code !== "23505") throw error;

  const cutoff = new Date(Date.now() - RETRY_COOLDOWN_MS).toISOString();
  // Single-statement conditional update = atomic. Two concurrent retries can't
  // both match, because the first one flips status off 'failed'.
  const { data: reclaimed, error: retryErr } = await admin
    .from("ticket_auto_analysis")
    .update({ status: "in_progress", error: null, trigger_conversation_id: conversationId })
    .eq("ticket_id", ticketId)
    .eq("status", "failed")
    .lt("attempts", MAX_ATTEMPTS)
    .lt("created_at", cutoff)
    .select("ticket_id, attempts");
  if (retryErr) throw retryErr;
  if (reclaimed?.length) {
    const attempts = (reclaimed[0].attempts ?? 1) + 1;
    await admin.from("ticket_auto_analysis").update({ attempts }).eq("ticket_id", ticketId);
    return { claimed: true, attempts };
  }
  return { claimed: false, reason: "already analysed (or an analysis is in flight)" };
}

async function finish(admin: any, ticketId: number, patch: Record<string, unknown>) {
  await admin.from("ticket_auto_analysis")
    .update({ ...patch, completed_at: new Date().toISOString() })
    .eq("ticket_id", ticketId);
}

// ============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const startedAt = Date.now();
  const deadline = startedAt + WALL_CLOCK_BUDGET_MS;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
  const EMBED_MODEL = Deno.env.get("GEMINI_EMBED_MODEL") ?? "gemini-embedding-001";
  const FD_DOMAIN = Deno.env.get("FRESHDESK_DOMAIN");
  const FD_API_KEY = Deno.env.get("FRESHDESK_API_KEY");
  const WEBHOOK_SECRET = Deno.env.get("AUTO_ANALYZE_WEBHOOK_SECRET");
  const MIN_SIMILARITY = Number(Deno.env.get("AUTO_ANALYZE_MIN_SIMILARITY") ?? "0.68");
  const MAX_MATCHES = Number(Deno.env.get("AUTO_ANALYZE_MAX_MATCHES") ?? "5");

  // A mis-signed call is the one thing worth rejecting loudly — it means the
  // webhook is misconfigured or someone else is poking the endpoint, and a
  // silent 200 would hide both.
  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-auto-analyze-secret") ?? "";
    if (provided !== WEBHOOK_SECRET) return json({ ok: false, error: "Invalid webhook secret" }, 401);
  }

  // Everything past this point answers 200 no matter what: Freshdesk retries
  // non-2xx webhooks, and a retry storm on a broken config is worse than a
  // missed note. Failures are recorded in ticket_auto_analysis and the log.
  if (!SUPABASE_URL || !SERVICE_ROLE || !GEMINI_API_KEY || !FD_DOMAIN || !FD_API_KEY) {
    const missing = [
      !SUPABASE_URL && "SUPABASE_URL", !SERVICE_ROLE && "SUPABASE_SERVICE_ROLE_KEY",
      !GEMINI_API_KEY && "GEMINI_API_KEY", !FD_DOMAIN && "FRESHDESK_DOMAIN", !FD_API_KEY && "FRESHDESK_API_KEY",
    ].filter(Boolean).join(", ");
    console.error(`auto-analyze-ticket: missing secrets — ${missing}`);
    return json({ ok: false, skipped: true, reason: `Missing secrets: ${missing}` });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const fd = new Freshdesk(FD_DOMAIN, FD_API_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  // ── Maintenance mode: embed the resolved-ticket corpus, nothing else ─────
  if (body?.mode === "backfill") {
    try {
      const result = await backfillEmbeddings(admin, GEMINI_API_KEY, EMBED_MODEL, BACKFILL_MODE_LIMIT, deadline);
      return json({ ok: true, mode: "backfill", ...result, elapsed_ms: Date.now() - startedAt });
    } catch (err) {
      console.error("auto-analyze-ticket backfill failed", err);
      return json({ ok: false, mode: "backfill", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── Manual-dashboard mode: post a note the user already reviewed ────────
  // The dry_run pipeline above builds the note but never sends it — this is
  // the second half of that flow: the UI shows the person the exact
  // markdown/HTML, they click "Post to Freshdesk", and THIS call posts
  // exactly that content. No re-embedding, no re-running Gemini — the note
  // was already generated once.
  if (body?.mode === "post_note") {
    const postTicketId = Number(body?.ticket_id);
    const noteHtml = typeof body?.note_html === "string" ? body.note_html : "";
    if (!postTicketId || !noteHtml) {
      return json({ ok: false, mode: "post_note", error: "ticket_id and note_html are required" }, 400);
    }
    try {
      const noteId = await fd.addPrivateNote(postTicketId, noteHtml);
      // upsert, not insert: a prior dry_run never claimed this row (dry_run
      // skips the claim on purpose), so there may be no row yet, and a
      // manual re-post later should just overwrite the record of what's on
      // the ticket rather than fail on a duplicate key.
      await admin.from("ticket_auto_analysis").upsert({
        ticket_id: postTicketId,
        status: "posted",
        trigger_source: "manual_dashboard",
        note_body: typeof body?.note_markdown === "string" ? body.note_markdown : null,
        freshdesk_note_id: noteId,
        completed_at: new Date().toISOString(),
      }, { onConflict: "ticket_id" });
      return json({ ok: true, mode: "post_note", ticket_id: postTicketId, freshdesk_note_id: noteId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`auto-analyze-ticket post_note failed for ticket ${postTicketId}:`, message);
      return json({ ok: false, mode: "post_note", ticket_id: postTicketId, error: message });
    }
  }

  // ── 1. Webhook shape ─────────────────────────────────────────────────────
  const { ticketId, statusHint, conversationIdHint } = parseWebhook(body);
  if (!ticketId) {
    console.error("auto-analyze-ticket: no ticket id in webhook payload", JSON.stringify(body).slice(0, 500));
    return json({ ok: false, skipped: true, reason: "No ticket_id in webhook payload" });
  }
  const dryRun = body?.dry_run === true;
  const forceRefresh = body?.force === true;

  // ── Cache short-circuit (dry_run only) ───────────────────────────────────
  // A person can click "Analyze Similar Cases" on the same ticket more than
  // once — reopening the drawer, or just checking again — and without this,
  // every click re-embeds, re-searches, and re-runs Gemini for an identical
  // answer. Serve the cached note instead, unless they explicitly asked for
  // a fresh one. This is checked BEFORE the Freshdesk calls below too, so a
  // cache hit costs nothing at all, not even an API round trip.
  if (dryRun && !forceRefresh) {
    const { data: cached } = await admin
      .from("ticket_similar_cases").select("*").eq("ticket_id", ticketId).maybeSingle();
    if (cached) {
      return json({
        ok: true, dry_run: true, cached: true, ticket_id: ticketId, posted: false,
        similar_count: cached.similar_count, confidence: cached.confidence,
        mean_similarity: cached.mean_similarity,
        median_resolve_minutes: cached.median_resolve_minutes,
        recommended_assignee: cached.recommended_assignee_name,
        note_markdown: cached.note_markdown, note_html: cached.note_html,
        generated_at: cached.generated_at,
        elapsed_ms: Date.now() - startedAt,
      });
    }
  }

  let claimed = false;
  try {
    // ── 2. Is this really the first customer reply? ────────────────────────
    // Read the thread from Freshdesk rather than our mirror: the sync runs on a
    // 5-minute cron, and the webhook fires in seconds, so our copy of the
    // conversation almost certainly does not have the triggering reply yet.
    const ticket = await fd.ticket(ticketId);
    const status = Number(ticket?.status ?? statusHint ?? 2);

    // dry_run is a user clicking "Analyze Similar Cases" on whatever ticket
    // they happen to be looking at in the dashboard — not a webhook timed to
    // the first reply. The auto path's "only the first reply, only while
    // open" gates exist to keep the AUTOMATIC note rare and cheap; a manual,
    // user-initiated look shouldn't be blocked by either.
    if (!dryRun && DONE_STATUSES.includes(status)) {
      return json({ ok: true, skipped: true, ticket_id: ticketId, reason: `Ticket is already ${statusLabel(status)}` });
    }

    const conversations = await fd.conversations(ticketId);
    const customerReplies = conversations
      .filter((c: any) => c?.incoming === true && c?.private !== true)
      .sort((a: any, b: any) => Date.parse(a.created_at) - Date.parse(b.created_at));

    if (!dryRun && customerReplies.length === 0) {
      return json({ ok: true, skipped: true, ticket_id: ticketId, reason: "No customer reply on the thread yet" });
    }
    // Strictly the FIRST reply. A later reply on an untouched ticket is a
    // different (and much noisier) product decision; the PK would stop the
    // second note anyway, but skipping here means we never pay for it.
    if (!dryRun && customerReplies.length > 1) {
      return json({ ok: true, skipped: true, ticket_id: ticketId, reason: `Not the first customer reply (${customerReplies.length} on thread)` });
    }
    const firstReply = customerReplies[0];
    const triggerConversationId = Number(firstReply?.id ?? conversationIdHint ?? 0) || null;

    // The ledger has an FK to tickets. If the syncer hasn't seen this ticket
    // yet, seed the row from what Freshdesk just gave us — DO NOTHING on
    // conflict so we never stomp on a fuller row the syncer already wrote.
    await admin.from("tickets").upsert({
      id: ticket.id,
      subject: ticket.subject ?? "",
      description: ticket.description_text ?? ticket.description ?? "",
      priority: ticket.priority ?? 1,
      status,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      requester_id: ticket.requester_id ?? null,
      company_id: ticket.company_id ?? null,
      responder_id: ticket.responder_id ?? null,
      tags: Array.isArray(ticket.tags) ? ticket.tags : [],
      ticket_type: ticket.type ?? null,
      module: ticket.custom_fields?.cf_module ?? null,
      sub_type: ticket.custom_fields?.cf_issue_type ?? null,
      company_name: ticket.company?.name ?? ticket.custom_fields?.cf_company ?? "Unknown",
      requester_name: ticket.requester?.name ?? null,
      requester_email: ticket.requester?.email ?? null,
      custom_fields: ticket.custom_fields ?? {},
    }, { onConflict: "id", ignoreDuplicates: true });

    // ── 3. Claim it. Nothing billable has happened yet. ────────────────────
    // dry_run deliberately skips the claim: it must be safe to re-run against
    // the same ticket repeatedly while testing, and it must never consume the
    // one-shot rate limit a real webhook will later need.
    if (!dryRun) {
      const claim = await claimTicket(admin, ticketId, triggerConversationId);
      if (!claim.claimed) {
        return json({ ok: true, skipped: true, ticket_id: ticketId, reason: claim.reason });
      }
      claimed = true;
    }

    // ── 4. Embeddings — the probe ticket, then a slice of the corpus ───────
    const probe = {
      id: ticketId,
      subject: ticket.subject ?? "",
      description: ticket.description_text ?? ticket.description ?? "",
      ticket_type: ticket.type ?? null,
      module: ticket.custom_fields?.cf_module ?? null,
      sub_type: ticket.custom_fields?.cf_issue_type ?? null,
    };
    await ensureEmbedding(admin, GEMINI_API_KEY, EMBED_MODEL, probe);

    let backfilled = 0;
    if (Date.now() < deadline - 12_000) {
      try {
        const r = await backfillEmbeddings(admin, GEMINI_API_KEY, EMBED_MODEL, WEBHOOK_BACKFILL_LIMIT, deadline - 10_000);
        backfilled = r.embedded;
      } catch (err) {
        // Corpus top-up is best-effort — a failure here must not cost the
        // agent the note we can still write from what IS embedded.
        console.error("auto-analyze-ticket: corpus backfill failed (non-fatal)", err);
      }
    }

    // ── 5. Semantic search over resolved tickets ───────────────────────────
    const { data: matchRows, error: matchErr } = await admin.rpc("match_similar_tickets", {
      p_ticket_id: ticketId,
      p_limit: MAX_MATCHES,
      p_min_similarity: MIN_SIMILARITY,
    });
    if (matchErr) throw matchErr;
    const similar: SimilarTicket[] = (matchRows ?? []) as SimilarTicket[];

    if (similar.length === 0) {
      // Deliberately post nothing. A note saying "we found nothing" is pure
      // noise in an agent's inbox, and noise is how a feature like this gets
      // switched off.
      if (!dryRun) {
        await finish(admin, ticketId, { status: "skipped", similar_count: 0, error: "No resolved tickets cleared the similarity floor" });
      } else {
        // Still an embedding call spent (the probe ticket). Cache the "found
        // nothing" outcome too, so a repeat click doesn't spend it again —
        // only Regenerate (force) re-checks, which is correct: the resolved
        // corpus does grow over time.
        await admin.from("ticket_similar_cases").upsert({
          ticket_id: ticketId, similar_ticket_ids: [], similar_count: 0,
          note_markdown: "No similar resolved tickets found above the similarity threshold.",
          note_html: "<p>No similar resolved tickets found above the similarity threshold.</p>",
          model: GEMINI_MODEL, generated_at: new Date().toISOString(),
        }, { onConflict: "ticket_id" });
      }
      return json({ ok: true, dry_run: dryRun, cached: false, ticket_id: ticketId, posted: false, similar_count: 0, reason: "No similar resolved tickets above threshold", embeddings_backfilled: backfilled });
    }

    // ── 6. Enrich each match with what was actually written about it ───────
    const ids = similar.map((s) => s.ticket_id);
    const [{ data: priorAnalyses }, { data: agentMessages }] = await Promise.all([
      admin.from("ticket_ai_analysis").select("ticket_id, primary_cause, narrative, prevention_tip").in("ticket_id", ids),
      admin.from("conversations").select("ticket_id, body_text, private, created_at")
        .in("ticket_id", ids).eq("incoming", false).order("created_at", { ascending: false }),
    ]);

    const analysisById = new Map<number, any>((priorAnalyses ?? []).map((a: any) => [a.ticket_id, a]));
    const notesById = new Map<number, string[]>();
    for (const msg of agentMessages ?? []) {
      const list = notesById.get(msg.ticket_id) ?? [];
      if (list.length >= 2) continue;
      const text = snippet(msg.body_text, 600);
      if (text.length < 25) continue; // "Thanks!" teaches the model nothing
      list.push(text);
      notesById.set(msg.ticket_id, list);
    }

    const matches: MatchContext[] = similar.map((s) => {
      const prior = analysisById.get(s.ticket_id);
      return {
        similar: s,
        primaryCause: prior?.primary_cause ?? null,
        narrative: prior?.narrative ?? null,
        preventionTip: prior?.prevention_tip ?? null,
        agentNotes: notesById.get(s.ticket_id) ?? [],
      };
    });

    // ── 7. Numbers — computed here, never asked of the model ───────────────
    const resolveMinutes = similar.map((s) => s.resolve_minutes).filter((m) => m > 0);
    const medianMinutes = median(resolveMinutes);
    const resolveRange: [number, number] | null = resolveMinutes.length
      ? [Math.min(...resolveMinutes), Math.max(...resolveMinutes)] : null;
    const meanSimilarity = similar.reduce((acc, s) => acc + s.similarity, 0) / similar.length;
    const assignee = recommendAssignee(similar);
    const confidence = confidenceOf(similar, meanSimilarity, assignee);

    // ── 8. Synthesis ───────────────────────────────────────────────────────
    const prompt = buildPrompt(
      { ...probe, priority: ticket.priority ?? 1, status },
      snippet(firstReply?.body_text ?? firstReply?.body, 1000),
      matches, medianMinutes, assignee, confidence,
    );
    const ai = await callGemini(GEMINI_API_KEY, GEMINI_MODEL, prompt);

    // ── 9. Render + post ───────────────────────────────────────────────────
    const noteMarkdown = buildNoteMarkdown({
      ai, matches, medianMinutes, resolveRange, assignee, confidence, meanSimilarity, model: GEMINI_MODEL,
    });

    // dry_run stops here — the note is fully built (real embeddings, real
    // search, real Gemini synthesis) but never touches Freshdesk, and no
    // ticket_auto_analysis row is written since none was claimed. It IS
    // cached in ticket_similar_cases, so the next click on this ticket (short
    // of an explicit Regenerate) costs nothing.
    if (dryRun) {
      const noteHtml = markdownToHtml(noteMarkdown);
      const generatedAt = new Date().toISOString();
      await admin.from("ticket_similar_cases").upsert({
        ticket_id: ticketId,
        similar_ticket_ids: ids,
        similar_count: similar.length,
        mean_similarity: round2(meanSimilarity),
        median_resolve_minutes: medianMinutes === null ? null : Math.round(medianMinutes),
        recommended_assignee_name: assignee?.name ?? null,
        confidence,
        note_markdown: noteMarkdown,
        note_html: noteHtml,
        model: GEMINI_MODEL,
        generated_at: generatedAt,
      }, { onConflict: "ticket_id" });

      return json({
        ok: true, dry_run: true, cached: false, ticket_id: ticketId, posted: false,
        similar_count: similar.length, confidence, mean_similarity: round2(meanSimilarity),
        median_resolve_minutes: medianMinutes === null ? null : Math.round(medianMinutes),
        recommended_assignee: assignee?.name ?? null,
        note_markdown: noteMarkdown,
        note_html: noteHtml,
        generated_at: generatedAt,
        embeddings_backfilled: backfilled, elapsed_ms: Date.now() - startedAt,
      });
    }

    const noteId = await fd.addPrivateNote(ticketId, markdownToHtml(noteMarkdown));

    await finish(admin, ticketId, {
      status: "posted",
      similar_ticket_ids: ids,
      similar_count: similar.length,
      mean_similarity: round2(meanSimilarity),
      median_resolve_minutes: medianMinutes === null ? null : Math.round(medianMinutes),
      recommended_assignee_id: assignee?.id ?? null,
      recommended_assignee_name: assignee?.name ?? null,
      confidence,
      root_causes: Array.isArray(ai.root_causes) ? ai.root_causes : [],
      resolution_steps: Array.isArray(ai.resolution_steps) ? ai.resolution_steps : [],
      note_body: noteMarkdown,
      freshdesk_note_id: noteId,
      model: GEMINI_MODEL,
      error: null,
    });

    return json({
      ok: true, ticket_id: ticketId, posted: true, freshdesk_note_id: noteId,
      similar_count: similar.length, confidence, mean_similarity: round2(meanSimilarity),
      median_resolve_minutes: medianMinutes === null ? null : Math.round(medianMinutes),
      recommended_assignee: assignee?.name ?? null,
      embeddings_backfilled: backfilled, elapsed_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`auto-analyze-ticket failed for ticket ${ticketId}:`, message);
    if (claimed) {
      // Mark it failed rather than leaving it 'in_progress' forever — that is
      // what makes the ticket eligible for the retry path in claimTicket.
      try { await finish(admin, ticketId, { status: "failed", error: message.slice(0, 2000) }); } catch { /* ignore */ }
    }
    return json({ ok: false, ticket_id: ticketId, error: message, elapsed_ms: Date.now() - startedAt });
  }
});
