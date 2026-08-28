import DOMPurify from "dompurify";
import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Ticket, Conversation, Priority } from "../../types/freshdesk";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  StickyNote, CheckCircle2,
  Lock, Info, RefreshCw, Loader2, Flag, CalendarClock,
  Lightbulb, Sparkles, Copy, ArrowLeft, Mail, ChevronRight,
  Paperclip, MessageSquare, History, FileText,
} from "lucide-react";
import { format, differenceInMinutes, parseISO, addHours, addMinutes } from "date-fns";
import { analyzeTicket, submitDispute, fetchCachedAnalysis } from "@/services/aiAnalysis";
import { fetchStatusHistory, buildSegments, statusBreakdown, StatusEvent } from "@/services/statusHistory";
import { AIAnalysis, AIAnalysisCitation, AIAnalysisSegment } from "@/types/aiAnalysis";
import { showSuccess } from "@/utils/toast";
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

// ─── Ticket header — compact command header ────────────────────────────────
// Red is reserved for the breach signal (a thin rail + the status text), not
// the whole surface — the old full-bleed gradient hero was doing status,
// urgency, branding and background all at once.

const SLA_RAIL: Record<string, string> = {
  breached: "bg-rose-500", attention: "bg-amber-500", met: "bg-emerald-500",
  on_track: "bg-[#6B4EFF]", paused: "bg-violet-500", not_applicable: "bg-slate-400",
};
const SLA_TEXT: Record<string, string> = {
  breached: "text-rose-600 dark:text-rose-400", attention: "text-amber-600 dark:text-amber-400",
  met: "text-emerald-600 dark:text-emerald-400", on_track: "text-[#6B4EFF] dark:text-violet-300",
  paused: "text-violet-600 dark:text-violet-300", not_applicable: "text-muted-foreground",
};
const SLA_STATE_LABEL: Record<string, string> = {
  breached: "Breached", attention: "At risk", met: "SLA met",
  on_track: "On track", paused: "Paused", not_applicable: "Not tracked",
};

const TicketHeader = ({ ticket, milestones, onClose }: { ticket: Ticket; milestones: Milestone[]; onClose: () => void }) => {
  const sla = computeSLA(ticket);
  const p = PRIORITY_META[ticket.priority] ?? { label: String(ticket.priority), tone: "", dot: "" };
  const s = STATUS_META[ticket.status] ?? { label: `Status ${ticket.status}`, tone: "" };
  const requester = requesterDisplayName(ticket);
  const resolution = milestones.find((m) => m.id === "resolution");

  const suffix =
    sla.state === "breached" ? `${sla.remaining.replace(/^-/, "")} overdue` :
    sla.state === "attention" ? `${sla.remaining} remaining` : null;

  return (
    <div className="relative border-b border-border/60 bg-card px-6 py-3">
      <span aria-hidden className={cn("absolute left-0 top-0 bottom-0 w-[3px]", SLA_RAIL[sla.state] ?? SLA_RAIL.on_track)} />

      <button onClick={onClose} className="mb-1.5 flex w-fit items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tickets
      </button>

      <div className="flex items-baseline gap-2.5">
        <h1 className="truncate font-display text-[16px] font-extrabold leading-tight tracking-tight text-foreground">
          {ticket.subject}
        </h1>
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/60">#{ticket.id}</span>
      </div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">
        <span className="font-semibold text-foreground/80">{requester}</span> · {ticketDept(ticket)}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <span className={cn("inline-flex items-center gap-1.5 font-bold", SLA_TEXT[sla.state] ?? SLA_TEXT.on_track)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", SLA_RAIL[sla.state] ?? SLA_RAIL.on_track)} />
          {SLA_STATE_LABEL[sla.state] ?? "On track"}
        </span>
        {suffix && (
          <>
            <span className="text-border">·</span>
            <span className={cn("font-semibold", SLA_TEXT[sla.state] ?? SLA_TEXT.on_track)}>{suffix}</span>
          </>
        )}
        {sla.state !== "not_applicable" && (
          <>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} /> {p.label}
            </span>
          </>
        )}
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_BAR_COLOR[ticket.status] ?? "bg-slate-400")} /> {s.label}
        </span>
        {sla.state === "not_applicable" ? (
          <span className="text-muted-foreground">· {SLA_NOT_APPLICABLE_MESSAGE}</span>
        ) : resolution ? (
          <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            Due <b className="font-semibold text-foreground">{format(resolution.deadline, "d MMM, h:mm a")}</b>
          </span>
        ) : null}
      </div>
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
// Same palette as literal hex — SVG `stroke`/`fill` can't take a Tailwind class.
const STATUS_HEX: Record<number, string> = {
  2: "#3b82f6", 3: "#6366f1", 4: "#10b981", 5: "#94a3b8",
  7: "#f59e0b", 8: "#8b5cf6", 9: "#f97316",
};
const OTHER_HEX = "#cbd5e1";

