-- ============================================================================
-- 0010_similar_cases_cache — cache for the manual "Analyze Similar Cases"
-- overlay (auto-analyze-ticket's dry_run mode).
--
-- Deliberately a SEPARATE table from ticket_auto_analysis, not a reuse of it.
-- ticket_auto_analysis's primary key IS the automatic webhook's one-shot rate
-- limit (see 0009) — writing a "just previewed" row into it would make a real
-- customer-triggered webhook see the row, believe the ticket was already
-- auto-analyzed, and silently skip posting the actual note. This table has no
-- such coupling: it exists purely so clicking "Analyze Similar Cases" twice
-- on the same, unchanged ticket costs one Gemini call instead of two.
--
-- Keyed by ticket_id only (not content_hash) — unlike ticket_embeddings, this
-- cache is invalidated by an explicit "Regenerate" click (force: true), the
-- same UX the SLA Autopsy panel already uses for ticket_ai_analysis, not by
-- silently detecting that the ticket text changed.
-- ============================================================================

create table if not exists public.ticket_similar_cases (
  ticket_id               bigint primary key references public.tickets (id) on delete cascade,
  similar_ticket_ids      bigint[]         not null default '{}',
  similar_count           integer          not null default 0,
  mean_similarity         double precision,
  median_resolve_minutes  integer,
  recommended_assignee_name text,
  confidence              text,                  -- 'high' | 'medium' | 'low'
  note_markdown           text             not null,
  note_html               text             not null,
  model                   text             not null,
  generated_at            timestamptz      not null default now()
);

comment on table public.ticket_similar_cases is
  'Cache for the manual "Analyze Similar Cases" dashboard overlay. Separate from ticket_auto_analysis on purpose — see file header.';

-- Reads open (same convention as the rest of this internal tool); writes are
-- service-role only (the Edge Function), so no insert/update policy needed.
alter table public.ticket_similar_cases enable row level security;

drop policy if exists ticket_similar_cases_read on public.ticket_similar_cases;
create policy ticket_similar_cases_read on public.ticket_similar_cases for select using (true);
