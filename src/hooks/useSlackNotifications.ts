import { useEffect } from "react";
import { Ticket } from "@/types/freshdesk";
import { loadSlackConfig, runAssigneeAlerts, runSlaDigest } from "@/services/slack";

/**
 * Evaluates Slack alert rules whenever the ticket set changes (i.e. on every
 * background refresh). Frontend-only and best-effort: alerts are dispatched
 * while a user has the app open. Config is re-read each pass so Admin changes
 * take effect without a reload.
 */
export const useSlackNotifications = (tickets: Ticket[]) => {
  useEffect(() => {
    if (!tickets.length) return;
    let cancelled = false;

    (async () => {
      const cfg = await loadSlackConfig();
      if (cancelled || !cfg.enabled) return;
      await runAssigneeAlerts(tickets, cfg);
      await runSlaDigest(tickets, cfg);
    })();

    return () => {
      cancelled = true;
    };
  }, [tickets]);
};
