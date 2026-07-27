// ============================================================================
// sync-freshdesk — Supabase Edge Function (Deno)
//
// Pulls NSE tickets (and their conversations) from the Freshdesk API and
// upserts them into the public.tickets / public.conversations tables.
//
// Required Edge Function secrets (supabase secrets set ...):
//   FRESHDESK_DOMAIN          e.g. yourcompany.freshdesk.com
//   FRESHDESK_API_KEY         your Freshdesk API key
//   SUPABASE_URL              (auto-injected in the Supabase runtime)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected in the Supabase runtime)
//
// Optional:
//   FRESHDESK_COMPANY_ID      hardcode NSE company ID to skip the lookup
//   SYNC_CONVERSATIONS        "false" to skip per-ticket conversation fetch
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const rawDomain = Deno.env.get("FRESHDESK_DOMAIN");
  const DOMAIN = rawDomain && !rawDomain.includes(".") ? `${rawDomain}.freshdesk.com` : rawDomain;
  const API_KEY = Deno.env.get("FRESHDESK_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const SYNC_CONVOS = Deno.env.get("SYNC_CONVERSATIONS") !== "false";

  if (!DOMAIN || !API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing required env: FRESHDESK_DOMAIN, FRESHDESK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const fdAuth = "Basic " + btoa(`${API_KEY}:X`);
  const fdHeaders = { Authorization: fdAuth, "Content-Type": "application/json" };
  const baseUrl = `https://${DOMAIN}/api/v2`;

  // ── Resolve NSE company ID ─────────────────────────────────────────────────
  const companyMatches = (name: string) => {
    const n = (name ?? "").toUpperCase();
    return n === "NSE" || n.includes("NSE ") || n.includes(" NSE") || n.includes("NATIONAL STOCK EXCHANGE");
  };

  // Fallback: reuse the company id from previously-synced tickets. Lets a sync
  // succeed even when the live /companies call is momentarily unavailable.
  const companyIdFromDb = async (): Promise<number | null> => {
    const { data } = await supabase
      .from("tickets")
      .select("company_id")
      .not("company_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.company_id ?? null;
  };

  const getNseCompanyId = async (): Promise<number | null> => {
    const hardcoded = Deno.env.get("FRESHDESK_COMPANY_ID");
    if (hardcoded) return Number(hardcoded);

    // Paginate through companies (NSE may sit beyond the first 100) and retry
    // transient responses (429 / 5xx) so a single rate-limited call doesn't
    // abort the whole sync.
    let lookupFailed = false;
    let page = 1;
    while (page <= 10) {
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${baseUrl}/companies?per_page=100&page=${page}`, { headers: fdHeaders });
        if (res.ok || !(res.status === 429 || res.status >= 500)) break;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
      if (!res || !res.ok) { lookupFailed = true; break; }
      const companies = await res.json();
      if (!Array.isArray(companies) || companies.length === 0) break;
      const nse = companies.find((c: any) => companyMatches(c.name));
      if (nse?.id) return nse.id;
      if (companies.length < 100) break;
      page++;
    }

    // Live lookup exhausted or failed → fall back to a known id from the DB.
    const cached = await companyIdFromDb();
    if (cached) return cached;
    if (lookupFailed) {
      throw new Error("Freshdesk /companies lookup failed (rate-limited or unavailable) and no cached company id is available. Set FRESHDESK_COMPANY_ID to skip the lookup.");
    }
    return null;
  };

  // open a sync_log row
  const { data: logRow } = await supabase
    .from("sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  try {
    // ── 1. Resolve NSE company ─────────────────────────────────────────────
    const companyId = await getNseCompanyId();
    if (!companyId) {
      throw new Error("NSE company not found in Freshdesk. Set FRESHDESK_COMPANY_ID secret to skip lookup.");
    }

    // ── 2. Fetch agents map (id → name) ───────────────────────────────────
    const agentsMap: Record<number, string> = {};
    try {
      const aRes = await fetch(`${baseUrl}/agents?per_page=100`, { headers: fdHeaders });
      if (aRes.ok) {
        const agents = await aRes.json();
        for (const a of agents) {
          agentsMap[a.id] = a.contact?.name ?? a.contact?.email ?? "Agent";
        }
      }
    } catch { /* non-fatal */ }

    // ── 3. Fetch NSE tickets (paginated, up to 10 pages × 100) ────────────
    // include=stats gives fr_due_by, due_by, resolved_at, first_responded_at
    const baseFilter = `?include=requester,company,stats&company_id=${companyId}&per_page=100&order_by=updated_at&order_type=desc`;

    const allTickets: any[] = [];
    let page = 1;
    while (page <= 10) {
      const res = await fetch(`${baseUrl}/tickets${baseFilter}&page=${page}`, { headers: fdHeaders });
      if (!res.ok) throw new Error(`Freshdesk tickets ${res.status}: ${await res.text()}`);
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      allTickets.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    const now = new Date().toISOString();
    const ticketRows = allTickets.map((t) => ({
      id: t.id,
      subject: t.subject ?? "",
      description: t.description_text ?? t.description ?? "",
      priority: t.priority ?? 1,
      status: t.status ?? 2,
      created_at: t.created_at,
      updated_at: t.updated_at,
      requester_id: t.requester_id ?? null,
      company_id: t.company_id ?? null,
      responder_id: t.responder_id ?? null,
      // Tags directly from Freshdesk
      tags: Array.isArray(t.tags) ? t.tags : [],
      // Freshdesk "Type" field (Query / Bug / Tech-Task / Service Task / …)
      ticket_type: t.type ?? null,
      // cf_module — functional area (PO / Invoice / GRN / PR / RFQ-QC / …)
      module: t.custom_fields?.cf_module ?? null,
      // cf_issue_type — "Sub Type - Module" (Slowness / Login / Integration / …)
      sub_type: t.custom_fields?.cf_issue_type ?? null,
      // SLA due dates from include=stats
      fr_due_by: t.fr_due_by ?? null,
      due_by: t.due_by ?? null,
      fr_escalated: t.fr_escalated ?? false,
      is_escalated: t.is_escalated ?? false,
      spam: t.spam ?? false,
      // Requester / agent names
      company_name: t.company?.name ?? "NSE",
      requester_name: t.requester?.name ?? null,
      requester_email: t.requester?.email ?? null,
      responder_name: t.responder_id ? (agentsMap[t.responder_id] ?? null) : null,
      sla_policy_id: t.sla_policy_id ?? null,
      // Full custom_fields bag — preserve everything from Freshdesk
      custom_fields: t.custom_fields ?? {},
      synced_at: now,
    }));

    if (ticketRows.length) {
      const { error } = await supabase.from("tickets").upsert(ticketRows, { onConflict: "id" });
      if (error) throw error;
    }

    // ── 3. Fetch conversations for the synced tickets ──────────────────────
    let convoCount = 0;
    if (SYNC_CONVOS) {
      for (const t of allTickets) {
        const res = await fetch(`${baseUrl}/tickets/${t.id}/conversations?per_page=100`, { headers: fdHeaders });
        if (!res.ok) continue;
        const convos = await res.json();
        if (!Array.isArray(convos) || !convos.length) continue;
        const rows = convos.map((c: any) => ({
          id: c.id,
          ticket_id: t.id,
          body: c.body ?? "",
          body_text: c.body_text ?? c.body ?? "",
          incoming: c.incoming ?? true,
          private: c.private ?? false,
          user_id: c.user_id ?? null,
          created_at: c.created_at,
          updated_at: c.updated_at,
          attachments: c.attachments ?? [],
        }));
        const { error } = await supabase.from("conversations").upsert(rows, { onConflict: "id" });
        if (!error) convoCount += rows.length;
      }
    }

    if (logId) {
      await supabase
        .from("sync_log")
        .update({ status: "success", finished_at: new Date().toISOString(), tickets_synced: ticketRows.length, conversations_synced: convoCount })
        .eq("id", logId);
    }

    return json({ ok: true, company_id: companyId, tickets_synced: ticketRows.length, conversations_synced: convoCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (logId) {
      await supabase
        .from("sync_log")
        .update({ status: "error", finished_at: new Date().toISOString(), error: message })
        .eq("id", logId);
    }
    return json({ ok: false, error: message }, 500);
  }
});
