import DOMPurify from "dompurify";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Ticket, Conversation, Priority } from "../../types/freshdesk";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Clock, User, Send, Paperclip, StickyNote, ShieldAlert,
  CheckCircle2, XCircle, Lock, ArrowDownLeft, ArrowUpRight, Timer,
} from "lucide-react";
import { format, differenceInMinutes, parseISO, addHours, addMinutes } from "date-fns";
import {
  requesterDisplayName, ticketDept, computeSLA,
  SLA_LABELS, SLA_ACK_MINUTES, SLA_ANALYSIS_MINUTES,
  SLA_RESOLUTION_HOURS, SLA_DONE_STATUSES, SLA_PAUSED_STATUS,
  PRIORITY_META, STATUS_META, initials, Priority,
} from "@/lib/tickets";
import { cn } from "@/lib/utils";

interface TicketDrawerProps {
  ticket: Ticket | null;
  conversations: Conversation[];
  isOpen: boolean;
  onClose: () => void;
}

// Force all links to open safely in a new tab
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { ADD_ATTR: ["target"], FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });

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

// ── SLA Tracker ──────────────────────────────────────────────────────────────

type MilestoneStatus = "met" | "missed" | "pending" | "paused";

interface Milestone {
  label: string;
  target: string;    // human label e.g. "15 minutes"
  deadline: Date;
  actual: Date | null;
  status: MilestoneStatus;
}

