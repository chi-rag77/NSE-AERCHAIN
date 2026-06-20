import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Flame, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { PRIORITY_META, computeSLA, ticketDept, initials, requesterDisplayName } from "@/lib/tickets";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Props {
  tickets: Ticket[];
  onRowClick: (t: Ticket) => void;
}

const avatarColor = (name: string) => {
  const cols = [
    "from-violet-500 to-purple-600",
    "from-sky-500 to-blue-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-indigo-500 to-violet-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `bg-gradient-to-br ${cols[h % cols.length]}`;
};

const urgencyBar = (remainingMinutes: number, totalMinutes: number) => {
  const pct = Math.max(0, Math.min(100, (remainingMinutes / totalMinutes) * 100));
  const color = pct < 10 ? "#f43f5e" : pct < 30 ? "#f59e0b" : "#10b981";
  return { pct, color };
};

export const PriorityQueue = ({ tickets, onRowClick }: Props) => {
  const urgent = useMemo(
    () =>
      [...tickets]
        .filter((t) => ![4, 5].includes(t.status))
        .sort((a, b) => computeSLA(a).remainingMinutes - computeSLA(b).remainingMinutes)
        .slice(0, 7),
    [tickets]
  );

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10">
            <Flame className="h-4 w-4 text-rose-500" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold">Priority Queue</h3>
            <p className="text-[11px] text-muted-foreground">Sorted by SLA urgency · {urgent.length} active</p>
          </div>
        </div>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1 rounded-lg bg-primary/8 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/60 flex-1">
        {urgent.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-2 text-2xl">🎉</div>
            <div className="text-sm font-semibold text-emerald-600">Queue is clear</div>
            <div className="text-[11px] text-muted-foreground">No urgent tickets pending</div>
          </div>
        )}
        {urgent.map((t, idx) => {
          const sla = computeSLA(t);
          const p = PRIORITY_META[t.priority] ?? { label: String(t.priority), tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
          const totalMins = Math.abs(sla.remainingMinutes) + (sla.state === "breached" ? 0 : Math.abs(sla.remainingMinutes));
          const ub = urgencyBar(sla.remainingMinutes, sla.remainingMinutes > 0 ? sla.remainingMinutes * 2 : 1);
          const requester = requesterDisplayName(t);

          return (
            <button
              key={t.id}
              onClick={() => onRowClick(t)}
              className="group flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-all duration-150 hover:bg-secondary/50"
            >
              {/* Rank */}
              <span className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black",
                idx === 0 ? "bg-rose-500/15 text-rose-600" :
                idx === 1 ? "bg-amber-500/15 text-amber-600" :
                "bg-secondary text-muted-foreground"
              )}>
                {idx + 1}
              </span>

              {/* Priority accent */}
              <div className={cn("h-9 w-1 shrink-0 rounded-full", p.dot)} />

              {/* Main content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[11px] font-bold text-primary">#{t.id}</span>
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", p.tone)}>
                    {p.label}
                  </span>
                  {sla.state === "breached" && (
                    <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-600">
                      Breached
                    </span>
                  )}
                </div>
                <p className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
                  {t.subject}
                </p>
                {/* SLA bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${sla.state === "breached" ? 100 : ub.pct}%`,
                        backgroundColor: sla.state === "breached" ? "#f43f5e" : ub.color,
                      }}
                    />
                  </div>
                  <div className={cn("flex items-center gap-0.5 text-[10px] font-bold shrink-0", sla.tone)}>
                    <Clock3 className="h-2.5 w-2.5" />
                    {sla.remaining}
                  </div>
                </div>
              </div>

              {/* Assignee avatar */}
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className={cn(
                  "text-[9px] font-bold text-white",
                  t.responder_name ? avatarColor(t.responder_name) : "bg-secondary"
                )}>
                  {t.responder_name ? initials(t.responder_name) : "?"}
                </AvatarFallback>
              </Avatar>
            </button>
          );
        })}
      </div>
    </div>
  );
};
