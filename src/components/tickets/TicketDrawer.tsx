import DOMPurify from "dompurify";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Ticket, Conversation, Priority } from "../../types/freshdesk";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Clock, User, Send, Paperclip, StickyNote, ShieldAlert,
  CheckCircle2, Lock, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import {
  requesterDisplayName, ticketDept, computeSLA,
  SLA_LABELS, SLA_ACK_MINUTES, SLA_ANALYSIS_MINUTES,
  PRIORITY_META, STATUS_META, initials,
} from "@/lib/tickets";
import { cn } from "@/lib/utils";

interface TicketDrawerProps {
  ticket: Ticket | null;
  conversations: Conversation[];
  isOpen: boolean;
  onClose: () => void;
}

// Force all links to open safely in a new tab
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { ADD_ATTR: ["target"], FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });

const avatarColor = (name: string) => {
  const colours = [
    "bg-gradient-to-br from-violet-500 to-purple-600",
    "bg-gradient-to-br from-sky-500 to-blue-600",
    "bg-gradient-to-br from-emerald-500 to-teal-600",
    "bg-gradient-to-br from-amber-500 to-orange-600",
    "bg-gradient-to-br from-rose-500 to-pink-600",
    "bg-gradient-to-br from-indigo-500 to-violet-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colours[h % colours.length];
};

export const TicketDrawer = ({ ticket, conversations, isOpen, onClose }: TicketDrawerProps) => {
  if (!ticket) return null;

  const sla = computeSLA(ticket);
  const slaLabel = SLA_LABELS[ticket.priority as Priority] ?? SLA_LABELS[1];
  const p = PRIORITY_META[ticket.priority] ?? { label: String(ticket.priority), tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
  const s = STATUS_META[ticket.status] ?? { label: `Status ${ticket.status}`, tone: "bg-slate-100 text-slate-600" };
  const requester = requesterDisplayName(ticket);

  const slaToneBox =
    sla.state === "breached" ? "border-rose-200 bg-gradient-to-br from-rose-50 to-rose-50/30 dark:border-rose-500/20 dark:from-rose-500/10 dark:to-transparent" :
    sla.state === "attention" ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/30 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" :
    sla.state === "met" ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/30 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" :
    "border-border/60 bg-gradient-to-br from-secondary/40 to-transparent";

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <SheetHeader className="space-y-0 border-b border-border/60 bg-secondary/20 p-6 pb-5 text-left">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[12px] font-semibold text-primary">#{ticket.id}</span>
            <span className={cn("chip", p.tone)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
              {p.label}
            </span>
            <span className={cn("chip", s.tone)}>{s.label}</span>
          </div>

          <SheetTitle className="font-display text-[19px] font-bold leading-snug tracking-tight">
            {ticket.subject}
          </SheetTitle>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {requester} · <span className="font-medium text-foreground/70">{ticketDept(ticket)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(ticket.created_at), "MMM d, yyyy · h:mm a")}
            </span>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-6">

            {/* ── SLA panel ──────────────────────────────────────────── */}
            <div className={cn("rounded-2xl border p-4", slaToneBox)}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className={cn("h-4 w-4", sla.tone)} />
                  <span className="text-[13px] font-bold text-foreground">{slaLabel.severity}</span>
                </div>
                <span className={cn("text-[12px] font-bold", sla.tone)}>{sla.label} · {sla.remaining}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Acknowledgment", value: `${SLA_ACK_MINUTES} minutes` },
                  { label: "Analysis", value: `${SLA_ANALYSIS_MINUTES} minutes` },
                  { label: "Workaround", value: slaLabel.workaround },
                  { label: "Full Resolution", value: slaLabel.resolution },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-border/40 bg-card/70 px-3 py-2">
                    <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/70">{row.label}</div>
                    <div className="mt-0.5 text-[13px] font-semibold text-foreground">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Original description ────────────────────────────────── */}
            {ticket.description && (
              <div className="rounded-2xl border border-border/50 bg-secondary/25 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className={cn("text-[10px] font-bold text-white", avatarColor(requester))}>
                      {initials(requester)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-[12.5px] font-semibold leading-none">{requester}</div>
                    <div className="text-[10.5px] text-muted-foreground">opened this ticket</div>
                  </div>
                </div>
                <div className="fd-html text-foreground/85" dangerouslySetInnerHTML={{ __html: sanitize(ticket.description) }} />
              </div>
            )}

            {/* ── Conversation divider ───────────────────────────────── */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                Conversation · {conversations.length}
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {/* ── Conversation thread ────────────────────────────────── */}
            <div className="space-y-4">
              {conversations.length === 0 && (
                <p className="py-6 text-center text-[12px] text-muted-foreground/60">No replies yet.</p>
              )}
              {conversations.map((conv) => {
                const author = conv.incoming ? requester : "Support Agent";
                const html = sanitize(conv.body || conv.body_text || "");
                return (
                  <div key={conv.id} className="flex gap-3">
                    <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                      <AvatarFallback className={cn(
                        "text-[10px] font-bold text-white",
                        conv.incoming ? avatarColor(author) : "bg-gradient-to-br from-[#6B4EFF] to-[#8b6dff]"
                      )}>
                        {initials(author)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-foreground">{author}</span>
                        <span className={cn(
                          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold",
                          conv.incoming ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10" : "bg-violet-50 text-violet-600 dark:bg-violet-500/10"
                        )}>
                          {conv.incoming ? <ArrowDownLeft className="h-2.5 w-2.5" /> : <ArrowUpRight className="h-2.5 w-2.5" />}
                          {conv.incoming ? "Incoming" : "Reply"}
                        </span>
                        {conv.private && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-600 dark:bg-amber-500/10">
                            <Lock className="h-2.5 w-2.5" /> Private
                          </span>
                        )}
                        <span className="ml-auto text-[10.5px] text-muted-foreground/60">
                          {format(new Date(conv.created_at), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <div className={cn(
                        "rounded-2xl rounded-tl-sm border p-3.5 shadow-sm",
                        conv.private
                          ? "border-amber-200/60 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
                          : conv.incoming
                            ? "border-border/50 bg-card"
                            : "border-violet-100 bg-violet-50/40 dark:border-violet-500/15 dark:bg-violet-500/5"
                      )}>
                        <div className="fd-html text-foreground/85" dangerouslySetInnerHTML={{ __html: html }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        {/* ── Reply composer ───────────────────────────────────────────── */}
        <div className="border-t border-border/60 bg-secondary/20 p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
              <StickyNote className="h-3.5 w-3.5" /> Internal Note
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
              <Paperclip className="h-3.5 w-3.5" /> Attach
            </Button>
          </div>
          <div className="relative">
            <Textarea
              placeholder="Type your reply…"
              className="min-h-[92px] resize-none rounded-xl border-border/60 bg-card pr-12 text-[13px] focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            <Button size="icon" className="absolute bottom-3 right-3 h-8 w-8 rounded-full bg-[#6B4EFF] hover:bg-[#5a3de8]">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1.5">
              <Button variant="secondary" size="sm" className="h-8 rounded-lg text-xs">Pending</Button>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
              </Button>
            </div>
            <Button size="sm" className="h-8 gap-1.5 rounded-lg bg-[#6B4EFF] px-4 text-xs font-semibold text-white hover:bg-[#5a3de8]">
              Send Reply
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
