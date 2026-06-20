import { useState } from "react";
import { MessageSquare, UserPlus, CheckCircle2, AlertCircle, ArrowUpRight, Clock, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  { id: 1, title: "Ticket NSE-12345 created", subtitle: "NSE — Procurement dept", time: "2m ago", icon: MessageSquare, color: "bg-blue-500", dot: "bg-blue-500" },
  { id: 2, title: "SLA threshold reached", subtitle: "NSE-12344 · 15 min remaining", time: "7m ago", icon: Clock, color: "bg-amber-500", dot: "bg-amber-500" },
  { id: 3, title: "Asha Nair replied", subtitle: "NSE-12340 · customer message", time: "10m ago", icon: MessageSquare, color: "bg-emerald-500", dot: "bg-emerald-500" },
  { id: 4, title: "NSE-12343 escalated", subtitle: "Escalated to Level 2 support", time: "12m ago", icon: ArrowUpRight, color: "bg-rose-500", dot: "bg-rose-500" },
  { id: 5, title: "Ravi Kumar assigned", subtitle: "NSE-12341 · Priority High", time: "15m ago", icon: UserPlus, color: "bg-violet-500", dot: "bg-violet-500" },
  { id: 6, title: "SLA breached", subtitle: "NSE-12340 · 8 min overdue", time: "22m ago", icon: AlertCircle, color: "bg-rose-500", dot: "bg-rose-500" },
  { id: 7, title: "NSE-12338 resolved", subtitle: "Closed by Meena N", time: "25m ago", icon: CheckCircle2, color: "bg-emerald-500", dot: "bg-emerald-500" },
  { id: 8, title: "New ticket opened", subtitle: "NSE-12346 · Invoice discrepancy", time: "31m ago", icon: MessageSquare, color: "bg-blue-500", dot: "bg-blue-500" },
];

export const ActivityFeed = () => {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
            <Radio className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold">Live Activity</h3>
            <p className="text-[11px] text-muted-foreground">Real-time event stream</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Live</span>
        </div>
      </div>

      {/* Feed */}
      <div className="relative flex-1 overflow-y-auto px-4 py-3">
        {/* Timeline rail */}
        <div className="absolute bottom-4 left-[28px] top-4 w-px bg-border/60" />

        <div className="space-y-0.5">
          {activities.map((a) => (
            <div
              key={a.id}
              onMouseEnter={() => setHovered(a.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "group relative flex gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150",
                hovered === a.id ? "bg-secondary/60" : "hover:bg-secondary/40"
              )}
            >
              {/* Icon circle */}
              <div className={cn(
                "z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white shadow-sm ring-4 ring-card transition-transform duration-150 group-hover:scale-110",
                a.color
              )}>
                <a.icon size={12} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="truncate text-[12px] font-semibold text-foreground group-hover:text-primary transition-colors">
                  {a.title}
                </p>
                <p className="truncate text-[10.5px] text-muted-foreground">{a.subtitle}</p>
              </div>

              {/* Time */}
              <span className="shrink-0 pt-0.5 text-[10px] text-muted-foreground/60">{a.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <button className="flex items-center justify-center gap-1.5 border-t border-border/60 py-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground">
        View full activity log <ArrowUpRight className="h-3 w-3" />
      </button>
    </div>
  );
};
