import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, CheckCircle2, Clock, Zap, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";

const sparklineData = [
  { value: 40 }, { value: 30 }, { value: 45 }, { value: 35 }, { value: 55 }, { value: 48 }, { value: 60 }
];

interface Props {
  tickets: Ticket[];
}

export const KPIStrip = ({ tickets }: Props) => {
  const kpis = useMemo(() => {
    const total = tickets.length || 1248;
    const resolved = tickets.filter((t) => [4, 5].includes(t.status)).length || 1156;
    const criticalOpen = tickets.filter((t) => t.priority === 4 && t.status === 2).length;
    const breachedPct = total > 0 ? Math.round(((total - resolved) / total) * 100) : 8;
    const healthScore = Math.max(60, 100 - breachedPct - criticalOpen * 2);

    return [
      {
        label: "Service Health Score",
        value: `${healthScore}%`,
        trend: "+ 3%",
        trendDir: "up" as const,
        trendGood: true,
        icon: Activity,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
        chartColor: "#10b981",
      },
      {
        label: "Tickets Created",
        value: total > 4 ? total.toLocaleString() : "1,248",
        trend: "+ 14%",
        trendDir: "up" as const,
        trendGood: false,
        icon: Zap,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
        chartColor: "#3b82f6",
      },
      {
        label: "Tickets Resolved",
        value: resolved > 0 ? resolved.toLocaleString() : "1,156",
        trend: "+ 18%",
        trendDir: "up" as const,
        trendGood: true,
        icon: CheckCircle2,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
        chartColor: "#10b981",
      },
      {
        label: "Avg. Response Time",
        value: "18m",
        trend: "5m",
        trendDir: "down" as const,
        trendGood: true,
        icon: Clock,
        color: "text-purple-500",
        bg: "bg-purple-500/10",
        chartColor: "#a855f7",
      },
      {
        label: "Avg. Resolution Time",
        value: "4h 32m",
        trend: "18m",
        trendDir: "down" as const,
        trendGood: true,
        icon: AlertCircle,
        color: "text-orange-500",
        bg: "bg-orange-500/10",
        chartColor: "#f97316",
      },
    ];
  }, [tickets]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border-none shadow-sm overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={cn("p-2 rounded-lg", kpi.bg)}>
                <kpi.icon className={cn("h-5 w-5", kpi.color)} />
              </div>
              <span className="text-sm font-medium text-muted-foreground">{kpi.label}</span>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold">{kpi.value}</div>
                <div className={cn(
                  "flex items-center gap-1 text-xs font-medium mt-1",
                  kpi.trendGood
                    ? (kpi.trendDir === "up" ? "text-emerald-600" : "text-emerald-600")
                    : "text-rose-600"
                )}>
                  {kpi.trendDir === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {kpi.trend}
                  <span className="text-muted-foreground font-normal ml-1">vs last 7d</span>
                </div>
              </div>

              <div className="h-12 w-20">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparklineData}>
                    <Line type="monotone" dataKey="value" stroke={kpi.chartColor} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
