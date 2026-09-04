-- ============================================================================
-- 0009_ticket_embeddings_and_analysis — "Auto-Analysis" foundation
--
-- Where 0007's SLA Autopsy explains ONE ticket after the fact, this powers the
-- proactive half: the moment a ticket gets its first customer reply, Freshdesk
-- fires a webhook at the auto-analyze-ticket Edge Function, which finds the
-- most semantically similar ALREADY-RESOLVED tickets and posts an internal
-- note telling the agent how those were solved, how long they took, and who
-- solved them.
--
-- Three objects:
--   • ticket_embeddings      — one pgvector row per ticket (Gemini embeddings).
--   • match_similar_tickets  — cosine-similarity search restricted to resolved
--                              tickets, returning the real time-to-resolve
--                              derived from ticket_status_history.
--   • ticket_auto_analysis   — the per-ticket ledger. Its PRIMARY KEY is the
--                              rate limiter: the Edge Function INSERTs here
--                              BEFORE spending a cent on embeddings or
--                              generation, so a duplicate/replayed webhook
--                              loses the race and costs nothing.
--
-- Safe to re-run. Writes are service-role only (Edge Function); reads are open
-- to match the rest of this internal tool.
-- ============================================================================

-- Managed Supabase installs extensions into `extensions`, a bare Postgres into
-- `public`. Pin both so `vector` / `vector_cosine_ops` resolve either way, and
-- so our own objects still land in `public` (first entry wins for creation).
set search_path = public, extensions;

-- pgvector. Supabase ships this; `if not exists` is a no-op when it is already
-- enabled, whichever schema it lives in.
create extension if not exists vector;

-- ─── Embeddings ─────────────────────────────────────────────────────────────
-- 768 dimensions: Gemini's gemini-embedding-001 supports 768 / 1536 / 3072 via
-- outputDimensionality. 768 is the cheapest to store and index and is well
-- inside pgvector's 2000-dim HNSW ceiling; quality loss on short support text
-- is negligible. NOTE: any sub-3072 output must be L2-normalised by the caller
-- before insert (the Edge Function does this) or cosine distance is wrong.
--
-- content_hash is a SHA-256 of the exact text that was embedded. It is what
-- makes re-embedding cheap: a ticket whose subject/description/classification
-- has not changed is skipped entirely on the next pass.
create table if not exists public.ticket_embeddings (
  ticket_id    bigint primary key references public.tickets (id) on delete cascade,
  embedding    vector(768) not null,
  content_hash text        not null,
  char_count   integer     not null default 0,
  model        text        not null,
  embedded_at  timestamptz not null default now()
);

-- Cosine (`vector_cosine_ops`) matches how the search below scores, and how
-- normalised Gemini embeddings are meant to be compared.
create index if not exists ticket_embeddings_hnsw_idx
  on public.ticket_embeddings using hnsw (embedding vector_cosine_ops);

