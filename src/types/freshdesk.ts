export type Priority = 1 | 2 | 3 | 4; // 1: Low, 2: Medium, 3: High, 4: Urgent
// Real NSE Freshdesk status codes:
//   2 Open · 3 Pending · 4 Resolved · 5 Closed · 7 On Tech · 8 Waiting on Customer · 9 On Product
export type Status = 2 | 3 | 4 | 5 | 7 | 8 | 9;

/** Freshdesk ticket "Type" (Query / Bug / Tech-Task / Service Task / Requirement / CS Task / …) */
export type TicketType = string | null;

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  priority: Priority;
  status: Status;
  created_at: string;
  updated_at: string;
  requester_id: number;
  company_id: number;
  responder_id: number | null;
  tags: string[];
  // Freshdesk-native classification fields
  ticket_type: TicketType;     // Freshdesk "Type" (Query/Bug/Tech-Task/Service Task/…)
  module: string | null;       // cf_module — PO / Invoice / GRN / PR / RFQ-QC / …
  sub_type: string | null;     // cf_issue_type — Slowness / Login / Integration / …
  // Freshdesk stats (resolved_at, first_responded_at from include=stats)
  fr_due_by: string | null;
  due_by: string | null;
  fr_escalated: boolean;
  is_escalated: boolean;
  spam: boolean;
  // Agent / company metadata
  company_name?: string;
  requester_name?: string;
  requester_email?: string;
  responder_name?: string;
  sla_policy_id?: number;
  // All Freshdesk custom_fields as a passthrough bag
  custom_fields: Record<string, unknown>;
}

export interface Conversation {
  id: number;
  body: string;
  body_text: string;
  incoming: boolean;
  private: boolean;
  user_id: number;
  created_at: string;
  updated_at: string;
  attachments: any[];
}

/* ----------------------------------------------------------------------------
 * Freshdesk webhooks — the trigger for auto-analyze-ticket
 *
 * A Freshdesk automation rule ("Ticket is updated" → "Trigger webhook") posts a
 * JSON body that the person configuring the rule composes by hand from
 * placeholders. That means the shape is a CONVENTION, not a contract: the
 * documented template nests everything under `freshdesk_webhook`, but flattened
 * bodies are common and the id field gets named several different ways.
 * The Edge Function parses defensively against exactly these variants.
 * ------------------------------------------------------------------------- */

/** The placeholder fields we read. Everything is optional and may arrive as a string. */
export interface FreshdeskWebhookFields {
  /** Freshdesk placeholder {{ticket.id}}. Also accepted as `ticketId` / `id`. */
  ticket_id?: number | string;
  ticketId?: number | string;
  id?: number | string;
  /** {{ticket.status}} — may be the numeric code (2) or the label ("Open"). */
  ticket_status?: number | string;
  status?: number | string;
  /** Id of the customer reply that fired the rule, when the rule template includes it. */
  first_customer_reply_id?: number | string;
  conversation_id?: number | string;
  note_id?: number | string;
  latest_public_comment_id?: number | string;
  /** Anything else the rule author chose to send along. */
  [key: string]: unknown;
}

/** Body as received by the auto-analyze-ticket function — nested or flat. */
export type FreshdeskWebhookPayload =
  | ({ freshdesk_webhook: FreshdeskWebhookFields } & Record<string, unknown>)
  | FreshdeskWebhookFields;

/** Non-webhook invocation: embed the resolved-ticket corpus and do nothing else. */
export interface AutoAnalyzeBackfillRequest {
  mode: 'backfill';
}

/* ----------------------------------------------------------------------------
 * public.ticket_auto_analysis — one row per ticket, ever.
 *
 * The primary key is the rate limit: auto-analyze-ticket INSERTs here before
 * spending anything on embeddings or generation, so a replayed webhook loses
 * the race for free.
 * ------------------------------------------------------------------------- */

export type AutoAnalysisStatus = 'in_progress' | 'posted' | 'skipped' | 'failed';
export type AutoAnalysisConfidence = 'high' | 'medium' | 'low';

export interface AutoAnalysisRootCause {
  cause: string;
  /** One sentence naming the matched ticket(s) this came from, cited as #<id>. */
  evidence: string;
}

export interface TicketAutoAnalysis {
  ticket_id: number;
  status: AutoAnalysisStatus;
  trigger_source: string;
  /** The first customer reply that fired the webhook. */
  trigger_conversation_id: number | null;
  attempts: number;
  similar_ticket_ids: number[];
  similar_count: number;
  /** Mean cosine similarity of the matches, 0–1. Computed, not model-authored. */
  mean_similarity: number | null;
  /** Median time-to-resolve across the matches, from ticket_status_history. */
  median_resolve_minutes: number | null;
  recommended_assignee_id: number | null;
  recommended_assignee_name: string | null;
  confidence: AutoAnalysisConfidence | null;
  root_causes: AutoAnalysisRootCause[];
  resolution_steps: string[];
  /** Exact markdown posted to Freshdesk (the API receives an HTML rendering of it). */
  note_body: string | null;
  freshdesk_note_id: number | null;
  model: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

/** A row from the match_similar_tickets(ticket_id, limit, min_similarity) RPC. */
export interface SimilarTicketMatch {
  ticket_id: number;
  subject: string;
  /** Cosine similarity, 0–1 (1 - cosine distance). */
  similarity: number;
  status: Status;
  priority: Priority;
  ticket_type: TicketType;
  module: string | null;
  sub_type: string | null;
  responder_id: number | null;
  responder_name: string | null;
  created_at: string;
  /** First transition into Resolved/Closed, falling back to updated_at. */
  resolved_at: string;
  resolve_minutes: number;
}

export type SLAStatus = 'on_track' | 'attention' | 'breached';

export interface SLAMetrics {
  remaining_time: number; // in seconds
  status: SLAStatus;
  label: string;
}