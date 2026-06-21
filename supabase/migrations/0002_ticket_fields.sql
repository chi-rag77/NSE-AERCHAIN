-- ============================================================================
-- 0002_ticket_fields — add Freshdesk native category / type / stats columns
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → paste & run).
-- Safe to run multiple times (uses IF NOT EXISTS / DO $$ patterns).
-- ============================================================================

-- Freshdesk "Type" field (Question / Incident / Problem / Feature Request / Lead)
alter table public.tickets
  add column if not exists ticket_type   text,
  add column if not exists category      text,
  add column if not exists sub_category  text;

-- SLA due-date columns (from include=stats)
alter table public.tickets
  add column if not exists fr_due_by     timestamptz,
  add column if not exists due_by        timestamptz,
  add column if not exists fr_escalated  boolean not null default false,
  add column if not exists is_escalated  boolean not null default false,
  add column if not exists spam          boolean not null default false;

-- Requester email
alter table public.tickets
  add column if not exists requester_email text;

-- Full custom_fields bag from Freshdesk
alter table public.tickets
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

-- Helpful indexes
create index if not exists tickets_ticket_type_idx on public.tickets (ticket_type);
create index if not exists tickets_category_idx    on public.tickets (category);
