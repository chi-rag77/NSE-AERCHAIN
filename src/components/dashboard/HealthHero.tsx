import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  ShieldCheck, AlertTriangle, XCircle, TrendingUp,
  Zap, ArrowUpRight, Activity,
} from "lucide-react";
import { DashboardMetrics } from "@/lib/tickets";
import { cn } from "@/lib/utils";

interface Props { metrics: DashboardMetrics }

const trendPoints = [8, 14, 11, 18, 16, 22, 20, 28, 25, 32, 30, 36].map((v, i) => ({ i, v }));

const arc = (pct: number, r: number) => {
  const angle = (pct / 100) * 251.2;
  return `stroke-dasharray: ${angle} ${251.2 - angle}`;
};

export const HealthHero = ({ metrics }: Props) => {
  const { healthScore, slaCompliance, breached, attention, onTrack, total, open } = metrics;

  const scoreColor = healthScore >= 85 ? "#10b981" : healthScore >= 65 ? "#f59e0b" : "#f43f5e";
  const scoreLabel = healthScore >= 85 ? "Excellent" : healthScore >= 65 ? "Fair" : "Critical";
  const scoreSub = healthScore >= 85 ? "All systems nominal" : healthScore >= 65 ? "Some issues need attention" : "Immediate action required";

  const circumference = 251.2;
  const dashOffset = circumference - (healthScore / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card animate-fade-up">
      {/* Deep ambient glows */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/15 blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-sky-400/10 blur-[60px]" />
      <div className="pointer-events-none absolute right-1/3 top-0 h-48 w-48 rounded-full bg-violet-400/8 blur-[50px]" />

      {/* Top accent bar */}
      <div className="h-[3px] w-full gradient-brand" />

      <div className="p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[220px_1fr_240px]">

          {/* ── Health Score Ring ─────────────────────────────────────── */}
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="relative h-40 w-40">
              {/* Track */}
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle
                  cx="44" cy="44" r="40"
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(healthScore / 100) * 251.2} 251.2`}
                  style={{ filter: `drop-shadow(0 0 8px ${scoreColor}80)`, transition: "stroke-dasharray 1s ease" }}
                />
              </svg>
              {/* Inner */}
              <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-card ring-1 ring-border/40">
                <span className="text-[32px] font-black leading-none tracking-tight" style={{ color: scoreColor }}>
                  {healthScore}
                </span>
                <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Score</span>
              </div>
              {/* Live dot */}
              <span className="absolute right-3 top-3 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: scoreColor }} />
                <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: scoreColor }} />
              </span>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold" style={{ color: scoreColor }}>{scoreLabel}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{scoreSub}</div>
            </div>
          </div>

          {/* ── Status pillars ────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3 self-center">
            <StatusPillar
              icon={ShieldCheck}
              label="SLA Compliance"
              value={`${slaCompliance}%`}
              sub={`${onTrack} on track`}
              color="emerald"
              pct={slaCompliance}
            />
            <StatusPillar
              icon={AlertTriangle}
              label="Needs Attention"
              value={String(attention)}
              sub="approaching SLA"
              color="amber"
              pct={total > 0 ? Math.round((attention / total) * 100) : 0}
            />
            <StatusPillar
              icon={XCircle}
              label="SLA Breached"
              value={String(breached)}
              sub="overdue tickets"
              color="rose"
              pct={total > 0 ? Math.round((breached / total) * 100) : 0}
            />

            {/* Wide stat: open + mini info */}
            <div className="col-span-3 mt-1 flex items-center gap-4 rounded-2xl border border-border/50 bg-secondary/30 px-4 py-3">
              <Activity className="h-4 w-4 shrink-0 text-primary" />
              <div className="flex flex-1 items-center gap-6 text-[12px]">
                <span><span className="font-bold text-foreground">{total}</span> <span className="text-muted-foreground">total tickets</span></span>
                <span className="text-border">|</span>
                <span><span className="font-bold text-amber-600">{open}</span> <span className="text-muted-foreground">open</span></span>
                <span className="text-border">|</span>
                <span><span className="font-bold text-emerald-600">{metrics.resolved}</span> <span className="text-muted-foreground">resolved</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                <TrendingUp className="h-3.5 w-3.5" />
                <ArrowUpRight className="h-3 w-3" />
                Trending up
              </div>
            </div>
          </div>

          {/* ── Velocity sparkline ────────────────────────────────────── */}
          <div className="flex flex-col justify-center gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Resolution Velocity</div>
                <div className="text-[11px] text-muted-foreground/60">12-week trend</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
                <TrendingUp className="h-3 w-3" /> +14%
              </span>
            </div>
            <div className="h-24 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendPoints} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
                  <defs>
                    <linearGradient id="heroGradFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone" dataKey="v"
                    stroke="hsl(var(--primary))" strokeWidth={2.5}
                    fill="url(#heroGradFill)" dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
              <span>12 weeks ago</span>
              <span>Today</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const colorMap = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", bar: "#10b981", border: "border-emerald-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", bar: "#f59e0b", border: "border-amber-500/20" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", bar: "#f43f5e", border: "border-rose-500/20" },
};

const StatusPillar = ({
  icon: Icon, label, value, sub, color, pct,
}: {
  icon: React.ElementType; label: string; value: string; sub: string; color: "emerald" | "amber" | "rose"; pct: number;
}) => {
  const c = colorMap[color];
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border p-3.5", c.border, c.bg)}>
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", c.bg)}>
        <Icon className={cn("h-4 w-4", c.text)} />
      </div>
      <div>
        <div className={cn("text-2xl font-black tracking-tight", c.text)}>{value}</div>
        <div className="text-[10px] font-semibold text-foreground/70">{label}</div>
        <div className="text-[9.5px] text-muted-foreground">{sub}</div>
      </div>
      {/* Mini progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: c.bar, boxShadow: `0 0 4px ${c.bar}60` }}
        />
      </div>
    </div>
  );
};
