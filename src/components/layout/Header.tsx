import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  Home, Ticket as TicketIcon, FileBarChart, Bell, Moon, Sun,
  RefreshCw, ShieldCheck, LogOut, Users, SlidersHorizontal, ScrollText,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isUsingRealAPI } from "@/services/freshdesk";
import { useAuth } from "@/auth/AuthProvider";
import { initials } from "@/lib/tickets";
import { formatDistanceToNow } from "date-fns";

interface Props {
  onOpenCommand?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | null;
}

export const Header = ({ onRefresh, isRefreshing, lastUpdated }: Props) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { profile, isAdmin, signOut, authDisabled } = useAuth();

  const nav = [
    { label: "Home", path: "/", icon: Home },
    { label: "Tickets", path: "/tickets", icon: TicketIcon },
    { label: "Reports", path: "/reports", icon: FileBarChart },
    ...(isAdmin ? [{ label: "Admin", path: "/admin/users", icon: ShieldCheck }] : []),
  ];

  const isActive = (path: string) =>
    path === "/admin/users" ? pathname.startsWith("/admin") : pathname === path;

  const activeIndex = nav.findIndex((item) => isActive(item.path));
  const idx = activeIndex >= 0 ? activeIndex : 0;

  const displayName = profile?.full_name || profile?.email || "User";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  // Neural-path geometry: measure the centre of each node so the connecting
  // line can fill progressively up to the active node.
  const navRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [path, setPath] = useState<{ start: number; end: number; fill: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const measure = () => {
      const container = navRef.current;
      const first = nodeRefs.current[0];
      const last = nodeRefs.current[nav.length - 1];
      const active = nodeRefs.current[idx];
      if (!container || !first || !last || !active) return;
      const c = container.getBoundingClientRect();
      const centre = (el: HTMLElement) => el.getBoundingClientRect().left - c.left + el.offsetWidth / 2;
      setPath({ start: centre(first), end: centre(last), fill: centre(active) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [idx, mounted, nav.length]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E8E8F0] bg-white dark:border-border dark:bg-[#0F0F1A]">
      <div className="flex h-[60px] items-center px-6 md:px-8">
        {/* Left: brand + nav */}
        <div className="flex items-center gap-7">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="shrink-0">
              <path d="M4 24L13 4L22 24M8 17H18" stroke="#E8341C" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden text-[15px] font-black uppercase tracking-[0.14em] text-[#1A1A2E] dark:text-white md:inline">
              Aerchain
            </span>
          </Link>

          <nav className="hidden md:block">
            <div ref={navRef} className="relative flex items-center">
              {/* Connecting track (muted, full span) */}
              {path && mounted && (
                <span
                  aria-hidden
                  className="dark:bg-border/70"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: path.start,
                    width: Math.max(0, path.end - path.start),
                    height: 2,
                    transform: "translateY(-50%)",
                    background: "#E2E2EE",
                    borderRadius: 9999,
                    zIndex: 0,
                  }}
                />
              )}
              {/* Animated progress fill up to the active node */}
              {path && mounted && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: path.start,
                    width: Math.max(0, path.fill - path.start),
                    height: 2,
                    transform: "translateY(-50%)",
                    background: "linear-gradient(90deg, #6B4EFF 0%, #8B6FFF 100%)",
                    borderRadius: 9999,
                    boxShadow: "0 0 8px rgba(107,78,255,0.55)",
                    transition: "width 0.5s cubic-bezier(0.65,0,0.35,1)",
                    zIndex: 1,
                  }}
                />
              )}

              {nav.map((item, i) => {
                const active = isActive(item.path);
                const passed = i <= idx; // nodes the workflow has reached
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="group relative z-10 flex flex-col items-center gap-1 px-4 py-1"
                  >
                    {/* Node */}
                    <span
                      ref={(el) => { nodeRefs.current[i] = el; }}
                      className={cn(
                        "relative flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all duration-300",
                        active
                          ? "border-[#6B4EFF] bg-[#6B4EFF]"
                          : passed
                          ? "border-[#6B4EFF] bg-white dark:bg-[#0F0F1A]"
                          : "border-[#CFCFE2] bg-white group-hover:border-[#6B4EFF] dark:border-border dark:bg-[#0F0F1A]"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-[9px] w-[9px] shrink-0 transition-colors duration-300",
                          active ? "text-white" : passed ? "text-[#6B4EFF]" : "text-[#9090A8] group-hover:text-[#6B4EFF] dark:text-muted-foreground"
                        )}
                      />
                      {/* Pulse ring on active */}
                      {active && (
                        <span
                          aria-hidden
                          className="absolute inset-0 animate-ping rounded-full"
                          style={{ background: "rgba(107,78,255,0.45)", animationDuration: "1.8s" }}
                        />
                      )}
                    </span>

                    {/* Label */}
                    <span
                      className={cn(
                        "text-[11.5px] font-medium leading-none transition-colors duration-200",
                        active
                          ? "font-semibold text-[#1A1A2E] dark:text-white"
                          : "text-[#6B6B8A] group-hover:text-[#1A1A2E] dark:text-muted-foreground dark:group-hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <span
            className={cn(
              "mr-2 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold xl:flex",
              isUsingRealAPI() ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "bg-amber-50 text-amber-600 dark:bg-amber-500/10"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", isUsingRealAPI() ? "animate-pulse bg-emerald-500" : "bg-amber-400")} />
            {isUsingRealAPI() ? "Live" : "Demo"}
          </span>

          {onRefresh && (
            <Button
              variant="ghost" size="icon"
              className="h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
              onClick={onRefresh} disabled={isRefreshing}
              title={lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : "Refresh"}
            >
              <RefreshCw className={cn("h-[17px] w-[17px]", isRefreshing && "animate-spin")} />
            </Button>
          )}

          <Button
            variant="ghost" size="icon"
            className="relative h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
          >
            <Bell className="h-[17px] w-[17px]" />
            <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full bg-rose-500 ring-[1.5px] ring-white dark:ring-background" />
          </Button>

          <Button
            variant="ghost" size="icon"
            className="h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
          </Button>

          <span className="mx-1.5 h-5 w-px bg-[#E2E2EE] dark:bg-border" />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full outline-none">
                <Avatar className="h-8 w-8 cursor-pointer transition-transform hover:scale-105">
                  <AvatarFallback className="bg-[#6B4EFF] text-[11px] font-bold text-white">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold">{displayName}</span>
                {profile?.email && <span className="truncate text-[11px] font-normal text-muted-foreground">{profile.email}</span>}
                {isAdmin && (
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                    <ShieldCheck className="h-3 w-3" /> System Admin
                  </span>
                )}
              </DropdownMenuLabel>

              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/admin/users")}>
                    <Users className="mr-2 h-4 w-4" /> Manage users
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/sla")}>
                    <SlidersHorizontal className="mr-2 h-4 w-4" /> SLA rules
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/logs")}>
                    <ScrollText className="mr-2 h-4 w-4" /> Sync logs
                  </DropdownMenuItem>
                </>
              )}

              {!authDisabled && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-rose-600 focus:text-rose-600 dark:text-rose-400">
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
