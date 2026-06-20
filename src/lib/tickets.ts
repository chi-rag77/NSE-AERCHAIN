import { Ticket, Priority, Status } from "@/types/freshdesk";
import { differenceInMinutes, parseISO, addHours } from "date-fns";

/* ----------------------------------------------------------------------------
 * Static maps
 * ------------------------------------------------------------------------- */

export const PRIORITY_META: Record<Priority, { label: string; tone: string; dot: string }> = {
  1: { label: "Low", tone: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20", dot: "bg-emerald-500" },
  2: { label: "Medium", tone: "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20", dot: "bg-sky-500" },
  3: { label: "High", tone: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20", dot: "bg-amber-500" },
  4: { label: "Critical", tone: "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20", dot: "bg-rose-500" },
};

export const STATUS_META: Record<number, { label: string; tone: string }> = {
  2: { label: "Open", tone: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20" },
  3: { label: "Pending", tone: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20" },
  4: { label: "Resolved", tone: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20" },
  5: { label: "Closed", tone: "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/20" },
  6: { label: "Waiting", tone: "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20" },
  7: { label: "In Progress", tone: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20" },
  8: { label: "On Hold", tone: "bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20" },
};

export const priorityLabel = (p: number) => PRIORITY_META[p as Priority]?.label ?? String(p);
export const statusLabel = (s: number) => STATUS_META[s]?.label ?? "Unknown";

/* ----------------------------------------------------------------------------
 * SLA
 * ------------------------------------------------------------------------- */

const SLA_RESOLUTION_HOURS: Record<Priority, number> = { 4: 4, 3: 24, 2: 48, 1: 72 };

export type SLAState = "on_track" | "attention" | "breached" | "met";

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
  if (t.status === 4 || t.status === 5) {
    return { state: "met", label: "Met", remaining: "—", remainingMinutes: 0, percent: 100, tone: "text-emerald-600", dot: "bg-emerald-500" };
  }

  const created = parseISO(t.created_at);
  const limit = addHours(created, SLA_RESOLUTION_HOURS[t.priority]);
  const totalMinutes = SLA_RESOLUTION_HOURS[t.priority] * 60;
  const remainingMinutes = differenceInMinutes(limit, new Date());
  const percent = Math.max(0, Math.min(100, (remainingMinutes / totalMinutes) * 100));

  let state: SLAState = "on_track";
  if (remainingMinutes < 0) state = "breached";
  else if (percent < 30) state = "attention";

  const abs = Math.abs(remainingMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const remaining = `${remainingMinutes < 0 ? "-" : ""}${h > 0 ? `${h}h ` : ""}${m}m`;

  const meta: Record<SLAState, { label: string; tone: string; dot: string }> = {
    on_track: { label: "On Track", tone: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
    attention: { label: "Attention", tone: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
    breached: { label: "Breached", tone: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
    met: { label: "Met", tone: "text-emerald-600", dot: "bg-emerald-500" },
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

export const ticketCategory = (t: Ticket): string => t.tags[0] ?? "";

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
