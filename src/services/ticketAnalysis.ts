// ============================================================================
// Similar-cases analysis — client for the auto-analyze-ticket Edge Function.
//
// The dashboard's "Analyze Similar Cases" button is the same one-shot,
// auto-posting pipeline the Freshdesk "ticket created" webhook uses — not a
// separate preview-then-confirm flow. Clicking it embeds, searches, and
// generates, then posts straight to Freshdesk as a private note. This is
// deliberately gated to signed-in users only (never shown in guest/public
// mode) — see TicketDrawer.tsx.
//
// Because it's the SAME pipeline and the SAME one-shot claim
// (ticket_auto_analysis.ticket_id is a primary key), most tickets a signed-in
// user opens will already have a row here — the webhook firing at creation
// almost always beats a human getting to the drawer. fetchAutoAnalysis()
// reads that row for free; triggerAnalysis() is only needed for a ticket the
// webhook missed (predates the feature, or failed and is past cooldown).
// ============================================================================

import { supabase } from "./supabase";

export type AnalysisConfidence = "high" | "medium" | "low";
export type AutoAnalysisStatus = "in_progress" | "posted" | "skipped" | "failed";

/** A row from ticket_auto_analysis — the one ledger both the webhook and the
 *  manual trigger write to, so "what's on this ticket" always means the
 *  same thing regardless of which one produced it. */
export interface AutoAnalysisRow {
  ticket_id: number;
  status: AutoAnalysisStatus;
  trigger_source: string;
  similar_count: number;
  mean_similarity: number | null;
  median_resolve_minutes: number | null;
  recommended_assignee_name: string | null;
  confidence: AnalysisConfidence | null;
  note_body: string | null;
  freshdesk_note_id: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TriggerResult {
  ok: boolean;
  ticket_id: number;
  posted: boolean;
  reason?: string;
  similar_count?: number;
  confidence?: AnalysisConfidence;
  mean_similarity?: number;
  median_resolve_minutes?: number | null;
  recommended_assignee?: string | null;
  note_markdown?: string;
  note_html?: string;
  freshdesk_note_id?: number;
  error?: string;
}

/** Best-effort extraction of the real error body Supabase's FunctionsHttpError hides behind a generic message. */
const extractError = async (error: any): Promise<string> => {
  try {
    if (error?.context?.json) {
      const body = await error.context.json();
      if (body?.error) return body.error as string;
    }
  } catch { /* fall through to generic message */ }
  return error?.message ?? "Analysis failed";
};

/** Free — direct table read, no Edge Function call. Returns null when this
 *  ticket has no ledger row yet (the webhook hasn't run, or this ticket
 *  predates the feature). */
export const fetchAutoAnalysis = async (ticketId: number): Promise<AutoAnalysisRow | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ticket_auto_analysis").select("*").eq("ticket_id", ticketId).maybeSingle();
  if (error || !data) return null;
  return data as AutoAnalysisRow;
};

/** Runs the real pipeline for one ticket — embeds, searches, synthesizes,
 *  and (if it finds anything) posts a private Freshdesk note immediately.
 *  No preview step: this IS the post. Protected by the same PK claim the
 *  webhook uses, so calling it on a ticket that already has a `posted` or
 *  `in_progress` row is a safe no-op (`posted: false`, a `reason` saying so)
 *  rather than a duplicate note. A `failed` row can be retried; `skipped`
 *  cannot be re-run without deleting its row (the floor genuinely wasn't
 *  cleared last time — see the Tuning note in supabase/README.md). */
export const triggerAnalysis = async (ticketId: number): Promise<TriggerResult> => {
  if (!supabase) return { ok: false, ticket_id: ticketId, posted: false, error: "Supabase not configured" };
  const { data, error } = await supabase.functions.invoke("auto-analyze-ticket", {
    body: { ticket_id: ticketId },
  });
  if (error) return { ok: false, ticket_id: ticketId, posted: false, error: await extractError(error) };
  return data as TriggerResult;
};

// ── Preview-only path (manual QA, not used by the dashboard UI) ────────────
// Kept for testing the pipeline without risking a real Freshdesk write —
// dry_run skips the claim and the post entirely, and postAnalysisNote sends
// exactly the markdown/HTML a prior dry_run returned. See the Edge Function's
// own header comment for the full mode list.

export interface SimilarCasesResult extends TriggerResult {
  cached?: boolean;
  generated_at?: string;
}

export const analyzeSimilarCases = async (ticketId: number, opts: { force?: boolean } = {}): Promise<SimilarCasesResult> => {
  if (!supabase) return { ok: false, ticket_id: ticketId, posted: false, error: "Supabase not configured" };
  const { data, error } = await supabase.functions.invoke("auto-analyze-ticket", {
    body: { ticket_id: ticketId, dry_run: true, force: !!opts.force },
  });
  if (error) return { ok: false, ticket_id: ticketId, posted: false, error: await extractError(error) };
  return data as SimilarCasesResult;
};

export const postAnalysisNote = async (
  ticketId: number,
  noteMarkdown: string,
  noteHtml: string,
): Promise<{ ok: boolean; freshdesk_note_id?: number; error?: string }> => {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase.functions.invoke("auto-analyze-ticket", {
    body: { mode: "post_note", ticket_id: ticketId, note_markdown: noteMarkdown, note_html: noteHtml },
  });
  if (error) return { ok: false, error: await extractError(error) };
  if (!data?.ok) return { ok: false, error: data?.error ?? "Post failed" };
  return { ok: true, freshdesk_note_id: data.freshdesk_note_id };
};
