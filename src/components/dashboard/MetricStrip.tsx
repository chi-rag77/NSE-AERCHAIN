import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Zap, CheckCircle2, Clock, AlertOctagon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "@/lib/tickets";

interface Props {
  metrics: DashboardMetrics;
}

const spark = (seed: number) =>
  Array.from({ length: 9 }, (_, i) => ({
    v: 30 + Math.round(Math.abs(Math.sin(seed + i * 0.9)) * 40),
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
        color: "#6366f1",
        tint: "bg-indigo-500/10 text-indigo-500",
      },
      {
        label: "Resolved",
        value: metrics.resolved.toLocaleString(),
        delta: "+18%",
        up: true,
        good: true,
        icon: CheckCircle2,
        color: "#10b981",
        tint: "bg-emerald-500/10 text-emerald-500",
      },
      {
        label: "Avg. Response",
        value: "18m",
        delta: "-5m",
        up: false,
        good: true,
        icon: Clock,
        color: "#0ea5e9",
        tint: "bg-sky-500/10 text-sky-500",
      },
      {
        label: "Critical Open",
        value: String(metrics.critical),
        delta: metrics.critical > 0 ? "Action" : "Clear",
        up: metrics.critical > 0,
        good: metrics.critical === 0,
        icon: AlertOctagon,
        color: "#f43f5e",
        tint: "bg-rose-500/10 text-rose-500",
      },
    ],
    [metrics]
  );

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((c, idx) => (
        <div
          key={c.label}
          className="card-elevated group animate-fade-up p-5"
          style={{ animationDelay: `${idx * 60}ms` }}
        >
          <div className="flex items-start justify-between">
            <div className={cn("grid h-10 w-10 place-items-center rounded-xl", c.tint)}>
              <c.icon className="h-5 w-5" />
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                c.good ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
              )}
            >
              {c.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {c.delta}
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-2">
            <div>
              <div className="text-2xl font-bold tracking-tight">{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
            <div className="h-10 w-20 opacity-70 transition-opacity group-hover:opacity-100">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spark(idx + 1)}>
                  <Line type="monotone" dataKey="v" stroke={c.color} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
