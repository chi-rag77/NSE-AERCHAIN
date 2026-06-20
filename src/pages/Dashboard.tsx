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

const Body = ({ tickets, isLoading, openTicket }: {
  tickets: Ticket[];
  isLoading: boolean;
  openTicket: (t: Ticket) => void;
}) => {
  const metrics = useMemo(() => computeMetrics(tickets), [tickets]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-64 animate-pulse rounded-3xl bg-card" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="h-80 animate-pulse rounded-2xl bg-card xl:col-span-2" />
          <div className="h-80 animate-pulse rounded-2xl bg-card" />
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-card" />
        <div className="h-64 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Command center hero */}
      <HealthHero metrics={metrics} />

      {/* 5-column KPI strip */}
      <MetricStrip metrics={metrics} />

      {/* Priority queue + live activity */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <PriorityQueue tickets={tickets} onRowClick={openTicket} />
        </div>
        <div className="xl:col-span-2">
          <ActivityFeed />
        </div>
      </div>

      {/* Analytics charts row */}
      <OverviewCharts tickets={tickets} />

      {/* Recurring issues + agent leaderboard */}
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
