import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Bell, User, LayoutDashboard, Ticket, Clock, AlertTriangle, BarChart3, Settings, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isUsingRealAPI } from "@/services/freshdesk";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Tickets", path: "/tickets", icon: Ticket },
  { label: "SLA Monitor", path: "/sla", icon: Clock },
  { label: "Escalations", path: "/escalations", icon: AlertTriangle },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
];

export const Header = () => {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">A</span>
            </div>
            <div className="hidden md:flex flex-col">
              <span className="font-bold text-lg tracking-tight leading-none">Aerchain Support</span>
              {isUsingRealAPI() && (
                <span className="text-[10px] text-emerald-500 font-semibold">● Live API</span>
              )}
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  location.pathname === item.path
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4 flex-1 justify-end max-w-xl">
          <div className="relative w-full max-w-sm hidden sm:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search tickets, IDs..."
              className="pl-9 bg-secondary/50 border-none focus-visible:ring-1"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Toggle dark mode"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive border-2 border-background" />
            </Button>

            <Button variant="ghost" size="icon" className="rounded-full">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border">
                <User className="h-4 w-4 text-primary" />
              </div>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
