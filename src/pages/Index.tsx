import React, { useState, useEffect } from "react";
import { Header } from "../components/layout/Header";
import { KPIStrip } from "../components/dashboard/KPIStrip";
import { TicketTable } from "../components/tickets/TicketTable";
import { TicketDrawer } from "../components/tickets/TicketDrawer";
import { OverviewCharts } from "../components/analytics/OverviewCharts";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { BottomGrid } from "../components/dashboard/BottomGrid";
import { fetchTickets, fetchConversations } from "../services/freshdesk";
import { Ticket, Conversation } from "../types/freshdesk";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showSuccess } from "../utils/toast";

const Index = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    const data = await fetchTickets();
    setTickets(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRowClick = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    const convs = await fetchConversations(ticket.id);
    setConversations(convs);
    setIsDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Header />
      
      <main className="container px-6 py-8 space-y-8">
        {/* Top KPI Strip */}
        <KPIStrip />

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Main Content Area */}
          <div className="xl:col-span-3 space-y-8">
            {/* Live Ticket Table Section */}
            <div className="space-y-4">
              <Tabs defaultValue="all" className="w-auto">
                <TabsList className="bg-transparent border-b border-slate-200 rounded-none h-auto p-0 gap-6">
                  <TabsTrigger value="all" className="data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 border-b-2 border-transparent rounded-none px-0 pb-2 text-xs font-semibold bg-transparent">All Tickets</TabsTrigger>
                  <TabsTrigger value="on-track" className="data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 border-b-2 border-transparent rounded-none px-0 pb-2 text-xs font-semibold bg-transparent">On Track</TabsTrigger>
                  <TabsTrigger value="attention" className="data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 border-b-2 border-transparent rounded-none px-0 pb-2 text-xs font-semibold bg-transparent">Attention Needed</TabsTrigger>
                  <TabsTrigger value="immediate" className="data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 border-b-2 border-transparent rounded-none px-0 pb-2 text-xs font-semibold bg-transparent">Immediate Action</TabsTrigger>
                  <TabsTrigger value="waiting" className="data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 border-b-2 border-transparent rounded-none px-0 pb-2 text-xs font-semibold bg-transparent">Waiting on Customer</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <TicketTable tickets={tickets} onRowClick={handleRowClick} />
            </div>

            {/* Analytics Charts Grid */}
            <OverviewCharts />

            {/* Bottom Grid (Recurring Issues & Performance) */}
            <BottomGrid />
          </div>

          {/* Right Sidebar (Activity Feed) */}
          <div className="xl:col-span-1">
            <ActivityFeed />
          </div>
        </div>
      </main>

      <TicketDrawer 
        ticket={selectedTicket}
        conversations={conversations}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
};

export default Index;