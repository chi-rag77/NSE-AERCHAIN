import React, { useState, useEffect } from "react";
import { Header } from "../components/layout/Header";
import { KPIStrip } from "../components/dashboard/KPIStrip";
import { ServiceStatusBar } from "../components/dashboard/ServiceStatusBar";
import { TicketTable } from "../components/tickets/TicketTable";
import { TicketDrawer } from "../components/tickets/TicketDrawer";
import { OverviewCharts } from "../components/analytics/OverviewCharts";
import { fetchTickets, fetchConversations } from "../services/freshdesk";
import { Ticket, Conversation } from "../types/freshdesk";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Filter, Download } from "lucide-react";
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
    // Auto-refresh every 60 seconds
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRowClick = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    const convs = await fetchConversations(ticket.id);
    setConversations(convs);
    setIsDrawerOpen(true);
  };

  const handleRefresh = () => {
    loadData();
    showSuccess("Dashboard updated with latest NSE tickets");
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Header />
      
      <main className="container px-6 py-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Command Center</h1>
            <p className="text-muted-foreground mt-1">Monitoring National Stock Exchange (NSE) Support Operations</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            <Button size="sm" className="bg-primary shadow-lg shadow-primary/20">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        <KPIStrip />

        <div className="grid grid-cols-1 gap-8">
          <ServiceStatusBar />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Tabs defaultValue="all" className="w-auto">
                <TabsList className="bg-secondary/50 p-1">
                  <TabsTrigger value="all" className="text-xs px-4">All Tickets</TabsTrigger>
                  <TabsTrigger value="on-track" className="text-xs px-4">On Track</TabsTrigger>
                  <TabsTrigger value="attention" className="text-xs px-4">Attention</TabsTrigger>
                  <TabsTrigger value="immediate" className="text-xs px-4">Immediate</TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="text-xs font-medium text-muted-foreground">
                Showing {tickets.length} active tickets for NSE
              </span>
            </div>
            
            <TicketTable tickets={tickets} onRowClick={handleRowClick} />
          </div>

          <OverviewCharts />
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

import { cn } from "@/lib/utils";