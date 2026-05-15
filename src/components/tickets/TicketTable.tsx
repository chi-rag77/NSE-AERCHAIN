import React, { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Ticket, Priority, Status } from "../../types/freshdesk";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Search, Filter, Download, Plus, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { exportTicketsCSV } from "@/utils/export";
import { formatDistanceToNow } from "date-fns";

const priorityMap: Record<Priority, { label: string; color: string }> = {
  1: { label: "Low", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  2: { label: "Medium", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  3: { label: "High", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  4: { label: "Critical", color: "bg-rose-600 text-white" },
};

const statusMap: Record<Status, { label: string; color: string }> = {
  2: { label: "Open", color: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400" },
  3: { label: "In Progress", color: "bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400" },
  4: { label: "Resolved", color: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400" },
  5: { label: "Closed", color: "bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-900/20 dark:text-slate-400" },
  6: { label: "Waiting", color: "bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400" },
};

const slaStatus = (ticket: Ticket) => {
  if (ticket.priority === 4) return { label: "Immediate Action", color: "text-rose-600", dot: "bg-rose-500", time: "-15m" };
  if (ticket.priority === 3) return { label: "Attention", color: "text-orange-600", dot: "bg-orange-500", time: "28m" };
  return { label: "On Track", color: "text-emerald-600", dot: "bg-emerald-500", time: "2h 35m" };
};

interface TicketTableProps {
  tickets: Ticket[];
  onRowClick: (ticket: Ticket) => void;
}

export const TicketTable = ({ tickets, onRowClick }: TicketTableProps) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        String(t.id).includes(q) ||
        t.requester_name?.toLowerCase().includes(q) ||
        t.responder_name?.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [tickets, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-bold">Live Tickets</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-60">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm border-border"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter size={14} /> Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => exportTicketsCSV(filtered)}
            title="Export filtered tickets as CSV"
          >
            <Download size={14} /> Export CSV
          </Button>
          <Button size="sm" className="h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus size={14} /> New Ticket
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent border-border">
              {["Ticket ID", "Subject", "Customer / Dept.", "Category", "Priority", "Status", "SLA Status", "SLA Time Left", "Assignee", "Updated"].map((h) => (
                <TableHead key={h} className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
              ))}
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-12">
                  {search ? `No tickets matching "${search}"` : "No tickets found"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((ticket) => {
                const sla = slaStatus(ticket);
                return (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors border-border"
                    onClick={() => onRowClick(ticket)}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-blue-600">
                      NSE-{ticket.id}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[220px] truncate">
                      {ticket.subject}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ticket.company_name ?? "NSE"} — {ticket.tags[0] ?? "General"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ticket.tags[1] ?? "Support"}
                    </TableCell>
                    <TableCell>
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", priorityMap[ticket.priority].color)}>
                        {priorityMap[ticket.priority].label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0", statusMap[ticket.status].color)}>
                        {statusMap[ticket.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className={cn("h-1.5 w-1.5 rounded-full", sla.dot)} />
                        <span className={cn("text-[11px] font-medium", sla.color)}>{sla.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Clock size={12} className="text-muted-foreground" />
                        {sla.time}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${ticket.responder_name}`} />
                          <AvatarFallback>{ticket.responder_name?.[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{ticket.responder_name ?? "Unassigned"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
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

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {tickets.length} tickets
          {search && ` · filtered by "${search}"`}
        </p>
      )}
    </div>
  );
};
