import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Zap, CheckCircle2, Clock, AlertOctagon, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "@/lib/tickets";

interface Props { metrics: DashboardMetrics }

const spark = (seed: number) =>
  Array.from({ length: 12 }, (_, i) => ({
    v: 20 + Math.round(Math.abs(Math.sin(seed + i * 0.7) * Math.cos(seed * 0.3 + i)) * 50 + 10),
  }));

export const MetricStrip = ({ metrics }: Props) => {
  const cards = useMemo(
    () => [
      {
        label: "Open Tickets",
        value: metrics.open.toLocaleString(),
        delta: "+14%",
        up: true,
        good: false,
        icon: Zap,
        color: "#818cf8",
        gradFrom: "#6366f1",
        gradTo: "#8b5cf6",
        tintBg: "bg-indigo-500/8",
        tintText: "text-indigo-500",
        glow: "shadow-indigo-500/20",
      },
      {
        label: "Resolved",
        value: metrics.resolved.toLocaleString(),
        delta: "+22%",
        up: true,
        good: true,
        icon: CheckCircle2,
        color: "#34d399",
        gradFrom: "#10b981",
        gradTo: "#059669",
        tintBg: "bg-emerald-500/8",
        tintText: "text-emerald-500",
        glow: "shadow-emerald-500/20",
      },
      {
        label: "Avg. Response",
        value: "18m",
        delta: "-5m faster",
        up: false,
        good: true,
        icon: Clock,
        color: "#38bdf8",
        gradFrom: "#0ea5e9",
        gradTo: "#0284c7",
        tintBg: "bg-sky-500/8",
        tintText: "text-sky-500",
        glow: "shadow-sky-500/20",
      },
      {
        label: "Critical Open",
        value: String(metrics.critical),
        delta: metrics.critical > 0 ? "Needs action" : "All clear",
        up: metrics.critical > 0,
        good: metrics.critical === 0,
        icon: AlertOctagon,
        color: "#fb7185",
        gradFrom: "#f43f5e",
        gradTo: "#e11d48",
        tintBg: "bg-rose-500/8",
        tintText: "text-rose-500",
        glow: "shadow-rose-500/20",
      },
      {
        label: "SLA Compliance",
        value: `${metrics.slaCompliance}%`,
        delta: "+3.2% this week",
        up: true,
        good: true,
        icon: BarChart3,
        color: "#a78bfa",
        gradFrom: "#8b5cf6",
        gradTo: "#7c3aed",
        tintBg: "bg-violet-500/8",
        tintText: "text-violet-500",
        glow: "shadow-violet-500/20",
      },
    ],
    [metrics]
  );

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map((c, idx) => (
        <div
          key={c.label}
          className={cn(
            "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300",
            "hover:shadow-lg hover:-translate-y-0.5 hover:border-border/80",
            c.glow,
          )}
          style={{ animationDelay: `${idx * 80}ms` }}
        >
          {/* Ambient corner glow */}
          <div
            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100"
            style={{ backgroundColor: `${c.gradFrom}20` }}
          />

          <div className="relative">
            <div className="flex items-start justify-between">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", c.tintBg)}>
                <c.icon className={cn("h-4.5 w-4.5", c.tintText)} style={{ width: "18px", height: "18px" }} />
              </div>
              <span className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold",
                c.good ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              )}>
                {c.up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {c.delta}
              </span>
            </div>

            <div className="mt-3.5 flex items-end justify-between gap-2">
              <div>
                <div
                  className="text-2xl font-black tracking-tight"
                  style={{ background: `linear-gradient(135deg, ${c.gradFrom}, ${c.gradTo})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  {c.value}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{c.label}</div>
              </div>
              <div className="h-10 w-20 flex-shrink-0 opacity-50 transition-opacity duration-300 group-hover:opacity-100">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={spark(idx + 1)}>
                    <Line type="monotone" dataKey="v" stroke={c.color} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
