import React from "react";
import { formatDistanceToNow } from "date-fns";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Ticket, Priority, Status } from "../../types/freshdesk";
import { cn } from "@/lib/utils";

const priorityMap: Record<Priority, { label: string; color: string }> = {
  1: { label: "Low", color: "bg-slate-100 text-slate-700" },
  2: { label: "Medium", color: "bg-blue-100 text-blue-700" },
  3: { label: "High", color: "bg-amber-100 text-amber-700" },
  4: { label: "Critical", color: "bg-rose-100 text-rose-700" },
};

const statusMap: Record<Status, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  2: { label: "Open", variant: "default" },
  3: { label: "Pending", variant: "secondary" },
  4: { label: "Resolved", variant: "outline" },
  5: { label: "Closed", variant: "outline" },
  6: { label: "Waiting on Customer", variant: "secondary" },
};

interface TicketTableProps {
  tickets: Ticket[];
  onRowClick: (ticket: Ticket) => void;
}

export const TicketTable = ({ tickets, onRowClick }: TicketTableProps) => {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[100px]">ID</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>SLA Timer</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead className="text-right">Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow 
              key={ticket.id} 
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => onRowClick(ticket)}
            >
              <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                #{ticket.id}
              </TableCell>
              <TableCell className="font-medium max-w-[300px] truncate">
                {ticket.subject}
              </TableCell>
              <TableCell>
                <span className={cn("px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", priorityMap[ticket.priority].color)}>
                  {priorityMap[ticket.priority].label}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={statusMap[ticket.status].variant} className="text-[10px] font-semibold">
                  {statusMap[ticket.status].label}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    ticket.priority === 4 ? "bg-rose-500 animate-pulse" : 
                    ticket.priority === 3 ? "bg-amber-500" : "bg-emerald-500"
                  )} />
                  <span className="text-xs font-medium">
                    {ticket.priority === 4 ? "14m left" : ticket.priority === 3 ? "1h 20m" : "4h 15m"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(ticket.created_at))}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold">
                    {ticket.responder_name?.split(' ').map(n => n[0]).join('') || '??'}
                  </div>
                  <span className="text-xs">{ticket.responder_name || "Unassigned"}</span>
                </div>
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(ticket.updated_at))} ago
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};