import React from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet";
import { Ticket, Conversation } from "../../types/freshdesk";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Clock, User, Send, Paperclip, History, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { requesterDisplayName, ticketDept, computeSLA, SLA_LABELS, SLA_ACK_MINUTES, SLA_ANALYSIS_MINUTES } from "@/lib/tickets";
import { cn } from "@/lib/utils";
import { Priority } from "../../types/freshdesk";

interface TicketDrawerProps {
  ticket: Ticket | null;
  conversations: Conversation[];
  isOpen: boolean;
  onClose: () => void;
}

export const TicketDrawer = ({ ticket, conversations, isOpen, onClose }: TicketDrawerProps) => {
  if (!ticket) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="p-6 border-b bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-muted-foreground">Ticket #{ticket.id}</span>
            <Badge variant="outline" className="text-[10px]">{ticket.company_name}</Badge>
          </div>
          <SheetTitle className="text-xl leading-tight">{ticket.subject}</SheetTitle>
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              {requesterDisplayName(ticket)} · {ticketDept(ticket)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Created {format(new Date(ticket.created_at), "MMM d, h:mm a")}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {/* SLA Panel */}
            {(() => {
              const sla = computeSLA(ticket);
              const slaLabel = SLA_LABELS[ticket.priority as Priority] ?? SLA_LABELS[1];
              return (
                <div className={cn(
                  "rounded-xl border p-4 space-y-3",
                  sla.state === "breached" ? "border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/5" :
                  sla.state === "attention" ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5" :
                  sla.state === "met" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5" :
                  "border-border bg-secondary/20"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className={cn("h-4 w-4", sla.tone)} />
                      <span className="text-xs font-semibold">{slaLabel.severity}</span>
                    </div>
                    <span className={cn("text-xs font-bold", sla.tone)}>{sla.label} · {sla.remaining}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-background/60 px-3 py-2 border border-border/50">
                      <div className="text-muted-foreground">Acknowledgment</div>
                      <div className="font-semibold mt-0.5">{SLA_ACK_MINUTES} minutes</div>
                    </div>
                    <div className="rounded-lg bg-background/60 px-3 py-2 border border-border/50">
                      <div className="text-muted-foreground">Analysis</div>
                      <div className="font-semibold mt-0.5">{SLA_ANALYSIS_MINUTES} minutes</div>
                    </div>
                    <div className="rounded-lg bg-background/60 px-3 py-2 border border-border/50">
                      <div className="text-muted-foreground">Workaround</div>
                      <div className="font-semibold mt-0.5">{slaLabel.workaround}</div>
                    </div>
                    <div className="rounded-lg bg-background/60 px-3 py-2 border border-border/50">
                      <div className="text-muted-foreground">Full Resolution</div>
                      <div className="font-semibold mt-0.5">{slaLabel.resolution}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Initial Description */}
            {ticket.description && (
            <div className="bg-secondary/30 rounded-xl p-4 border border-secondary">
              <p className="text-sm leading-relaxed">{ticket.description}</p>
            </div>
            )}

            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Conversation</span>
              <Separator className="flex-1" />
            </div>

            {/* Conversation Thread */}
            {conversations.map((conv) => (
              <div 
                key={conv.id} 
                className={cn(
                  "flex flex-col gap-2 max-w-[85%]",
                  conv.incoming ? "self-start" : "self-end items-end ml-auto"
                )}
              >
                <div className={cn(
                  "rounded-2xl p-4 text-sm shadow-sm",
                  conv.incoming 
                    ? "bg-card border text-foreground rounded-tl-none"
                    : "bg-primary text-primary-foreground rounded-tr-none"
                )}>
                  {conv.body_text}
                </div>
                <span className="text-[10px] text-muted-foreground px-1">
                  {format(new Date(conv.created_at), "h:mm a")}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-6 border-t bg-background">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <History className="h-3.5 w-3.5 mr-1.5" />
              Internal Note
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Paperclip className="h-3.5 w-3.5 mr-1.5" />
              Attach
            </Button>
          </div>
          <div className="relative">
            <Textarea 
              placeholder="Type your reply..." 
              className="min-h-[100px] pr-12 resize-none focus-visible:ring-1"
            />
            <Button 
              size="icon" 
              className="absolute bottom-3 right-3 h-8 w-8 rounded-full"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="h-8 text-xs">Pending</Button>
              <Button variant="secondary" size="sm" className="h-8 text-xs">Resolved</Button>
            </div>
            <Button size="sm" className="h-8 text-xs px-4">Send Reply</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};