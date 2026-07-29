# Spinning up a new customer instance (Meta, Danone, Unilever, …)

This codebase is **multi-customer via configuration**: one repo, deployed once
per customer. Each instance has **its own Supabase project** (data isolation)
and a Freshdesk sync scoped to that customer's `cf_company`. Branding stays
Aerchain; only the company label and data change.

The two values that define an instance:

| Where | Variable | Example |
|-------|----------|---------|
| Frontend (Vercel) | `VITE_COMPANY_NAME` | `Meta` |
| Sync (Edge Function secret) | `FRESHDESK_COMPANY_NAME` | `Meta` |

**Both must equal the `cf_company` value that customer's tickets carry in Freshdesk.**
(Confirm it on a real ticket: `GET /api/v2/tickets/{id}` → `custom_fields.cf_company`.)

---

## 1. Supabase project (per customer)

1. Create a new Supabase project (e.g. `aerchain-meta`).
2. Run the migrations in `supabase/migrations/` in order (SQL Editor or `supabase db push`):
   `0001 → 0002 → 0003 → 0004 → 0005`.
3. Enable **Email** auth; turn **off** public sign-ups (Auth → Providers → Email).

## 2. Edge Functions (per customer)

Deploy all three, with `verify_jwt = false` (already set in `config.toml`):

```bash
supabase link --project-ref <NEW_PROJECT_REF>
supabase functions deploy sync-freshdesk
supabase functions deploy admin-users
supabase functions deploy slack-notify   # optional (Slack alerts)
```

Set the secrets (note the **company name**, not id):

```bash
supabase secrets set FRESHDESK_DOMAIN=aerchain.freshdesk.com
supabase secrets set FRESHDESK_API_KEY=<freshdesk_api_key>
supabase secrets set FRESHDESK_COMPANY_NAME=Meta          # cf_company to sync
supabase secrets set SYNC_CREATED_AFTER=2026-07-27T00:00:00Z   # optional
```

## 3. Schedule the sync

In the SQL Editor, run the `sync-freshdesk-every-5m` (and optional
`slack-notify-every-5m`) blocks from `supabase/cron.sql`, replacing the URL
host with **this project's** ref.

## 4. First admin user

Create a login (Auth → Users → Add user, auto-confirm), then grant admin:

```sql
insert into public.profiles (id, email, full_name, is_admin)
select id, email, 'Admin', true from auth.users where lower(email) = '<admin@customer.com>'
on conflict (id) do update set is_admin = true, disabled = false;
```

Customer end-users are created the same way but with `is_admin = false`
(they then see only Home + Tickets; Reports/Admin stay hidden).

## 5. Vercel deployment (per customer)

New Vercel project from this repo, with env vars:

```
VITE_SUPABASE_URL=https://<NEW_PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<new project's anon key>
VITE_COMPANY_NAME=Meta
VITE_COMPANY_FULL_NAME=Meta Platforms, Inc.   # optional, login subtitle
```

Deploy. The whole UI ("Meta support …", `Meta-<id>` exports, ticket dept
labels, page title) now reads for that customer, pulling only their tickets.

---

## Checklist per customer

- [ ] `cf_company` value confirmed on a real Freshdesk ticket
- [ ] Supabase project created + migrations run
- [ ] `sync-freshdesk`, `admin-users` (and `slack-notify`) deployed
- [ ] Secrets set incl. `FRESHDESK_COMPANY_NAME`
- [ ] Cron scheduled
- [ ] Admin user + end-user logins created
- [ ] Vercel env set incl. `VITE_COMPANY_NAME` and deployed
