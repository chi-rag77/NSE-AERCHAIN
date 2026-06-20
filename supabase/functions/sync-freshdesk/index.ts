// ============================================================================
// sync-freshdesk — Supabase Edge Function (Deno)
//
// Pulls tickets (and their conversations) from the Freshdesk API and upserts
// them into the public.tickets / public.conversations tables. Designed to be
// invoked on a schedule (pg_cron) and on-demand from the dashboard "Refresh".
//
// Required Edge Function secrets (supabase secrets set ...):
//   FRESHDESK_DOMAIN          e.g. yourcompany.freshdesk.com
//   FRESHDESK_API_KEY         your Freshdesk API key
//   SUPABASE_URL              (auto-injected in the Supabase runtime)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected in the Supabase runtime)
//
// Optional:
//   FRESHDESK_COMPANY_ID      restrict sync to one company (e.g. NSE)
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

  // Accept a bare workspace ("aerchain") or a full host ("aerchain.freshdesk.com").
  const rawDomain = Deno.env.get("FRESHDESK_DOMAIN");
  const DOMAIN = rawDomain && !rawDomain.includes(".") ? `${rawDomain}.freshdesk.com` : rawDomain;
  const API_KEY = Deno.env.get("FRESHDESK_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  // Support both legacy service_role JWT and the new secret API key.
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const COMPANY_ID = Deno.env.get("FRESHDESK_COMPANY_ID");
  const SYNC_CONVOS = Deno.env.get("SYNC_CONVERSATIONS") !== "false";

  if (!DOMAIN || !API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing required env: FRESHDESK_DOMAIN, FRESHDESK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const fdAuth = "Basic " + btoa(`${API_KEY}:X`);
  const fdHeaders = { Authorization: fdAuth, "Content-Type": "application/json" };

  // open a sync_log row
  const { data: logRow } = await supabase
    .from("sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  try {
    // ── 1. Fetch tickets (paginated, up to 100/page) ──────────────────────
    const baseFilter = COMPANY_ID
      ? `?include=requester,company,stats&company_id=${COMPANY_ID}&per_page=100&order_by=updated_at&order_type=desc`
      : `?include=requester,company,stats&per_page=100&order_by=updated_at&order_type=desc`;

    const allTickets: any[] = [];
    let page = 1;
    while (page <= 10) {
      const res = await fetch(`https://${DOMAIN}/api/v2/tickets${baseFilter}&page=${page}`, { headers: fdHeaders });
      if (!res.ok) throw new Error(`Freshdesk tickets ${res.status}: ${await res.text()}`);
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      allTickets.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

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
      tags: t.tags ?? [],
      company_name: t.company?.name ?? null,
      requester_name: t.requester?.name ?? t.requester?.email ?? null,
      responder_name: null,
      sla_policy_id: t.sla_policy_id ?? null,
      synced_at: new Date().toISOString(),
    }));

    if (ticketRows.length) {
      const { error } = await supabase.from("tickets").upsert(ticketRows, { onConflict: "id" });
      if (error) throw error;
    }

    // ── 2. Fetch conversations for the synced tickets ─────────────────────
    let convoCount = 0;
    if (SYNC_CONVOS) {
      for (const t of allTickets) {
        const res = await fetch(`https://${DOMAIN}/api/v2/tickets/${t.id}/conversations?per_page=100`, { headers: fdHeaders });
        if (!res.ok) continue; // tolerate per-ticket failures
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

    return json({ ok: true, tickets_synced: ticketRows.length, conversations_synced: convoCount });
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
