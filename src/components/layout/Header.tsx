import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Ticket as TicketIcon,
  FileBarChart,
  Bell,
  Moon,
  Sun,
  Settings,
  RefreshCw,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isUsingRealAPI } from "@/services/freshdesk";
import { formatDistanceToNow } from "date-fns";

const nav = [
  { label: "Home", path: "/", icon: Home },
  { label: "Tickets", path: "/tickets", icon: TicketIcon },
  { label: "Reports", path: "/reports", icon: FileBarChart },
];

interface Props {
  onOpenCommand: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastUpdated: Date | null;
}

export const Header = ({ onRefresh, isRefreshing, lastUpdated }: Props) => {
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E8E8F0] bg-white dark:border-border dark:bg-[#0F0F1A]">
      <div className="flex h-[60px] items-center px-6 md:px-8">

        {/* ── Left group: brand + nav ── */}
        <div className="flex items-center gap-7">
          {/* Brand */}
          <Link to="/" className="flex shrink-0 items-center gap-2">
            {/* Aerchain logo mark — bold A in brand coral/red */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="shrink-0">
              <path
                d="M4 24L13 4L22 24M8 17H18"
                stroke="#E8341C"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="hidden text-[15px] font-black uppercase tracking-[0.14em] text-[#1A1A2E] dark:text-white md:inline">
              Aerchain
            </span>
          </Link>

          {/* Pill nav */}
          <nav className="hidden md:block">
            <div className="flex items-center gap-0.5 rounded-full border border-[#E2E2EE] bg-[#F5F5FB] p-1 shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-border dark:bg-secondary/40">
            {nav.map((item) => {
              const active = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "group relative flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[13px] font-medium transition-all duration-200",
                    active
                      ? "bg-[#6B4EFF] text-white shadow-[0_2px_12px_rgba(107,78,255,0.35)]"
                      : "text-[#6B6B8A] hover:bg-white hover:text-[#1A1A2E] hover:shadow-[0_1px_4px_rgba(0,0,0,0.08)] dark:text-muted-foreground dark:hover:bg-secondary dark:hover:text-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[14px] w-[14px] shrink-0",
                      active ? "text-white" : "text-[#9090A8] group-hover:text-[#6B4EFF] dark:text-muted-foreground"
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              );
              })}
            </div>
          </nav>
        </div>

        {/* ── Right actions ── */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {/* data freshness indicator */}
          <span
            className={cn(
              "mr-2 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold xl:flex",
              isUsingRealAPI()
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"
                : "bg-amber-50 text-amber-600 dark:bg-amber-500/10"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", isUsingRealAPI() ? "animate-pulse bg-emerald-500" : "bg-amber-400")} />
            {isUsingRealAPI() ? "Live" : "Demo"}
          </span>

          {/* refresh */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
            onClick={onRefresh}
            disabled={isRefreshing}
            title={lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : "Refresh"}
          >
            <RefreshCw className={cn("h-[17px] w-[17px]", isRefreshing && "animate-spin")} />
          </Button>

          {/* settings */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
          >
            <Settings className="h-[17px] w-[17px]" />
          </Button>

          {/* bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
          >
            <Bell className="h-[17px] w-[17px]" />
            <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full bg-rose-500 ring-[1.5px] ring-white dark:ring-background" />
          </Button>

          {/* theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
          </Button>

          {/* divider */}
          <span className="mx-1.5 h-5 w-px bg-[#E2E2EE] dark:bg-border" />

          {/* avatar */}
          <Avatar className="h-8 w-8 cursor-pointer transition-transform hover:scale-105">
            <AvatarFallback className="bg-[#6B4EFF] text-[11px] font-bold text-white">CH</AvatarFallback>
          </Avatar>
        </div>

      </div>
    </header>
  );
};
