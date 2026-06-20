import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Clock, MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Ticket } from "@/types/freshdesk";
import {
  PRIORITY_META,
  STATUS_META,
  computeSLA,
  ticketCategory,
  ticketDept,
  initials,
} from "@/lib/tickets";

type SortKey = "id" | "priority" | "status" | "sla" | "updated";

interface Props {
  tickets: Ticket[];
  onRowClick: (t: Ticket) => void;
  selectable?: boolean;
  selected?: Set<number>;
  onToggle?: (id: number) => void;
  onToggleAll?: (ids: number[]) => void;
  pageSize?: number;
}

export const TicketsTable = ({
  tickets,
  onRowClick,
  selectable = false,
  selected = new Set(),
  onToggle,
  onToggleAll,
  pageSize = 12,
}: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("sla");
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...tickets];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id": cmp = a.id - b.id; break;
        case "priority": cmp = b.priority - a.priority; break;
        case "status": cmp = a.status - b.status; break;
        case "sla": cmp = computeSLA(a).remainingMinutes - computeSLA(b).remainingMinutes; break;
        case "updated": cmp = +new Date(b.updated_at) - +new Date(a.updated_at); break;
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
  };

  const Th = ({ k, label, className }: { k?: SortKey; label: string; className?: string }) => (
    <TableHead className={cn("text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", className)}>
      {k ? (
        <button onClick={() => sort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
          {label}
          <ArrowUpDown className={cn("h-3 w-3", sortKey === k ? "text-primary" : "opacity-40")} />
        </button>
      ) : (
        label
      )}
    </TableHead>
  );

  return (
    <div className="card-elevated overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => onToggleAll?.(pageIds)}
                    aria-label="Select page"
                  />
                </TableHead>
              )}
              <Th k="id" label="Ticket" />
              <Th label="Subject" />
              <Th label="Customer / Dept." className="hidden md:table-cell" />
              <Th k="priority" label="Priority" />
              <Th k="status" label="Status" />
              <Th k="sla" label="SLA" />
              <Th label="Assignee" className="hidden lg:table-cell" />
              <Th k="updated" label="Updated" className="hidden xl:table-cell" />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-16 text-center text-sm text-muted-foreground">
                  No tickets match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t) => {
                const sla = computeSLA(t);
                const p = PRIORITY_META[t.priority] ?? { label: String(t.priority), tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
                const s = STATUS_META[t.status] ?? { label: `Status ${t.status}`, tone: "bg-slate-100 text-slate-600" };
                const isSel = selected.has(t.id);
                return (
                  <TableRow
                    key={t.id}
                    onClick={() => onRowClick(t)}
                    className={cn(
                      "group cursor-pointer border-border transition-colors hover:bg-secondary/50",
                      isSel && "bg-primary/5"
                    )}
                  >
                    {selectable && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSel} onCheckedChange={() => onToggle?.(t.id)} aria-label={`Select ${t.id}`} />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs font-semibold text-primary">NSE-{t.id}</TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.dot)} />
                        <span className="truncate text-sm font-medium">{t.subject}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      <div className="font-medium text-foreground/80">{ticketDept(t)}</div>
                      <div>{ticketCategory(t)}</div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", p.tone)}>
                        {p.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", s.tone)}>{s.label}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", sla.dot)} />
                        <span className={cn("text-xs font-medium", sla.tone)}>{sla.label}</span>
                        <span className="text-[11px] text-muted-foreground">· {sla.remaining}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="bg-secondary text-[9px] font-semibold">
                            {initials(t.responder_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{t.responder_name ?? "Unassigned"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100">
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

      {/* pagination */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{rows.length}</strong> of{" "}
          <strong className="text-foreground">{sorted.length}</strong> tickets
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="px-1">
            Page {safePage + 1} / {pageCount}
          </span>
          <Button variant="outline" size="sm" className="h-8" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
