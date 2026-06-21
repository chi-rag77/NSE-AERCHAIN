import { useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { VerdictHero } from "@/components/dashboard/VerdictHero";
import { AssuranceTrends } from "@/components/dashboard/AssuranceTrends";
import { AttentionPanel } from "@/components/dashboard/AttentionPanel";
import { SLABreakdownTable } from "@/components/dashboard/SLABreakdownTable";
import { buildAssurance, complianceTrend } from "@/lib/dashboardData";
import { Ticket } from "@/types/freshdesk";

const Body = ({ tickets, isLoading, openTicket }: {
  tickets: Ticket[];
  isLoading: boolean;
  openTicket: (t: Ticket) => void;
}) => {
  const summary = useMemo(() => buildAssurance(tickets), [tickets]);
  const trend = useMemo(() => complianceTrend(tickets), [tickets]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-72 animate-pulse rounded-3xl bg-card" />
        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Zone 1 — Verdict */}
      <VerdictHero summary={summary} trend={trend} />

      {/* Zone 2 — Trends */}
      <AssuranceTrends tickets={tickets} />

      {/* Zone 3 — Attention + breakdowns */}
      <AttentionPanel tickets={tickets} onOpen={openTicket} />

      {/* Zone 4 — SLA detail */}
      <SLABreakdownTable tickets={tickets} />
    </div>
  );
};

const Dashboard = () => (
  <AppShell>
    {(props) => <Body {...props} />}
  </AppShell>
);

export default Dashboard;
