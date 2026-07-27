// ============================================================================
// Slack integration — 100% frontend, no backend dependency.
//
// Uses Slack *Incoming Webhooks*: an admin creates a webhook URL in their
// Slack workspace (https://api.slack.com/messaging/webhooks) and pastes it in
// the Admin → Slack screen. Messages are POSTed straight from the browser.
//
// Browser/CORS note: Slack's hooks.slack.com endpoint does not return CORS
// headers, so we send the payload form-encoded (`payload=…`) with
// `mode: "no-cors"`. That shape is a "simple" request (no preflight) and is
// delivered by the browser, but the response is opaque — we cannot read
// Slack's success/failure from JS. Callers therefore treat a resolved promise
// as "sent" (best-effort). This is an inherent limitation of no-backend Slack.
//
// Because there is no server, alerts are evaluated in the browser while a user
// has the dashboard open, and de-duplication is per-browser (localStorage).
// ============================================================================

import { Ticket } from "@/types/freshdesk";
import { computeSLA, priorityLabel, statusLabel } from "@/lib/tickets";
import { loadSetting, saveSetting } from "@/services/settings";

export interface SlackConfig {
  /** Master switch for the whole integration. */
  enabled: boolean;
  /** Webhook posted to when a ticket is newly assigned (team channel). */
  assigneeWebhookUrl: string;
  /** Webhook for the SLA reminder digest (group channel). */
  slaWebhookUrl: string;
  /** Fire assignee alerts. */
  notifyAssignee: boolean;
  /** Fire the SLA reminder digest. */
  notifySla: boolean;
  /** Minimum hours between SLA digests (throttle). */
  slaReminderHours: number;
  /** Optional Freshdesk domain (e.g. company.freshdesk.com) for deep links. */
  freshdeskDomain: string;
  /** Map an agent (lowercased Freshdesk name) → Slack member ID for @mentions. */
  userMap: Record<string, string>;
}

export const DEFAULT_SLACK_CONFIG: SlackConfig = {
  enabled: false,
  assigneeWebhookUrl: "",
  slaWebhookUrl: "",
  notifyAssignee: true,
  notifySla: true,
  slaReminderHours: 4,
  freshdeskDomain: "",
  userMap: {},
};

const CONFIG_KEY = "slack_config";
const SEEN_KEY = "nse-slack-seen-assignments"; // { [ticketId]: responder_id | null }
const SLA_TS_KEY = "nse-slack-sla-last-sent"; // epoch ms of last digest

/* ── Config persistence ──────────────────────────────────────────────────── */

export const loadSlackConfig = async (): Promise<SlackConfig> => {
  const raw = await loadSetting(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_SLACK_CONFIG };
  try {
    return { ...DEFAULT_SLACK_CONFIG, ...(JSON.parse(raw) as Partial<SlackConfig>) };
  } catch {
    return { ...DEFAULT_SLACK_CONFIG };
  }
};

export const saveSlackConfig = (cfg: SlackConfig) =>
  saveSetting(CONFIG_KEY, JSON.stringify(cfg));

/* ── Delivery ────────────────────────────────────────────────────────────── */

export const isSlackWebhook = (url: string) =>
  /^https:\/\/hooks\.slack\.com\/(services|triggers)\//.test((url ?? "").trim());

/**
 * Deliver a Slack message payload to an incoming webhook. Best-effort: resolves
 * `{ ok: true }` once the request is dispatched (the opaque no-cors response
 * cannot be inspected). Returns `{ ok: false }` only for a clearly invalid URL
 * or a thrown network error.
 */
