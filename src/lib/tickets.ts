import { Ticket, Priority, Status } from "@/types/freshdesk";
import { differenceInMinutes, parseISO, addHours } from "date-fns";

/* ----------------------------------------------------------------------------
 * Static maps
 * ------------------------------------------------------------------------- */

export const PRIORITY_META: Record<Priority, { label: string; tone: string; dot: string }> = {
  1: { label: "Low", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300", dot: "bg-emerald-500" },
  2: { label: "Medium", tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300", dot: "bg-sky-500" },
  3: { label: "High", tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300", dot: "bg-amber-500" },
  4: { label: "Critical", tone: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300", dot: "bg-rose-500" },
};

// Real NSE Freshdesk status codes (from /ticket_fields)
export const STATUS_META: Record<number, { label: string; tone: string }> = {
  2: { label: "Open", tone: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300" },
  3: { label: "Pending", tone: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" },
  4: { label: "Resolved", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" },
  5: { label: "Closed", tone: "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-300" },
  7: { label: "On Tech", tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300" },
  8: { label: "Waiting on Customer", tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" },
  9: { label: "On Product", tone: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300" },
};

// Status 8 = Waiting on Customer → ball is in NSE's court, SLA timer paused.
export const SLA_PAUSED_STATUS = 8;
// Resolved / closed → SLA clock stopped (done).
export const SLA_DONE_STATUSES = [4, 5];

export const priorityLabel = (p: number) => PRIORITY_META[p as Priority]?.label ?? String(p);
export const statusLabel = (s: number) => STATUS_META[s]?.label ?? "Unknown";

/* ----------------------------------------------------------------------------
 * SLA — Aerchain SLA document (Section 6)
 *
 * Severity 1 (Critical / P4) — Full resolution: 8 business hours
 * Severity 2 (High    / P3) — Full resolution: 32 business hours
 * Severity 3 (Medium  / P2) — Full resolution: 64 business hours
 * Severity 3 (Low     / P1) — Full resolution: 15 business days (120 biz hrs)
 *
 * All levels: Acknowledgment within 15 min, Analysis within 60 min.
 * Business hours = 9 h/day (09:00–18:00). Values below are calendar hours
 * approximated from business hours (÷ 9 h × 24 h).
 * ------------------------------------------------------------------------- */

// Calendar-hour equivalents of the business-hour SLA targets
const BIZ_TO_CAL = (bizHours: number) => Math.round((bizHours / 9) * 24);

export const SLA_RESOLUTION_HOURS: Record<Priority, number> = {
  4: BIZ_TO_CAL(8),    // Severity 1 — Critical: 8 biz hrs ≈ 21 cal hrs
  3: BIZ_TO_CAL(32),   // Severity 2 — High:     32 biz hrs ≈ 85 cal hrs
  2: BIZ_TO_CAL(64),   // Severity 3 — Medium:   64 biz hrs ≈ 171 cal hrs
  1: BIZ_TO_CAL(120),  // Severity 3 — Low:      15 biz days ≈ 320 cal hrs
};

// Attention threshold: warn when <30% of SLA window remains
const SLA_ATTENTION_PERCENT = 30;

// Fixed targets (same across all severity levels per SLA doc)
export const SLA_ACK_MINUTES = 15;       // Acknowledgment: 15 min
export const SLA_ANALYSIS_MINUTES = 60;  // Analysis: 60 min

export const SLA_LABELS: Record<Priority, { severity: string; workaround: string; resolution: string }> = {
  4: { severity: "Severity 1 — Business Critical", workaround: "2 business hours", resolution: "8 business hours" },
  3: { severity: "Severity 2 — System Defect", workaround: "16 business hours", resolution: "32 business hours" },
  2: { severity: "Severity 3 — Minor Error", workaround: "64 business hours", resolution: "15 business days" },
  1: { severity: "Severity 3 — Minor Error", workaround: "64 business hours", resolution: "15 business days" },
};

export type SLAState = "on_track" | "attention" | "breached" | "met" | "paused";

export interface SLAInfo {
  state: SLAState;
  label: string;
  /** human readable remaining time, negative => overdue */
  remaining: string;
  remainingMinutes: number;
  /** percent of the SLA window still available (0-100) */
  percent: number;
  tone: string;
  dot: string;
}

export const computeSLA = (t: Ticket): SLAInfo => {
  // Resolved / closed tickets are considered met.
  if (SLA_DONE_STATUSES.includes(t.status)) {
    return { state: "met", label: "Met", remaining: "—", remainingMinutes: 0, percent: 100, tone: "text-emerald-600", dot: "bg-emerald-500" };
  }

  // Waiting on Customer → SLA timer is OFF; the ball is in NSE's court.
  if (t.status === SLA_PAUSED_STATUS) {
    return { state: "paused", label: "Paused — Waiting on NSE", remaining: "Paused", remainingMinutes: Infinity, percent: 100, tone: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500" };
  }

  const created = parseISO(t.created_at);
  const limit = addHours(created, SLA_RESOLUTION_HOURS[t.priority]);
  const totalMinutes = SLA_RESOLUTION_HOURS[t.priority] * 60;
  const remainingMinutes = differenceInMinutes(limit, new Date());
  const percent = Math.max(0, Math.min(100, (remainingMinutes / totalMinutes) * 100));

  let state: SLAState = "on_track";
  if (remainingMinutes < 0) state = "breached";
  else if (percent < SLA_ATTENTION_PERCENT) state = "attention";

  const abs = Math.abs(remainingMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const remaining = `${remainingMinutes < 0 ? "-" : ""}${h > 0 ? `${h}h ` : ""}${m}m`;

  const meta: Record<SLAState, { label: string; tone: string; dot: string }> = {
    on_track: { label: "On Track", tone: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
    attention: { label: "Attention", tone: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
    breached: { label: "Breached", tone: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
    met: { label: "Met", tone: "text-emerald-600", dot: "bg-emerald-500" },
    paused: { label: "Paused — Waiting on NSE", tone: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
  };

  return { state, remaining, remainingMinutes, percent, ...meta[state] };
};

/* ----------------------------------------------------------------------------
 * Department / category derived from real Freshdesk data
 * requester_name often contains the dept in parens: "John Smith (NSE-F&A-SYS)"
 * ------------------------------------------------------------------------- */

const extractDept = (name: string | null): string | null => {
  if (!name) return null;
  const match = name.match(/\(([^)]+)\)$/);
  return match ? match[1] : null;
};

export const ticketDept = (t: Ticket): string => {
  const dept = extractDept(t.requester_name);
  return dept ? `NSE — ${dept}` : "NSE";
};

export const ticketCategory = (t: Ticket): string =>
  t.ticket_type ?? t.module ?? t.tags[0] ?? "";

export const requesterDisplayName = (t: Ticket): string =>
  t.requester_name ? t.requester_name.replace(/\s*\([^)]*\)$/, "").trim() : "Unknown";

/* ----------------------------------------------------------------------------
 * Aggregate metrics for the dashboard
 * ------------------------------------------------------------------------- */

export interface DashboardMetrics {
  total: number;
  open: number;
  resolved: number;
  critical: number;
  breached: number;
  attention: number;
  onTrack: number;
  slaCompliance: number; // %
  healthScore: number; // 0-100
}

export const computeMetrics = (tickets: Ticket[]): DashboardMetrics => {
  const total = tickets.length;
  const resolved = tickets.filter((t) => [4, 5].includes(t.status)).length;
  const open = total - resolved;
  const critical = tickets.filter((t) => t.priority === 4 && t.status === 2).length;

  let breached = 0, attention = 0, onTrack = 0;
  tickets.forEach((t) => {
    const s = computeSLA(t).state;
    if (s === "breached") breached++;
    else if (s === "attention") attention++;
    else onTrack++;
  });

  const active = open || 1;
  const slaCompliance = total === 0 ? 100 : Math.round(((total - breached) / total) * 100);
  // Health: weighted blend of SLA health and resolution rate, clamped 0-100.
  const resolutionRate = total === 0 ? 100 : (resolved / total) * 100;
  const breachPenalty = (breached / active) * 100;
  const healthScore = Math.max(0, Math.min(100, Math.round(0.55 * slaCompliance + 0.35 * resolutionRate - 0.4 * breachPenalty + 18)));

  return { total, open, resolved, critical, breached, attention, onTrack, slaCompliance, healthScore };
};

export const initials = (name?: string) =>
  (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
