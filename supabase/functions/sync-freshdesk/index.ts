// ============================================================================
// sync-freshdesk — Supabase Edge Function (Deno)
//
// Pulls tickets (and their conversations, ALL pages) from the Freshdesk API
// and upserts them into public.tickets / public.conversations. Called from
// three independent places — pg_cron every 5 min, every open browser tab's
// 60s auto-refresh, and a manual click (open to anonymous visitors too) —
// with no coordination between them, so it self-throttles (see MIN_INTERVAL_MS
// below) rather than trusting callers to behave.
//
// Company scoping: this deployment is scoped to a single customer (NSE) via
// FRESHDESK_COMPANY_NAME. Each ticket carries its company in the custom field
// cf_company (native company_id is often null); we persist that as
// company_name. Leaving FRESHDESK_COMPANY_NAME unset syncs every company —
// only do that if this deployment is genuinely meant to be multi-customer.
//
// Required secrets:  FRESHDESK_DOMAIN, FRESHDESK_API_KEY,
//                    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// Optional secrets:  FRESHDESK_COMPANY_NAME     (cf_company to keep; default ""
//                                                = sync ALL companies)
//                    SYNC_CREATED_AFTER         (ISO date, default 2026-07-27T00:00:00Z)
//                    SYNC_CONVERSATIONS         ("false" to skip conversations)
//                    SYNC_MIN_INTERVAL_SECONDS  (self-throttle floor, default 90)
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

  // Scope by the cf_company custom field (native company_id is often null).
  // Default "" → keep every company (multi-customer). Set the secret to scope.
  const COMPANY_FILTER = (Deno.env.get("FRESHDESK_COMPANY_NAME") ?? "").trim().toUpperCase();
  const matchesCompany = (t: any) =>
    !COMPANY_FILTER || String(t.custom_fields?.cf_company ?? "").trim().toUpperCase() === COMPANY_FILTER;

  // ── Cooldown — this function fetches ALL conversation pages per ticket, so
  // one full run is now a lot of Freshdesk calls (250+ tickets × up to 30
  // pages each). It's called from three independent, uncoordinated places —
  // pg_cron every 5 min, the frontend's 60s auto-refresh in every open tab,
  // and a manual click (open to anonymous visitors) — with no shared memory
  // between them. Without a floor here, two overlapping tabs alone are
  // enough to blow through Freshdesk's rate limit (this actually happened:
  // sync_log was full of "Freshdesk tickets 429" errors roughly once a
  // minute). Whoever calls first in the window does the real work; everyone
  // else in that window gets the last known result instantly, no Freshdesk
  // calls, no new sync_log row — so spamming this (accidentally via open
  // tabs, or deliberately) is harmless regardless of who's calling.
  const MIN_INTERVAL_MS = Number(Deno.env.get("SYNC_MIN_INTERVAL_SECONDS") ?? "90") * 1000;
  const { data: lastLog } = await supabase
    .from("sync_log")
    .select("started_at, tickets_synced, conversations_synced")
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastLog) {
    const ageMs = Date.now() - Date.parse(lastLog.started_at);
    if (ageMs < MIN_INTERVAL_MS) {
      return json({
        ok: true, throttled: true,
        message: `Synced ${Math.round(ageMs / 1000)}s ago — reusing that result (min interval ${MIN_INTERVAL_MS / 1000}s).`,
        tickets_synced: lastLog.tickets_synced, conversations_synced: lastLog.conversations_synced,
      });
    }
  }

  // open a sync_log row
  const { data: logRow } = await supabase
    .from("sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  try {
    // ── 1. Agents map (id → name) ─────────────────────────────────────────
    const agentsMap: Record<number, string> = {};
    try {
      const aRes = await fetch(`${baseUrl}/agents?per_page=100`, { headers: fdHeaders });
      if (aRes.ok) {
        const agents = await aRes.json();
        for (const a of agents) agentsMap[a.id] = a.contact?.name ?? a.contact?.email ?? "Agent";
      }
    } catch { /* non-fatal */ }

    // ── 2. Fetch tickets created on/after the cutoff (all companies) ──────
    // Ordered created_at desc so we can stop as soon as we cross the cutoff.
    // We do NOT filter by native company_id (it's null for NSE) — scoping by
    // cf_company happens client-side below. include=stats gives due dates.
    const createdAfter = Deno.env.get("SYNC_CREATED_AFTER") ?? "2026-07-27T00:00:00Z";
    const parsedCutoff = Date.parse(createdAfter);
    const createdAfterMs = Number.isNaN(parsedCutoff) ? 0 : parsedCutoff;
    const baseFilter = `?include=requester,company,stats&per_page=100&order_by=created_at&order_type=desc`;

    const allTickets: any[] = [];
    let page = 1;
    while (page <= 20) {
      const res = await fetch(`${baseUrl}/tickets${baseFilter}&page=${page}`, { headers: fdHeaders });
      if (!res.ok) throw new Error(`Freshdesk tickets ${res.status}: ${await res.text()}`);
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      const fresh = batch.filter((t: any) => Date.parse(t.created_at) >= createdAfterMs);
      allTickets.push(...fresh);
      if (fresh.length < batch.length) break; // crossed the cutoff boundary
      if (batch.length < 100) break;
      page++;
    }

    // ── 3. Scope to the target company via cf_company ──────────────────────
    const scoped = allTickets.filter(matchesCompany);

    const now = new Date().toISOString();
    const ticketRows = scoped.map((t) => ({
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
      tags: Array.isArray(t.tags) ? t.tags : [],
      ticket_type: t.type ?? null,
      module: t.custom_fields?.cf_module ?? null,
      sub_type: t.custom_fields?.cf_issue_type ?? null,
      fr_due_by: t.fr_due_by ?? null,
      due_by: t.due_by ?? null,
      fr_escalated: t.fr_escalated ?? false,
      is_escalated: t.is_escalated ?? false,
      spam: t.spam ?? false,
      company_name: t.company?.name ?? t.custom_fields?.cf_company ?? "Unknown",
      requester_name: t.requester?.name ?? null,
      requester_email: t.requester?.email ?? null,
      responder_name: t.responder_id ? (agentsMap[t.responder_id] ?? null) : null,
      sla_policy_id: t.sla_policy_id ?? null,
      custom_fields: t.custom_fields ?? {},
      synced_at: now,
    }));

    // ── 3.5 Status-history capture (SLA Autopsy P0) ────────────────────────
    // Snapshot each scoped ticket's PREVIOUSLY stored status before we
    // overwrite it below, so a change can be diffed and logged. A ticket
    // we've never synced before gets a synthetic starting row instead of a
    // diff (there's nothing to diff against).
    let historyInserted = 0;
    if (ticketRows.length) {
      const scopedIds = ticketRows.map((t) => t.id);
      const prevStatusMap: Record<number, number> = {};
      const { data: prevRows } = await supabase.from("tickets").select("id, status").in("id", scopedIds);
      for (const r of prevRows ?? []) prevStatusMap[r.id] = r.status;

      const historyRows = ticketRows
        .filter((t) => prevStatusMap[t.id] !== undefined && prevStatusMap[t.id] !== t.status)
        .map((t) => ({
          ticket_id: t.id,
          from_status: prevStatusMap[t.id],
          to_status: t.status,
          changed_at: now,             // best known: this sync detected the change
          source: "sync_diff",
          confidence: "exact",
        }))
        .concat(
          ticketRows
            .filter((t) => prevStatusMap[t.id] === undefined)
            .map((t) => ({
              ticket_id: t.id,
              from_status: null,
              to_status: t.status,
              changed_at: t.created_at,
              source: "sync_diff_initial",
              confidence: "approximate",
            }))
        );

      if (historyRows.length) {
        const { error: histErr } = await supabase.from("ticket_status_history").insert(historyRows);
        if (!histErr) historyInserted = historyRows.length;
      }
    }

    if (ticketRows.length) {
      const { error } = await supabase.from("tickets").upsert(ticketRows, { onConflict: "id" });
      if (error) throw error;
    }

    // Purge tickets created before the cutoff (self-corrects older rows).
    let purged = 0;
    if (createdAfterMs > 0) {
      const { data: removed, error: purgeErr } = await supabase
        .from("tickets")
        .delete()
        .lt("created_at", new Date(createdAfterMs).toISOString())
        .select("id");
      if (purgeErr) throw purgeErr;
      purged = removed?.length ?? 0;
    }

    // ── 4. Conversations for the scoped tickets — ALL pages, not just the
    // first 100. A ticket with a long back-and-forth thread previously lost
    // every message past #100 silently, which starved the AI analysis (and
    // anything else reading conversations) of the messages that actually
    // explain what happened. Capped at 30 pages (3,000 messages) purely as a
    // runaway-loop safety valve — no real ticket should ever hit that.
    let convoCount = 0;
    if (SYNC_CONVOS) {
      for (const t of scoped) {
        const convos: any[] = [];
        let cPage = 1;
        while (cPage <= 30) {
          const res = await fetch(`${baseUrl}/tickets/${t.id}/conversations?per_page=100&page=${cPage}`, { headers: fdHeaders });
          if (!res.ok) break;
          const batch = await res.json();
          if (!Array.isArray(batch) || batch.length === 0) break;
          convos.push(...batch);
          if (batch.length < 100) break; // last page
          cPage++;
        }
        if (!convos.length) continue;
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

    return json({ ok: true, company_filter: COMPANY_FILTER || "(all)", fetched: allTickets.length, tickets_synced: ticketRows.length, conversations_synced: convoCount, tickets_purged: purged, status_changes_logged: historyInserted });
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
