import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  Clock,
  AlertTriangle,
  BarChart3,
  Settings,
  Bell,
  Moon,
  Sun,
  Search,
  Command,
  RefreshCw,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isUsingRealAPI } from "@/services/freshdesk";
import { formatDistanceToNow } from "date-fns";

const nav = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Tickets", path: "/tickets", icon: TicketIcon },
  { label: "SLA Monitor", path: "/sla", icon: Clock },
  { label: "Escalations", path: "/escalations", icon: AlertTriangle },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
];

interface Props {
  onOpenCommand: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastUpdated: Date | null;
}

export const Header = ({ onOpenCommand, onRefresh, isRefreshing, lastUpdated }: Props) => {
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Ambient top bar glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <div className="flex h-[68px] items-center justify-between gap-4 border-b border-border/60 bg-background/70 px-5 backdrop-blur-2xl md:px-8">

        {/* ── Brand ── */}
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <div className="relative grid h-8 w-8 place-items-center rounded-xl gradient-brand shadow-lg shadow-primary/40">
            <span className="text-[15px] font-black text-white">A</span>
            {/* live pulse dot */}
            <span className="absolute -right-0.5 -top-0.5 grid h-3 w-3 place-items-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
          <div className="hidden flex-col leading-none md:flex">
            <span className="text-sm font-bold tracking-tight">Aerchain</span>
            <span className="text-[10px] text-muted-foreground">NSE Support OS</span>
          </div>
        </Link>

        {/* ── Frosted pill nav ── */}
        <nav className="relative hidden lg:block">
          {/* gradient shimmer border via pseudo — done inline with box-shadow trick */}
          <div className="nav-pill-shell relative rounded-full p-[1.5px]">
            {/* inner frosted surface */}
            <div className="flex items-center gap-0.5 rounded-full bg-background/60 px-1.5 py-1.5 backdrop-blur-2xl dark:bg-background/40">
              {nav.map((item) => {
                const active = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "nav-item group relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-300",
                      active
                        ? "text-white"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {/* active bubble */}
                    {active && (
                      <span className="nav-active-bubble absolute inset-0 rounded-full gradient-brand shadow-[0_0_16px_2px_hsl(var(--primary)/0.55)]" />
                    )}

                    {/* hover highlight (non-active) */}
                    {!active && (
                      <span className="absolute inset-0 rounded-full bg-foreground/0 transition-all duration-200 group-hover:bg-foreground/[0.06]" />
                    )}

                    <item.icon
                      className={cn(
                        "relative z-10 h-3.5 w-3.5 shrink-0 transition-all duration-300",
                        active
                          ? "drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                          : "group-hover:text-primary group-hover:drop-shadow-[0_0_4px_hsl(var(--primary)/0.6)]"
                      )}
                    />
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* ── Right actions ── */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* data freshness */}
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground xl:flex",
              isUsingRealAPI()
                ? "bg-emerald-500/5 text-emerald-600"
                : "bg-amber-500/5 text-amber-600"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isUsingRealAPI() ? "animate-pulse bg-emerald-500" : "bg-amber-500"
              )}
            />
            {isUsingRealAPI() ? "Live" : "Demo"}
          </span>

          {/* search trigger */}
          <button
            onClick={onOpenCommand}
            className="hidden items-center gap-2 rounded-full border border-border/60 bg-secondary/60 px-3 py-1.5 text-[13px] text-muted-foreground backdrop-blur transition-all hover:border-primary/40 hover:bg-secondary hover:text-foreground sm:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Search…</span>
            <kbd className="hidden items-center gap-0.5 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-medium lg:flex">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>

          {/* refresh */}
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 rounded-full"
            onClick={onRefresh}
            disabled={isRefreshing}
            title={lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : "Refresh"}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>

          {/* theme */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* bell */}
          <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" />
          </Button>

          {/* divider */}
          <span className="mx-1 h-5 w-px bg-border" />

          {/* avatar */}
          <Avatar className="h-8 w-8 cursor-pointer border border-border transition-transform hover:scale-105">
            <AvatarFallback className="gradient-brand text-[11px] font-bold text-white">NS</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
};
