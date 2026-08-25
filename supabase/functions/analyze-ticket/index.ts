// ============================================================================
// analyze-ticket — Supabase Edge Function (Deno)
// "SLA Autopsy" — explains WHY a ticket breached (or comfortably met) its SLA.
//
// Design principle: the model never invents a number. Every duration,
// percentage, and benchmark figure is computed here from real rows BEFORE the
// prompt is built; Gemini's only job is to narrate those already-computed
// facts in plain language. This keeps the output trustworthy and the prompt
// (and therefore the bill) small.
//
// Cost control: this only runs when a user clicks "Analyze" in the drawer
// (never automatically, never for a whole ticket list). Even then, the
// Gemini call itself is skipped whenever an input_hash match shows nothing
// relevant has changed since the last generation — a re-click just re-serves
// the cached narrative alongside freshly recomputed (free) timeline numbers.
//
// Required secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional secret:  GEMINI_MODEL (default "gemini-3.6-flash")
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ─── Domain constants (mirrors src/lib/tickets.ts — kept local, edge
// functions can't import frontend code) ──────────────────────────────────────
const DONE_STATUSES = [4, 5];
const STATUS_LABEL: Record<number, string> = {
  2: "Open", 3: "Pending", 4: "Resolved", 5: "Closed",
  7: "On Tech", 8: "Waiting on Customer", 9: "On Product",
};
const FALLBACK_SLA_HOURS: Record<number, number> = { 4: 21, 3: 85, 2: 171, 1: 320 };

const teamFor = (status: number): "aerchain" | "nse" | "engineering" => {
  if (status === 8) return "nse";
  if (status === 7 || status === 9) return "engineering";
  return "aerchain";
};
const statusLabel = (s: number) => STATUS_LABEL[s] ?? `Status ${s}`;

const fmtDuration = (mins: number) => {
  const m = Math.max(0, Math.round(mins));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Segments / attribution / confidence — all deterministic, zero AI cost ──
interface Segment {
  index: number; status: number; label: string; team: string;
  startsAt: string; endsAt: string; minutes: number; confidence: string;
}

function computeSegments(ticket: any, history: any[]): Segment[] {
  const sorted = [...history].sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at));
  const endAnchor = DONE_STATUSES.includes(ticket.status) ? ticket.updated_at : new Date().toISOString();
  return sorted.map((row, i) => {
    const start = row.changed_at;
    const end = i + 1 < sorted.length ? sorted[i + 1].changed_at : endAnchor;
    const minutes = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60000));
    return {
      index: i, status: row.to_status, label: statusLabel(row.to_status), team: teamFor(row.to_status),
      startsAt: start, endsAt: end, minutes, confidence: row.confidence,
    };
  });
}

function computeAttribution(segments: Segment[]) {
  const totals = { aerchain: 0, nse: 0, engineering: 0 };
  for (const s of segments) (totals as any)[s.team] += s.minutes;
  const sum = totals.aerchain + totals.nse + totals.engineering;
  if (sum === 0) return { aerchain: 0, nse: 0, engineering: 0 };
  return {
    aerchain: round1((totals.aerchain / sum) * 100),
    nse: round1((totals.nse / sum) * 100),
    engineering: round1((totals.engineering / sum) * 100),
  };
}

function overallConfidence(segments: Segment[]): "high" | "partial" | "low" {
  if (segments.length <= 1) return "low";
  const exact = segments.filter((s) => s.confidence === "exact").length;
  if (exact === segments.length) return "high";
  if (exact > 0) return "partial";
  return "low";
}

function completenessNote(segments: Segment[]): string {
  if (segments.length <= 1) {
    return "Only this ticket's creation is on record — status history capture started after this ticket was last touched, so timing here is a rough estimate.";
  }
  const exact = segments.filter((s) => s.confidence === "exact").length;
  return exact === segments.length
    ? `All ${segments.length} status changes were captured directly.`
    : `${exact} of ${segments.length} status changes were captured directly; the rest are estimated from surrounding timestamps.`;
}