const fmtDiff = (minutes: number): string => {
  const abs = Math.abs(minutes);
  const d = Math.floor(abs / (60 * 24));
  const h = Math.floor((abs % (60 * 24)) / 60);
  const m = abs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const SLATracker = ({ ticket, conversations }: { ticket: Ticket; conversations: Conversation[] }) => {
  const created = parseISO(ticket.created_at);
  const isDone = SLA_DONE_STATUSES.includes(ticket.status);
  const isPaused = ticket.status === SLA_PAUSED_STATUS;

  // First agent reply (incoming=false, earliest)
  const firstAgentReply = conversations
    .filter((c) => !c.incoming)
    .sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at))[0] ?? null;
  const firstReplyAt = firstAgentReply ? parseISO(firstAgentReply.created_at) : null;
  const ackDeadline = addMinutes(created, SLA_ACK_MINUTES);
  const analysisDeadline = addMinutes(created, SLA_ANALYSIS_MINUTES);
  const resolutionHours = SLA_RESOLUTION_HOURS[ticket.priority as Priority] ?? SLA_RESOLUTION_HOURS[1];
  const resolutionDeadline = addHours(created, resolutionHours);
  const slaLabel = SLA_LABELS[ticket.priority as Priority] ?? SLA_LABELS[1];

  const ackStatus = (): MilestoneStatus => {
    if (!firstReplyAt) return isPaused ? "paused" : "pending";
    return firstReplyAt <= ackDeadline ? "met" : "missed";
  };

  const analysisStatus = (): MilestoneStatus => {
    if (!firstReplyAt) return isPaused ? "paused" : "pending";
    return firstReplyAt <= analysisDeadline ? "met" : "missed";
  };

  const resolutionStatus = (): MilestoneStatus => {
    if (isDone) return new Date() <= resolutionDeadline ? "met" : "missed";
    if (isPaused) return "paused";
    return new Date() > resolutionDeadline ? "missed" : "pending";
  };

  const milestones: Milestone[] = [
    {
      label: "Acknowledgment",
      target: `${SLA_ACK_MINUTES} min`,
      deadline: ackDeadline,
      actual: firstReplyAt,
      status: ackStatus(),
    },
    {
      label: "Initial Analysis",
      target: `${SLA_ANALYSIS_MINUTES} min`,
      deadline: analysisDeadline,
      actual: firstReplyAt,
      status: analysisStatus(),
    },
    {
      label: "Workaround",
      target: slaLabel.workaround,
      deadline: resolutionDeadline,
      actual: isDone ? new Date() : null,
      status: isDone ? "met" : isPaused ? "paused" : new Date() > resolutionDeadline ? "missed" : "pending",
    },
    {
      label: "Full Resolution",
      target: slaLabel.resolution,
      deadline: resolutionDeadline,
      actual: isDone ? new Date() : null,
      status: resolutionStatus(),
    },
  ];

  const overallSla = computeSLA(ticket);
  const slaToneBox =
    overallSla.state === "breached" ? "border-rose-200 bg-gradient-to-br from-rose-50 to-rose-50/30 dark:border-rose-500/20 dark:from-rose-500/10 dark:to-transparent" :
    overallSla.state === "attention" ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/30 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" :
    overallSla.state === "met" ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/30 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" :
    "border-border/60 bg-gradient-to-br from-secondary/40 to-transparent";

  const statusIcon = (s: MilestoneStatus) => {
    if (s === "met") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (s === "missed") return <XCircle className="h-4 w-4 text-rose-500" />;
    if (s === "paused") return <Timer className="h-4 w-4 text-violet-400" />;
    return <Clock className="h-4 w-4 text-muted-foreground/50" />;
  };

  const statusBadge = (m: Milestone) => {
    if (m.status === "met") {
      const diffMin = differenceInMinutes(m.actual!, m.deadline);
      // met early or on-time
      const early = Math.abs(diffMin);
      return (
        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          Met {early > 0 ? `· ${fmtDiff(early)} early` : "on time"}
        </span>
      );
    }
    if (m.status === "missed") {
      const now = m.actual ?? new Date();
      const overMin = differenceInMinutes(now, m.deadline);
      return (
        <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          Overdue · +{fmtDiff(overMin)}
        </span>
      );
    }
    if (m.status === "paused") {
      return <span className="text-[11px] font-semibold text-violet-500">Paused</span>;
    }
    // pending
    const rem = differenceInMinutes(m.deadline, new Date());
    return (
      <span className="text-[11px] font-medium text-muted-foreground">
        {fmtDiff(rem)} left
      </span>
    );
  };

  const metCount = milestones.filter((m) => m.status === "met").length;
  const missedCount = milestones.filter((m) => m.status === "missed").length;

  return (
    <div className={cn("rounded-2xl border p-4", slaToneBox)}>
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className={cn("h-4 w-4", overallSla.tone)} />
          <span className="text-[13px] font-bold text-foreground">{slaLabel.severity}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[12px] font-bold", overallSla.tone)}>
            {overallSla.label}
            {overallSla.state !== "met" && overallSla.state !== "paused" && ` · ${overallSla.remaining}`}
          </span>
          <span className="rounded-full bg-card/80 px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
            {metCount}/{milestones.length} met
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-border/50">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            missedCount > 0 ? "bg-rose-500" : metCount === milestones.length ? "bg-emerald-500" : "bg-[#6B4EFF]"
          )}
          style={{ width: `${(metCount / milestones.length) * 100}%` }}
        />
      </div>

      {/* Milestones */}
      <div className="space-y-2">
        {milestones.map((m, i) => (
          <div
            key={m.label}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              m.status === "met" ? "border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-500/15 dark:bg-emerald-500/5" :
              m.status === "missed" ? "border-rose-200/70 bg-rose-50/50 dark:border-rose-500/15 dark:bg-rose-500/5" :
              m.status === "paused" ? "border-violet-200/60 bg-violet-50/40 dark:border-violet-500/15 dark:bg-violet-500/5" :
              "border-border/40 bg-card/50"
            )}
          >
            {/* Step number + connector */}
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                m.status === "met" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" :
                m.status === "missed" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300" :
                m.status === "paused" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" :
                "bg-muted text-muted-foreground"
              )}>
                {i + 1}
              </div>
            </div>

            {/* Icon */}
            <div className="shrink-0">{statusIcon(m.status)}</div>

            {/* Label + target */}
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-foreground">{m.label}</div>
              <div className="text-[11px] text-muted-foreground">Target: {m.target}</div>
            </div>

            {/* Status badge */}
            <div className="shrink-0 text-right">
              {statusBadge(m)}
              {m.actual && m.status !== "pending" && (
                <div className="text-[10px] text-muted-foreground/60">
                  {format(m.actual, "MMM d, h:mm a")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export const TicketDrawer = ({ ticket, conversations, isOpen, onClose }: TicketDrawerProps) => {
  if (!ticket) return null;

  const p = PRIORITY_META[ticket.priority] ?? { label: String(ticket.priority), tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
  const s = STATUS_META[ticket.status] ?? { label: `Status ${ticket.status}`, tone: "bg-slate-100 text-slate-600" };
  const requester = requesterDisplayName(ticket);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <SheetHeader className="space-y-0 border-b border-border/60 bg-secondary/20 p-6 pb-5 text-left">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[12px] font-semibold text-primary">#{ticket.id}</span>
            <span className={cn("chip", p.tone)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
              {p.label}
            </span>
            <span className={cn("chip", s.tone)}>{s.label}</span>
          </div>

          <SheetTitle className="font-display text-[19px] font-bold leading-snug tracking-tight">
            {ticket.subject}
          </SheetTitle>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {requester} · <span className="font-medium text-foreground/70">{ticketDept(ticket)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(ticket.created_at), "MMM d, yyyy · h:mm a")}
            </span>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-6">

            {/* ── SLA Milestone Tracker ──────────────────────────────── */}
            <SLATracker ticket={ticket} conversations={conversations} />

            {/* ── Original description ────────────────────────────────── */}
            {ticket.description && (
              <div className="rounded-2xl border border-border/50 bg-secondary/25 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className={cn("text-[10px] font-bold text-white", avatarColor(requester))}>
                      {initials(requester)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-[12.5px] font-semibold leading-none">{requester}</div>
                    <div className="text-[10.5px] text-muted-foreground">opened this ticket</div>
                  </div>
                </div>
                <div className="fd-html text-foreground/85" dangerouslySetInnerHTML={{ __html: sanitize(ticket.description) }} />
              </div>
            )}

            {/* ── Conversation divider ───────────────────────────────── */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                Conversation · {conversations.length}
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {/* ── Conversation thread ────────────────────────────────── */}
            <div className="space-y-4">
              {conversations.length === 0 && (
                <p className="py-6 text-center text-[12px] text-muted-foreground/60">No replies yet.</p>
              )}
              {conversations.map((conv) => {
                const author = conv.incoming ? requester : "Support Agent";
                const html = sanitize(conv.body || conv.body_text || "");
                return (
                  <div key={conv.id} className="flex gap-3">
                    <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                      <AvatarFallback className={cn(
                        "text-[10px] font-bold text-white",
                        conv.incoming ? avatarColor(author) : "bg-gradient-to-br from-[#6B4EFF] to-[#8b6dff]"
                      )}>
                        {initials(author)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-foreground">{author}</span>
                        <span className={cn(
                          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold",
                          conv.incoming ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10" : "bg-violet-50 text-violet-600 dark:bg-violet-500/10"
                        )}>
                          {conv.incoming ? <ArrowDownLeft className="h-2.5 w-2.5" /> : <ArrowUpRight className="h-2.5 w-2.5" />}
                          {conv.incoming ? "Incoming" : "Reply"}
                        </span>
                        {conv.private && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-600 dark:bg-amber-500/10">
                            <Lock className="h-2.5 w-2.5" /> Private
                          </span>
                        )}
                        <span className="ml-auto text-[10.5px] text-muted-foreground/60">
                          {format(new Date(conv.created_at), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <div className={cn(
                        "rounded-2xl rounded-tl-sm border p-3.5 shadow-sm",
                        conv.private
                          ? "border-amber-200/60 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
                          : conv.incoming
                            ? "border-border/50 bg-card"
                            : "border-violet-100 bg-violet-50/40 dark:border-violet-500/15 dark:bg-violet-500/5"
                      )}>
                        <div className="fd-html text-foreground/85" dangerouslySetInnerHTML={{ __html: html }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        {/* ── Reply composer ───────────────────────────────────────────── */}
        <div className="border-t border-border/60 bg-secondary/20 p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
              <StickyNote className="h-3.5 w-3.5" /> Internal Note
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
              <Paperclip className="h-3.5 w-3.5" /> Attach
            </Button>
          </div>
          <div className="relative">
            <Textarea
              placeholder="Type your reply…"
              className="min-h-[92px] resize-none rounded-xl border-border/60 bg-card pr-12 text-[13px] focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            <Button size="icon" className="absolute bottom-3 right-3 h-8 w-8 rounded-full bg-[#6B4EFF] hover:bg-[#5a3de8]">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1.5">
              <Button variant="secondary" size="sm" className="h-8 rounded-lg text-xs">Pending</Button>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
              </Button>
            </div>
            <Button size="sm" className="h-8 gap-1.5 rounded-lg bg-[#6B4EFF] px-4 text-xs font-semibold text-white hover:bg-[#5a3de8]">
              Send Reply
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
