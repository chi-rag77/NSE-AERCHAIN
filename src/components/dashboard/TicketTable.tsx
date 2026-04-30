import React from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MOCK_TICKETS } from '@/services/mockData';
import { calculateSLA, getPriorityLabel, getStatusLabel } from '@/utils/sla';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Clock, User } from 'lucide-react';

interface TicketTableProps {
  onRowClick: (ticket: any) => void;
}

const TicketTable = ({ onRowClick }: TicketTableProps) => {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[100px]">ID</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>SLA Timer</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Assigned To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_TICKETS.map((ticket) => {
            const sla = calculateSLA(ticket.created_at, ticket.priority);
            
            return (
              <TableRow 
                key={ticket.id} 
                className="cursor-pointer hover:bg-muted/50 transition-colors group"
                onClick={() => onRowClick(ticket)}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  #{ticket.id}
                </TableCell>
                <TableCell className="max-w-[300px]">
                  <div className="font-medium truncate group-hover:text-primary transition-colors">
                    {ticket.subject}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {ticket.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    "font-medium",
                    ticket.priority === 4 && "border-rose-200 bg-rose-50 text-rose-700",
                    ticket.priority === 3 && "border-amber-200 bg-amber-50 text-amber-700",
                    ticket.priority === 2 && "border-blue-200 bg-blue-50 text-blue-700",
                    ticket.priority === 1 && "border-slate-200 bg-slate-50 text-slate-700",
                  )}>
                    {getPriorityLabel(ticket.priority)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      ticket.status === 2 ? "bg-blue-500" : "bg-amber-500"
                    )}></div>
                    <span className="text-sm">{getStatusLabel(ticket.status)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className={cn(
                      "text-xs font-bold flex items-center gap-1",
                      sla.status === 'immediate' ? "text-rose-600" : 
                      sla.status === 'attention' ? "text-amber-600" : "text-emerald-600"
                    )}>
                      <Clock size={12} />
                      {sla.remainingTime}
                    </div>
                    <div className="h-1 w-20 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all",
                          sla.status === 'immediate' ? "bg-rose-500" : 
                          sla.status === 'attention' ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${sla.percentRemaining}%` }}
                      ></div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(parseISO(ticket.created_at))} ago
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                      <User size={14} className="text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium">{ticket.responder_name || 'Unassigned'}</span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default TicketTable;