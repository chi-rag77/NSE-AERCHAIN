-- ============================================================================
-- 0008_ai_analysis_primary_cause — adds a short, concrete "why" label to the
-- SLA Autopsy cache, surfaced above the narrative so a reader gets the real
-- reason at a glance instead of only a paragraph of (diplomatic) prose.
-- ============================================================================

alter table public.ticket_ai_analysis add column if not exists primary_cause text;
