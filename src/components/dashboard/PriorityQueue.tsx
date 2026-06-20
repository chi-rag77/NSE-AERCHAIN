import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { PRIORITY_META, computeSLA, ticketDept, initials } from "@/lib/tickets";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Props {
  tickets: Ticket[];
  onRowClick: (t: Ticket) => void;
}

export const PriorityQueue = ({ tickets, onRowClick }: Props) => {
  const urgent = useMemo(
    () =>
      [...tickets]
        .filter((t) => ![4, 5].includes(t.status))
        .sort((a, b) => computeSLA(a).remainingMinutes - computeSLA(b).remainingMinutes)
        .slice(0, 6),
    [tickets]
  );

  return (
    <div className="card-elevated">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">Priority Queue</h3>
          <p className="text-xs text-muted-foreground">Sorted by SLA urgency</p>
        </div>
        <Link to="/tickets" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          All tickets <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="divide-y divide-border">
        {urgent.map((t) => {
          const sla = computeSLA(t);
          const p = PRIORITY_META[t.priority];
          return (
            <button
              key={t.id}
              onClick={() => onRowClick(t)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-secondary/50"
            >
              <span className={cn("h-8 w-1 shrink-0 rounded-full", p.dot)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-primary">NSE-{t.id}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", p.tone)}>{p.label}</span>
                </div>
                <p className="truncate text-sm font-medium">{t.subject}</p>
                <p className="truncate text-[11px] text-muted-foreground">{ticketDept(t)}</p>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <div className={cn("flex items-center justify-end gap-1 text-xs font-semibold", sla.tone)}>
                  <Clock className="h-3 w-3" /> {sla.remaining}
                </div>
                <div className="text-[10px] text-muted-foreground">{sla.label}</div>
              </div>
              <Avatar className="hidden h-7 w-7 shrink-0 sm:flex">
                <AvatarFallback className="bg-secondary text-[9px] font-semibold">{initials(t.responder_name)}</AvatarFallback>
              </Avatar>
            </button>
          );
        })}
      </div>
    </div>
  );
};
