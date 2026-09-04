// ============================================================================
// Similar-cases analysis — client for the auto-analyze-ticket Edge Function's
// manual-dashboard path.
//
// This is the user-triggered counterpart to the automatic webhook flow: a
// person clicks "Analyze Similar Cases" in the ticket drawer, sees the exact
// note before anything is sent anywhere, and only THEN — a separate, explicit
// click — does it go to Freshdesk. Two calls, two edge-function modes:
//   1. analyzeSimilarCases()  → { dry_run: true }   — builds the note, posts nothing.
//   2. postAnalysisNote()     → { mode: "post_note" } — posts exactly what was shown.
// ============================================================================

import { supabase } from "./supabase";

export type AnalysisConfidence = "high" | "medium" | "low";

export interface SimilarCasesResult {
  ok: boolean;
  ticket_id: number;
  /** false whenever nothing was posted — always true for the dry-run path. */
  posted: boolean;
  /** True when this came straight from ticket_similar_cases — no Gemini call,
   *  no Freshdesk API call, effectively free. False when it was just computed
   *  fresh (and therefore just got written to that cache for next time). */
  cached?: boolean;
  /** When the underlying analysis was generated — from the cache row on a
   *  cache hit, or "now" on a fresh run. */
  generated_at?: string;
  /** Present when the pipeline ran but found nothing worth surfacing, or the
   *  ticket itself couldn't be analyzed (e.g. it's already Closed on Freshdesk
   *  outside of dry_run — not reachable from this manual path, but the field
   *  is still typed for the shared response shape). */
  reason?: string;
  similar_count?: number;
  confidence?: AnalysisConfidence;
  mean_similarity?: number;
  median_resolve_minutes?: number | null;
  recommended_assignee?: string | null;
  note_markdown?: string;
  note_html?: string;
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

/** Runs the similar-cases pipeline (embed → semantic search → Gemini
 *  synthesis) for one ticket and returns the would-be note. Nothing is
 *  written to Freshdesk and no rate-limit row is claimed. Served from the
 *  ticket_similar_cases cache when one exists — pass `force: true` to bypass
 *  it and spend a fresh Gemini call, mirroring the "Regenerate" pattern the
 *  SLA Autopsy panel already uses. */
export const analyzeSimilarCases = async (ticketId: number, opts: { force?: boolean } = {}): Promise<SimilarCasesResult> => {
  if (!supabase) return { ok: false, ticket_id: ticketId, posted: false, error: "Supabase not configured" };
  const { data, error } = await supabase.functions.invoke("auto-analyze-ticket", {
    body: { ticket_id: ticketId, dry_run: true, force: !!opts.force },
  });
  if (error) return { ok: false, ticket_id: ticketId, posted: false, error: await extractError(error) };
  return data as SimilarCasesResult;
};

/** Posts the note the user already reviewed as a private Freshdesk note.
 *  Takes the exact markdown/HTML the dry run returned — this call does not
 *  re-run the analysis, so what gets posted is guaranteed to match what was
 *  shown on screen. */
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
