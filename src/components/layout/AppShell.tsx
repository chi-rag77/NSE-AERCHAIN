import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { TicketDrawer } from "@/components/tickets/TicketDrawer";
import { useTickets } from "@/hooks/useTickets";
import { Ticket, Conversation } from "@/types/freshdesk";
import { fetchConversations } from "@/services/freshdesk";

interface ShellRenderProps {
  tickets: Ticket[];
  isLoading: boolean;
  openTicket: (t: Ticket) => void;
}

interface Props {
  title: string;
  subtitle?: string;
  children: (props: ShellRenderProps) => ReactNode;
}

export const AppShell = ({ title, subtitle, children }: Props) => {
  const { tickets, isLoading, isRefreshing, lastUpdated, refresh } = useTickets();
  const [collapsed, setCollapsed] = useState(false);
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
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          subtitle={subtitle}
          onOpenCommand={() => setCmdOpen(true)}
          onRefresh={refresh}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
        />

        <main className="flex-1 overflow-y-auto grid-bg">
          <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
            {children({ tickets, isLoading, openTicket })}
          </div>
        </main>
      </div>

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
