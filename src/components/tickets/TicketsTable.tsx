import { useMemo, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ChevronLeft, ChevronRight, MoreHorizontal, ExternalLink } from "lucide-react";
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
  if (days === 0) return { label: "Today", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" };
  if (days <= 3) return { label: `${days}d`, cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" };
  if (days <= 7) return { label: `${days}d`, cls: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400" };
  if (days <= 30) return { label: `${days}d`, cls: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400" };
  return { label: `${days}d`, cls: "bg-rose-100 text-rose-800 font-extrabold dark:bg-rose-500/20 dark:text-rose-300" };
};

// Distinct avatar colour per person, stable by name
const avatarColor = (name: string) => {
  const colours = [
    "bg-violet-100 text-violet-700",
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-indigo-100 text-indigo-700",
    "bg-teal-100 text-teal-700",
    "bg-orange-100 text-orange-700",
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

  const Th = ({ k, label, className }: { k?: SortKey; label: string; className?: string }) => (
    <TableHead className={cn(
      "h-10 bg-[#FAFAFA] dark:bg-secondary/30 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/70 border-b border-border/60",
      className
    )}>
      {k ? (
        <button
          onClick={() => sort(k)}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {label}
          <ArrowUpDown className={cn("h-3 w-3 transition-opacity", sortKey === k ? "text-primary opacity-100" : "opacity-30")} />
        </button>
      ) : label}
    </TableHead>
  );

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden bg-background shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-0">
              {selectable && (
                <TableHead className="w-10 h-10 bg-[#FAFAFA] dark:bg-secondary/30 border-b border-border/60">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => onToggleAll?.(pageIds)}
                    aria-label="Select page"
                    className="border-border/50"
                  />
                </TableHead>
              )}
              <Th k="id" label="Ticket #" className="w-[110px]" />
              <Th label="Subject" className="min-w-[260px]" />
              <Th k="priority" label="Priority" className="w-[100px]" />
              <Th k="status" label="Status" className="w-[120px]" />
              <Th label="Created By" className="hidden lg:table-cell w-[160px]" />
              <Th label="Assigned To" className="hidden lg:table-cell w-[160px]" />
              <Th k="created" label="Created" className="hidden xl:table-cell w-[120px]" />
              <Th k="updated" label="Updated" className="hidden xl:table-cell w-[130px]" />
              <Th k="aging" label="Aging" className="hidden xl:table-cell w-[80px]" />
              <Th k="sla" label="SLA" className="w-[160px]" />
              <TableHead className="w-10 h-10 bg-[#FAFAFA] dark:bg-secondary/30 border-b border-border/60" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="h-10 w-10 rounded-full bg-secondary/60 flex items-center justify-center">
                      <ExternalLink className="h-5 w-5 opacity-40" />
                    </div>
                    <p className="text-sm font-medium">No tickets found</p>
                    <p className="text-xs opacity-60">Try adjusting your filters</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t, idx) => {
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
                      "group cursor-pointer transition-all duration-100 border-b border-border/40 last:border-0",
                      "hover:bg-primary/[0.025] dark:hover:bg-primary/5",
                      isSel && "bg-primary/[0.04] dark:bg-primary/[0.06]",
                      isBreached && !isSel && idx % 2 === 0 && "bg-rose-50/30 dark:bg-rose-500/[0.02]",
                    )}
                  >
                    {selectable && (
                      <TableCell className="py-3 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => onToggle?.(t.id)}
                          aria-label={`Select ${t.id}`}
                          className="border-border/50"
                        />
                      </TableCell>
                    )}

                    {/* Ticket ID */}
                    <TableCell className="py-3 pl-4">
                      <div className="flex items-center gap-1.5">
                        {isBreached && <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0 animate-pulse" />}
                        <span className="font-mono text-[11px] font-bold text-primary tracking-wide">
                          #{t.id}
                        </span>
                      </div>
                    </TableCell>

                    {/* Subject */}
                    <TableCell className="py-3 max-w-0">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className={cn("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", p.dot)} />
                        <span className="truncate text-[13px] font-medium text-foreground/90 group-hover:text-foreground transition-colors">
                          {t.subject}
                        </span>
                      </div>
                    </TableCell>

                    {/* Priority */}
                    <TableCell className="py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-md px-2 py-[3px] text-[10px] font-bold uppercase tracking-wide",
                        p.tone
                      )}>
                        {p.label}
                      </span>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-semibold",
                        s.tone
                      )}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                        {s.label}
                      </span>
                    </TableCell>

                    {/* Created By */}
                    <TableCell className="hidden lg:table-cell py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className={cn("text-[9px] font-bold", avatarColor(requester))}>
                            {initials(requester)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-foreground/80 truncate max-w-[120px]">{requester}</span>
                      </div>
                    </TableCell>

                    {/* Assigned To */}
                    <TableCell className="hidden lg:table-cell py-3">
                      {assignee ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className={cn("text-[9px] font-bold", avatarColor(assignee))}>
                              {initials(assignee)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-foreground/80 truncate max-w-[120px]">{assignee}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 italic">
                          <span className="h-5 w-5 rounded-full border-2 border-dashed border-border/60 flex items-center justify-center text-[8px]">?</span>
                          Unassigned
                        </span>
                      )}
                    </TableCell>

                    {/* Created Date */}
                    <TableCell className="hidden xl:table-cell py-3">
                      <div className="text-[12px] text-foreground/75 font-medium tabular-nums">
                        {format(parseISO(t.created_at), "dd MMM yyyy")}
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 tabular-nums mt-0.5">
                        {format(parseISO(t.created_at), "h:mm a")}
                      </div>
                    </TableCell>

                    {/* Updated Date */}
                    <TableCell className="hidden xl:table-cell py-3">
                      <div className="text-[12px] text-foreground/75 font-medium tabular-nums">
                        {format(parseISO(t.updated_at), "dd MMM yyyy")}
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {formatDistanceToNow(parseISO(t.updated_at), { addSuffix: true })}
                      </div>
                    </TableCell>

                    {/* Aging */}
                    <TableCell className="hidden xl:table-cell py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-md px-2 py-[3px] text-[10px] font-bold tabular-nums",
                        aging.cls
                      )}>
                        {aging.label}
                      </span>
                    </TableCell>

                    {/* SLA */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          sla.dot,
                          sla.state === "breached" && "animate-pulse"
                        )} />
                        <div>
                          <div className={cn("text-[11px] font-semibold leading-none", sla.tone)}>
                            {sla.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground/60 tabular-nums mt-0.5">
                            {sla.remaining}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary"
                      >
                        <MoreHorizontal size={13} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-border/50 bg-[#FAFAFA] dark:bg-secondary/20 px-5 py-3">
        <span className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{rows.length === 0 ? 0 : safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)}</span>
          {" "}of{" "}
          <span className="font-semibold text-foreground">{sorted.length}</span> tickets
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-lg border-border/60 bg-background"
            disabled={safePage === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-1 px-1">
            {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
              const p = pageCount <= 7 ? i : i;
              const isActive = p === safePage;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "h-7 min-w-[28px] rounded-lg text-[11px] font-semibold px-2 transition-all",
                    isActive
                      ? "bg-[#6B4EFF] text-white shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {p + 1}
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-lg border-border/60 bg-background"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
