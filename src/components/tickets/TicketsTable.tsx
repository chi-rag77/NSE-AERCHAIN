import { useMemo, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, MoreHorizontal, Inbox } from "lucide-react";
import { format, formatDistanceToNow, differenceInDays, parseISO } from "date-fns";
import { Ticket } from "@/types/freshdesk";
import {
  PRIORITY_META, STATUS_META, computeSLA, initials, requesterDisplayName,
} from "@/lib/tickets";

type SortKey = "id" | "priority" | "status" | "sla" | "updated" | "created" | "aging";

interface Props {
  tickets: Ticket[];
  onRowClick: (t: Ticket) => void;
  selectable?: boolean;
  selected?: Set<number>;
  onToggle?: (id: number) => void;
  onToggleAll?: (ids: number[]) => void;
  pageSize?: number;
}

const agingDays = (t: Ticket) => differenceInDays(new Date(), parseISO(t.created_at));

const agingBadge = (days: number) => {
  if (days === 0) return { label: "Today", cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" };
  if (days <= 3)  return { label: `${days}d`, cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" };
  if (days <= 7)  return { label: `${days}d`, cls: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" };
  if (days <= 30) return { label: `${days}d`, cls: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" };
  return { label: `${days}d`, cls: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" };
};

// Stable, aesthetic avatar gradient per person
const avatarColor = (name: string) => {
  const colours = [
    "bg-gradient-to-br from-violet-500 to-purple-600 text-white",
    "bg-gradient-to-br from-sky-500 to-blue-600 text-white",
    "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
    "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
    "bg-gradient-to-br from-rose-500 to-pink-600 text-white",
    "bg-gradient-to-br from-indigo-500 to-violet-600 text-white",
    "bg-gradient-to-br from-teal-500 to-cyan-600 text-white",
    "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colours[h % colours.length];
};

export const TicketsTable = ({
  tickets, onRowClick,
  selectable = false, selected = new Set(),
  onToggle, onToggleAll, pageSize = 15,
}: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("sla");
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...tickets];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":       cmp = a.id - b.id; break;
        case "priority": cmp = b.priority - a.priority; break;
        case "status":   cmp = a.status - b.status; break;
        case "sla":      cmp = computeSLA(a).remainingMinutes - computeSLA(b).remainingMinutes; break;
        case "updated":  cmp = +new Date(b.updated_at) - +new Date(a.updated_at); break;
        case "created":  cmp = +new Date(b.created_at) - +new Date(a.created_at); break;
        case "aging":    cmp = agingDays(b) - agingDays(a); break;
      }
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [tickets, sortKey, asc]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pageIds = rows.map((r) => r.id);
  const allSelected = selectable && pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const sort = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(true); }
    setPage(0);
  };

  const Th = ({ k, label, className }: { k?: SortKey; label: string; className?: string }) => {
    const active = sortKey === k;
    return (
      <TableHead className={cn(
        "h-11 bg-transparent px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60",
        className
      )}>
        {k ? (
          <button
            onClick={() => sort(k)}
            className={cn(
              "inline-flex items-center gap-1 transition-colors hover:text-foreground",
              active && "text-primary"
            )}
          >
            {label}
            {active ? (
              asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
            ) : (
              <ArrowUp className="h-3 w-3 opacity-0" />
            )}
          </button>
        ) : label}
      </TableHead>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => onToggleAll?.(pageIds)}
                    aria-label="Select page"
                    className="border-border/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </TableHead>
              )}
              <Th k="id" label="Ticket" className="w-[100px]" />
              <Th label="Subject" className="min-w-[280px]" />
              <Th k="priority" label="Priority" className="w-[100px]" />
              <Th k="status" label="Status" className="w-[120px]" />
              <Th label="Requester" className="hidden lg:table-cell w-[170px]" />
              <Th label="Assignee" className="hidden lg:table-cell w-[170px]" />
              <Th k="created" label="Created" className="hidden 2xl:table-cell w-[120px]" />
              <Th k="updated" label="Updated" className="hidden xl:table-cell w-[130px]" />
              <Th k="aging" label="Age" className="hidden xl:table-cell w-[70px]" />
              <Th k="sla" label="SLA" className="w-[150px]" />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-24 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/60">
                      <Inbox className="h-6 w-6 opacity-40" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground/80">No tickets found</p>
                      <p className="mt-0.5 text-xs opacity-60">Try adjusting your search or filters</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t) => {
                const sla = computeSLA(t);
                const p = PRIORITY_META[t.priority] ?? { label: String(t.priority), tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
                const s = STATUS_META[t.status] ?? { label: `Status ${t.status}`, tone: "bg-slate-100 text-slate-600" };
                const isSel = selected.has(t.id);
                const days = agingDays(t);
                const aging = agingBadge(days);
                const requester = requesterDisplayName(t);
                const assignee = t.responder_name ?? null;
                const isBreached = sla.state === "breached";

                return (
                  <TableRow
                    key={t.id}
                    onClick={() => onRowClick(t)}
                    className={cn(
                      "group relative cursor-pointer border-b border-border/40 transition-colors duration-100 last:border-0",
                      "hover:bg-primary/[0.025] dark:hover:bg-primary/[0.04]",
                      isSel && "bg-primary/[0.05] dark:bg-primary/[0.07]"
                    )}
                  >
                    {selectable && (
                      <TableCell className="relative py-3.5 pl-4" onClick={(e) => e.stopPropagation()}>
                        {isBreached && (
                          <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-rose-500" />
                        )}
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => onToggle?.(t.id)}
                          aria-label={`Select ${t.id}`}
                          className="border-border/60 opacity-0 transition-opacity group-hover:opacity-100 data-[state=checked]:opacity-100 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </TableCell>
                    )}

                    {/* Ticket ID */}
                    <TableCell className="relative py-3.5 px-3">
                      {isBreached && !selectable && (
                        <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-rose-500" />
                      )}
                      <span className="font-mono text-[12px] font-semibold text-primary/90">
                        #{t.id}
                      </span>
                    </TableCell>

                    {/* Subject */}
                    <TableCell className="py-3.5 px-3 max-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn("h-6 w-[3px] shrink-0 rounded-full", p.dot)} />
                        <span className="truncate text-[13.5px] font-medium text-foreground/90 group-hover:text-foreground">
                          {t.subject}
                        </span>
                      </div>
                    </TableCell>

                    {/* Priority */}
                    <TableCell className="py-3.5 px-3">
                      <span className={cn("chip", p.tone)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
                        {p.label}
                      </span>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3.5 px-3">
                      <span className={cn("chip", s.tone)}>{s.label}</span>
                    </TableCell>

                    {/* Requester */}
                    <TableCell className="hidden lg:table-cell py-3.5 px-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-7 w-7 shrink-0 ring-2 ring-background">
                          <AvatarFallback className={cn("text-[10px] font-bold", avatarColor(requester))}>
                            {initials(requester)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-[12.5px] font-medium text-foreground/75 max-w-[120px]">{requester}</span>
                      </div>
                    </TableCell>

                    {/* Assignee */}
                    <TableCell className="hidden lg:table-cell py-3.5 px-3">
                      {assignee ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7 shrink-0 ring-2 ring-background">
                            <AvatarFallback className={cn("text-[10px] font-bold", avatarColor(assignee))}>
                              {initials(assignee)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-[12.5px] font-medium text-foreground/75 max-w-[120px]">{assignee}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/50">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-[10px]">—</span>
                          Unassigned
                        </span>
                      )}
                    </TableCell>

                    {/* Created */}
                    <TableCell className="hidden 2xl:table-cell py-3.5 px-3">
                      <div className="text-[12px] font-medium text-foreground/70 tabular-nums">
                        {format(parseISO(t.created_at), "dd MMM yyyy")}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground/50 tabular-nums">
                        {format(parseISO(t.created_at), "h:mm a")}
                      </div>
                    </TableCell>

                    {/* Updated */}
                    <TableCell className="hidden xl:table-cell py-3.5 px-3">
                      <div className="text-[12px] font-medium text-foreground/70 tabular-nums">
                        {format(parseISO(t.updated_at), "dd MMM yyyy")}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground/50">
                        {formatDistanceToNow(parseISO(t.updated_at), { addSuffix: true })}
                      </div>
                    </TableCell>

                    {/* Aging */}
                    <TableCell className="hidden xl:table-cell py-3.5 px-3">
                      <span className={cn("chip tabular-nums", aging.cls)}>{aging.label}</span>
                    </TableCell>

                    {/* SLA */}
                    <TableCell className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          sla.dot,
                          isBreached && "ring-2 ring-rose-500/20 animate-pulse"
                        )} />
                        <div className="leading-tight">
                          <div className={cn("text-[12px] font-semibold", sla.tone)}>{sla.label}</div>
                          <div className="text-[10.5px] text-muted-foreground/50 tabular-nums">{sla.remaining}</div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3.5 pr-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-secondary"
                      >
                        <MoreHorizontal size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border/50 px-5 py-3">
        <span className="text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {rows.length === 0 ? 0 : safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)}
          </span>
          {" of "}
          <span className="font-semibold text-foreground tabular-nums">{sorted.length}</span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="icon"
            className="h-8 w-8 rounded-lg border-border/60"
            disabled={safePage === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 px-1">
            {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => i).map((p) => {
              const isActive = p === safePage;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "h-8 min-w-[32px] rounded-lg px-2 text-[12px] font-semibold tabular-nums transition-all",
                    isActive
                      ? "bg-[#6B4EFF] text-white shadow-[0_2px_8px_-2px_rgba(107,78,255,0.5)]"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {p + 1}
                </button>
              );
            })}
          </div>
          <Button
            variant="outline" size="icon"
            className="h-8 w-8 rounded-lg border-border/60"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
