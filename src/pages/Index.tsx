import React, { useState, useEffect, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X, RefreshCw } from "lucide-react";
import { format, isWithinInterval, startOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { showSuccess } from "../utils/toast";

type TabValue = "all" | "on-track" | "attention" | "immediate" | "waiting";

const Index = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const data = await fetchTickets();
      setTickets(data);
      if (silent) showSuccess("Tickets refreshed");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRowClick = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    const convs = await fetchConversations(ticket.id);
    setConversations(convs);
    setIsDrawerOpen(true);
  };

  // Filter by date range
  const dateFiltered = useMemo(() => {
    if (!dateRange?.from) return tickets;
    const to = dateRange.to ?? new Date();
    return tickets.filter((t) => {
      const d = new Date(t.created_at);
      return isWithinInterval(d, { start: startOfDay(dateRange.from!), end: to });
    });
  }, [tickets, dateRange]);

  // Filter by tab
  const tabFiltered = useMemo(() => {
    switch (activeTab) {
      case "on-track":
        return dateFiltered.filter((t) => t.priority <= 2);
      case "attention":
        return dateFiltered.filter((t) => t.priority === 3);
      case "immediate":
        return dateFiltered.filter((t) => t.priority === 4);
      case "waiting":
        return dateFiltered.filter((t) => t.status === 6);
      default:
        return dateFiltered;
    }
  }, [dateFiltered, activeTab]);

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "dd MMM")} – ${format(dateRange.to, "dd MMM yyyy")}`
      : format(dateRange.from, "dd MMM yyyy")
    : "All time";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-6 py-8 space-y-8">
        {/* Date range control bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-9 gap-2 text-sm", dateRange?.from && "border-blue-500 text-blue-600")}
                >
                  <CalendarIcon size={14} />
                  {dateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {dateRange?.from && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-xs text-muted-foreground"
                onClick={() => setDateRange(undefined)}
              >
                <X size={12} /> Clear
              </Button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 text-sm"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={cn(isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* KPI Strip — driven by real ticket data */}
        <KPIStrip tickets={dateFiltered} />

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3 space-y-8">
            {/* Ticket Table with tab filtering */}
            <div className="space-y-4">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-auto">
                <TabsList className="bg-transparent border-b border-border rounded-none h-auto p-0 gap-6">
                  {[
                    { value: "all", label: "All Tickets" },
                    { value: "on-track", label: "On Track" },
                    { value: "attention", label: "Attention Needed" },
                    { value: "immediate", label: "Immediate Action" },
                    { value: "waiting", label: "Waiting on Customer" },
                  ].map(({ value, label }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 border-b-2 border-transparent rounded-none px-0 pb-2 text-xs font-semibold bg-transparent"
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {isLoading ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  Loading tickets…
                </div>
              ) : (
                <TicketTable tickets={tabFiltered} onRowClick={handleRowClick} />
              )}
            </div>

            {/* Charts — receive ticket data + date range */}
            <OverviewCharts tickets={dateFiltered} dateRange={dateRange ? { from: dateRange.from, to: dateRange.to } : undefined} />

            <BottomGrid />
          </div>

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
