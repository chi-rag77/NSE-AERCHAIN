import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/tickets";

const issues = [
  { name: "Vendor duplication issue", cat: "Data", total: 12, open: 7, trend: "+20%", up: true },
  { name: "PR approval workflow delay", cat: "Workflow", total: 9, open: 5, trend: "+12%", up: true },
  { name: "PO error on save", cat: "Bug", total: 7, open: 3, trend: "-8%", up: false },
  { name: "Email not triggered", cat: "Integration", total: 6, open: 2, trend: "+20%", up: true },
];

const agents = [
  { name: "Ravi Kumar", resolved: 152, sla: 96 },
  { name: "Asha Nair", resolved: 138, sla: 94 },
  { name: "Suresh P", resolved: 128, sla: 92 },
  { name: "Meena N", resolved: 112, sla: 91 },
  { name: "Vikas Singh", resolved: 98, sla: 89 },
];

export const BottomGrid = () => {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Recurring issues */}
      <div className="card-elevated lg:col-span-2">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Top Recurring Issues</h3>
          <button className="text-xs font-medium text-primary hover:underline">Detect patterns</button>
        </div>
        <div className="divide-y divide-border">
          {issues.map((i, idx) => (
            <div key={i.name} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/40">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold text-muted-foreground">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.name}</p>
                <p className="text-[11px] text-muted-foreground">{i.cat}</p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold">{i.total}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">total</p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-amber-600">{i.open}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">open</p>
              </div>
              <span className={cn("flex items-center gap-0.5 text-xs font-bold", i.up ? "text-rose-500" : "text-emerald-500")}>
                {i.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {i.trend}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>

      {/* Agent leaderboard */}
      <div className="card-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Agent Leaderboard</h3>
          <button className="text-xs font-medium text-primary hover:underline">All</button>
        </div>
        <div className="divide-y divide-border">
          {agents.map((a, idx) => (
            <div key={a.name} className="flex items-center gap-3 px-5 py-3">
              <div className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-secondary text-[10px] font-semibold">{initials(a.name)}</AvatarFallback>
                </Avatar>
                {idx === 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full gradient-brand text-[8px] font-bold text-white">
                    1
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <span className="truncate text-xs font-semibold">{a.name}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">{a.resolved}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full gradient-brand" style={{ width: `${a.sla}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600">{a.sla}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
