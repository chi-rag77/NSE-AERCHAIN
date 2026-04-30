import React, { useState } from 'react';
import Header from '@/components/layout/Header';
import KPIStrip from '@/components/dashboard/KPIStrip';
import ServiceStatusBar from '@/components/dashboard/ServiceStatusBar';
import TicketTable from '@/components/dashboard/TicketTable';
import TicketDrawer from '@/components/dashboard/TicketDrawer';
import { Ticket } from '@/types/freshdesk';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Download, Filter, RefreshCw } from 'lucide-react';

const Index = () => {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleRowClick = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setIsDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] text-foreground selection:bg-primary/10">
      <Header />
      
      <main className="container px-8 py-8 space-y-8">
        {/* Page Title & Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">NSE Command Center</h1>
            <p className="text-muted-foreground mt-1">Monitoring National Stock Exchange of India support operations.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-full gap-2 bg-white shadow-sm">
              <RefreshCw size={16} />
              Sync Freshdesk
            </Button>
            <Button variant="outline" className="rounded-full gap-2 bg-white shadow-sm">
              <Download size={16} />
              Export Report
            </Button>
            <Button className="rounded-full gap-2 shadow-lg shadow-primary/20">
              New Ticket
            </Button>
          </div>
        </div>

        {/* KPI Section */}
        <KPIStrip />

        {/* Service Status Section */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <ServiceStatusBar />
        </div>

        {/* Live Tickets Section */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <Tabs defaultValue="all" className="w-full md:w-auto">
              <TabsList className="bg-white border p-1 rounded-full h-11">
                <TabsTrigger value="all" className="rounded-full px-6">All Tickets</TabsTrigger>
                <TabsTrigger value="on-track" className="rounded-full px-6">On Track</TabsTrigger>
                <TabsTrigger value="attention" className="rounded-full px-6">Attention</TabsTrigger>
                <TabsTrigger value="immediate" className="rounded-full px-6">Immediate</TabsTrigger>
              </TabsList>
            </Tabs>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="rounded-full gap-2 text-muted-foreground">
                <Filter size={14} />
                Filters
              </Button>
              <div className="h-4 w-[1px] bg-slate-200 mx-2"></div>
              <span className="text-xs font-medium text-muted-foreground">Showing 4 of 128 tickets</span>
            </div>
          </div>

          <TicketTable onRowClick={handleRowClick} />
        </div>
      </main>

      <TicketDrawer 
        ticket={selectedTicket} 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
      />
    </div>
  );
};

export default Index;