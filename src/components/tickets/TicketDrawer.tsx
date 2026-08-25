import DOMPurify from "dompurify";
import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Ticket, Conversation, Priority } from "../../types/freshdesk";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Clock, User, StickyNote, CheckCircle2, XCircle,
  Lock, AlertTriangle, Timer,
  CircleDot, CalendarClock, Info, RefreshCw, Loader2, Flag,
  Lightbulb, BarChart3, Sparkles,
} from "lucide-react";
import { format, differenceInMinutes, parseISO, addHours, addMinutes } from "date-fns";
import { analyzeTicket, submitDispute } from "@/services/aiAnalysis";
import { AIAnalysis, AIAnalysisCitation } from "@/types/aiAnalysis";
import {
  requesterDisplayName, ticketDept, ticketCompany, computeSLA, SLA_NOT_APPLICABLE_MESSAGE,
  SLA_LABELS, SLA_ACK_MINUTES,
  SLA_RESOLUTION_HOURS, SLA_DONE_STATUSES, SLA_PAUSED_STATUS,
  PRIORITY_META, STATUS_META, initials,
} from "@/lib/tickets";
import { cn } from "@/lib/utils";

// ─── DOMPurify setup ─────────────────────────────────────────────────────────

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});
const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { ADD_ATTR: ["target"], FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const avatarColor = (name: string) => {
  const colours = [
    "bg-gradient-to-br from-violet-500 to-purple-600",
    "bg-gradient-to-br from-sky-500 to-blue-600",
    "bg-gradient-to-br from-emerald-500 to-teal-600",
    "bg-gradient-to-br from-amber-500 to-orange-600",
    "bg-gradient-to-br from-rose-500 to-pink-600",
    "bg-gradient-to-br from-indigo-500 to-violet-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colours[h % colours.length];
};

const fmtDiff = (minutes: number): string => {
  const abs = Math.abs(minutes);
  const d = Math.floor(abs / (60 * 24));
  const h = Math.floor((abs % (60 * 24)) / 60);
  const m = abs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

type MilestoneStatus = "met" | "missed" | "pending" | "paused";

interface Milestone {
  id: string;
  label: string;
  shortLabel: string;
  target: string;
  deadline: Date;
  actual: Date | null;
  /** What the actual timestamp represents, e.g. "First reply sent". */
  actualVerb: string;
  /** How long after the ticket opened the milestone was hit, e.g. "in 6m". */
  elapsedLabel: string | null;
  status: MilestoneStatus;
  detail: string;
}

const buildMilestones = (ticket: Ticket, conversations: Conversation[]): Milestone[] => {
  const created = parseISO(ticket.created_at);
  const isDone = SLA_DONE_STATUSES.includes(ticket.status);
  const isPaused = ticket.status === SLA_PAUSED_STATUS;
  const slaLabel = SLA_LABELS[ticket.priority as Priority] ?? SLA_LABELS[1];
  const resHours = SLA_RESOLUTION_HOURS[ticket.priority as Priority] ?? SLA_RESOLUTION_HOURS[1];

  // Acknowledgment = first *public* agent reply to the requester. Private
  // (internal) notes are not an acknowledgment, so they must be excluded —
  // otherwise the ack time reflects an internal note rather than the reply.
  const firstAgentReply = conversations
    .filter((c) => !c.incoming && !c.private)
    .sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at))[0] ?? null;
  const firstReplyAt = firstAgentReply ? parseISO(firstAgentReply.created_at) : null;

  const ackDeadline = addMinutes(created, SLA_ACK_MINUTES);
  const resDeadline = addHours(created, resHours);

  // Best available resolution timestamp: updated_at on a resolved/closed ticket.
  const resolvedAt = isDone ? parseISO(ticket.updated_at) : null;

  const ackStatus = (): MilestoneStatus => {
    if (!firstReplyAt) return isPaused ? "paused" : "pending";
    return firstReplyAt <= ackDeadline ? "met" : "missed";
  };
  const resolutionStatus = (): MilestoneStatus => {
    // Judge by the ACTUAL resolution time, not "now" — otherwise an on-time
    // resolution flips to "missed" once the clock passes the deadline.
    if (isDone) return resolvedAt && resolvedAt <= resDeadline ? "met" : "missed";
    if (isPaused) return "paused";
    return new Date() > resDeadline ? "missed" : "pending";
  };

  const ackDetail = () => {
    if (!firstReplyAt) return isPaused ? "Waiting on customer" : "Awaiting first reply";
    const diff = differenceInMinutes(firstReplyAt, ackDeadline);
    return diff <= 0 ? `Replied ${fmtDiff(-diff)} early` : `Replied ${fmtDiff(diff)} late`;
  };
  const resDetail = (deadline: Date) => {
    if (isDone) {
      if (!resolvedAt) return "Resolved";
      const late = differenceInMinutes(resolvedAt, deadline);
      return late <= 0 ? `Resolved ${fmtDiff(-late)} early` : `Resolved ${fmtDiff(late)} late`;
    }
    if (isPaused) return "Timer paused";
    const over = differenceInMinutes(new Date(), deadline);
    return over > 0 ? `Overdue by ${fmtDiff(over)}` : `${fmtDiff(-over)} remaining`;
  };

  // "in <x>" = time from ticket open to when the milestone was actually hit.
  const elapsed = (at: Date | null) =>
    at ? `in ${fmtDiff(Math.max(0, differenceInMinutes(at, created)))}` : null;

  return [
    {
      id: "ack",
      label: "Acknowledgment",
      shortLabel: "ACK",
      target: `${SLA_ACK_MINUTES} min`,
      deadline: ackDeadline,
      actual: firstReplyAt,
      actualVerb: "First reply sent",
      elapsedLabel: elapsed(firstReplyAt),
      status: ackStatus(),
      detail: ackDetail(),
    },
    {
      id: "resolution",
      label: "Full Resolution",
      shortLabel: "RESOLUTION",
      target: slaLabel.resolution,
      deadline: resDeadline,
      actual: resolvedAt,
      actualVerb: "Resolved",
      elapsedLabel: elapsed(resolvedAt),
      status: resolutionStatus(),
      detail: resDetail(resDeadline),
    },
  ];
};

// ─── Circular SLA gauge ───────────────────────────────────────────────────────

const CircularGauge = ({ met, total, state }: { met: number; total: number; state: string }) => {
  const pct = total === 0 ? 0 : met / total;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const fill = circ * pct;
  const color =
    state === "breached" ? "#f43f5e" :
    state === "met" ? "#10b981" :
    state === "attention" ? "#f59e0b" :
    "#6B4EFF";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-border/40" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)" }}
        />
        <text x="48" y="44" textAnchor="middle" className="fill-foreground" style={{ fontSize: 18, fontWeight: 800, fontFamily: "inherit" }}>
          {met}/{total}
        </text>
        <text x="48" y="60" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9, fontWeight: 600, fontFamily: "inherit" }}>
          MILESTONES
        </text>
      </svg>
    </div>
  );
};

