import { Bell, Moon, Sun, Search, RefreshCw, Command } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { isUsingRealAPI } from "@/services/freshdesk";
import { formatDistanceToNow } from "date-fns";

interface Props {
  title: string;
  subtitle?: string;
  onOpenCommand: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastUpdated: Date | null;
}

export const Topbar = ({ title, subtitle, onOpenCommand, onRefresh, isRefreshing, lastUpdated }: Props) => {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              isUsingRealAPI()
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-amber-500/10 text-amber-600"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", isUsingRealAPI() ? "bg-emerald-500" : "bg-amber-500")} />
            {isUsingRealAPI() ? "Live" : "Demo data"}
          </span>
        </div>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Command trigger */}
        <button
          onClick={onOpenCommand}
          className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary md:flex"
        >
          <Search className="h-4 w-4" />
          <span className="pr-8">Search…</span>
          <kbd className="flex items-center gap-0.5 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          <span className="hidden sm:inline">
            {lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : "Refresh"}
          </span>
        </Button>

        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" />
        </Button>

        <Avatar className="h-9 w-9 border border-border">
          <AvatarFallback className="gradient-brand text-xs font-bold text-white">NS</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
};
