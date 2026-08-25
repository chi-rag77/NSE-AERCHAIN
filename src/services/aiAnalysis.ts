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
