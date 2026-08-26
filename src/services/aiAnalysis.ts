// ============================================================================
// SLA Autopsy — client for the analyze-ticket Edge Function.
//
// Nothing here calls Gemini directly or ever fires on its own — every call
// is the direct result of a user clicking "Analyze" (or "Regenerate") in the
// ticket drawer. See analyze-ticket/index.ts for the cost/cache logic.
// ============================================================================

import { supabase } from "./supabase";
import { AIAnalysis } from "@/types/aiAnalysis";

interface Result {
  ok: boolean;
  data?: AIAnalysis;
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
  return error?.message ?? "AI analysis failed";
};

export const analyzeTicket = async (ticketId: number, opts: { force?: boolean } = {}): Promise<Result> => {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase.functions.invoke("analyze-ticket", {
    body: { ticket_id: ticketId, force: !!opts.force },
  });
  if (error) return { ok: false, error: await extractError(error) };
  if (!data?.data) return { ok: false, error: data?.error ?? "AI analysis returned no data" };
  return { ok: true, data: data.data as AIAnalysis };
};

/** Lightweight cache read (no AI cost) — used to preview a ticket's "primary
 * cause" in the Tickets list without opening the drawer. */
export const fetchPrimaryCauses = async (): Promise<Record<number, string>> => {
  if (!supabase) return {};
  const { data, error } = await supabase.from("ticket_ai_analysis").select("ticket_id, primary_cause");
  if (error || !data) return {};
  const map: Record<number, string> = {};
  for (const row of data) if (row.primary_cause) map[row.ticket_id] = row.primary_cause;
  return map;
};

/** Direct cache read (no AI cost, no edge function round trip) — used to
 * auto-show an already-generated analysis the instant the drawer opens,
 * without an "Analyze" click. Returns null if this ticket has never been
 * analyzed; a genuinely new analysis still requires the user to click
 * Analyze (that's the one path that can spend a Gemini call). */
export const fetchCachedAnalysis = async (ticketId: number): Promise<AIAnalysis | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from("ticket_ai_analysis").select("*").eq("ticket_id", ticketId).maybeSingle();
  if (error || !data) return null;
  return {
    ticket_id: data.ticket_id,
    generated: false,
    generated_at: data.generated_at,
    generated_by: data.generated_by,
    model: data.model,
    confidence: data.confidence,
    completeness_note: data.completeness_note,
    segments: data.segments ?? [],
    attribution: data.attribution ?? { aerchain: 0, nse: 0, engineering: 0 },
    benchmark: data.benchmark ?? null,
    primary_cause: data.primary_cause,
    narrative: data.narrative,
    formal_narrative: data.formal_narrative,
    prevention_tip: data.prevention_tip,
    citations: data.citations ?? [],
  };
};

export const submitDispute = async (
  ticketId: number,
  reason: string,
  analysisGeneratedAt?: string
): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from("ticket_ai_disputes").insert({
    ticket_id: ticketId,
    reason,
    analysis_generated_at: analysisGeneratedAt ?? null,
    created_by: userRes?.user?.id ?? null,
    created_by_email: userRes?.user?.email ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};
