import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search, Download, Plus, X, CheckCircle2,
  UserPlus, Trash2, SlidersHorizontal, AlertTriangle,
  ShieldAlert, TrendingUp, Clock3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { computeSLA, computeMetrics } from "@/lib/tickets";
import { exportTicketsCSV } from "@/utils/export";
import { showSuccess } from "@/utils/toast";

type TabKey = "all" | "open" | "attention" | "breached" | "resolved";

const StatPill = ({
  icon: Icon, label, value, tone,
}: { icon: React.ElementType; label: string; value: number; tone: string }) => (
  <div className={cn(
    "flex items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-all",
    tone
  )}>
    <Icon className="h-4 w-4 shrink-0 opacity-70" />
    <div>
      <div className="text-[11px] font-medium opacity-60 leading-none mb-0.5">{label}</div>
      <div className="text-lg font-bold leading-none">{value}</div>
    </div>
  </div>
);

const Body = ({ tickets, isLoading, openTicket }: {
  tickets: Ticket[]; isLoading: boolean; openTicket: (t: Ticket) => void;
}) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const m = useMemo(() => computeMetrics(tickets), [tickets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tickets.filter((t) => {
      if (q && !(
        t.subject.toLowerCase().includes(q) ||
        String(t.id).includes(q) ||
        t.responder_name?.toLowerCase().includes(q) ||
        t.requester_name?.toLowerCase().includes(q) ||
        t.tags.some((x) => x.toLowerCase().includes(q))
      )) return false;
      if (priority !== "all" && String(t.priority) !== priority) return false;
      if (status !== "all" && String(t.status) !== status) return false;
      const sla = computeSLA(t).state;
      switch (tab) {
        case "open": return ![4, 5].includes(t.status);
        case "attention": return sla === "attention";
        case "breached": return sla === "breached";
        case "resolved": return [4, 5].includes(t.status);
        default: return true;
      }
    });
  }, [tickets, search, tab, priority, status]);

  const tabs: { key: TabKey; label: string; count: number; color?: string }[] = [
    { key: "all", label: "All Tickets", count: tickets.length },
    { key: "open", label: "Open", count: m.open, color: "text-blue-600" },
    { key: "attention", label: "Attention", count: m.attention, color: "text-amber-600" },
    { key: "breached", label: "Breached", count: m.breached, color: "text-rose-600" },
    { key: "resolved", label: "Resolved", count: m.resolved, color: "text-emerald-600" },
  ];

  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const toggleAll = (ids: number[]) =>
    setSelected((s) => {
      const n = new Set(s);
      const all = ids.every((id) => n.has(id));
      ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
      return n;
    });

  const hasFilters = search || priority !== "all" || status !== "all" || tab !== "all";

  return (
    <div className="space-y-0">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="border-b border-border/60 bg-gradient-to-r from-background via-background to-primary/[0.03] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold tracking-tight">Support Tickets</h1>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                NSE
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Freshdesk tickets synced in real-time · {tickets.length} total
            </p>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap items-center gap-2">
            <StatPill icon={AlertTriangle} label="Breached" value={m.breached}
              tone="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/5 dark:text-rose-400" />
            <StatPill icon={Clock3} label="Attention" value={m.attention}
              tone="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-400" />
            <StatPill icon={ShieldAlert} label="Open" value={m.open}
              tone="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/5 dark:text-blue-400" />
            <StatPill icon={TrendingUp} label="Resolved" value={m.resolved}
              tone="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-400" />
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by subject, ID, agent…"
                className="h-9 pl-8 text-sm bg-background border-border/70 focus-visible:border-primary/50 focus-visible:ring-primary/20"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <Button
              variant="outline"
              size="sm"
              className={cn("h-9 gap-1.5 text-xs border-border/70", showFilters && "bg-primary/5 border-primary/30 text-primary")}
              onClick={() => setShowFilters(v => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {(priority !== "all" || status !== "all") && (
                <span className="ml-0.5 rounded-full bg-primary text-white text-[9px] w-4 h-4 flex items-center justify-center font-bold">
                  {(priority !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0)}
                </span>
              )}
            </Button>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setSearch(""); setPriority("all"); setStatus("all"); setTab("all"); }}
              >
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs border-border/70"
              onClick={() => exportTicketsCSV(filtered)}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 text-xs bg-[#6B4EFF] hover:bg-[#5a3de8] text-white shadow-md shadow-[#6B4EFF]/25"
            >
              <Plus className="h-3.5 w-3.5" />
              New Ticket
            </Button>
          </div>
        </div>

        {/* ── Expandable filters ──────────────────────────────────────── */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Filter by</span>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-background border-border/70">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="4">🔴 Critical</SelectItem>
                <SelectItem value="3">🟠 High</SelectItem>
                <SelectItem value="2">🔵 Medium</SelectItem>
                <SelectItem value="1">🟢 Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-background border-border/70">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="2">Open</SelectItem>
                <SelectItem value="3">Pending</SelectItem>
                <SelectItem value="4">Resolved</SelectItem>
                <SelectItem value="5">Closed</SelectItem>
                <SelectItem value="7">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 border-b border-border/60">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "relative flex items-center gap-2 px-4 pb-3 pt-1 text-[13px] font-medium transition-all duration-150",
                tab === t.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <span>{t.label}</span>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums transition-all",
                tab === t.key
                  ? t.color
                    ? cn("text-white", t.key === "breached" ? "bg-rose-500" : t.key === "attention" ? "bg-amber-500" : t.key === "open" ? "bg-blue-500" : t.key === "resolved" ? "bg-emerald-500" : "bg-primary")
                    : "bg-primary text-white"
                  : "bg-secondary text-muted-foreground"
              )}>
                {t.count}
              </span>
              {tab === t.key && (
                <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#6B4EFF]" />
              )}
            </button>
          ))}
        </div>

        {/* ── Bulk action bar ──────────────────────────────────────────── */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">{selected.size}</span>
              </span>
              <span className="text-sm font-medium text-foreground/80">tickets selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                onClick={() => { showSuccess("Assigned"); setSelected(new Set()); }}>
                <UserPlus className="h-3 w-3" /> Assign
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                onClick={() => { showSuccess("Marked resolved"); setSelected(new Set()); }}>
                <CheckCircle2 className="h-3 w-3" /> Resolve
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => setSelected(new Set())}>
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
            </div>
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-secondary/40 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : (
          <TicketsTable
            tickets={filtered}
            onRowClick={openTicket}
            selectable
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
        )}
      </div>
    </div>
  );
};

const Tickets = () => (
  <AppShell>
    {(props) => <Body {...props} />}
  </AppShell>
);

export default Tickets;
