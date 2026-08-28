import { Ticket, Priority } from "@/types/freshdesk";
import { COMPANY_NAME } from "@/config";
import {
  computeSLA, SLA_RESOLUTION_HOURS, SLA_LABELS, ticketDept,
} from "@/lib/tickets";
import { metSLA, resolutionHours, priorityName } from "@/lib/reportData";
import {
  parseISO, subDays, startOfDay, endOfDay, isWithinInterval,
  isBefore, format, differenceInHours,
} from "date-fns";

/* ----------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */
export const SLA_TARGET = 95;        // contractual compliance target (%)
export const WINDOW_DAYS = 30;       // rolling reporting window
const RESOLVED = (t: Ticket) => t.status === 4 || t.status === 5;
const AWAITING_NSE = (t: Ticket) => t.status === 8;                 // Waiting on Customer (SLA paused)
const AWAITING_AERCHAIN = (t: Ticket) => !RESOLVED(t) && t.status !== 8; // Open/Pending/On Tech/On Product

const within = (iso: string, start: Date, end: Date) =>
  isWithinInterval(parseISO(iso), { start, end });

/**
 * Tickets created within the selected reporting window (last `days`, inclusive).
 * Used by the "at a glance" breakdowns/distributions so they refresh when the
 * dashboard date-range filter changes. Trend charts intentionally keep the full
 * ticket set — they compute running backlog/deltas across the window themselves.
 */
export const windowedTickets = (tickets: Ticket[], days: number = WINDOW_DAYS): Ticket[] => {
  const now = new Date();
  const start = startOfDay(subDays(now, days - 1));
  return tickets.filter((t) => within(t.created_at, start, now));
};

/** Prior-window volume needed before a percentage change means anything. A
 *  percentage off a tiny base is arithmetically true but useless: 3 resolved
 *  last period vs 257 this period is "+8467%", which tells a reader nothing
 *  except that we had almost no history to compare against. */
const MIN_DELTA_BASELINE = 10;
/** Above this, a percentage stops informing and starts looking broken. */
const MAX_SENSIBLE_PCT = 300;

/** A period-over-period change, carrying both readings so the UI can show
 *  whichever is actually informative. `pct` is null whenever a percentage
 *  would mislead (base too small, or the ratio is so large it reads as a
 *  glitch); `abs` is always true and always meaningful. */
export interface Trend {
  pct: number | null;
  abs: number;
}

const trend = (curr: number, prev: number): Trend => {
  const abs = curr - prev;
  if (prev < MIN_DELTA_BASELINE) return { pct: null, abs };
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { pct: Math.abs(pct) > MAX_SENSIBLE_PCT ? null : pct, abs };
};

/* ----------------------------------------------------------------------------
 * Zone 1 — Verdict + pulse + ball-in-court
 * ------------------------------------------------------------------------- */
export type Verdict = "healthy" | "watch" | "at_risk";

export interface PulseStat {
  key: string;
  label: string;
  value: number;
  /** Change vs the previous window, or null when this stat has no comparable
   *  prior reading at all (see the At Risk / Breached note in buildAssurance). */
  delta: Trend | null;
  /** is an increase a good thing? (resolved↑ good, breaching↑ bad) */
  goodWhenUp: boolean;
}

export interface AssuranceSummary {
  verdict: Verdict;
  statement: string;
  slaCompliance: number;        // % over the window
  slaDelta: number | null;      // pts change vs previous window
  breaching: number;            // currently breached + at-risk open
  pulse: PulseStat[];
  ballInCourt: { aerchain: number; nse: number };
  windowDays: number;
  windowLabel: string;
}

