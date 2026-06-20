import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown, Trophy, BarChart3, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/tickets";

const issues = [
  { name: "Vendor duplication issue", cat: "Data", total: 12, open: 7, trend: "+20%", up: true },
  { name: "PR approval workflow delay", cat: "Workflow", total: 9, open: 5, trend: "+12%", up: true },
  { name: "PO error on save", cat: "Bug", total: 7, open: 3, trend: "-8%", up: false },
  { name: "Email not triggered on PO", cat: "Integration", total: 6, open: 2, trend: "+20%", up: true },
  { name: "Report export failure", cat: "Bug", total: 5, open: 4, trend: "+5%", up: true },
];

const agents = [
  { name: "Ravi Kumar", resolved: 152, sla: 96, delta: "+8%" },
  { name: "Asha Nair", resolved: 138, sla: 94, delta: "+5%" },
  { name: "Suresh P", resolved: 128, sla: 92, delta: "+3%" },
  { name: "Meena N", resolved: 112, sla: 91, delta: "+2%" },
  { name: "Vikas Singh", resolved: 98, sla: 89, delta: "-1%" },
];

const catColors: Record<string, string> = {
  Data: "bg-blue-500/10 text-blue-600",
  Workflow: "bg-violet-500/10 text-violet-600",
  Bug: "bg-rose-500/10 text-rose-600",
  Integration: "bg-amber-500/10 text-amber-600",
};

const avatarGradients = [
  "from-violet-500 to-purple-600",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
];

const rankColors = ["text-amber-500", "text-slate-400", "text-orange-600"];

export const BottomGrid = () => {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Recurring issues */}
      <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden lg:col-span-2">
        <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10">
              <Layers className="h-4 w-4 text-rose-500" />
            </div>
            <div>
              <h3 className="text-[13px] font-bold">Top Recurring Issues</h3>
              <p className="text-[11px] text-muted-foreground">Pattern detection · last 30 days</p>
            </div>
          </div>
          <button className="inline-flex items-center gap-1 rounded-lg bg-primary/8 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15">
            Detect patterns
          </button>
        </div>

        <div className="divide-y divide-border/60">
          {issues.map((iss, idx) => (
            <div
              key={iss.name}
              className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/40"
            >
              {/* Rank badge */}
              <span className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black",
                idx === 0 ? "bg-rose-500/10 text-rose-600" :
                idx === 1 ? "bg-amber-500/10 text-amber-600" :
                "bg-secondary text-muted-foreground"
              )}>
                {idx + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="truncate text-[13px] font-semibold group-hover:text-primary transition-colors">{iss.name}</p>
                </div>
                <span className={cn(
                  "inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                  catColors[iss.cat] ?? "bg-secondary text-muted-foreground"
                )}>
                  {iss.cat}
                </span>
              </div>

              <div className="hidden text-right sm:flex flex-col items-end gap-0.5">
                <span className="text-[13px] font-bold">{iss.total}</span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">total</span>
              </div>
              <div className="hidden text-right sm:flex flex-col items-end gap-0.5">
                <span className="text-[13px] font-bold text-amber-600">{iss.open}</span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">open</span>
              </div>

              <span className={cn("flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold",
                iss.up ? "bg-rose-500/8 text-rose-600" : "bg-emerald-500/8 text-emerald-600"
              )}>
                {iss.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {iss.trend}
              </span>

              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </div>
          ))}
        </div>
      </div>

      {/* Agent leaderboard */}
      <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10">
              <Trophy className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <h3 className="text-[13px] font-bold">Agent Leaderboard</h3>
              <p className="text-[11px] text-muted-foreground">By SLA compliance</p>
            </div>
          </div>
          <button className="text-[11px] font-semibold text-primary hover:underline">All agents</button>
        </div>

        <div className="divide-y divide-border/60 flex-1">
          {agents.map((a, idx) => (
            <div key={a.name} className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-secondary/40">
              {/* Avatar with rank */}
              <div className="relative">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className={cn("bg-gradient-to-br text-[10px] font-bold text-white", avatarGradients[idx % avatarGradients.length])}>
                    {initials(a.name)}
                  </AvatarFallback>
                </Avatar>
                {idx < 3 && (
                  <span className={cn(
                    "absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-card text-[8px] font-black ring-1 ring-border",
                    rankColors[idx]
                  )}>
                    {idx + 1}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="truncate text-[12px] font-semibold">{a.name}</span>
                  <span className={cn(
                    "text-[10px] font-bold",
                    a.delta.startsWith("+") ? "text-emerald-600" : "text-rose-500"
                  )}>{a.delta}</span>
                </div>
                {/* SLA bar */}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full gradient-brand"
                      style={{ width: `${a.sla}%`, transition: "width 1s ease" }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-primary">{a.sla}%</span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{a.resolved} resolved</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
