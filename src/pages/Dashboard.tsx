import { useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { HealthHero } from "@/components/dashboard/HealthHero";
import { MetricStrip } from "@/components/dashboard/MetricStrip";
import { PriorityQueue } from "@/components/dashboard/PriorityQueue";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { BottomGrid } from "@/components/dashboard/BottomGrid";
import { OverviewCharts } from "@/components/analytics/OverviewCharts";
import { computeMetrics } from "@/lib/tickets";
import { Ticket } from "@/types/freshdesk";

const Body = ({ tickets, isLoading, openTicket }: { tickets: Ticket[]; isLoading: boolean; openTicket: (t: Ticket) => void }) => {
  const metrics = useMemo(() => computeMetrics(tickets), [tickets]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-56 animate-pulse rounded-3xl bg-card" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthHero metrics={metrics} />
      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <PriorityQueue tickets={tickets} onRowClick={openTicket} />
          <OverviewCharts tickets={tickets} />
        </div>
        <ActivityFeed />
      </div>

      <BottomGrid />
    </div>
  );
};

const Dashboard = () => (
  <AppShell>
    {(props) => <Body {...props} />}
  </AppShell>
);

export default Dashboard;