export const buildAssurance = (
  tickets: Ticket[],
  windowDays: number = WINDOW_DAYS,
  companyLabel: string = COMPANY_NAME,
): AssuranceSummary => {
  const now = new Date();
  const curStart = startOfDay(subDays(now, windowDays - 1));
  const prevStart = startOfDay(subDays(now, windowDays * 2 - 1));
  const prevEnd = endOfDay(subDays(now, windowDays));

  const createdCur = tickets.filter((t) => within(t.created_at, curStart, now));
  const createdPrev = tickets.filter((t) => within(t.created_at, prevStart, prevEnd));
  const resolvedCur = tickets.filter((t) => RESOLVED(t) && within(t.updated_at, curStart, now));
  const resolvedPrev = tickets.filter((t) => RESOLVED(t) && within(t.updated_at, prevStart, prevEnd));

  // Compliance over the window: of tickets resolved in-window, % that met SLA;
  // fall back to live state across all tickets when nothing resolved yet.
  const complianceOf = (set: Ticket[]) =>
    set.length ? Math.round((set.filter(metSLA).length / set.length) * 100) : null;
  const curComp = complianceOf(resolvedCur) ?? Math.round((tickets.filter(metSLA).length / Math.max(1, tickets.length)) * 100);
  const prevComp = complianceOf(resolvedPrev);
  const slaDelta = prevComp === null ? null : curComp - prevComp;

  const openNow = tickets.filter((t) => !RESOLVED(t)).length;
  // approximate open backlog at window start: created before curStart & not resolved before curStart
  const openPrev = tickets.filter(
    (t) => isBefore(parseISO(t.created_at), curStart) &&
      !(RESOLVED(t) && isBefore(parseISO(t.updated_at), curStart))
  ).length;

  // Live count of everything currently breached or at-risk — used in BOTH the
  // headline and the pulse stat so they always agree.
  let breaching = 0;
  tickets.forEach((t) => {
    const s = computeSLA(t).state;
    if (s === "breached" || s === "attention") breaching++;
  });
  // No delta for this one, deliberately. `breaching` is a live snapshot of the
  // whole open population; the only "previous" figure available was the count
  // of tickets *created in the prior window* that are breached today — a
  // different population entirely, so the comparison was apples-to-oranges.
  // A true prior snapshot would need breach state recorded over time, which
  // isn't captured yet.

  const verdict: Verdict =
    curComp >= SLA_TARGET && breaching === 0 ? "healthy" :
    curComp >= 85 ? "watch" : "at_risk";

  // Context-aware monitoring statement: never misleading about what the
  // numbers mean. Breaching = currently at-risk or breached (live SLA
  // snapshot), NOT work queue. Compliance = % of resolved in-window that met
  // SLA, or live state across all when nothing resolved yet.
  const generateStatement = (): string => {
    const breachingText = breaching === 0 ? "no at-risk tickets" : `${breaching} ${breaching === 1 ? "ticket" : "tickets"} at risk or breached`;

    if (verdict === "healthy") {
      return `${companyLabel} support is in great shape — ${curComp}% SLA compliance and every ticket comfortably on track.`;
    }

    if (verdict === "watch") {
      return `${companyLabel} support is tracking well at ${curComp}% SLA compliance. We have ${breachingText} — prioritizing these to maintain service strength.`;
    }

    // "at_risk" verdict
    return `We're focused on lifting ${companyLabel} service levels. Currently at ${curComp}% SLA compliance with ${breachingText} — our team is prioritizing these to restore compliance to target (${SLA_TARGET}%).`;
  };

  const statement = generateStatement();

  const pulse: PulseStat[] = [
    { key: "new", label: "New", value: createdCur.length, delta: trend(createdCur.length, createdPrev.length), goodWhenUp: false },
    { key: "resolved", label: "Resolved", value: resolvedCur.length, delta: trend(resolvedCur.length, resolvedPrev.length), goodWhenUp: true },
    { key: "backlog", label: "Open Backlog", value: openNow, delta: trend(openNow, openPrev), goodWhenUp: false },
    { key: "breaching", label: "At Risk / Breached", value: breaching, delta: null, goodWhenUp: false },
  ];

  return {
    verdict,
    statement,
    slaCompliance: curComp,
    slaDelta,
    breaching,
    pulse,
    ballInCourt: {
      aerchain: tickets.filter(AWAITING_AERCHAIN).length,
      nse: tickets.filter(AWAITING_NSE).length,
    },
    windowDays,
    windowLabel: `Last ${windowDays} days`,
  };
};

/* ----------------------------------------------------------------------------
 * Zone 2 — Trends
 * ------------------------------------------------------------------------- */

export interface BacklogPoint { date: string; created: number; resolved: number; backlog: number; }

export const backlogTrend = (tickets: Ticket[], days = WINDOW_DAYS): BacklogPoint[] => {
  const now = new Date();
  const out: BacklogPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = subDays(now, i);
    const s = startOfDay(day);
    const e = endOfDay(day);
    const created = tickets.filter((t) => within(t.created_at, s, e)).length;
    const resolved = tickets.filter((t) => RESOLVED(t) && within(t.updated_at, s, e)).length;
    // running open backlog at end of this day
    const backlog = tickets.filter(
      (t) => !isBefore(e, parseISO(t.created_at)) &&            // created on/before day end
        !(RESOLVED(t) && isBefore(parseISO(t.updated_at), e))   // not resolved before day end
    ).length;
    out.push({ date: format(day, "d MMM"), created, resolved, backlog });
  }
  return out;
};

