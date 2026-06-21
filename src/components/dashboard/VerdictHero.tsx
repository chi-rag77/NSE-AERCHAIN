import { Area, AreaChart, ResponsiveContainer, ReferenceLine, Tooltip } from "recharts";
import {
  CheckCircle2, AlertTriangle, ShieldAlert, TrendingUp, TrendingDown,
  ArrowRight, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AssuranceSummary, CompliancePoint, SLA_TARGET,
} from "@/lib/dashboardData";

interface Props {
  summary: AssuranceSummary;
  trend: CompliancePoint[];
}

const verdictTheme = {
  healthy: { color: "#10b981", soft: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2, label: "Healthy" },
  watch: { color: "#f59e0b", soft: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", icon: AlertTriangle, label: "Watch" },
  at_risk: { color: "#f43f5e", soft: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", icon: ShieldAlert, label: "At Risk" },
};

const TrendTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-lg">
      <span className="font-bold text-foreground">{payload[0].payload.compliance}%</span>
      <span className="ml-1 text-muted-foreground">{payload[0].payload.date}</span>
    </div>
  );
};

export const VerdictHero = ({ summary, trend }: Props) => {
  const t = verdictTheme[summary.verdict];
  const Icon = t.icon;
  const total = summary.ballInCourt.aerchain + summary.ballInCourt.nse;
  const aerchainPct = total ? (summary.ballInCourt.aerchain / total) * 100 : 0;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card animate-fade-up">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full blur-[80px]" style={{ backgroundColor: `${t.color}1a` }} />
      <div className="h-[3px] w-full" style={{ backgroundColor: t.color }} />

      <div className="p-6 md:p-8">
        {/* ── Verdict statement ─────────────────────────────────────── */}
        <div className="flex items-start gap-4">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", t.soft)}>
            <Icon className="h-6 w-6" style={{ color: t.color }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", t.soft, t.text)}>
                {t.label}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">{summary.windowLabel}</span>
            </div>
            <h1 className="mt-1.5 font-display text-[22px] font-bold leading-snug tracking-tight md:text-[26px]">
              {summary.statement}
            </h1>
          </div>
        </div>

        {/* ── Hero grid ─────────────────────────────────────────────── */}
        <div className="mt-7 grid gap-6 lg:grid-cols-[1.15fr_1fr]">

          {/* SLA compliance + trend */}
          <div className="rounded-2xl border border-border/60 bg-secondary/20 p-5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">SLA Compliance</div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="font-display text-5xl font-black tracking-tight" style={{ color: t.color }}>
                    {summary.slaCompliance}<span className="text-2xl">%</span>
                  </span>
                  <Delta value={summary.slaDelta} unit="pts" goodWhenUp />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">Target</div>
                <div className="text-lg font-bold text-foreground">{SLA_TARGET}%</div>
              </div>
            </div>

            <div className="mt-4 h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, bottom: 0, left: 0, right: 0 }}>
                  <defs>
                    <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={t.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={t.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip content={<TrendTip />} cursor={{ stroke: t.color, strokeOpacity: 0.3 }} />
                  <ReferenceLine y={SLA_TARGET} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Area type="monotone" dataKey="compliance" stroke={t.color} strokeWidth={2.5} fill="url(#compGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/60">
              <span>30 days ago</span>
              <span>Today · 7-day rolling</span>
            </div>
          </div>

          {/* Pulse + ball-in-court */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              {summary.pulse.map((p) => (
                <div key={p.key} className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="text-[11px] font-medium text-muted-foreground">{p.label}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-display text-2xl font-black tracking-tight">{p.value.toLocaleString()}</span>
                    <Delta value={p.delta} unit="%" goodWhenUp={p.goodWhenUp} small />
                  </div>
                </div>
              ))}
            </div>

            {/* Ball in court */}
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span>Ball in court</span>
                <span className="text-[10px]">{total} open</span>
              </div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-violet-500" style={{ width: `${aerchainPct}%` }} />
                <div className="h-full bg-sky-400" style={{ width: `${100 - aerchainPct}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  <span className="font-semibold text-foreground">{summary.ballInCourt.aerchain}</span>
                  <span className="text-muted-foreground">Aerchain</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">NSE</span>
                  <span className="font-semibold text-foreground">{summary.ballInCourt.nse}</span>
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Delta = ({ value, unit, goodWhenUp, small }: {
  value: number | null; unit: string; goodWhenUp: boolean; small?: boolean;
}) => {
  if (value === null) {
    return <span className={cn("inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 font-bold text-muted-foreground", small ? "text-[10px]" : "text-[11px]")}>new</span>;
  }
  if (value === 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 font-bold text-muted-foreground", small ? "text-[10px]" : "text-[11px]")}>
        <Minus className="h-3 w-3" /> 0{unit}
      </span>
    );
  }
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-bold",
      small ? "text-[10px]" : "text-[11px]",
      good ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
    )}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{value}{unit}
    </span>
  );
};
