-- ============================================================================
-- 0011_matched_tickets_column — structured match data for the dashboard's
-- "Matched tickets" table.
--
-- ticket_auto_analysis.note_body has always carried this as markdown bullets
-- (fine for the Freshdesk note), but the dashboard overlay renders its own
-- table and needs the underlying fields (ticket id, subject, similarity,
-- resolve time, assignee) as data, not text to re-parse out of prose on every
-- read. Populated going forward by the Edge Function; existing rows default
-- to '[]' and simply show no table until they're next analyzed.
-- ============================================================================

alter table public.ticket_auto_analysis
  add column if not exists matched_tickets jsonb not null default '[]'::jsonb;

comment on column public.ticket_auto_analysis.matched_tickets is
  'Structured form of the matches behind this analysis: [{ticket_id, subject, similarity, status, resolve_minutes, responder_name}, ...]. Same tickets as similar_ticket_ids / note_body, just as data for the dashboard table instead of markdown prose.';
