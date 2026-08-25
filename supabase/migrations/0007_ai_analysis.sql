-- ============================================================================
-- 0007_ai_analysis — SLA Autopsy foundation
--
-- Three tables:
--   • ticket_status_history — P0. Real status transitions, captured going
--     forward by diffing each ticket's status on every sync run (see
--     sync-freshdesk/index.ts). Tickets synced before this migration get one
--     synthetic 'approximate' row so every ticket has at least a start point.
--   • ticket_ai_analysis — P1/P2/P3 cache. One row per ticket holding the
--     last-generated breakdown (segments + attribution + benchmark, computed
--     deterministically in the analyze-ticket Edge Function — NOT invented by
--     the model) plus the Gemini-written narrative/prevention tip/formal
--     export. Regenerated only on demand (user click) and only when the
--     underlying data actually changed (input_hash), to keep AI spend low.
--   • ticket_ai_disputes — P2 correction workflow. An agent flags a wrong
--     attribution; this is the queue that feeds future corrections.
-- ============================================================================

-- ─── Status history ─────────────────────────────────────────────────────────
create table if not exists public.ticket_status_history (
  id          bigint generated always as identity primary key,
  ticket_id   bigint not null references public.tickets (id) on delete cascade,
  from_status smallint,                        -- null = first known status
  to_status   smallint not null,
  changed_at  timestamptz not null,
  source      text not null default 'sync_diff',   -- 'sync_diff' | 'sync_diff_initial'
  confidence  text not null default 'exact',        -- 'exact' | 'approximate'
  created_at  timestamptz not null default now()
);

create index if not exists ticket_status_history_ticket_idx
  on public.ticket_status_history (ticket_id, changed_at);

-- ─── AI analysis cache (one row per ticket, latest wins) ────────────────────
create table if not exists public.ticket_ai_analysis (
  ticket_id         bigint primary key references public.tickets (id) on delete cascade,
  generated_at      timestamptz not null default now(),
  generated_by      uuid,                       -- auth.uid() of whoever clicked "Analyze"
  model             text not null,
  input_hash        text not null,              -- detects staleness so a re-click without
                                                  -- new data skips the Gemini call entirely
  confidence        text not null,              -- 'high' | 'partial' | 'low'
  completeness_note text,
  segments          jsonb not null,             -- [{status,label,team,startsAt,endsAt,minutes,confidence}]
  attribution       jsonb not null,             -- {aerchain,nse,engineering} percentages, computed not asserted
  benchmark         jsonb,                      -- {medianHours,sampleSize,ticketHours,multiple} or null if sample too small
  narrative         text not null,
  formal_narrative  text,
  prevention_tip    text,
  citations         jsonb not null default '[]'::jsonb
);

-- ─── Disputes (P2 correction workflow) ──────────────────────────────────────
create table if not exists public.ticket_ai_disputes (
  id                    uuid primary key default uuid_generate_v4(),
  ticket_id             bigint not null references public.tickets (id) on delete cascade,
  analysis_generated_at timestamptz,            -- which cached analysis this refers to
  reason                text not null,
  created_by            uuid references auth.users (id),
  created_by_email      text,
  status                text not null default 'open',  -- 'open' | 'reviewed' | 'dismissed'
  created_at            timestamptz not null default now()
);

create index if not exists ticket_ai_disputes_ticket_idx on public.ticket_ai_disputes (ticket_id);

-- ============================================================================
-- Row Level Security — reads open (internal tool, same as tickets/conversations).
-- ticket_status_history / ticket_ai_analysis are written only by Edge
-- Functions via the service role. ticket_ai_disputes accepts a direct insert
-- from any signed-in agent — filing a dispute doesn't need admin rights.
-- ============================================================================
alter table public.ticket_status_history enable row level security;
alter table public.ticket_ai_analysis    enable row level security;
alter table public.ticket_ai_disputes    enable row level security;

drop policy if exists ticket_status_history_read   on public.ticket_status_history;
drop policy if exists ticket_ai_analysis_read       on public.ticket_ai_analysis;
drop policy if exists ticket_ai_disputes_read       on public.ticket_ai_disputes;
drop policy if exists ticket_ai_disputes_insert     on public.ticket_ai_disputes;

create policy ticket_status_history_read on public.ticket_status_history for select using (true);
create policy ticket_ai_analysis_read    on public.ticket_ai_analysis    for select using (true);
create policy ticket_ai_disputes_read    on public.ticket_ai_disputes    for select using (true);

create policy ticket_ai_disputes_insert on public.ticket_ai_disputes
  for insert with check (auth.uid() is not null);

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Every ticket synced before this migration has zero history rows. Give each
-- one synthetic 'approximate' row so the timeline always has a start point —
-- this is exactly what the confidence meter is built to be honest about.
insert into public.ticket_status_history (ticket_id, from_status, to_status, changed_at, source, confidence)
select id, null, status, created_at, 'sync_diff_initial', 'approximate'
from public.tickets t
where not exists (
  select 1 from public.ticket_status_history h where h.ticket_id = t.id
);
