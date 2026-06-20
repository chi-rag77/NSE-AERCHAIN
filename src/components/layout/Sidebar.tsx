import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  Clock,
  AlertTriangle,
  BarChart3,
  Settings,
  ChevronLeft,
  Sparkles,
  LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Tickets", path: "/tickets", icon: TicketIcon },
  { label: "SLA Monitor", path: "/sla", icon: Clock },
  { label: "Escalations", path: "/escalations", icon: AlertTriangle },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ collapsed, onToggle }: Props) => {
  const { pathname } = useLocation();

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-300 ease-out",
        collapsed ? "w-[76px]" : "w-[248px]"
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 h-16 px-4 border-b border-sidebar-border">
        <div className="relative h-9 w-9 shrink-0 rounded-xl gradient-brand grid place-items-center shadow-lg shadow-primary/30">
          <span className="font-black text-white text-lg">A</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-white tracking-tight">Aerchain</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
              NSE Support OS
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1">
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
            Workspace
          </p>
        )}
        {nav.map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full gradient-brand" />
              )}
              <item.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Upsell / help card */}
      {!collapsed && (
        <div className="mx-3 mb-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-4">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Copilot</span>
          </div>
          <p className="mt-1.5 text-xs text-sidebar-foreground/70">
            Ask AI to summarise breaches & draft replies.
          </p>
          <button className="mt-3 w-full rounded-lg gradient-brand py-2 text-xs font-semibold text-white shadow-md shadow-primary/30 transition-transform hover:scale-[1.02]">
            Open Copilot
          </button>
        </div>
      )}

      {/* Footer controls */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-white transition-colors"
        >
          <ChevronLeft className={cn("h-[18px] w-[18px] transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-sidebar-foreground/50">
            <LifeBuoy className="h-3.5 w-3.5" /> v2.0 · Control Center
          </div>
        )}
      </div>
    </aside>
  );
};
