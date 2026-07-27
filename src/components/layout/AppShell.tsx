import { ReactNode, useState } from "react";
import { Header } from "./Header";
import { CommandPalette } from "./CommandPalette";
import { TicketDrawer } from "@/components/tickets/TicketDrawer";
import { useTickets } from "@/hooks/useTickets";
import { useSlackNotifications } from "@/hooks/useSlackNotifications";
import { Ticket, Conversation } from "@/types/freshdesk";
import { fetchConversations } from "@/services/freshdesk";

interface ShellRenderProps {
  tickets: Ticket[];
  isLoading: boolean;
  openTicket: (t: Ticket) => void;
}

interface Props {
  children: (props: ShellRenderProps) => ReactNode;
}

export const AppShell = ({ children }: Props) => {
  const { tickets, isLoading, isRefreshing, lastUpdated, refresh } = useTickets();
  useSlackNotifications(tickets);
  const [cmdOpen, setCmdOpen] = useState(false);

  const [selected, setSelected] = useState<Ticket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      />

      <main className="flex-1 overflow-y-auto app-canvas">
        <div className="mx-auto max-w-[1640px] px-4 py-6 md:px-8 md:py-8">
          {children({ tickets, isLoading, openTicket })}
        </div>
      </main>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        tickets={tickets}
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
