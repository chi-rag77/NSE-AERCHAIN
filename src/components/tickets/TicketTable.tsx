import React from "react";
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
import { MoreHorizontal, Search, Filter, Columns, Plus, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const priorityMap: Record<Priority, { label: string; color: string }> = {
  1: { label: "Low", color: "bg-emerald-100 text-emerald-700" },
  2: { label: "Medium", color: "bg-orange-100 text-orange-700" },
  3: { label: "High", color: "bg-rose-100 text-rose-700" },
  4: { label: "Critical", color: "bg-rose-600 text-white" },
};

const statusMap: Record<Status, { label: string; color: string }> = {
  2: { label: "Open", color: "bg-blue-50 text-blue-600 border-blue-100" },
  3: { label: "In Progress", color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
  4: { label: "Resolved", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  5: { label: "Closed", color: "bg-slate-50 text-slate-600 border-slate-100" },
  6: { label: "Waiting", color: "bg-purple-50 text-purple-600 border-purple-100" },
};

interface TicketTableProps {
  tickets: Ticket[];
  onRowClick: (ticket: Ticket) => void;
}

export const TicketTable = ({ tickets, onRowClick }: TicketTableProps) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">Live Tickets</h2>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Search in tickets..." className="pl-9 h-9 text-sm bg-white border-slate-200" />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2 text-slate-600">
            <Filter size={14} /> Filters
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-2 text-slate-600">
            <Columns size={14} /> Columns
          </Button>
          <Button size="sm" className="h-9 gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus size={14} /> New Ticket
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="hover:bg-transparent border-slate-200">
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Ticket ID</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Subject</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Customer / Dept.</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Category</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Priority</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">SLA Status</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">SLA Time Left</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Assignee</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Updated</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow 
                key={ticket.id} 
                className="cursor-pointer hover:bg-slate-50/80 transition-colors border-slate-100"
                onClick={() => onRowClick(ticket)}
              >
                <TableCell className="font-mono text-xs font-semibold text-blue-600">
                  NSE-{ticket.id}
                </TableCell>
                <TableCell className="font-medium text-slate-900 text-sm">
                  {ticket.subject}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  NSE - {ticket.tags[0] || "General"}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {ticket.tags[1] || "Support"}
                </TableCell>
                <TableCell>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                    priorityMap[ticket.priority].color
                  )}>
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
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      ticket.priority === 4 ? "bg-rose-500" : 
                      ticket.priority === 3 ? "bg-orange-500" : "bg-emerald-500"
                    )} />
                    <span className={cn(
                      "text-[11px] font-medium",
                      ticket.priority === 4 ? "text-rose-600" : 
                      ticket.priority === 3 ? "text-orange-600" : "text-emerald-600"
                    )}>
                      {ticket.priority === 4 ? "Immediate Action" : ticket.priority === 3 ? "Attention" : "On Track"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <Clock size={12} className="text-slate-400" />
                    {ticket.priority === 4 ? "-15m" : ticket.priority === 3 ? "28m" : "2h 35m"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${ticket.responder_name}`} />
                      <AvatarFallback>{ticket.responder_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium text-slate-700">{ticket.responder_name || "Unassigned"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  2m ago
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                    <MoreHorizontal size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};