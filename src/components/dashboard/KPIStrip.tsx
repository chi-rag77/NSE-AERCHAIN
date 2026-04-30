import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, CheckCircle2, Clock, Zap, AlertCircle } from "lucide-react";

const kpis = [
  {
    label: "Service Health",
    value: "98.2%",
    description: "Tickets resolved in SLA",
    icon: Activity,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    label: "Closed Today",
    value: "24",
    description: "+4 from yesterday",
    icon: CheckCircle2,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    label: "Avg First Response",
    value: "12m",
    description: "Target: < 30m",
    icon: Zap,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    label: "Avg Resolution",
    value: "4.2h",
    description: "Target: < 8h",
    icon: Clock,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    label: "Critical Tickets",
    value: "3",
    description: "Immediate action",
    icon: AlertCircle,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
];

export const KPIStrip = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className={cn("p-2 rounded-lg", kpi.bg)}>
                <kpi.icon className={cn("h-4 w-4", kpi.color)} />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {kpi.label}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tracking-tight">{kpi.value}</span>
              <span className="text-xs text-muted-foreground mt-1">{kpi.description}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

import { cn } from "@/lib/utils";