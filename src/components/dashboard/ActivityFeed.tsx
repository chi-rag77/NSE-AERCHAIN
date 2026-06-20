import { MessageSquare, UserPlus, CheckCircle2, AlertCircle, ArrowUpRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  { id: 1, title: "Ticket NSE-12345 created", subtitle: "by NSE — Procurement", time: "2m ago", icon: MessageSquare, color: "bg-blue-500" },
  { id: 2, title: "SLA approaching", subtitle: "Ticket NSE-12344", time: "7m ago", icon: Clock, color: "bg-amber-500" },
  { id: 3, title: "Asha Nair replied", subtitle: "Ticket NSE-12340", time: "10m ago", icon: MessageSquare, color: "bg-emerald-500" },
  { id: 4, title: "Ticket NSE-12343 escalated", subtitle: "to Level 2", time: "12m ago", icon: ArrowUpRight, color: "bg-rose-500" },
  { id: 5, title: "Ravi Kumar assigned", subtitle: "Ticket NSE-12341", time: "15m ago", icon: UserPlus, color: "bg-violet-500" },
  { id: 6, title: "SLA breached", subtitle: "Ticket NSE-12340", time: "22m ago", icon: AlertCircle, color: "bg-rose-500" },
  { id: 7, title: "Ticket NSE-12338 resolved", subtitle: "by Meena N", time: "25m ago", icon: CheckCircle2, color: "bg-emerald-500" },
];

export const ActivityFeed = () => {
  return (
    <div className="card-elevated flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold">Live Activity</h3>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
        </span>
      </div>

      <div className="relative flex-1 overflow-y-auto px-5 py-2">
        {/* timeline rail */}
        <div className="absolute bottom-4 left-[34px] top-4 w-px bg-border" />
        {activities.map((a) => (
          <div key={a.id} className="group relative flex gap-3 py-3">
            <div className={cn("z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ring-4 ring-card", a.color)}>
              <a.icon size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold transition-colors group-hover:text-primary">{a.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{a.subtitle}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">{a.time}</p>
            </div>
          </div>
        ))}
      </div>

      <button className="border-t border-border py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        View all activity
      </button>
    </div>
  );
};
