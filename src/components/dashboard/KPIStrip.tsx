import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Clock, AlertCircle, Zap, TrendingUp } from 'lucide-react';

const KPIStrip = () => {
  const kpis = [
    {
      label: "Service Health",
      value: "98.4%",
      sub: "+1.2% from last week",
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-50"
    },
    {
      label: "Closed Today",
      value: "24",
      sub: "Target: 30",
      icon: CheckCircle2,
      color: "text-blue-500",
      bg: "bg-blue-50"
    },
    {
      label: "Avg Response",
      value: "14m",
      sub: "Within SLA",
      icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-50"
    },
    {
      label: "Avg Resolution",
      value: "3.2h",
      sub: "NSE Standard: 4h",
      icon: Clock,
      color: "text-indigo-500",
      bg: "bg-indigo-50"
    },
    {
      label: "Critical Active",
      value: "03",
      sub: "Immediate Action",
      icon: AlertCircle,
      color: "text-rose-500",
      bg: "bg-rose-50"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {kpis.map((kpi, i) => (
        <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-2 rounded-xl transition-colors", kpi.bg)}>
                <kpi.icon className={kpi.color} size={20} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{kpi.label}</p>
              <h3 className="text-2xl font-bold tracking-tight">{kpi.value}</h3>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {kpi.sub}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

import { cn } from '@/lib/utils';
export default KPIStrip;