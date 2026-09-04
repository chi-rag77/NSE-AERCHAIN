# Aerchain · NSE Support Dashboard

Enterprise support analytics dashboard for NSE (National Stock Exchange of India),
backed by Freshdesk data synced into Supabase.

- **Dashboard** — service health score, KPI strip, priority queue, live activity, SLA analytics
- **Tickets** — full ticket register with filters, SLA tracking, and a detail drawer
- **Reports** — styled Excel (2-sheet) ticket export + SLA compliance reports in Excel & PDF
- **Ticket auto-analysis** — the moment a new ticket is created, Freshdesk webhooks
  an Edge Function that finds similar *resolved* tickets by semantic search and posts
  an internal note with root causes, resolution steps, median resolve time, and a
  recommended assignee ([details](supabase/README.md#ticket-auto-analysis)). Signed-in
  agents can also trigger it on demand from the ticket drawer ("Analyze Similar
  Cases") — same pipeline, posts straight to Freshdesk; not shown in guest/public mode.

Stack: Vite · React 19 · TypeScript · Tailwind · shadcn/ui · Recharts · Supabase (Postgres + Edge Functions) · ExcelJS · jsPDF

---

## Local development

```bash
npm install --legacy-peer-deps   # React 19 peer-dep resolution
npm run dev
```

The app runs in **demo mode** (mock data) when the Supabase env vars are absent,
so it works out of the box without any credentials.

---

## ⚠️ Production deployment checklist

> **Read this before any live deploy.** If the host (Vercel, etc.) auto-deploys from
> `main`, these steps are required — otherwise prod silently runs on mock data.

### 1. Frontend environment variables (Vercel / host)

The frontend needs these at **build time**. Without them, prod falls back to demo mode:

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key (safe for the browser; protected by RLS) |

Set them in **Vercel → Project → Settings → Environment Variables** for the
Production (and Preview) environments, then redeploy.

### 2. Edge Function secrets (Supabase — server-side only)

These are **secrets** and must **never** be committed or exposed to the browser.
Set them only as Supabase Edge Function secrets:

```bash
supabase secrets set SUPABASE_SECRET_KEY=<service-role-key>
supabase secrets set FRESHDESK_API_KEY=<freshdesk-api-key>
supabase secrets set FRESHDESK_DOMAIN=<your-domain>.freshdesk.com
supabase secrets set GEMINI_API_KEY=<gemini-api-key>
# Ticket auto-analysis: authenticates the inbound Freshdesk webhook
supabase secrets set AUTO_ANALYZE_WEBHOOK_SECRET="$(openssl rand -hex 24)"
```

`.env` is gitignored — keep it that way.

### 3. Sync cron (optional, recommended)

To keep data fresh, schedule the sync Edge Function every 5 minutes by running
`supabase/cron.sql` in the Supabase SQL Editor (requires `pg_cron` + `pg_net`).

### 4. 🔐 Rotate exposed credentials

The **Freshdesk API key** and **Supabase secret (service-role) key** were shared
in plaintext during initial setup and should be **rotated**:

1. **Freshdesk** → Profile Settings → regenerate API key, then update the
   `FRESHDESK_API_KEY` Edge Function secret.
2. **Supabase** → Project Settings → API → roll the service-role/secret key, then
   update the `SUPABASE_SECRET_KEY` Edge Function secret.

The `VITE_SUPABASE_ANON_KEY` is public by design and does **not** need rotation
(it is gated by Row Level Security).

---

## Architecture

```
Freshdesk REST API                        Freshdesk webhook (ticket created)
      │                                              │
      ▼                                              ▼
sync-freshdesk (Edge Function, Deno)      auto-analyze-ticket (Edge Function, Deno)
      │  upserts tickets + conversations   │  pgvector search over resolved tickets
      │                                    │  → posts an internal note back to Freshdesk
      ▼                                    ▼
Supabase Postgres (RLS: anon read-only) ◀──┘
      │        ← FRESHDESK_API_KEY, GEMINI_API_KEY, SUPABASE_SECRET_KEY
      ▼
Frontend (Vite/React)   ← VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

`analyze-ticket` (on-demand "SLA Autopsy", triggered from the ticket drawer) and
`auto-analyze-ticket` (proactive, webhook-triggered) both read from Postgres and
call Gemini; neither invents a number — see `supabase/README.md`.
