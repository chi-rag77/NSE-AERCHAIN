import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Download, X, Copy, Trash2,
  SlidersHorizontal, AlertTriangle, ShieldCheck, Inbox, Hourglass, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { computeSLA, computeMetrics, ticketRef } from "@/lib/tickets";
import { exportTicketsCSV } from "@/utils/export";
import { showSuccess } from "@/utils/toast";

type TabKey = "all" | "open" | "attention" | "breached" | "resolved";
const UNASSIGNED = "__unassigned__";

/* ── Stat tile — doubles as the view switcher, so the count is never shown
 * twice for the same thing (that duplication was the main clutter here). */
const StatTile = ({
  icon: Icon, label, value, active, accent, ring, onClick,
}: {
  icon: React.ElementType; label: string; value: number; active: boolean;
  accent: string; ring: string; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "group flex flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all",
      active
        ? cn("border-transparent bg-card shadow-[0_8px_28px_-12px_rgba(16,24,40,0.18)] ring-2", ring)
        : "border-border/60 bg-card/60 hover:border-border hover:bg-card"
    )}
  >
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-opacity", accent, !active && "opacity-70 group-hover:opacity-100")}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </div>
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 leading-none mb-1.5">
        {label}
      </div>
      <div className="font-display text-[20px] font-bold leading-none tabular-nums text-foreground">
        {value}
      </div>
    </div>
  </button>
);

/* ── Removable filter chip ────────────────────────────────────────────── */
const FilterChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
  <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 py-1 pl-2.5 pr-1.5 text-[12px] font-medium text-primary">
    {label}
    <button onClick={onClear} className="rounded-md p-0.5 hover:bg-primary/15">
      <X className="h-3 w-3" />
    </button>
  </span>
);

const Body = ({ tickets, isLoading, openTicket }: {
  tickets: Ticket[]; isLoading: boolean; openTicket: (t: Ticket) => void;
}) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const m = useMemo(() => computeMetrics(tickets), [tickets]);

  const assignees = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickets) if (t.responder_name) set.add(t.responder_name);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tickets]);

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
      if (assignee === UNASSIGNED && t.responder_name) return false;
      if (assignee !== "all" && assignee !== UNASSIGNED && t.responder_name !== assignee) return false;
      const sla = computeSLA(t).state;
      switch (tab) {
        case "open": return ![4, 5].includes(t.status);
        case "attention": return sla === "attention";
        case "breached": return sla === "breached";
        case "resolved": return [4, 5].includes(t.status);
        default: return true;
      }
    });
  }, [tickets, search, tab, priority, status, assignee]);

  const tiles: { key: TabKey; label: string; value: number; icon: React.ElementType; accent: string; ring: string }[] = [
    { key: "all", label: "All", value: tickets.length, icon: Layers,
      accent: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400", ring: "ring-violet-500/25" },
    { key: "open", label: "Open", value: m.open, icon: Inbox,
      accent: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400", ring: "ring-blue-500/25" },
    { key: "attention", label: "Attention", value: m.attention, icon: Hourglass,
      accent: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", ring: "ring-amber-500/25" },
    { key: "breached", label: "Breached", value: m.breached, icon: AlertTriangle,
      accent: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400", ring: "ring-rose-500/25" },
    { key: "resolved", label: "Resolved", value: m.resolved, icon: ShieldCheck,
      accent: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400", ring: "ring-emerald-500/25" },
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

  const selectedTickets = useMemo(() => tickets.filter((t) => selected.has(t.id)), [tickets, selected]);

  const activeFilterCount = (priority !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0) + (assignee !== "all" ? 1 : 0);
  const hasFilters = search || activeFilterCount > 0 || tab !== "all";

  const priorityLabel: Record<string, string> = { "4": "Critical", "3": "High", "2": "Medium", "1": "Low" };
  const statusLabel: Record<string, string> = { "2": "Open", "3": "Pending", "4": "Resolved", "5": "Closed", "7": "In Progress" };

  return (
    <div className="space-y-5">

      {/* ── Header row ───────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-[26px] font-extrabold tracking-tight text-foreground">
          Support Tickets
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Live Freshdesk sync · <span className="font-semibold text-foreground/70">{tickets.length}</span> tickets tracked
        </p>
      </div>

      {/* ── Stat tiles — also the view switcher, so a count only lives in
          one place instead of a KPI row AND a separate tab strip. ────── */}
      <div className="flex flex-wrap gap-2.5 sm:flex-nowrap">
        {tiles.map((t) => (
          <StatTile
            key={t.key}
            icon={t.icon} label={t.label} value={t.value}
            active={tab === t.key} accent={t.accent} ring={t.ring}
            onClick={() => setTab(t.key)}
          />
        ))}
      </div>

      {/* ── Main surface ─────────────────────────────────────────────── */}
      <div className="surface overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets, requesters, agents…"
                className="h-10 rounded-xl border-border/60 bg-secondary/40 pl-9 text-[13px] placeholder:text-muted-foreground/60 focus-visible:border-primary/40 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/15"
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              variant="outline" size="sm"
              className={cn(
                "h-10 gap-1.5 rounded-xl border-border/60 text-[13px] font-medium",
                showFilters && "border-primary/40 bg-primary/5 text-primary"
              )}
              onClick={() => setShowFilters(v => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {hasFilters && (
              <Button
                variant="ghost" size="sm"
                className="h-10 gap-1 rounded-xl text-[13px] text-muted-foreground hover:text-foreground"
                onClick={() => { setSearch(""); setPriority("all"); setStatus("all"); setAssignee("all"); setTab("all"); }}
              >
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              className="h-10 gap-1.5 rounded-xl border-border/60 text-[13px] font-medium"
              onClick={() => exportTicketsCSV(filtered)}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>

        {/* Expandable filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-secondary/25 px-4 py-3">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Refine</span>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-9 w-[150px] rounded-lg border-border/60 bg-card text-[13px]">
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
              <SelectTrigger className="h-9 w-[150px] rounded-lg border-border/60 bg-card text-[13px]">
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
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-9 w-[170px] rounded-lg border-border/60 bg-card text-[13px]">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Active filter chips — visible even when the panel above is collapsed */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-4 py-2.5">
            {priority !== "all" && (
              <FilterChip label={`Priority: ${priorityLabel[priority] ?? priority}`} onClear={() => setPriority("all")} />
            )}
            {status !== "all" && (
              <FilterChip label={`Status: ${statusLabel[status] ?? status}`} onClear={() => setStatus("all")} />
            )}
            {assignee !== "all" && (
              <FilterChip label={`Assignee: ${assignee === UNASSIGNED ? "Unassigned" : assignee}`} onClear={() => setAssignee("all")} />
            )}
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between border-b border-primary/15 bg-primary/[0.04] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/15 text-[11px] font-bold text-primary">
                {selected.size}
              </span>
              <span className="text-[13px] font-medium text-foreground/80">selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs"
                onClick={() => exportTicketsCSV(selectedTickets, "selected-tickets.csv")}>
                <Download className="h-3 w-3" /> Export selected
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(selectedTickets.map(ticketRef).join(", "));
                    showSuccess(`Copied ${selectedTickets.length} ticket ID${selectedTickets.length === 1 ? "" : "s"}`);
                  } catch { /* clipboard denied — fail quietly */ }
                }}>
                <Copy className="h-3 w-3" /> Copy IDs
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg text-xs text-muted-foreground"
                onClick={() => setSelected(new Set())}>
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-secondary/40 animate-pulse"
                style={{ animationDelay: `${i * 50}ms` }} />
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