export const postToSlack = async (
  webhookUrl: string,
  message: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> => {
  const url = (webhookUrl ?? "").trim();
  if (!isSlackWebhook(url)) {
    return { ok: false, error: "Enter a valid https://hooks.slack.com/… webhook URL" };
  }
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      // URLSearchParams → application/x-www-form-urlencoded (a simple request,
      // so no CORS preflight). Slack accepts the legacy `payload=` form.
      body: new URLSearchParams({ payload: JSON.stringify(message) }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reach Slack" };
  }
};

/* ── Message builders ────────────────────────────────────────────────────── */

const priorityEmoji = (p: number) =>
  p === 4 ? ":red_circle:" : p === 3 ? ":large_orange_circle:" : p === 2 ? ":large_blue_circle:" : ":large_green_circle:";

const ticketDeepLink = (t: Ticket, domain: string): string | null => {
  const d = (domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return d ? `https://${d}/a/tickets/${t.id}` : null;
};

export const buildAssigneeMessage = (t: Ticket, cfg: SlackConfig): Record<string, unknown> => {
  const slackId = cfg.userMap[(t.responder_name ?? "").trim().toLowerCase()];
  const mention = slackId ? `<@${slackId}>` : `*${t.responder_name ?? "there"}*`;
  const link = ticketDeepLink(t, cfg.freshdeskDomain);
  const lines = [
    `:bell: ${mention} — a ticket has been assigned to you`,
    `${priorityEmoji(t.priority)} *#${t.id}* — ${t.subject}`,
    `*Priority:* ${priorityLabel(t.priority)}   ·   *Status:* ${statusLabel(t.status)}${t.requester_name ? `   ·   *Requester:* ${t.requester_name}` : ""}`,
  ];
  if (link) lines.push(`<${link}|Open in Freshdesk →>`);
  return { text: lines.join("\n"), unfurl_links: false };
};

export const buildSlaDigest = (tickets: Ticket[]): Record<string, unknown> | null => {
  const scored = tickets
    .map((t) => ({ t, sla: computeSLA(t) }))
    .filter((x) => x.sla.state === "breached" || x.sla.state === "attention")
    .sort((a, b) => a.sla.remainingMinutes - b.sla.remainingMinutes);

  if (!scored.length) return null;

  const breached = scored.filter((x) => x.sla.state === "breached").length;
  const atRisk = scored.filter((x) => x.sla.state === "attention").length;

  const line = ({ t, sla }: (typeof scored)[number]) => {
    const dot = sla.state === "breached" ? ":red_circle:" : ":large_orange_circle:";
    const state = sla.state === "breached" ? `breached (${sla.remaining} overdue)` : `${sla.remaining} left`;
    const who = t.responder_name ? ` · _${t.responder_name}_` : " · _unassigned_";
    return `${dot} *#${t.id}* ${t.subject} — ${state}${who}`;
  };

  const text = [
    ":rotating_light: *SLA Watch — NSE Support*",
    `*${breached}* breached · *${atRisk}* at risk · updated ${new Date().toLocaleString()}`,
    "",
    ...scored.slice(0, 15).map(line),
    scored.length > 15 ? `_…and ${scored.length - 15} more_` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { text, unfurl_links: false };
};

/* ── localStorage helpers ────────────────────────────────────────────────── */

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — non-fatal */
  }
};

/* ── Triggers (called from the ticket refresh loop) ──────────────────────── */

/**
 * Alert the assignee for any newly created or newly (re)assigned ticket.
 * The first run establishes a baseline silently so existing tickets don't
 * flood the channel; only changes after that fire alerts.
 */
export const runAssigneeAlerts = async (tickets: Ticket[], cfg: SlackConfig): Promise<void> => {
  if (!cfg.enabled || !cfg.notifyAssignee || !isSlackWebhook(cfg.assigneeWebhookUrl)) return;

  const seen = readJson<Record<string, number | null> | null>(SEEN_KEY, null);

  // First run: baseline current state without alerting.
  if (seen === null) {
    const baseline: Record<string, number | null> = {};
    tickets.forEach((t) => (baseline[t.id] = t.responder_id ?? null));
    writeJson(SEEN_KEY, baseline);
    return;
  }

  // Rebuild from the current set so the map can't grow unbounded; the recency
  // guard below stops a ticket that briefly left the window from re-alerting.
  const next: Record<string, number | null> = {};
  const now = Date.now();
  const RECENT_MS = 3 * 24 * 60 * 60 * 1000; // ignore backfilled tickets older than 3 days

  for (const t of tickets) {
    const assigned = t.responder_id ?? null;
    const prev = seen[t.id];
    const newlyAssigned = assigned != null && prev !== assigned;
    const recent = now - new Date(t.created_at).getTime() < RECENT_MS;
    if (newlyAssigned && recent) {
      await postToSlack(cfg.assigneeWebhookUrl, buildAssigneeMessage(t, cfg));
    }
    next[t.id] = assigned;
  }

  writeJson(SEEN_KEY, next);
};

/** Post an SLA digest to the group channel, throttled to `slaReminderHours`. */
export const runSlaDigest = async (tickets: Ticket[], cfg: SlackConfig): Promise<void> => {
  if (!cfg.enabled || !cfg.notifySla || !isSlackWebhook(cfg.slaWebhookUrl)) return;

  const last = Number(localStorage.getItem(SLA_TS_KEY) || 0);
  const now = Date.now();
  const intervalMs = Math.max(1, cfg.slaReminderHours) * 60 * 60 * 1000;
  if (now - last < intervalMs) return;

  const digest = buildSlaDigest(tickets);
  if (!digest) return; // nothing at risk — keep the timer so it fires once one appears

  const res = await postToSlack(cfg.slaWebhookUrl, digest);
  if (res.ok) {
    try {
      localStorage.setItem(SLA_TS_KEY, String(now));
    } catch {
      /* non-fatal */
    }
  }
};