/** Donut showing what share of the ticket's life went to its dominant status. */
const Donut = ({ percent, color }: { percent: number; color: string }) => {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="9" className="stroke-secondary" />
        <circle
          cx="32" cy="32" r={r} fill="none" strokeWidth="9" strokeLinecap="round" stroke={color}
          strokeDasharray={`${(circumference * Math.min(100, percent)) / 100} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-[14px] font-extrabold text-foreground">
        {percent}%
      </span>
    </div>
  );
};

const CONFIDENCE_META: Record<AIAnalysis["confidence"], { label: string; tone: string }> = {
  high: { label: "High confidence", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  partial: { label: "Partial data", tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  low: { label: "Limited data", tone: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300" },
};

// ─── Conversation chain codes — the single source of truth for CM#/SR#/PN# ──
// numbering, shared by ConversationThread (which renders them) and the AI
// narrative's citation chips (which now speak the same codes instead of a
// separate S#/M# scheme, and can scroll straight to the message they cite).
interface ConvCode { code: string; convId: number; tone: string }

const codeConversations = (conversations: Conversation[]): Map<string, ConvCode> => {
  const sorted = [...conversations].sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at));
  let c = 0, s = 0, p = 0;
  const map = new Map<string, ConvCode>();
  for (const conv of sorted) {
    const code = conv.private ? `PN${++p}` : !conv.incoming ? `SR${++s}` : `CM${++c}`;
    const tone = conv.private
      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      : !conv.incoming
        ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
        : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
    map.set(conv.created_at, { code, convId: conv.id, tone });
  }
  return map;
};

/** Renders narrative text, turning S#/M#-style citation tokens into evidence
 * chips. Segment (S#) citations stay hover-only (nothing to scroll to).
 * Message (M#) citations are relabeled to their real CM#/SR#/PN# code and
 * become clickable — click scrolls to and highlights that exact message. */
const renderNarrative = (
  text: string,
  citations: AIAnalysisCitation[],
  convCodes: Map<string, ConvCode>,
  onCite: (convId: number) => void,
) => {
  const byMarker = new Map(citations.map((c) => [c.marker, c]));
  return text.split(/(\b(?:S|M)\d+\b)/g).map((part, i) => {
    const c = byMarker.get(part);
    if (!c) return <span key={i}>{part}</span>;
    const when = c.at ? format(parseISO(c.at), "d MMM, h:mm a") : null;
    const resolved = c.at ? convCodes.get(c.at) : undefined;
    const label = resolved?.code ?? part;
    const title = [c.label, when, c.detail].filter(Boolean).join(" · ");
    if (!resolved) {
      return (
        <sup key={i} title={title} className="mx-0.5 cursor-help rounded bg-[#6B4EFF]/10 px-1 py-0.5 font-mono text-[9px] font-bold not-italic text-[#6B4EFF] dark:bg-violet-500/15 dark:text-violet-300">
          {label}
        </sup>
      );
    }
    return (
      <sup key={i} className="mx-0.5">
        <button
          type="button"
          title={`${title} — click to jump to it`}
          onClick={() => onCite(resolved.convId)}
          className={cn("cursor-pointer rounded px-1 py-0.5 font-mono text-[9px] font-bold not-italic underline decoration-dotted underline-offset-2 hover:brightness-95", resolved.tone)}
        >
          {label}
        </button>
      </sup>
    );
  });
};

const AIAnalysisPanel = ({ ticket, conversations, segments, onCitationClick, onDataChange }: {
  ticket: Ticket; conversations: Conversation[];
  /** Real status spans, read straight from ticket_status_history by the
   * parent. The donut, the legend and the "spent Xd in Y" sentence are all
   * computed from these — so the top of this card is true and visible even
   * before (or without) any AI call. */
  segments: AIAnalysisSegment[];
  onCitationClick: (convId: number) => void;
  onDataChange?: (data: AIAnalysis | null) => void;
}) => {
  // A first-time analysis is open to anonymous visitors (public-mode
  // Dashboard/Tickets are read-only-open) — it costs one Gemini call, ever,
  // per ticket, then serves from cache. Forcing a fresh regenerate and
  // filing a dispute both need a real identity server-side, so those two
  // stay gated on a real session rather than failing with a dead-end error.
  const { session } = useAuth();
  const canRegenerate = !!session;
  // "checking" = the free cache read below hasn't resolved yet. Most tickets
  // someone opens have already been analyzed by *someone*, and re-serving
  // that costs no AI credit — so the AI card shows itself automatically
  // instead of making every viewer re-click "Analyze" on the same ticket.
  const [status, setStatus] = useState<"checking" | "idle" | "loading" | "loaded" | "error">("checking");
  const [data, setData] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeState, setDisputeState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const convCodes = useMemo(() => codeConversations(conversations), [conversations]);

  useEffect(() => {
    let cancelled = false;
    fetchCachedAnalysis(ticket.id).then((cached) => {
      if (cancelled) return;
      if (cached) { setData(cached); setStatus("loaded"); onDataChange?.(cached); }
      else setStatus("idle");
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  const run = async (force: boolean) => {
    setStatus("loading");
    setError(null);
    const res = await analyzeTicket(ticket.id, { force });
    if (res.ok && res.data) {
      setData(res.data);
      setStatus("loaded");
      onDataChange?.(res.data);
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

  // ── Deterministic half of this card: which statuses the ticket's life was
  // actually spent in. Plain arithmetic over real spans — no model involved,
  // so it renders for every visitor whether or not AI has ever run. ────────
  const breakdown = useMemo(() => statusBreakdown(segments), [segments]);
  const dominant = breakdown[0];
  const sla = computeSLA(ticket);
  const isDone = SLA_DONE_STATUSES.includes(ticket.status);
  // End-to-end elapsed time — always true, and the honest thing to quote when
  // the status history is too thin to say where the time actually went.
  const openMinutes = differenceInMinutes(
    isDone ? parseISO(ticket.updated_at) : new Date(),
    parseISO(ticket.created_at),
  );
  const legend = useMemo(() => {
    const withHex = breakdown.map((b) => ({ ...b, hex: STATUS_HEX[b.status] ?? OTHER_HEX }));
    if (withHex.length <= 3) return withHex;
    const top = withHex.slice(0, 2);
    const rest = withHex.slice(2);
    return [...top, {
      status: -1, label: "Other", hex: OTHER_HEX,
      minutes: rest.reduce((n, b) => n + b.minutes, 0),
      percent: Math.max(0, 100 - top.reduce((n, b) => n + b.percent, 0)),
    }];
  }, [breakdown]);

  const headline =
    sla.state === "breached" ? "Why did this breach?" :
    isDone ? "How did this resolve?" :
    "Why is this taking so long?";

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 bg-secondary/20 px-3.5 py-2.5">
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

      <div className="space-y-3 p-3.5">
        {data?.warning && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-700 dark:text-amber-300">
            {data.warning}
          </div>
        )}

        <div>
          <div className="text-[13px] font-bold text-foreground">{headline}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {dominant ? (
              <>
                The ticket spent <b className="font-semibold text-foreground">{fmtDiff(dominant.minutes)}</b> in{" "}
                <b className="font-semibold text-foreground">“{dominant.label}”</b>, which accounted for{" "}
                <b className="font-semibold text-foreground">{dominant.percent}%</b> of its open time.
              </>
            ) : segments.length ? (
              // History exists but records no working time — typically a ticket
              // whose only row is the backfilled "current status at creation"
              // stamp. Say what we actually know instead of blaming a status.
              <>
                No status changes were recorded while this ticket was open — its history only
                covers time after it was already{" "}
                <b className="font-semibold text-foreground">{segments.at(-1)?.label.toLowerCase()}</b>, so there's no
                record of where the{" "}
                <b className="font-semibold text-foreground">{fmtDiff(openMinutes)}</b>{" "}
                before that went.
              </>
            ) : (
              "No status transitions have been recorded for this ticket yet, so a status-by-status breakdown isn't available."
            )}
          </p>
        </div>

        {(dominant || data?.benchmark) && (
          <div className="flex items-center gap-4 rounded-lg bg-secondary/25 px-3.5 py-3">
            {data?.benchmark?.multiple != null && (
              <div className="w-[92px] shrink-0">
                <div className="font-display text-[24px] font-extrabold leading-none text-[#6B4EFF] dark:text-violet-300">
                  {data.benchmark.multiple}×
                </div>
                <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">longer than similar tickets</div>
              </div>
            )}
            {dominant && <Donut percent={dominant.percent} color={STATUS_HEX[dominant.status] ?? OTHER_HEX} />}
            {legend.length > 0 && (
              <div className="min-w-0 flex-1 space-y-1">
                {legend.map((l) => (
                  <div key={l.label} className="flex items-center gap-2 text-[11.5px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.hex }} />
                    <span className="truncate text-muted-foreground">{l.label}</span>
                    <span className="ml-auto shrink-0 font-semibold text-foreground">{l.percent}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {status === "checking" && <div className="h-4 w-48 animate-pulse rounded bg-secondary/60" />}

        {status === "idle" && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border/70 px-3 py-2.5">
            <p className="text-[12px] text-muted-foreground">
              Add an AI explanation — the specific reason, benchmark and recommended action.
            </p>
            <Button size="sm" className="gap-1.5 shrink-0 bg-[#6B4EFF] hover:bg-[#5a3de8]" onClick={() => run(false)}>
              <Info className="h-3.5 w-3.5" /> Analyze
            </Button>
          </div>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-[#6B4EFF]" /> Analyzing ticket history…
          </div>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <p className="text-[12.5px] text-rose-600 dark:text-rose-400">
              {/^(Invalid session|Missing authorization token)$/.test(error ?? "")
                ? "Your session has expired — sign in again to run AI analysis."
                : error}
            </p>
            {/^(Invalid session|Missing authorization token)$/.test(error ?? "") ? (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to="/login"><Lock className="h-3.5 w-3.5" /> Sign in</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(false)}>
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </Button>
            )}
          </div>
        )}

        {status === "loaded" && data && (
          <>
            {data.prevention_tip && (
              <div className="rounded-lg bg-[#6B4EFF]/[0.05] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#6B4EFF] dark:text-violet-300">
                  <Lightbulb className="h-3 w-3" /> Recommended action
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-foreground">{data.prevention_tip}</p>
              </div>
            )}

            {showEvidence && (
              <div className="space-y-1.5 rounded-lg bg-secondary/30 p-3">
                <p className="text-[12.5px] leading-relaxed text-foreground">
                  {data.narrative ? renderNarrative(data.narrative, data.citations, convCodes, onCitationClick) : "No narrative available."}
                </p>
                <p className="text-[11px] text-muted-foreground/70">{data.completeness_note}</p>
              </div>
            )}

            {/* ── Actions as plain links, not a button row — this is metadata
                about the briefing, not a set of primary calls to action. ── */}
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t border-border/40 pt-2.5 text-[11.5px] font-semibold text-[#6B4EFF] dark:text-violet-300">
              {disputeState === "sent" && (
                <span className="mr-auto font-normal text-emerald-600 dark:text-emerald-400">Filed — thanks, this will be reviewed.</span>
              )}
              <button className="flex items-center gap-1" onClick={() => setShowEvidence((v) => !v)}>
                <FileText className="h-3 w-3" /> {showEvidence ? "Hide reasoning" : "Show reasoning"}
              </button>
              <span className="text-border">·</span>
              <button
                className="flex items-center gap-1"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.formal_narrative ?? "");
                    showSuccess("Copied — ready to paste into a customer email");
                  } catch { /* clipboard denied — fail quietly */ }
                }}
              >
                <Copy className="h-3 w-3" /> Copy summary
              </button>
              <span className="text-border">·</span>
              {canRegenerate ? (
                <button className="flex items-center gap-1" onClick={() => run(true)}>
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              ) : (
                <Link to="/login" className="flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Sign in to refresh
                </Link>
              )}
              {canRegenerate && disputeState !== "sent" && (
                <>
                  <span className="text-border">·</span>
                  <button className="flex items-center gap-1 text-muted-foreground" onClick={() => setDisputeOpen((v) => !v)}>
                    <Flag className="h-3 w-3" /> Dispute
                  </button>
                </>
              )}
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
          </>
        )}
      </div>
    </div>
  );
};

// ─── Timeline — the ticket's real transition track, always visible and
// entirely AI-free: every dot below comes from ticket_status_history (or the
// ticket's own created/resolved stamps). AI explains this timeline; it never
// gates access to it. ──────────────────────────────────────────────────────

interface TimelineEvent { date: string; label: string; duration: string | null; hex: string; approx?: boolean }

const TicketTimeline = ({ ticket, segments, onViewFullHistory }: {
  ticket: Ticket; segments: AIAnalysisSegment[]; onViewFullHistory: () => void;
}) => {
  const sla = computeSLA(ticket);
  const isDone = SLA_DONE_STATUSES.includes(ticket.status);

  const events: TimelineEvent[] = [
    { date: ticket.created_at, label: "Created", duration: null, hex: "#94a3b8" },
    ...segments.map((s) => ({
      date: s.startsAt,
      label: s.label,
      duration: fmtDiff(s.minutes),
      hex: STATUS_HEX[s.status] ?? OTHER_HEX,
      approx: s.confidence !== "exact",
    })),
    {
      date: segments.at(-1)?.endsAt ?? (isDone ? ticket.updated_at : new Date().toISOString()),
      label: isDone ? "Resolved" : "Now",
      duration: null,
      hex: isDone ? "#10b981" : (sla.state === "breached" ? "#f43f5e" : "#6B4EFF"),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">Timeline</span>
        <button onClick={onViewFullHistory} className="text-[11.5px] font-semibold text-[#6B4EFF] dark:text-violet-300">
          View full history
        </button>
      </div>

      {/* Horizontal track. Overflows to a scroller rather than crushing the
          labels when a ticket has bounced through many statuses. */}
      <div className="overflow-x-auto pb-1">
        <div className="relative min-w-full" style={{ minWidth: `${events.length * 96}px` }}>
          <div className="absolute left-0 right-0 top-[19px] h-px bg-border" />
          <div className="relative flex justify-between">
            {events.map((e, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5 px-1 text-center">
                <span className="text-[10.5px] leading-none text-muted-foreground whitespace-nowrap">
                  {format(parseISO(e.date), "d MMM")}
                </span>
                <span className="h-2.5 w-2.5 rounded-full ring-4 ring-card" style={{ background: e.hex }} />
                <span className="text-[11px] font-semibold leading-tight text-foreground">{e.label}</span>
                <span
                  className={cn("text-[10.5px] leading-none", e.approx && "decoration-dotted underline underline-offset-2 opacity-70")}
                  style={{ color: e.duration ? e.hex : undefined }}
                  title={e.approx ? "Estimated — this span predates status tracking, so its start time is inferred, not recorded" : undefined}
                >
                  {e.duration ? `${e.approx ? "~" : ""}${e.duration}` : <span className="text-muted-foreground/40">–</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Every recorded span is an estimate — i.e. the ticket predates status
          tracking and its history was backfilled. Say so, so a synthetic
          "Closed since day one" row isn't read as a real transition. */}
      {segments.length > 0 && segments.every((s) => s.confidence !== "exact") && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/60">
          This ticket predates status tracking — its history was backfilled from the status it
          held when tracking began, so these spans are estimates rather than recorded changes.
        </p>
      )}
    </div>
  );
};

// ─── Resolution summary — the AI's plain-language read of the above.
// "Impact" from the reference design is deliberately absent: nothing in
// Freshdesk or this database records production impact, and inventing an
// assessment would be worse than omitting the row. ─────────────────────────

const ResolutionSummary = ({ ticket, data }: { ticket: Ticket; data: AIAnalysis }) => {
  const isDone = SLA_DONE_STATUSES.includes(ticket.status);
  const rows = [
    { label: "Primary delay", value: data.primary_cause },
    { label: isDone ? "Resolution" : "Where it stands", value: data.formal_narrative },
  ].filter((r) => !!r.value);
  if (!rows.length) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5">
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
        {isDone ? "Resolution summary" : "Current summary"}
      </div>
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-4 text-[12px]">
            <dt className="w-[110px] shrink-0 text-muted-foreground">{r.label}</dt>
            <dd className="flex-1 leading-relaxed text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

// ─── Files — real attachments carried on conversation records. Freshdesk's
// attachment URLs are signed and short-lived, so a row jumps to the message
// that carried the file rather than offering a download link that would be
// dead by the time anyone clicked it. ──────────────────────────────────────

interface TicketFile { name: string; size: number; contentType: string; createdAt: string; convId: number }

const collectFiles = (conversations: Conversation[]): TicketFile[] =>
  conversations.flatMap((c) =>
    (c.attachments ?? []).map((a: any) => ({
      name: a.name ?? "Attachment",
      size: a.size ?? 0,
      contentType: a.content_type ?? "",
      createdAt: a.created_at ?? c.created_at,
      convId: c.id,
    }))
  );

const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const FilesTab = ({ files, onOpenMessage }: { files: TicketFile[]; onOpenMessage: (convId: number) => void }) => {
  if (!files.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 py-12 text-center">
        <Paperclip className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-[12.5px] text-muted-foreground">No files attached to this ticket</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      {files.map((f, i) => (
        <button
          key={`${f.convId}-${f.name}-${i}`}
          onClick={() => onOpenMessage(f.convId)}
          className={cn(
            "flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[12px] hover:bg-secondary/40",
            i > 0 && "border-t border-border/50"
          )}
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{f.name}</span>
          <span className="shrink-0 text-muted-foreground/70">{fmtBytes(f.size)}</span>
          <span className="w-20 shrink-0 text-right text-muted-foreground/70">{format(parseISO(f.createdAt), "d MMM")}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        </button>
      ))}
    </div>
  );
};

// ─── Activity — the raw transition log, one row per recorded status change.
// Same source as the Timeline, shown in full. ──────────────────────────────

const ActivityTab = ({ ticket, history }: { ticket: Ticket; history: StatusEvent[] }) => {
  const rows = [...history].sort((a, b) => +parseISO(b.changed_at) - +parseISO(a.changed_at));
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 py-12 text-center">
        <History className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-[12.5px] text-muted-foreground">No status changes recorded yet</p>
        <p className="text-[11px] text-muted-foreground/60">History capture began after this ticket was last synced.</p>
      </div>
    );
  }
  return (
    <div className="relative pl-1">
      <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-border/60" />
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="relative flex gap-3">
            <span
              className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-background"
              style={{ background: STATUS_HEX[r.to_status] ?? OTHER_HEX }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="font-semibold text-foreground">
                  {r.from_status != null
                    ? <>Moved to <b>{STATUS_META[r.to_status]?.label ?? r.to_status}</b> from {STATUS_META[r.from_status]?.label ?? r.from_status}</>
                    : <>First recorded status: <b>{STATUS_META[r.to_status]?.label ?? r.to_status}</b></>}
                </span>
                <span className="text-[10.5px] text-muted-foreground/70">
                  {format(parseISO(r.changed_at), "d MMM yyyy, h:mm a")}
                </span>
              </div>
              <div className="text-[10.5px] text-muted-foreground/60">
                {r.confidence === "exact" ? "Captured directly from a sync" : "Estimated from surrounding timestamps"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground/60">
        Ticket opened {format(parseISO(ticket.created_at), "d MMM yyyy, h:mm a")}.
      </p>
    </div>
  );
};

// ─── Conversation thread — a labeled chain ──────────────────────────────────
// Single connected column (same visual idiom as the SLA Journey milestone
// chain above it), strict chronological order. Every message gets a short
// reference code so "which reply answered which message" reads at a glance
// instead of requiring the reader to track names down a long thread:
//   CM# = Client Mail (customer message)   SR# = Support Reply (agent reply)
//   PN# = Private Note (internal-only, never seen by the customer)
// Keyed by ticket.id from the parent, so switching tickets remounts this
// (and re-runs the scroll-to-latest effect) instead of carrying over state.

// Splits a sanitized message body into the visible reply and any trailing
// quoted email chain (the "On Aug 12, X wrote: > ..." block most email
// clients append). Folding that away is what makes a 30-message thread
// readable — the quote is one click away, never lost.
const splitQuoted = (html: string): { main: string; quoted: string | null } => {
  if (typeof document === "undefined" || !html) return { main: html, quoted: null };
  const container = document.createElement("div");
  container.innerHTML = html;
  const marker = container.querySelector("blockquote, .gmail_quote, .quoted-text, .freshdesk_quote, .moz-cite-prefix");
  if (!marker) return { main: html, quoted: null };
  const quotedContainer = document.createElement("div");
  let node: ChildNode | null = marker;
  while (node) {
    const next: ChildNode | null = node.nextSibling;
    quotedContainer.appendChild(node);
    node = next;
  }
  const main = container.innerHTML;
  // If folding the quote would leave nothing visible, it wasn't a quote —
  // it was the whole message. Don't fold it away.
  if (!main.replace(/<[^>]+>/g, "").trim()) return { main: quotedContainer.innerHTML, quoted: null };
  return { main, quoted: quotedContainer.innerHTML };
};

const ConversationThread = ({ ticket, conversations, ackId }: { ticket: Ticket; conversations: Conversation[]; ackId: number | null }) => {
  const requester = requesterDisplayName(ticket);
  const lastRef = useRef<HTMLDivElement>(null);
  const [expandedQuotes, setExpandedQuotes] = useState<Set<number>>(new Set());
  const toggleQuote = (id: number) =>
    setExpandedQuotes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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
  const codeMap = codeConversations(conversations);
  const coded = sorted.map((conv) => ({ conv, code: codeMap.get(conv.created_at)?.code ?? "" }));

  return (
    <div className="relative">
      {/* Chain rail behind the avatars */}
      <span aria-hidden className="absolute left-[15px] top-2 bottom-2 w-px bg-border/60" />
      <div className="space-y-3">
        {coded.map(({ conv, code }, i) => {
          const isAgent = !conv.incoming;
          const author = conv.incoming ? requester : (ticket.responder_name ?? "Aerchain Support");
          const { main: html, quoted } = splitQuoted(sanitize(conv.body || conv.body_text || ""));
          const quoteOpen = expandedQuotes.has(conv.id);
          const isAck = conv.id === ackId;
          const refProp = i === coded.length - 1 ? { ref: lastRef } : {};
          const when = format(new Date(conv.created_at), "MMM d, h:mm a");
          const codeTone = conv.private
            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            : isAgent
              ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
              : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";

          return (
            <div key={conv.id} {...refProp} data-conv-id={conv.id} className="relative flex gap-3 rounded-lg transition-shadow">
              <Avatar className="relative z-10 mt-0.5 h-8 w-8 shrink-0 ring-4 ring-background">
                <AvatarFallback className={cn(
                  "text-[10px] font-bold text-white",
                  conv.private
                    ? "bg-gradient-to-br from-amber-500 to-orange-500"
                    : isAgent ? "bg-gradient-to-br from-[#6B4EFF] to-[#8b6dff]" : avatarColor(author)
                )}>
                  {initials(author)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                  <span className={cn("rounded-md px-1.5 py-0.5 font-mono font-bold tracking-wide", codeTone)}>{code}</span>
                  <span className="font-semibold text-foreground">{author}</span>
                  {conv.private && (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-600 dark:bg-amber-500/10">
                      <Lock className="h-2.5 w-2.5" /> Private
                    </span>
                  )}
                  {isAck && (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Ack
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground/60">{when}</span>
                </div>
                <div className={cn(
                  "rounded-2xl rounded-tl-sm border p-3.5 shadow-sm",
                  conv.private
                    ? "border-amber-200/60 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
                    : isAgent
                      ? "border-violet-100 bg-violet-50/40 dark:border-violet-500/15 dark:bg-violet-500/5"
                      : "border-border/50 bg-card"
                )}>
                  <div className="fd-html text-foreground/85" dangerouslySetInnerHTML={{ __html: html }} />
                  {quoted && (
                    <div className="mt-2 border-t border-border/40 pt-2">
                      <button
                        onClick={() => toggleQuote(conv.id)}
                        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className={cn("h-3 w-3 transition-transform", quoteOpen && "rotate-90")} />
                        <Mail className="h-3 w-3" />
                        {quoteOpen ? "Hide quoted email" : "Show quoted email"}
                      </button>
                      {quoteOpen && (
                        <div className="fd-html mt-2 border-l-2 border-border/50 pl-3 text-foreground/60" dangerouslySetInnerHTML={{ __html: quoted }} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main TicketDrawer ────────────────────────────────────────────────────────

// ─── Context panel — Status / Severity / Owner / Due / SLA at a glance,
// sticky alongside the AI brief so the reader never has to scroll back up
// to the header to check them. ──────────────────────────────────────────

// A row group renders only when it has at least one real value — no
// section titled "Assignment" or "Related" with fabricated fields (a
// ticket queue, a linked-ticket count) this app doesn't actually track.
const DetailRows = ({ rows }: { rows: { label: string; value: ReactNode }[] }) => (
  <dl className="space-y-2">
    {rows.map((r) => (
      <div key={r.label} className="flex items-center justify-between gap-3 text-[12px]">
        <dt className="text-muted-foreground">{r.label}</dt>
        <dd className="font-medium text-foreground text-right truncate max-w-[60%]">{r.value}</dd>
      </div>
    ))}
  </dl>
);

const ContextPanel = ({ ticket, conversations, milestones, fileCount, onGoTo }: {
  ticket: Ticket; conversations: Conversation[]; milestones: Milestone[];
  fileCount: number; onGoTo: (tab: WorkspaceTab) => void;
}) => {
  const sla = computeSLA(ticket);
  const p = PRIORITY_META[ticket.priority] ?? { label: String(ticket.priority), tone: "", dot: "" };
  const s = STATUS_META[ticket.status] ?? { label: `Status ${ticket.status}`, tone: "" };
  const resolution = milestones.find((m) => m.id === "resolution");
  const owner = ticket.responder_name?.trim();
  const isDone = SLA_DONE_STATUSES.includes(ticket.status);

  const mainRows: { label: string; value: ReactNode }[] = [
    { label: "Status", value: s.label },
    { label: "Severity", value: <span className="inline-flex items-center gap-1.5"><span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />{p.label}</span> },
    {
      label: "Owner",
      value: owner ? (
        <span className="inline-flex items-center gap-1.5">
          <Avatar className="h-4 w-4"><AvatarFallback className={cn("text-[7px] font-bold text-white", avatarColor(owner))}>{initials(owner)}</AvatarFallback></Avatar>
          {owner}
        </span>
      ) : "Unassigned",
    },
    { label: "Requester", value: requesterDisplayName(ticket) },
    { label: "Organization", value: ticketCompany(ticket) },
    ...(resolution && sla.state !== "not_applicable"
      ? [{ label: "Due", value: format(resolution.deadline, "d MMM, h:mm a") }]
      : []),
    {
      label: "SLA",
      value: (
        <span className={cn("inline-flex items-center gap-1.5 font-semibold", SLA_TEXT[sla.state] ?? SLA_TEXT.on_track)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", SLA_RAIL[sla.state] ?? SLA_RAIL.on_track)} />
          {SLA_STATE_LABEL[sla.state] ?? "On track"}
        </span>
      ),
    },
  ];

  const classificationRows: { label: string; value: ReactNode }[] = [
    ...(ticket.ticket_type ? [{ label: "Type", value: ticket.ticket_type }] : []),
    ...(ticket.module ? [{ label: "Module", value: ticket.module }] : []),
    ...(ticket.sub_type ? [{ label: "Issue type", value: ticket.sub_type }] : []),
  ];

  // Only real SLA facts: the target we computed, the actual stop time on a
  // done ticket, and how far past target it ran.
  const slaRows: { label: string; value: ReactNode }[] =
    sla.state === "not_applicable" || !resolution ? [] : [
      { label: "Target", value: format(resolution.deadline, "d MMM, h:mm a") },
      {
        label: isDone ? "Actual resolution" : "Elapsed",
        value: isDone ? format(parseISO(ticket.updated_at), "d MMM, h:mm a") : fmtDiff(differenceInMinutes(new Date(), parseISO(ticket.created_at))),
      },
      ...(sla.state === "breached"
        ? [{ label: "Overdue", value: <span className="font-semibold text-rose-600 dark:text-rose-400">{sla.remaining.replace(/^-/, "")}</span> }]
        : []),
    ];

  const related: { icon: typeof Paperclip; label: string; count: number; tab: WorkspaceTab }[] = [
    { icon: Paperclip, label: "Attachments", count: fileCount, tab: "files" },
    { icon: MessageSquare, label: "Conversations", count: conversations.length, tab: "conversation" },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-3.5">
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">Details</div>
        <DetailRows rows={mainRows} />
      </div>
      {classificationRows.length > 0 && (
        <div className="border-t border-border/50 pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">Classification</div>
          <DetailRows rows={classificationRows} />
        </div>
      )}
      {slaRows.length > 0 && (
        <div className="border-t border-border/50 pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">SLA details</div>
          <DetailRows rows={slaRows} />
        </div>
      )}
      <div className="border-t border-border/50 pt-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">Related</div>
        <div className="space-y-1">
          {related.map((r) => (
            <button
              key={r.label}
              onClick={() => onGoTo(r.tab)}
              className="flex w-full items-center gap-2 rounded-md py-1 text-[12px] hover:text-[#6B4EFF]"
            >
              <r.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{r.label}</span>
              <span className="ml-auto font-semibold text-foreground">{r.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Workspace body — Overview / Conversation tabs. Deliberately no
// Activity or Files tab: neither has a real data source behind it yet, and
// a tab that opens onto nothing is worse than not offering it. ─────────

type WorkspaceTab = "overview" | "conversation" | "files" | "activity";

const TicketWorkspaceBody = ({
  ticket, conversations, milestones, ackId, onCitationClick,
}: {
  ticket: Ticket; conversations: Conversation[]; milestones: Milestone[]; ackId: number | null;
  onCitationClick: (id: number) => void;
}) => {
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const requester = requesterDisplayName(ticket);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);

  // Status history is read directly here — NOT via analyze-ticket — so the
  // Timeline and Activity tab are real, free and available to every visitor
  // regardless of whether AI has ever run on this ticket.
  const [history, setHistory] = useState<StatusEvent[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchStatusHistory(ticket.id).then((rows) => { if (!cancelled) setHistory(rows); });
    return () => { cancelled = true; };
  }, [ticket.id]);

  const segments = useMemo(() => buildSegments(ticket, history), [ticket, history]);
  const files = useMemo(() => collectFiles(conversations), [conversations]);

  // Jumping to a message from the Files tab means switching tabs first, then
  // letting the thread mount before scrolling to the row.
  const openMessage = (convId: number) => {
    setTab("conversation");
    requestAnimationFrame(() => requestAnimationFrame(() => onCitationClick(convId)));
  };

  const tabs: { id: WorkspaceTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "conversation", label: "Conversation", count: conversations.length },
    { id: "files", label: "Files", count: files.length },
    { id: "activity", label: "Activity", count: history.length },
  ];

  return (
    <div>
      {/* Pinned so switching views never requires scrolling back up. */}
      <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-border/60 bg-background px-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-semibold transition-colors",
              tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn(
                "rounded px-1.5 py-px text-[10px] font-bold",
                tab === t.id ? "bg-[#6B4EFF]/10 text-[#6B4EFF] dark:text-violet-300" : "bg-secondary text-muted-foreground"
              )}>
                {t.count}
              </span>
            )}
            {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#6B4EFF]" />}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_252px] gap-4 p-4">
          <div className="space-y-4">
            <AIAnalysisPanel
              key={ticket.id}
              ticket={ticket}
              conversations={conversations}
              segments={segments}
              onCitationClick={onCitationClick}
              onDataChange={setAnalysis}
            />
            <TicketTimeline ticket={ticket} segments={segments} onViewFullHistory={() => setTab("activity")} />
            {analysis && <ResolutionSummary ticket={ticket} data={analysis} />}
          </div>
          <div className="lg:sticky lg:top-0 lg:self-start">
            <ContextPanel
              ticket={ticket}
              conversations={conversations}
              milestones={milestones}
              fileCount={files.length}
              onGoTo={setTab}
            />
          </div>
        </div>
      )}

      {tab === "conversation" && (
        <div className="space-y-4 p-4">
          {ticket.description && (
            <div className="rounded-xl border border-border/50 bg-secondary/25 p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
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
          <ConversationThread key={ticket.id} ticket={ticket} conversations={conversations} ackId={ackId} />
        </div>
      )}

      {tab === "files" && <div className="p-4"><FilesTab files={files} onOpenMessage={openMessage} /></div>}
      {tab === "activity" && <div className="p-4"><ActivityTab ticket={ticket} history={history} /></div>}
    </div>
  );
};

interface TicketDrawerProps {
  ticket: Ticket | null;
  conversations: Conversation[];
  isOpen: boolean;
  onClose: () => void;
}

export const TicketDrawer = ({ ticket, conversations, isOpen, onClose }: TicketDrawerProps) => {
  if (!ticket) return null;

  const milestones = buildMilestones(ticket, conversations);
  // First public agent reply = the acknowledgment message; tag it in the thread.
  const ackId = conversations
    .filter((c) => !c.incoming && !c.private)
    .sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at))[0]?.id ?? null;

  // Scrolls to and briefly rings the conversation entry a citation refers to.
  // Plain DOM, not React state — this is a one-shot visual pulse, not
  // something any render actually needs to know about.
  const onCitationClick = (convId: number) => {
    const el = document.querySelector(`[data-conv-id="${convId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-[#6B4EFF]", "ring-offset-2", "ring-offset-background");
    setTimeout(() => el.classList.remove("ring-2", "ring-[#6B4EFF]", "ring-offset-2", "ring-offset-background"), 1600);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" floating className="gap-0 p-0 sm:max-w-[1180px]">
        <TicketHeader ticket={ticket} milestones={milestones} onClose={onClose} />
        <ScrollArea className="flex-1" viewportClassName="[&>div]:!block">
          <TicketWorkspaceBody
            ticket={ticket}
            conversations={conversations}
            milestones={milestones}
            ackId={ackId}
            onCitationClick={onCitationClick}
          />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