export interface CompliancePoint { date: string; compliance: number; target: number; }

/** Rolling 7-day SLA compliance for each of the last `days`. */
export const complianceTrend = (tickets: Ticket[], days = WINDOW_DAYS): CompliancePoint[] => {
  const now = new Date();
  const out: CompliancePoint[] = [];
  let last = SLA_TARGET;
  for (let i = days - 1; i >= 0; i--) {
    const day = subDays(now, i);
    const winStart = startOfDay(subDays(day, 6));
    const winEnd = endOfDay(day);
    const resolved = tickets.filter((t) => RESOLVED(t) && within(t.updated_at, winStart, winEnd));
    const comp = resolved.length ? Math.round((resolved.filter(metSLA).length / resolved.length) * 100) : last;
    last = comp;
    out.push({ date: format(day, "d MMM"), compliance: comp, target: SLA_TARGET });
  }
  return out;
};

export interface ResolutionBar {
  priority: string;
  severity: string;
  avgHours: number;
  targetHours: number;
  withinTarget: boolean;
  count: number;
}

export const resolutionVsTarget = (
  tickets: Ticket[],
  windowDays: number = WINDOW_DAYS,
): ResolutionBar[] => {
  const scoped = windowedTickets(tickets, windowDays);
  return ([4, 3, 2, 1] as Priority[]).map((p) => {
    const resolved = scoped.filter((t) => t.priority === p && RESOLVED(t));
    const durs = resolved.map((t) => resolutionHours(t) ?? 0);
    const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
    const target = SLA_RESOLUTION_HOURS[p];
    return {
      priority: priorityName(p),
      severity: SLA_LABELS[p].severity,
      avgHours: Math.round(avg * 10) / 10,
      targetHours: target,
      withinTarget: avg <= target,
      count: resolved.length,
    };
  });
};

export interface SeveritySlice { priority: string; count: number; color: string; }

export const severityMix = (
  tickets: Ticket[],
  windowDays: number = WINDOW_DAYS,
): SeveritySlice[] => {
  const scoped = windowedTickets(tickets, windowDays);
  const colors: Record<number, string> = { 4: "#f43f5e", 3: "#f59e0b", 2: "#6366f1", 1: "#10b981" };
  return ([4, 3, 2, 1] as Priority[]).map((p) => ({
    priority: priorityName(p),
    count: scoped.filter((t) => t.priority === p).length,
    color: colors[p],
  }));
};

/* ----------------------------------------------------------------------------
 * Zone 3 — Attention + breakdowns
 * ------------------------------------------------------------------------- */

export const atRiskTickets = (tickets: Ticket[], limit = 4): Ticket[] =>
  tickets
    .filter((t) => ["breached", "attention"].includes(computeSLA(t).state))
    .sort((a, b) => computeSLA(a).remainingMinutes - computeSLA(b).remainingMinutes)
    .slice(0, limit);

export interface Breakdown { label: string; count: number; pct: number; }

const toBreakdown = (map: Map<string, number>, total: number, limit: number): Breakdown[] =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count, pct: total ? Math.round((count / total) * 100) : 0 }));

export const categoryBreakdown = (tickets: Ticket[], limit = 5): Breakdown[] => {
  const m = new Map<string, number>();
  tickets.forEach((t) => {
    // Prefer Freshdesk native Type (Query/Bug/Tech-Task…), fall back to module, then first tag
    const k = t.ticket_type ?? t.module ?? t.tags[0] ?? "Uncategorised";
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return toBreakdown(m, tickets.length, limit);
};

/** Breakdown by Freshdesk Module (cf_module): PO, Invoice, GRN, PR, … */
export const moduleBreakdown = (tickets: Ticket[], limit = 6): Breakdown[] => {
  const m = new Map<string, number>();
  tickets.forEach((t) => {
    const k = t.module ?? "Unspecified";
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return toBreakdown(m, tickets.length, limit);
};

export const departmentBreakdown = (tickets: Ticket[], limit = 6): Breakdown[] => {
  const m = new Map<string, number>();
  tickets.forEach((t) => {
    const k = ticketDept(t);
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return toBreakdown(m, tickets.length, limit);
};