// ─── SLA target lookup (single global ruleset — falls back to the fixed defaults) ──
async function getSlaTargetHours(admin: any, ticket: any): Promise<number | null> {
  const { data } = await admin.from("sla_rules").select("resolution_hours").eq("priority", ticket.priority).maybeSingle();
  if (data?.resolution_hours) return data.resolution_hours;
  return FALLBACK_SLA_HOURS[ticket.priority as number] ?? null;
}

// ─── Benchmark — real computed median over similar resolved tickets, or null
// when the sample is too small to say anything meaningful (never invented) ──
async function computeBenchmark(admin: any, ticket: any) {
  const { data } = await admin
    .from("tickets")
    .select("id, created_at, updated_at")
    .eq("ticket_type", ticket.ticket_type)
    .eq("priority", ticket.priority)
    .in("status", DONE_STATUSES)
    .neq("id", ticket.id)
    .order("updated_at", { ascending: false })
    .limit(200);

  const hours = (data ?? [])
    .map((t: any) => (Date.parse(t.updated_at) - Date.parse(t.created_at)) / 3600000)
    .filter((h: number) => h > 0);

  if (hours.length < 5) return null; // not enough peers to say anything real

  const sorted = [...hours].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianHours = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const ticketHours = DONE_STATUSES.includes(ticket.status)
    ? (Date.parse(ticket.updated_at) - Date.parse(ticket.created_at)) / 3600000
    : (Date.now() - Date.parse(ticket.created_at)) / 3600000;

  return {
    medianHours: round1(medianHours),
    sampleSize: hours.length,
    ticketHours: round1(ticketHours),
    multiple: medianHours > 0 ? round1(ticketHours / medianHours) : null,
  };
}

// ─── Pick a small, relevant slice of the conversation for the prompt ────────
function pickMessages(conversations: any[]) {
  const KEYWORD = /linear|jira|engineer|tech team|deploy|root cause|fix(ed)?|escalat/i;
  const sorted = [...conversations].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const picked: any[] = [];
  const seen = new Set<number>();
  const add = (c: any) => { if (c && !seen.has(c.id)) { seen.add(c.id); picked.push(c); } };

  add(sorted.find((c) => !c.incoming && !c.private)); // first agent reply
  sorted.filter((c) => KEYWORD.test(c.body_text ?? "")).slice(0, 3).forEach(add);
  sorted.slice(-4).forEach(add);

  return picked.slice(0, 8).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
const snippet = (text: string) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, 280);

// Bump this whenever buildPrompt's instructions change meaningfully (tone,
// fields, etc.) — it's folded into input_hash so every previously cached
// analysis is treated as stale and regenerates fresh on the next click,
// instead of silently serving text written under the old instructions.
const PROMPT_VERSION = "2-client-facing-diplomatic";

// ─── Gemini call — structured JSON output, small prompt, facts pre-computed ──
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    narrative: { type: "STRING" },
    formal_narrative: { type: "STRING" },
    prevention_tip: { type: "STRING" },
  },
  required: ["narrative", "formal_narrative", "prevention_tip"],
};

