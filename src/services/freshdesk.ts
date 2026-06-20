// ============================================================================
// Data layer
//
// The frontend reads tickets/conversations from Supabase (populated by the
// sync-freshdesk Edge Function). When Supabase is not configured it falls back
// to bundled mock data, so the UI still renders in demo mode.
//
// Function names are kept (`fetchTickets`, `fetchConversations`,
// `isUsingRealAPI`) for backwards-compatibility with existing imports.
// ============================================================================

import { Ticket, Conversation } from "../types/freshdesk";
import { MOCK_TICKETS, MOCK_CONVERSATIONS } from "./mockData";
import { supabase, isSupabaseConfigured } from "./supabase";

export const isUsingRealAPI = () => isSupabaseConfigured;

/** Trigger a Freshdesk → Supabase sync via the Edge Function. */
export const triggerSync = async (): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase.functions.invoke("sync-freshdesk", { body: {} });
  if (error) return { ok: false, error: error.message };
  return { ok: data?.ok ?? true };
};

export const fetchTickets = async (): Promise<Ticket[]> => {
  if (!supabase) {
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_TICKETS), 400));
  }

  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Supabase tickets error:", error.message);
    throw new Error(error.message);
  }

  return (data ?? []).map((t) => ({
    id: t.id,
    subject: t.subject ?? "",
    description: t.description ?? "",
    priority: t.priority,
    status: t.status,
    created_at: t.created_at,
    updated_at: t.updated_at,
    requester_id: t.requester_id ?? 0,
    company_id: t.company_id ?? 0,
    responder_id: t.responder_id ?? null,
    tags: t.tags ?? [],
    company_name: t.company_name ?? undefined,
    requester_name: t.requester_name ?? undefined,
    responder_name: t.responder_name ?? undefined,
    sla_policy_id: t.sla_policy_id ?? undefined,
  }));
};

export const fetchConversations = async (ticketId: number): Promise<Conversation[]> => {
  if (!supabase) {
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
        200
      )
    );
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => ({
    id: c.id,
    body: c.body ?? "",
    body_text: c.body_text ?? c.body ?? "",
    incoming: c.incoming,
    private: c.private ?? false,
    user_id: c.user_id ?? 0,
    created_at: c.created_at,
    updated_at: c.updated_at,
    attachments: c.attachments ?? [],
  }));
};
