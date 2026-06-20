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
import { Search, Download, Plus, X, CheckCircle2, UserPlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { computeSLA, computeMetrics } from "@/lib/tickets";
import { exportTicketsCSV } from "@/utils/export";
import { showSuccess } from "@/utils/toast";

type TabKey = "all" | "open" | "attention" | "breached" | "resolved";

const Body = ({ tickets, isLoading, openTicket }: { tickets: Ticket[]; isLoading: boolean; openTicket: (t: Ticket) => void }) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [priority, setPriority] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const m = useMemo(() => computeMetrics(tickets), [tickets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tickets.filter((t) => {
      if (q && !(t.subject.toLowerCase().includes(q) || String(t.id).includes(q) || t.responder_name?.toLowerCase().includes(q) || t.tags.some((x) => x.toLowerCase().includes(q)))) return false;
      if (priority !== "all" && String(t.priority) !== priority) return false;
      const sla = computeSLA(t).state;
      switch (tab) {
        case "open": return ![4, 5].includes(t.status);
        case "attention": return sla === "attention";
        case "breached": return sla === "breached";
        case "resolved": return [4, 5].includes(t.status);
        default: return true;
      }
    });
  }, [tickets, search, tab, priority]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: tickets.length },
    { key: "open", label: "Open", count: m.open },
    { key: "attention", label: "Attention", count: m.attention },
    { key: "breached", label: "Breached", count: m.breached },
    { key: "resolved", label: "Resolved", count: m.resolved },
  ];

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleAll = (ids: number[]) =>
    setSelected((s) => {
      const n = new Set(s);
      const all = ids.every((id) => n.has(id));
      ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
      return n;
    });

  const hasFilters = search || priority !== "all" || tab !== "all";

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject, ID, agent, tag…"
              className="h-10 pl-9"
            />
          </div>

          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-10 w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="4">Critical</SelectItem>
              <SelectItem value="3">High</SelectItem>
              <SelectItem value="2">Medium</SelectItem>
              <SelectItem value="1">Low</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 gap-1 text-muted-foreground"
              onClick={() => { setSearch(""); setPriority("all"); setTab("all"); }}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-10 gap-2" onClick={() => exportTicketsCSV(filtered)}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button size="sm" className="h-10 gap-2 gradient-brand text-white shadow-md shadow-primary/30 hover:opacity-95">
            <Plus className="h-4 w-4" /> New Ticket
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex items-center gap-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors",
              tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                tab === t.key ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
              )}
            >
              {t.count}
            </span>
            {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full gradient-brand" />}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 animate-fade-up">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { showSuccess("Assigned"); setSelected(new Set()); }}>
              <UserPlus className="h-3.5 w-3.5" /> Assign
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { showSuccess("Marked resolved"); setSelected(new Set()); }}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-rose-600" onClick={() => setSelected(new Set())}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="h-96 animate-pulse rounded-2xl bg-card" />
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
  );
};

const Tickets = () => (
  <AppShell title="Tickets" subtitle="Browse, filter and action the full NSE queue">
    {(props) => <Body {...props} />}
  </AppShell>
);

export default Tickets;
