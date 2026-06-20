import { useCallback, useEffect, useState } from "react";
import { fetchTickets } from "@/services/freshdesk";
import { Ticket } from "@/types/freshdesk";
import { showSuccess } from "@/utils/toast";

interface UseTicketsResult {
  tickets: Ticket[];
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}

/**
 * Central ticket store with silent auto-refresh every 60s.
 */
export const useTickets = (autoRefreshMs = 60000): UseTicketsResult => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (silent: boolean) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const data = await fetchTickets();
      setTickets(data);
      setLastUpdated(new Date());
      if (silent) showSuccess("Tickets refreshed");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    if (!autoRefreshMs) return;
    const id = setInterval(() => load(true), autoRefreshMs);
    return () => clearInterval(id);
  }, [load, autoRefreshMs]);

  return { tickets, isLoading, isRefreshing, lastUpdated, refresh: () => load(true) };
};
