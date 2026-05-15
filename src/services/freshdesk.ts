import { Ticket, Conversation } from "../types/freshdesk";
import { MOCK_TICKETS, MOCK_CONVERSATIONS } from "./mockData";

const API_KEY = import.meta.env.VITE_FRESHDESK_API_KEY as string | undefined;
const DOMAIN = import.meta.env.VITE_FRESHDESK_DOMAIN as string | undefined;
const USE_REAL_API = !!(API_KEY && DOMAIN && API_KEY !== "your_api_key_here");

const authHeaders = () => ({
  Authorization: `Basic ${btoa(`${API_KEY}:X`)}`,
  "Content-Type": "application/json",
});

export const isUsingRealAPI = () => USE_REAL_API;

export const fetchTickets = async (): Promise<Ticket[]> => {
  if (!USE_REAL_API) {
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_TICKETS), 600));
  }

  const res = await fetch(
    `https://${DOMAIN}/api/v2/tickets?include=requester,company,stats&per_page=100&order_type=desc`,
    { headers: authHeaders() }
  );

  if (!res.ok) {
    console.error("Freshdesk API error:", res.status, await res.text());
    throw new Error(`Freshdesk API returned ${res.status}`);
  }

  const data = await res.json();

  // Normalise Freshdesk response to our Ticket shape
  return (data as any[]).map((t) => ({
    id: t.id,
    subject: t.subject,
    description: t.description_text ?? t.description ?? "",
    priority: t.priority,
    status: t.status,
    created_at: t.created_at,
    updated_at: t.updated_at,
    requester_id: t.requester_id,
    company_id: t.company_id ?? 0,
    responder_id: t.responder_id ?? null,
    tags: t.tags ?? [],
    company_name: t.company?.name,
    requester_name: t.requester
      ? `${t.requester.name ?? t.requester.email}`
      : undefined,
    responder_name: undefined,
    sla_policy_id: t.sla_policy_id,
  }));
};

export const fetchConversations = async (ticketId: number): Promise<Conversation[]> => {
  if (!USE_REAL_API) {
    const convs = MOCK_CONVERSATIONS[ticketId] ?? [];
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve(
            convs.map((c) => ({
              ...c,
              body_text: c.body,
              private: false,
              updated_at: c.created_at,
              attachments: [],
            }))
          ),
        300
      )
    );
  }

  const res = await fetch(
    `https://${DOMAIN}/api/v2/tickets/${ticketId}/conversations`,
    { headers: authHeaders() }
  );

  if (!res.ok) throw new Error(`Failed to fetch conversations for ticket ${ticketId}`);

  const data = await res.json();
  return (data as any[]).map((c) => ({
    id: c.id,
    body: c.body ?? "",
    body_text: c.body_text ?? c.body ?? "",
    incoming: c.incoming,
    private: c.private ?? false,
    user_id: c.user_id,
    created_at: c.created_at,
    updated_at: c.updated_at,
    attachments: c.attachments ?? [],
  }));
};
