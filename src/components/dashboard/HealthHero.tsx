import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ShieldCheck, Activity, Timer } from "lucide-react";
import { DashboardMetrics } from "@/lib/tickets";
import { cn } from "@/lib/utils";

interface Props {
  metrics: DashboardMetrics;
}

const trend = [12, 18, 15, 22, 19, 26, 24, 30, 28, 34, 33, 38].map((v, i) => ({ i, v }));

export const HealthHero = ({ metrics }: Props) => {
  const { healthScore, slaCompliance, breached, attention, onTrack } = metrics;
  const ring = `conic-gradient(hsl(var(--grad-from)) 0deg, hsl(var(--grad-via)) ${healthScore * 1.8}deg, hsl(var(--grad-to)) ${healthScore * 3.6}deg, hsl(var(--muted)) ${healthScore * 3.6}deg)`;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8 animate-fade-up">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />

      <div className="relative grid gap-8 lg:grid-cols-[auto_1fr]">
        {/* Health ring */}
        <div className="flex items-center gap-6">
          <div className="relative grid h-36 w-36 place-items-center rounded-full" style={{ background: ring }}>
            <div className="grid h-28 w-28 place-items-center rounded-full bg-card text-center shadow-inner">
              <div>
                <div className="text-3xl font-black tracking-tight">{healthScore}</div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Health</div>
              </div>
            </div>
            <span className="absolute right-1 top-3 flex h-3 w-3">
              <span className="ring-pulse relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Service Health Score</p>
            <h2 className="mt-1 text-2xl font-bold leading-tight">
              {healthScore >= 85 ? "Operating smoothly" : healthScore >= 65 ? "Minor strain" : "Needs attention"}
            </h2>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">
              <ArrowUpRight className="h-3.5 w-3.5" /> +3.2% vs last 7d
            </div>
          </div>
        </div>

        {/* Right: SLA split + trend */}
        <div className="grid gap-5 sm:grid-cols-3 lg:border-l lg:border-border lg:pl-8">
          <Stat icon={ShieldCheck} label="SLA Compliance" value={`${slaCompliance}%`} tone="text-emerald-600" sub={`${onTrack} on track`} />
          <Stat icon={Activity} label="Needs Attention" value={String(attention)} tone="text-amber-600" sub="approaching SLA" />
          <Stat icon={Timer} label="Breached" value={String(breached)} tone="text-rose-600" sub="overdue tickets" />

          <div className="sm:col-span-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Resolution velocity (12w)</span>
              <span className="font-semibold text-foreground">Trending up</span>
            </div>
            <div className="h-16 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                  <defs>
                    <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#heroGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Stat = ({
  icon: Icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone: string;
  sub: string;
}) => (
  <div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className={cn("h-4 w-4", tone)} />
      {label}
    </div>
    <div className="mt-1.5 text-2xl font-bold tracking-tight">{value}</div>
    <div className="text-[11px] text-muted-foreground">{sub}</div>
  </div>
);
