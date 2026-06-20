import { useCallback, useEffect, useState } from "react";
import { fetchTickets, triggerSync } from "@/services/freshdesk";
import { isSupabaseConfigured } from "@/services/supabase";
import { Ticket } from "@/types/freshdesk";
import { showSuccess, showError } from "@/utils/toast";

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

  // initialLoad: just read from Supabase. manualRefresh: trigger a fresh
  // Freshdesk → Supabase sync first, then read.
  const load = useCallback(async (mode: "initial" | "auto" | "manual") => {
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);
    try {
      if (mode === "manual" && isSupabaseConfigured) {
        const res = await triggerSync();
        if (!res.ok) showError(res.error ?? "Sync failed");
      }
      const data = await fetchTickets();
      setTickets(data);
      setLastUpdated(new Date());
      if (mode === "manual") showSuccess("Tickets refreshed");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load tickets");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
    if (!autoRefreshMs) return;
    const id = setInterval(() => load("auto"), autoRefreshMs);
    return () => clearInterval(id);
  }, [load, autoRefreshMs]);

  return { tickets, isLoading, isRefreshing, lastUpdated, refresh: () => load("manual") };
};
