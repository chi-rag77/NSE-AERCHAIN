import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Ticket, Conversation } from '@/types/freshdesk';
import { MOCK_CONVERSATIONS } from '@/services/mockData';
import { getPriorityLabel, getStatusLabel } from '@/utils/sla';
import { format, parseISO } from 'date-fns';
import { Send, User, Clock, Paperclip, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketDrawerProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onClose: () => void;
}

const TicketDrawer = ({ ticket, isOpen, onClose }: TicketDrawerProps) => {
  if (!ticket) return null;

  const conversations = MOCK_CONVERSATIONS[ticket.id] || [];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="p-6 border-b bg-muted/10">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">#{ticket.id}</span>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">NSE India</Badge>
              </div>
              <SheetTitle className="text-xl leading-tight">{ticket.subject}</SheetTitle>
            </div>
            <Button variant="ghost" size="icon"><MoreVertical size={18} /></Button>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Priority</span>
              <span className="text-sm font-medium">{getPriorityLabel(ticket.priority)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Status</span>
              <span className="text-sm font-medium">{getStatusLabel(ticket.status)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Requester</span>
              <span className="text-sm font-medium">{ticket.requester_name}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Created</span>
              <span className="text-sm font-medium">{format(parseISO(ticket.created_at), 'MMM d, HH:mm')}</span>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-8">
            {/* Original Description */}
            <div className="flex gap-4">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User size={16} className="text-primary" />
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm">{ticket.requester_name}</span>
                  <span className="text-xs text-muted-foreground">{format(parseISO(ticket.created_at), 'HH:mm')}</span>
                </div>
                <div className="bg-muted/30 p-4 rounded-2xl rounded-tl-none text-sm leading-relaxed">
                  {ticket.description}
                </div>
              </div>
            </div>

            {/* Conversations */}
            {conversations.map((conv) => (
              <div key={conv.id} className={cn("flex gap-4", !conv.incoming && "flex-row-reverse")}>
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  conv.incoming ? "bg-primary/10" : "bg-indigo-100"
                )}>
                  <User size={16} className={conv.incoming ? "text-primary" : "text-indigo-600"} />
                </div>
                <div className={cn("space-y-2 flex-1", !conv.incoming && "text-right")}>
                  <div className={cn("flex items-center gap-2", !conv.incoming && "flex-row-reverse")}>
                    <span className="font-bold text-sm">{conv.incoming ? ticket.requester_name : ticket.responder_name}</span>
                    <span className="text-xs text-muted-foreground">{format(parseISO(conv.created_at), 'HH:mm')}</span>
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed inline-block max-w-[90%]",
                    conv.incoming ? "bg-muted/30 rounded-tl-none" : "bg-indigo-600 text-white rounded-tr-none"
                  )}>
                    {conv.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-6 border-t bg-background">
          <div className="relative">
            <Textarea 
              placeholder="Type your reply..." 
              className="min-h-[120px] pr-12 resize-none rounded-2xl border-muted focus-visible:ring-primary/20"
            />
            <div className="absolute bottom-3 right-3 flex gap-2">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                <Paperclip size={18} />
              </Button>
              <Button size="icon" className="rounded-full h-8 w-8">
                <Send size={16} />
              </Button>
            </div>
          </div>
          <div className="flex justify-between items-center mt-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-full text-xs h-8">Change Status</Button>
              <Button variant="outline" size="sm" className="rounded-full text-xs h-8">Assign Agent</Button>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-8">Internal Note</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TicketDrawer;