-- ─── Semantic search over RESOLVED tickets only ─────────────────────────────
-- Deliberately plpgsql rather than sql: pulling the probe vector into a local
-- variable first makes it a bound parameter in the ORDER BY, which is what lets
-- the planner actually use the HNSW index (an inlined scalar subquery does not
-- reliably do that).
--
-- resolve_minutes comes from ticket_status_history — the FIRST transition into
-- Resolved(4)/Closed(5) — not from updated_at, which keeps moving every time
-- anyone touches a closed ticket. updated_at is only the fallback for tickets
-- whose history predates 0007's capture.
create or replace function public.match_similar_tickets(
  p_ticket_id      bigint,
  p_limit          integer          default 5,
  p_min_similarity double precision default 0.55
)
returns table (
  ticket_id       bigint,
  subject         text,
  similarity      double precision,
  status          smallint,
  priority        smallint,
  ticket_type     text,
  module          text,
  sub_type        text,
  responder_id    bigint,
  responder_name  text,
  created_at      timestamptz,
  resolved_at     timestamptz,
  resolve_minutes integer
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_probe vector(768);
begin
  select e.embedding into v_probe
  from public.ticket_embeddings e
  where e.ticket_id = p_ticket_id;

  -- No embedding for the probe ticket yet → no matches, not an error. The
  -- Edge Function embeds on demand before calling this, so this is the
  -- "nothing to compare against" case, which callers handle as "skip".
  if v_probe is null then
    return;
  end if;

  return query
  with resolved as (
    select h.ticket_id as tid, min(h.changed_at) as at
    from public.ticket_status_history h
    where h.to_status in (4, 5)
    group by h.ticket_id
  )
  select
    t.id,
    t.subject,
    (1 - (e.embedding <=> v_probe))::double precision,
    t.status,
    t.priority,
    t.ticket_type,
    t.module,
    t.sub_type,
    t.responder_id,
    t.responder_name,
    t.created_at,
    coalesce(r.at, t.updated_at),
    greatest(
      0,
      extract(epoch from (coalesce(r.at, t.updated_at) - t.created_at)) / 60
    )::integer
  from public.ticket_embeddings e
  join public.tickets t on t.id = e.ticket_id
  left join resolved r on r.tid = t.id
  where t.id <> p_ticket_id
    and t.status in (4, 5)                          -- resolved / closed only
    and (1 - (e.embedding <=> v_probe)) >= p_min_similarity
  order by e.embedding <=> v_probe
  limit greatest(1, least(coalesce(p_limit, 5), 25));
end;
$$;

comment on function public.match_similar_tickets(bigint, integer, double precision) is
  'Cosine-similarity search for resolved (status 4/5) tickets similar to p_ticket_id. resolve_minutes is derived from ticket_status_history, falling back to updated_at.';

grant execute on function public.match_similar_tickets(bigint, integer, double precision)
  to authenticated, service_role;

-- ─── Auto-analysis ledger (one row per ticket, ever) ────────────────────────
-- The primary key IS the rate limit. The Edge Function's first action on a
-- webhook — before any Gemini call, before any Freshdesk write — is an INSERT
-- here. A duplicate or replayed webhook hits 23505, the function returns 200,
-- and nothing was spent. Everything else on the row is filled in afterwards.
--
-- status: 'in_progress' (claimed, working) → 'posted' (note is on the ticket)
--       | 'skipped'     (nothing similar enough to be worth an agent's time)
--       | 'failed'      (see error; retryable under the guard in the function)
create table if not exists public.ticket_auto_analysis (
  ticket_id               bigint primary key references public.tickets (id) on delete cascade,
  status                  text        not null default 'in_progress',
  trigger_source          text        not null default 'freshdesk_webhook',
  trigger_conversation_id bigint,                       -- the first customer reply that fired it
  attempts                integer     not null default 1,
  similar_ticket_ids      bigint[]    not null default '{}',
  similar_count           integer     not null default 0,
  mean_similarity         double precision,
  median_resolve_minutes  integer,
  recommended_assignee_id   bigint,
  recommended_assignee_name text,
  confidence              text,                          -- 'high' | 'medium' | 'low'
  root_causes             jsonb       not null default '[]'::jsonb,
  resolution_steps        jsonb       not null default '[]'::jsonb,
  note_body               text,                          -- exact markdown posted to Freshdesk
  freshdesk_note_id       bigint,
  model                   text,
  error                   text,
  created_at              timestamptz not null default now(),
  completed_at            timestamptz
);

create index if not exists ticket_auto_analysis_status_idx
  on public.ticket_auto_analysis (status, created_at desc);

-- ============================================================================
-- Row Level Security — reads open (internal tool, same as tickets /
-- ticket_ai_analysis); all writes go through the service role, which bypasses
-- RLS, so no insert/update policies are defined on purpose.
-- ============================================================================
alter table public.ticket_embeddings    enable row level security;
alter table public.ticket_auto_analysis enable row level security;

drop policy if exists ticket_embeddings_read    on public.ticket_embeddings;
drop policy if exists ticket_auto_analysis_read on public.ticket_auto_analysis;

-- The embedding vectors themselves are derived from ticket text the same
-- readers can already see, so exposing the row is not a new disclosure.
create policy ticket_embeddings_read    on public.ticket_embeddings    for select using (true);
create policy ticket_auto_analysis_read on public.ticket_auto_analysis for select using (true);