// ─── SLA DNA Strand ───────────────────────────────────────────────────────────

const DNAStrand = ({ milestones }: { milestones: Milestone[] }) => {
  const nodeColor = (s: MilestoneStatus) =>
    s === "met" ? { bg: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-500/30", text: "text-white" } :
    s === "missed" ? { bg: "bg-rose-500", ring: "ring-rose-200 dark:ring-rose-500/30", text: "text-white" } :
    s === "paused" ? { bg: "bg-violet-500", ring: "ring-violet-200 dark:ring-violet-500/30", text: "text-white" } :
    { bg: "bg-muted", ring: "ring-border/60", text: "text-muted-foreground" };

  const lineColor = (s: MilestoneStatus) =>
    s === "met" ? "bg-emerald-400" :
    s === "missed" ? "bg-rose-400" :
    "bg-border/50";

  const icon = (s: MilestoneStatus) =>
    s === "met" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
    s === "missed" ? <XCircle className="h-3.5 w-3.5" /> :
    s === "paused" ? <Timer className="h-3.5 w-3.5" /> :
    <Clock className="h-3.5 w-3.5" />;

  const pillTone = (s: MilestoneStatus) =>
    s === "met" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" :
    s === "missed" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" :
    s === "paused" ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" :
    "bg-secondary text-muted-foreground";

  const pillText = (s: MilestoneStatus) =>
    s === "met" ? "Completed" : s === "missed" ? "Overdue" : s === "paused" ? "Paused" : "Pending";

  return (
    <div className="relative pl-5">
      {milestones.map((m, i) => {
        const c = nodeColor(m.status);
        return (
          <div key={m.id} className="relative flex gap-4">
            {/* Strand column */}
            <div className="flex flex-col items-center">
              {/* Node */}
              <div
                className={cn(
                  "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4",
                  c.bg, c.ring, c.text
                )}
              >
                {icon(m.status)}
                {/* Pulse on active/missed */}
                {(m.status === "missed" || m.status === "pending") && m.status !== "paused" && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-0 animate-ping rounded-full opacity-40",
                      m.status === "missed" ? "bg-rose-500" : "bg-[#6B4EFF]"
                    )}
                    style={{ animationDuration: "2s" }}
                  />
                )}
              </div>
              {/* Connector */}
              {i < milestones.length - 1 && (
                <div className={cn("mt-0.5 w-0.5 flex-1", lineColor(m.status))} style={{ minHeight: 28 }} />
              )}
            </div>

            {/* Content */}
            <div className={cn("flex-1 pb-5", i === milestones.length - 1 && "pb-0")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-foreground leading-tight">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground">Target: {m.target}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
                    pillTone(m.status)
                  )}>
                    {pillText(m.status)}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground/70">{m.detail}</span>
                </div>
              </div>

              {/* When it actually happened (or when it's due) */}
              <div className={cn(
                "mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]",
                m.actual ? "bg-secondary/50" : m.status === "paused" ? "bg-violet-50/60 dark:bg-violet-500/10" : "bg-secondary/30"
              )}>
                {m.actual ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    <span className="font-semibold text-foreground/80">{m.actualVerb}</span>
                    <span className="text-muted-foreground">· {format(m.actual, "MMM d, h:mm a")}</span>
                    {m.elapsedLabel && (
                      <span className="ml-auto shrink-0 rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {m.elapsedLabel}
                      </span>
                    )}
                  </>
                ) : m.status === "paused" ? (
                  <>
                    <Timer className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <span className="text-violet-600 dark:text-violet-300">Timer paused — waiting on customer</span>
                  </>
                ) : (
                  <>
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="font-semibold text-foreground/70">Due by</span>
                    <span className="text-muted-foreground">{format(m.deadline, "MMM d, h:mm a")}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Breach Hero ──────────────────────────────────────────────────────────────

const BreachHero = ({ ticket, milestones }: { ticket: Ticket; milestones: Milestone[] }) => {
  const sla = computeSLA(ticket);
  const p = PRIORITY_META[ticket.priority] ?? { label: String(ticket.priority), tone: "", dot: "" };
  const s = STATUS_META[ticket.status] ?? { label: `Status ${ticket.status}`, tone: "" };
  const requester = requesterDisplayName(ticket);
  const slaLabel = SLA_LABELS[ticket.priority as Priority] ?? SLA_LABELS[1];

  const heroStyle = {
    breached: {
      bg: "from-rose-600 via-rose-700 to-rose-800 dark:from-rose-900 dark:via-rose-900/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "BREACHED",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    attention: {
      bg: "from-amber-500 via-amber-600 to-orange-700 dark:from-amber-900 dark:via-amber-900/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "AT RISK",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    on_track: {
      bg: "from-[#6B4EFF] via-[#7c5fff] to-[#5a3de8] dark:from-[#3d2b99] dark:via-[#4a34b5]",
      badge: "bg-white/20 text-white border-white/30",
      label: "ON TRACK",
      icon: <CircleDot className="h-4 w-4" />,
    },
    met: {
      bg: "from-emerald-500 via-emerald-600 to-teal-700 dark:from-emerald-900 dark:via-emerald-900/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "SLA MET",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    paused: {
      bg: "from-violet-600 via-violet-700 to-indigo-800 dark:from-violet-900 dark:via-violet-900/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "PAUSED",
      icon: <Timer className="h-4 w-4" />,
    },
    not_applicable: {
      bg: "from-slate-500 via-slate-600 to-slate-700 dark:from-slate-800 dark:via-slate-800/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "SLA NOT TRACKED",
      icon: <Info className="h-4 w-4" />,
    },
  };

  const h = heroStyle[sla.state] ?? heroStyle.on_track;

  return (
    <div className={cn("bg-gradient-to-br px-6 py-5 text-white", h.bg)}>
      {/* Status row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest", h.badge)}>
          {h.icon} {h.label}
        </span>
        {sla.state === "breached" && (
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold tracking-wide">
            {sla.remaining} overdue
          </span>
        )}
        {sla.state === "attention" && (
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">
            {sla.remaining} remaining
          </span>
        )}
        {sla.state === "not_applicable" && (
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">
            No SLA on Requirement tickets
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] font-bold opacity-70">#{ticket.id}</span>
      </div>

      {/* Title */}
      <h2 className="mb-3 text-[17px] font-extrabold leading-snug tracking-tight opacity-95">
        {ticket.subject}
      </h2>

      {/* Meta strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] font-medium opacity-80">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", h.badge)}>
            {sla.state === "not_applicable" ? "Requirement" : slaLabel.severity.split("—")[0].trim()}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <User className="h-3 w-3" /> {requester} · {ticketDept(ticket)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> {format(new Date(ticket.created_at), "d MMM yyyy")}
        </span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold", h.badge)}>
          {p.label}
        </span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold", h.badge)}>
          {s.label}
        </span>
      </div>

      {/* Deadline fact — concrete info, not a repeat of the SLA Journey card's
          milestone count right below it (that duplication was part of what
          made this overlay feel cluttered). */}
      {sla.state === "not_applicable" ? (
        <p className="mt-4 text-[11.5px] font-medium leading-snug opacity-85">
          {SLA_NOT_APPLICABLE_MESSAGE}
        </p>
      ) : (() => {
          const resolution = milestones.find((m) => m.id === "resolution");
          return resolution ? (
            <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold opacity-90">
              <CalendarClock className="h-3.5 w-3.5 opacity-70" />
              Due {format(resolution.deadline, "d MMM, h:mm a")} · {resolution.detail}
            </div>
          ) : null;
        })()}
    </div>
  );
};

// ─── SLA Autopsy — AI Analysis panel ───────────────────────────────────────────
// Idle until the user clicks the (i) trigger — nothing here ever calls the AI
// on its own. Keyed by ticket.id from the parent, so switching tickets in the
// drawer remounts this fresh instead of leaking one ticket's analysis into
// another's.

const STATUS_BAR_COLOR: Record<number, string> = {
  2: "bg-blue-500", 3: "bg-indigo-500", 4: "bg-emerald-500", 5: "bg-slate-400",
  7: "bg-amber-500", 8: "bg-violet-500", 9: "bg-orange-500",
};

const CONFIDENCE_META: Record<AIAnalysis["confidence"], { label: string; tone: string }> = {
  high: { label: "High confidence", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  partial: { label: "Partial data", tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  low: { label: "Limited data", tone: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300" },
};

/** Renders narrative text, turning S1/M2-style citation tokens into hoverable evidence chips. */
const renderNarrative = (text: string, citations: AIAnalysisCitation[]) => {
  const byMarker = new Map(citations.map((c) => [c.marker, c]));
  return text.split(/(\b(?:S|M)\d+\b)/g).map((part, i) => {
    const c = byMarker.get(part);
    if (!c) return <span key={i}>{part}</span>;
    const when = c.at ? format(parseISO(c.at), "d MMM, h:mm a") : null;
    return (
      <sup
        key={i}
        title={[c.label, when, c.detail].filter(Boolean).join(" · ")}
        className="mx-0.5 cursor-help rounded bg-[#6B4EFF]/10 px-1 py-0.5 font-mono text-[9px] font-bold not-italic text-[#6B4EFF] dark:bg-violet-500/15 dark:text-violet-300"
      >
        {part}
      </sup>
    );
  });
};

const AIAnalysisPanel = ({ ticket }: { ticket: Ticket }) => {
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [data, setData] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Client-facing summary is the default view — this panel is meant to be shown
  // to NSE, not just kept internal. The evidence-heavy version is opt-in.
  const [showInternal, setShowInternal] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeState, setDisputeState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const run = async (force: boolean) => {
    setStatus("loading");
    setError(null);
    const res = await analyzeTicket(ticket.id, { force });
    if (res.ok && res.data) {
      setData(res.data);
      setStatus("loaded");
    } else {
      setError(res.error ?? "AI analysis failed");
      setStatus("error");
    }
  };

  const sendDispute = async () => {
    if (!disputeReason.trim()) return;
    setDisputeState("sending");
    const res = await submitDispute(ticket.id, disputeReason.trim(), data?.generated_at);
    setDisputeState(res.ok ? "sent" : "error");
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="flex items-center justify-between border-b border-border/40 bg-secondary/20 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-3 w-3 text-[#6B4EFF]" /> AI Analysis
        </span>
        {status === "loaded" && data && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", CONFIDENCE_META[data.confidence].tone)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {CONFIDENCE_META[data.confidence].label}
          </span>
        )}
      </div>

      <div className="p-4">
        {status === "idle" && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-muted-foreground max-w-[34ch]">
              Understand why this ticket took as long as it did — status by status, with evidence.
            </p>
            <Button size="sm" className="gap-1.5 shrink-0 bg-[#6B4EFF] hover:bg-[#5a3de8]" onClick={() => run(false)}>
              <Info className="h-3.5 w-3.5" /> Analyze
            </Button>
          </div>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-2 py-3 text-[12.5px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-[#6B4EFF]" /> Analyzing ticket history…
          </div>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <p className="text-[12.5px] text-rose-600 dark:text-rose-400">{error}</p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(false)}>
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </Button>
          </div>
        )}

        {status === "loaded" && data && (
          <div className="space-y-4">
            {data.warning && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-700 dark:text-amber-300">
                {data.warning}
              </div>
            )}

            {/* Timeline */}
            <div>
              <div className="mb-1.5 flex h-6 w-full overflow-hidden rounded-md">
                {data.segments.map((s) => (
                  <div
                    key={s.index}
                    title={`${s.label} — ${format(parseISO(s.startsAt), "d MMM, h:mm a")} → ${format(parseISO(s.endsAt), "d MMM, h:mm a")}`}
                    className={cn("h-full min-w-[3%] first:rounded-l-md last:rounded-r-md", STATUS_BAR_COLOR[s.status] ?? "bg-slate-400")}
                    style={{ width: `${Math.max(3, (s.minutes / Math.max(1, data.segments.reduce((a, b) => a + b.minutes, 0))) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground/60">
                <span>{format(parseISO(ticket.created_at), "d MMM")}, created</span>
                <span>{data.segments.at(-1) ? format(parseISO(data.segments.at(-1)!.endsAt), "d MMM") : "now"}</span>
              </div>
            </div>

            {/* Primary cause — the concrete, scannable "real reason," not a vague reassurance */}
            {data.primary_cause && (
              <div className="flex items-center gap-2 rounded-lg bg-[#6B4EFF]/5 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#6B4EFF] dark:text-violet-300">Why</span>
                <span className="text-[13px] font-semibold text-foreground">{data.primary_cause}</span>
              </div>
            )}

            {/* Narrative — client-facing summary by default */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {showInternal ? "Internal detail (with evidence)" : "Client-facing summary"}
              </span>
              <label className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                Show internal detail
                <Switch checked={showInternal} onCheckedChange={setShowInternal} className="scale-75" />
              </label>
            </div>
            <p className="text-[13px] leading-relaxed text-foreground -mt-2">
              {showInternal
                ? (data.narrative ? renderNarrative(data.narrative, data.citations) : "No narrative available.")
                : data.formal_narrative}
            </p>
            {showInternal && <p className="text-[11px] text-muted-foreground/70 -mt-2">{data.completeness_note}</p>}

            {/* Attribution split */}
            <div>
              <div className="mb-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-[#6B4EFF]" style={{ width: `${data.attribution.aerchain}%` }} />
                <div className="h-full bg-sky-500" style={{ width: `${data.attribution.nse}%` }} />
                <div className="h-full bg-amber-500" style={{ width: `${data.attribution.engineering}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground">
                <span><i className="inline-block h-2 w-2 rounded-sm bg-[#6B4EFF] mr-1 align-[-1px]" />Aerchain support · {data.attribution.aerchain}%</span>
                <span><i className="inline-block h-2 w-2 rounded-sm bg-sky-500 mr-1 align-[-1px]" />Waiting on {ticketCompany(ticket)} · {data.attribution.nse}%</span>
                <span><i className="inline-block h-2 w-2 rounded-sm bg-amber-500 mr-1 align-[-1px]" />Engineering · {data.attribution.engineering}%</span>
              </div>
            </div>

            {/* Benchmark */}
            {data.benchmark && (
              <div className="flex items-start gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-[11.5px] text-foreground">
                <BarChart3 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <span>
                  Similar <span className="font-mono">{ticket.ticket_type ?? "tickets"}</span> resolve in a median of{" "}
                  <b>{data.benchmark.medianHours}h</b> ({data.benchmark.sampleSize} tickets). This one: <b>{data.benchmark.ticketHours}h</b>
                  {data.benchmark.multiple != null && <> ({data.benchmark.multiple}× the median)</>}.
                </span>
              </div>
            )}

            {/* Prevention tip */}
            {data.prevention_tip && (
              <div className="flex items-start gap-2 rounded-lg bg-[#6B4EFF]/5 px-3 py-2 text-[11.5px] text-foreground">
                <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#6B4EFF]" />
                <span>{data.prevention_tip}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-[11.5px]" onClick={() => run(true)}>
                <RefreshCw className="h-3 w-3" /> Regenerate
              </Button>
              {disputeState !== "sent" && (
                <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-[11.5px] text-muted-foreground" onClick={() => setDisputeOpen((v) => !v)}>
                  <Flag className="h-3 w-3" /> Dispute this analysis
                </Button>
              )}
              {disputeState === "sent" && (
                <span className="text-[11.5px] text-emerald-600 dark:text-emerald-400">Filed — thanks, this will be reviewed.</span>
              )}
              <span className="ml-auto text-[10px] font-mono text-muted-foreground/50">
                {data.generated ? "Freshly generated" : "From cache · no AI credits used"}
              </span>
            </div>

            {disputeOpen && disputeState !== "sent" && (
              <div className="space-y-2 rounded-lg border border-border/50 p-3">
                <Textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="What's wrong with this analysis? (e.g. a status change was logged late)"
                  className="min-h-[64px] text-[12.5px]"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-7 text-[11.5px]" disabled={!disputeReason.trim() || disputeState === "sending"} onClick={sendDispute}>
                    {disputeState === "sending" ? "Sending…" : "Submit"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11.5px]" onClick={() => setDisputeOpen(false)}>Cancel</Button>
                  {disputeState === "error" && <span className="text-[11px] text-rose-600">Couldn't send — try again.</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Conversation thread — chat-style chain ─────────────────────────────────
// Customer on the left, agent on the right, strict chronological order (first
// message → agent reply → next customer reply → …) so the back-and-forth is
// readable at a glance instead of a flat stack of identical-looking cards.
// Private notes break the chain deliberately — they're internal asides the
// customer never saw, not part of the reply chain, so they render as their
// own centered card rather than a chat bubble on either side.
// Keyed by ticket.id from the parent, so switching tickets remounts this
// (and re-runs the scroll-to-latest effect) instead of carrying over state.

const ConversationThread = ({ ticket, conversations, ackId }: { ticket: Ticket; conversations: Conversation[]; ackId: number | null }) => {
  const requester = requesterDisplayName(ticket);
  const lastRef = useRef<HTMLDivElement>(null);

  // Open straight to the latest message — the newest update is what someone
  // opening a ticket wants first, not the oldest message after a long scroll.
  useEffect(() => {
    const id = requestAnimationFrame(() => lastRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(id);
  }, []);

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60">
          <StickyNote className="h-5 w-5 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-foreground/70">No updates yet</p>
          <p className="text-[11.5px] text-muted-foreground/60">Add the first note or reply below</p>
        </div>
      </div>
    );
  }

  const sorted = [...conversations].sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at));

  return (
    <div className="space-y-3">
      {sorted.map((conv, i) => {
        const isAgent = !conv.incoming;
        const author = conv.incoming ? requester : (ticket.responder_name ?? "Aerchain Support");
        const html = sanitize(conv.body || conv.body_text || "");
        const isAck = conv.id === ackId;
        const refProp = i === sorted.length - 1 ? { ref: lastRef } : {};
        const when = format(new Date(conv.created_at), "MMM d, h:mm a");

        if (conv.private) {
          return (
            <div key={conv.id} {...refProp} className="mx-auto w-[92%] rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">
                <Lock className="h-3 w-3" /> Private note · {author}
                <span className="ml-auto font-normal text-amber-700/60 dark:text-amber-300/60">{when}</span>
              </div>
              <div className="fd-html text-[13px] text-foreground/85" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          );
        }

        return (
          <div key={conv.id} {...refProp} className={cn("flex items-end gap-2", isAgent ? "justify-end" : "justify-start")}>
            {!isAgent && (
              <Avatar className="h-7 w-7 shrink-0 ring-2 ring-background">
                <AvatarFallback className={cn("text-[10px] font-bold text-white", avatarColor(author))}>{initials(author)}</AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0 max-w-[78%]">
              <div className={cn("mb-1 flex items-center gap-1.5 text-[10.5px]", isAgent ? "justify-end" : "justify-start")}>
                {!isAgent && <span className="font-semibold text-foreground">{author}</span>}
                {isAck && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Ack
                  </span>
                )}
                <span className="text-muted-foreground/60">{when}</span>
                {isAgent && <span className="font-semibold text-foreground">{author}</span>}
              </div>
              <div className={cn(
                "rounded-2xl border p-3.5 shadow-sm",
                isAgent
                  ? "rounded-tr-sm border-violet-100 bg-violet-50/60 dark:border-violet-500/15 dark:bg-violet-500/10"
                  : "rounded-tl-sm border-border/50 bg-card"
              )}>
                <div className="fd-html text-foreground/85" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
            {isAgent && (
              <Avatar className="h-7 w-7 shrink-0 ring-2 ring-background">
                <AvatarFallback className="bg-gradient-to-br from-[#6B4EFF] to-[#8b6dff] text-[10px] font-bold text-white">
                  {initials(author)}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Main TicketDrawer ────────────────────────────────────────────────────────

interface TicketDrawerProps {
  ticket: Ticket | null;
  conversations: Conversation[];
  isOpen: boolean;
  onClose: () => void;
}

export const TicketDrawer = ({ ticket, conversations, isOpen, onClose }: TicketDrawerProps) => {
  if (!ticket) return null;

  const milestones = buildMilestones(ticket, conversations);
  const requester = requesterDisplayName(ticket);
  const sla = computeSLA(ticket);
  // First public agent reply = the acknowledgment message; tag it in the thread.
  const ackId = conversations
    .filter((c) => !c.incoming && !c.private)
    .sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at))[0]?.id ?? null;

  const slaPillTone =
    sla.state === "met" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" :
    sla.state === "breached" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" :
    sla.state === "attention" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" :
    sla.state === "paused" ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" :
    sla.state === "not_applicable" ? "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300" :
    "bg-[#6B4EFF]/10 text-[#6B4EFF] dark:text-violet-300";

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" floating className="gap-0 p-0">

        {/* ── Breach / Status Hero ────────────────────────────────────────── */}
        <BreachHero ticket={ticket} milestones={milestones} />

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-5">

            {/* ── SLA Section: gauge + DNA strand side by side ───────────── */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
              <div className="flex items-center justify-between border-b border-border/40 bg-secondary/20 px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">SLA Journey</span>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", slaPillTone)}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                  {sla.label}
                </span>
              </div>
              {sla.state === "not_applicable" ? (
                <div className="flex items-start gap-3 px-4 py-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300">
                    <Info className="h-4 w-4" />
                  </span>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {SLA_NOT_APPLICABLE_MESSAGE}
                  </p>
                </div>
              ) : (
                <div className="flex gap-0">
                  {/* Circular gauge */}
                  <div className="flex shrink-0 flex-col items-center justify-center border-r border-border/40 px-5 py-5 gap-1">
                    <CircularGauge
                      met={milestones.filter(m => m.status === "met").length}
                      total={milestones.length}
                      state={computeSLA(ticket).state}
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">SLA Health</span>
                    <span className="text-[18px] font-extrabold text-foreground">
                      {Math.round((milestones.filter(m => m.status === "met").length / milestones.length) * 100)}%
                    </span>
                  </div>

                  {/* DNA Strand */}
                  <div className="flex-1 px-4 py-5">
                    <DNAStrand milestones={milestones} />
                  </div>
                </div>
              )}
            </div>

            {/* ── SLA Autopsy: AI Analysis (click to run, never automatic) ── */}
            <AIAnalysisPanel key={ticket.id} ticket={ticket} />

            {/* ── Original description ────────────────────────────────────── */}
            {ticket.description && (
              <div className="rounded-2xl border border-border/50 bg-secondary/25 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className={cn("text-[10px] font-bold text-white", avatarColor(requester))}>
                      {initials(requester)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-[12.5px] font-semibold leading-none">{requester}</div>
                    <div className="text-[10.5px] text-muted-foreground">opened this ticket · {format(new Date(ticket.created_at), "MMM d, yyyy · h:mm a")}</div>
                  </div>
                </div>
                <div className="fd-html text-[13px] text-foreground/85" dangerouslySetInnerHTML={{ __html: sanitize(ticket.description) }} />
              </div>
            )}

            {/* ── Conversation divider ────────────────────────────────────── */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                Conversation · {conversations.length}
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {/* ── Conversation thread ─────────────────────────────────────── */}
            <ConversationThread key={ticket.id} ticket={ticket} conversations={conversations} ackId={ackId} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
