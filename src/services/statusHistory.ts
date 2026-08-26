// ============================================================================
// Ticket status history — the real transition log behind the Timeline and
// Activity views.
//
// This is deliberately a DIRECT table read, not an analyze-ticket call: the
// timeline is core ticket information and must render for every visitor with
// zero AI involvement and zero AI cost. `ticket_status_history` is readable
// by anon (RLS: `for select using (true)`), so this works in public mode too.
//
// The segment maths below mirrors computeSegments() in
// supabase/functions/analyze-ticket/index.ts. Edge functions can't import
// frontend code, so the two are kept in sync by hand — change both together.
// ============================================================================

import { supabase } from "./supabase";
import { Ticket } from "@/types/freshdesk";
import { AIAnalysisSegment, AttributionTeam } from "@/types/aiAnalysis";
import { SLA_DONE_STATUSES, statusLabel } from "@/lib/tickets";

export interface StatusEvent {
  id: number;
  from_status: number | null;
  to_status: number;
  changed_at: string;
  source: string;
  confidence: "exact" | "approximate";
}

export const fetchStatusHistory = async (ticketId: number): Promise<StatusEvent[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ticket_status_history")
    .select("id, from_status, to_status, changed_at, source, confidence")
    .eq("ticket_id", ticketId)
    .order("changed_at", { ascending: true });
  if (error || !data) return [];
  return data as StatusEvent[];
};

// Status 8 (Waiting on Customer) = the ball is in NSE's court; 7/9 (On Tech /
// On Product) = engineering owns it; everything else is Aerchain support.
const teamFor = (status: number): AttributionTeam =>
  status === 8 ? "nse" : status === 7 || status === 9 ? "engineering" : "aerchain";

/** Turns the raw transition log into closed [start, end) spans with durations.
 *  The final span runs to the resolution timestamp on a done ticket, or to
 *  "now" on a live one. */
export const buildSegments = (ticket: Ticket, history: StatusEvent[]): AIAnalysisSegment[] => {
  const sorted = [...history].sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at));
  const endAnchor = SLA_DONE_STATUSES.includes(ticket.status) ? ticket.updated_at : new Date().toISOString();
  return sorted.map((row, i) => {
    const startsAt = row.changed_at;
    const endsAt = i + 1 < sorted.length ? sorted[i + 1].changed_at : endAnchor;
    return {
      index: i,
      status: row.to_status,
      label: statusLabel(row.to_status),
      team: teamFor(row.to_status),
      startsAt,
      endsAt,
      minutes: Math.max(0, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000)),
      confidence: row.confidence,
    };
  });
};

export interface StatusShare {
  status: number;
  label: string;
  minutes: number;
  percent: number;
}

/** Share of total elapsed time spent in each status, biggest first — the
 *  numbers behind the donut and its legend. Purely arithmetic on real spans;
 *  nothing here is estimated or model-generated. */
export const statusBreakdown = (segments: AIAnalysisSegment[]): StatusShare[] => {
  const total = segments.reduce((n, s) => n + s.minutes, 0);
  if (total === 0) return [];
  const byStatus = new Map<number, StatusShare>();
  for (const s of segments) {
    const row = byStatus.get(s.status) ?? { status: s.status, label: s.label, minutes: 0, percent: 0 };
    row.minutes += s.minutes;
    byStatus.set(s.status, row);
  }
  return [...byStatus.values()]
    .map((r) => ({ ...r, percent: Math.round((r.minutes / total) * 100) }))
    .sort((a, b) => b.minutes - a.minutes);
};