function buildPrompt(ticket: any, segments: Segment[], attribution: any, benchmark: any, slaHours: number | null, messages: any[]) {
  const lines: string[] = [];
  lines.push(`You write "why did this take as long as it did" explanations for support tickets. IMPORTANT: this is shown directly to the client (NSE, a stock exchange) — Aerchain is the vendor being read about. Write diplomatically: Aerchain must never come across as slow, idle, neglectful, or at fault. Frame Aerchain's own time as active effort — careful investigation, coordination with engineering, thorough validation before closing — and convey that the team worked hard to bring this to resolution. Time spent waiting on the customer should be stated gently and factually, never as a complaint. Stay completely accurate to the numbers given below — reframe the STORY and tone, never the FACTS.`);
  lines.push(`Ticket #${ticket.id} — "${ticket.subject}". Type: ${ticket.ticket_type ?? "Unclassified"}. Priority code: ${ticket.priority}. Company: ${ticket.company_name ?? "Unknown"}.`);
  lines.push(`Current status: ${statusLabel(ticket.status)}. SLA target: ${slaHours ? slaHours + " calendar hours" : "unknown"}.`);
  lines.push(`Status timeline (already computed — do not invent or alter these numbers):`);
  segments.forEach((s, i) => lines.push(`  S${i + 1}. ${s.label} for ${fmtDuration(s.minutes)} (team: ${s.team}, confidence: ${s.confidence})`));
  lines.push(`Time attribution (already computed): Aerchain ${attribution.aerchain}%, NSE (customer) ${attribution.nse}%, Engineering ${attribution.engineering}%.`);
  if (benchmark) {
    lines.push(`Benchmark (already computed): similar tickets (same type + priority) resolved in a median of ${benchmark.medianHours}h across ${benchmark.sampleSize} tickets. This ticket: ${benchmark.ticketHours}h (${benchmark.multiple}x the median).`);
  }
  if (messages.length) {
    lines.push(`Relevant messages:`);
    messages.forEach((m, i) => lines.push(`  M${i + 1}. [${m.private ? "private note" : m.incoming ? "customer" : "agent"}, ${m.created_at}]: "${snippet(m.body_text)}"`));
  }
  lines.push(`Write three fields, all in the diplomatic, client-facing tone described above:`);
  lines.push(`1. narrative — 2-4 sentences with the evidence trail visible, for an agent presenting this to the client. Cite the timeline using the exact tokens S1, S2, ... and messages using M1, M2, ... where relevant. Never state a duration, percentage, or benchmark that isn't given above.`);
  lines.push(`2. formal_narrative — the same facts as a warm, professional 2-3 sentence paragraph for a customer-facing SLA report, emphasizing the effort the team put in to close this out. No internal jargon, no S#/M# tokens, no words like "breach," "failed," or "overdue" — describe it as extra time invested to get it right.`);
  lines.push(`3. prevention_tip — one concrete, forward-looking sentence grounded only in this ticket's own pattern, phrased as a commitment to doing even better next time — not a criticism of what happened here.`);
  if (segments.length <= 1) lines.push(`The timeline has only one entry — say plainly that detailed history isn't available yet rather than guessing at a cause.`);
  return lines.join("\n");
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3, maxOutputTokens: 700, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA,
        // LOW thinking: this task is "narrate pre-computed facts," not reasoning-heavy —
        // full thinking budget burns hundreds of extra tokens for no quality gain here.
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

// ============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")!;
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";

  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // ── Auth: any signed-in, non-disabled user may trigger an analysis ────────
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "Missing authorization token" }, 401);
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json({ error: "Invalid session" }, 401);
  const { data: callerProfile } = await admin.from("profiles").select("disabled").eq("id", caller.user.id).maybeSingle();
  if (callerProfile?.disabled) return json({ error: "Account disabled" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const ticketId = Number(body?.ticket_id);
  const force = !!body?.force;
  if (!ticketId) return json({ error: "ticket_id is required" }, 400);

  try {
    const { data: ticket, error: tErr } = await admin.from("tickets").select("*").eq("id", ticketId).maybeSingle();
    if (tErr) throw tErr;
    if (!ticket) return json({ error: "Ticket not found" }, 404);

    const { data: historyRows } = await admin
      .from("ticket_status_history").select("*").eq("ticket_id", ticketId).order("changed_at", { ascending: true });
    const history = historyRows ?? [];

    // ── Deterministic facts — computed every call, free ──────────────────
    const segments = computeSegments(ticket, history);
    const attribution = computeAttribution(segments);
    const confidence = overallConfidence(segments);
    const completeness = completenessNote(segments);
    const [benchmark, slaHours] = await Promise.all([computeBenchmark(admin, ticket), getSlaTargetHours(admin, ticket)]);

    // ── Staleness check — only the narrative needs an AI call, and only
    // when something relevant actually changed since it was last written ──
    const { count: convoCount } = await admin.from("conversations").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId);
    const { data: lastConvo } = await admin.from("conversations").select("updated_at").eq("ticket_id", ticketId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const inputHash = await sha256(JSON.stringify([
      PROMPT_VERSION, ticket.status, ticket.updated_at, history.length, history.at(-1)?.changed_at ?? null, convoCount ?? 0, lastConvo?.updated_at ?? null,
    ]));

    const { data: cached } = await admin.from("ticket_ai_analysis").select("*").eq("ticket_id", ticketId).maybeSingle();

    let narrative: string, formalNarrative: string, preventionTip: string, citations: any[], model: string, generatedAt: string, generatedBy: string | null, generated = false;

    if (cached && cached.input_hash === inputHash && !force) {
      narrative = cached.narrative; formalNarrative = cached.formal_narrative; preventionTip = cached.prevention_tip;
      citations = cached.citations ?? []; model = cached.model; generatedAt = cached.generated_at; generatedBy = cached.generated_by;
    } else {
      generated = true;
      const { data: conversations } = await admin.from("conversations").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
      const messages = pickMessages(conversations ?? []);
      const prompt = buildPrompt(ticket, segments, attribution, benchmark, slaHours, messages);

      let ai: any;
      try {
        ai = await callGemini(GEMINI_API_KEY, GEMINI_MODEL, prompt);
      } catch (aiErr) {
        // Degrade gracefully: serve stale narrative if we have one, otherwise
        // still return the (free, deterministic) timeline with no narrative.
        if (cached) {
          return json({
            data: {
              ticket_id: ticketId, generated: false, stale: true,
              generated_at: cached.generated_at, model: cached.model, confidence, completeness_note: completeness,
              segments, attribution, benchmark, narrative: cached.narrative, formal_narrative: cached.formal_narrative,
              prevention_tip: cached.prevention_tip, citations: cached.citations ?? [],
              warning: `Regeneration failed (${(aiErr as Error).message}); showing the last successful analysis.`,
            },
          });
        }
        return json({
          data: { ticket_id: ticketId, generated: false, confidence, completeness_note: completeness, segments, attribution, benchmark, narrative: null },
          error: `AI analysis failed: ${(aiErr as Error).message}`,
        }, 502);
      }

      narrative = ai.narrative; formalNarrative = ai.formal_narrative; preventionTip = ai.prevention_tip;
      model = GEMINI_MODEL; generatedAt = new Date().toISOString(); generatedBy = caller.user.id;
      citations = [
        ...segments.map((s, i) => ({ marker: `S${i + 1}`, type: "segment", label: `${s.label} — ${fmtDuration(s.minutes)}`, detail: `${s.startsAt} → ${s.endsAt}` })),
        ...messages.map((m, i) => ({ marker: `M${i + 1}`, type: m.private ? "note" : m.incoming ? "customer_message" : "agent_reply", label: m.private ? "Private note" : m.incoming ? "Customer message" : "Agent reply", detail: snippet(m.body_text), at: m.created_at })),
      ];

      await admin.from("ticket_ai_analysis").upsert({
        ticket_id: ticketId, generated_at: generatedAt, generated_by: generatedBy, model, input_hash: inputHash,
        confidence, completeness_note: completeness, segments, attribution, benchmark,
        narrative, formal_narrative: formalNarrative, prevention_tip: preventionTip, citations,
      }, { onConflict: "ticket_id" });
    }

    return json({
      data: {
        ticket_id: ticketId, generated, generated_at: generatedAt, generated_by: generatedBy, model,
        confidence, completeness_note: completeness, segments, attribution, benchmark,
        narrative, formal_narrative: formalNarrative, prevention_tip: preventionTip, citations,
      },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
