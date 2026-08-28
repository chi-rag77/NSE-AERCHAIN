import { ReactNode, useMemo, useState } from "react";
import { Header } from "./Header";
import { CommandPalette } from "./CommandPalette";
import { TicketDrawer } from "@/components/tickets/TicketDrawer";
import { useTickets } from "@/hooks/useTickets";
import { Ticket, Conversation } from "@/types/freshdesk";
import { fetchConversations } from "@/services/freshdesk";
import { ALL_CUSTOMERS } from "@/config";

interface ShellRenderProps {
  tickets: Ticket[];
  isLoading: boolean;
  openTicket: (t: Ticket) => void;
  /** Human label for the active customer filter ("All customers" or a name). */
  companyLabel: string;
}

interface Props {
  children: (props: ShellRenderProps) => ReactNode;
}

export const AppShell = ({ children }: Props) => {
  const { tickets, isLoading, isRefreshing, lastUpdated, refresh } = useTickets();
  // Manual re-sync is open to anonymous public-mode visitors too — safe
  // because sync-freshdesk self-throttles server-side (see its own header
  // comment), so spamming this button can't run up Freshdesk API cost or
  // hit its rate limit regardless of who's clicking.
  const [cmdOpen, setCmdOpen] = useState(false);
  // Default to NSE instead of ALL_CUSTOMERS — NSE is the primary customer
  // and users want to see NSE-specific data on first load.
  const [company, setCompany] = useState<string>("NSE");

  const [selected, setSelected] = useState<Ticket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Distinct customers present in the data (drives the header filter).
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickets) {
      const name = (t.company_name ?? "").trim();
      if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tickets]);

  // Tickets scoped to the selected customer (or all).
  const visibleTickets = useMemo(
    () => (company === ALL_CUSTOMERS ? tickets : tickets.filter((t) => (t.company_name ?? "").trim() === company)),
    [tickets, company],
  );

  const companyLabel = company === ALL_CUSTOMERS ? "All customers" : company;

  const openTicket = async (t: Ticket) => {
    setSelected(t);
    setDrawerOpen(true);
    setConversations(await fetchConversations(t.id));
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header
        onOpenCommand={() => setCmdOpen(true)}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        companies={companies}
        selectedCompany={company}
        onSelectCompany={setCompany}
      />

      <main className="flex-1 overflow-y-auto app-canvas">
        <div className="mx-auto max-w-[1640px] px-4 py-6 md:px-8 md:py-8">
          {children({ tickets: visibleTickets, isLoading, openTicket, companyLabel })}
        </div>
      </main>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        tickets={visibleTickets}
        onSelectTicket={openTicket}
        onRefresh={refresh}
      />

      <TicketDrawer
        ticket={selected}
        conversations={conversations}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
};
