# Freshdesk → Supabase integration

The dashboard reads tickets/conversations from Supabase. A Supabase Edge
Function (`sync-freshdesk`) pulls data from the Freshdesk API and upserts it
into the `tickets` / `conversations` tables, on a 5-minute cron and on-demand
when you hit **Refresh** in the UI. Freshdesk credentials stay server-side.

```
Freshdesk API ──(Edge Function: sync-freshdesk)──▶ Supabase tables ──(anon, RLS)──▶ Dashboard
                         ▲ cron every 5m / Refresh button
```

## One-time setup

1. **Install the CLI & link the project**
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <PROJECT_REF>
   ```

2. **Apply the schema**
   ```bash
   supabase db push        # runs supabase/migrations/0001_init.sql
   ```

3. **Set Edge Function secrets** (server-side only)
   ```bash
   supabase secrets set FRESHDESK_DOMAIN=yourcompany.freshdesk.com
   supabase secrets set FRESHDESK_API_KEY=your_freshdesk_api_key
   # optional:
   supabase secrets set FRESHDESK_COMPANY_ID=12345
   ```

4. **Deploy the function**
   ```bash
   supabase functions deploy sync-freshdesk --no-verify-jwt
   ```

5. **Schedule the cron** — paste `supabase/cron.sql` into the Dashboard →
   SQL Editor and run it (already pre-filled with the project URL + key), or
   use Dashboard → Edge Functions → sync-freshdesk → Cron.

6. **First sync** (optional manual kick)
   ```bash
   supabase functions invoke sync-freshdesk --no-verify-jwt
   ```

7. **Frontend env** — copy `.env.example` to `.env` and set:
   ```
   VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   (On Vercel, add these as Environment Variables instead.)

Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, the app runs in **demo
mode** with bundled mock data, so local dev still works.

---

# Ticket auto-analysis

The moment a **new ticket is created**, Freshdesk fires a webhook at the
`auto-analyze-ticket` Edge Function. The function finds the most semantically
similar tickets that have **already been resolved**, and posts a **private
internal note** on the new ticket: what these usually turn out to be, what
worked last time, how long it took, and who to hand it to — before an agent
has even opened it.

```
Freshdesk (ticket created)
      │  webhook
      ▼
auto-analyze-ticket ──▶ PK claim in ticket_auto_analysis   (dedup, before any spend)
      │                 Gemini embeddings → ticket_embeddings (pgvector)
      │                 match_similar_tickets()  → resolved tickets only
      │                 Gemini synthesis over those real rows
      ▼
Freshdesk private note on the ticket
```

It is the proactive counterpart to `analyze-ticket` ("SLA Autopsy"), which
explains one ticket *after* the fact when an agent clicks Analyze.

## What the note contains

- **Similar cases found** — N resolved tickets, each linked by real ticket number
- **Common root causes** — 1–3, each citing the ticket(s) it came from
- **Typical resolution steps** — ordered, drawn from what actually worked
- **Median time to resolve** — plus the range across the matches
- **Recommended assignee** — the agent who closed the most similar tickets
- **Confidence** and an honest caveat about the weakest part of the suggestion

## Design guarantees

**No invented numbers.** Similarity, per-ticket time-to-resolve, the median, the
recommended assignee, and the confidence rating are all computed in the function
(and in SQL) from real rows *before* the prompt is built. Gemini's only job is to
turn those facts into prose, and it is instructed never to emit a ticket number,
agent name or duration that wasn't handed to it. This is the same principle
`analyze-ticket` is built on.

**Time-to-resolve is real.** `match_similar_tickets` derives it from the first
transition into Resolved/Closed in `ticket_status_history` — not from
`updated_at`, which keeps moving every time anyone touches a closed ticket.
`updated_at` is only the fallback for tickets predating history capture.

**One analysis per ticket, ever.** `ticket_auto_analysis.ticket_id` is a primary
key, and inserting it is the *first* thing the function does after cheap
validation — before any embedding or generation call. A duplicated or replayed
webhook loses that race, gets a `200`, and costs nothing. A run that genuinely
*failed* can be re-claimed, but only after a 10-minute cooldown and at most 3
attempts total.

**Bounded spend per webhook.** One embedding call for the incoming ticket, at
most one batch (24 tickets) of corpus top-up, and one generation call. The bulk
corpus work happens in `mode: "backfill"`, not on the webhook path.

**Freshdesk never sees a failure.** Every path returns HTTP `200` (the sole
exception is a bad `AUTO_ANALYZE_WEBHOOK_SECRET`, which returns `401` on
purpose — a silent success there would hide a misconfigured or hostile caller).
Freshdesk retries non-2xx webhooks, and a retry storm on a broken deploy is
worse than a missed note. Real outcomes land in `ticket_auto_analysis.status`
(`posted` / `skipped` / `failed`) and in the function logs.

**Silence over noise.** If nothing clears the similarity floor, the function
records `skipped` and posts *nothing*. A note saying "we found nothing" is how a
feature like this gets switched off.

## Setup

1. **Apply the migration** — `supabase/migrations/0009_ticket_embeddings_and_analysis.sql`
   creates `ticket_embeddings` (pgvector, 768-dim, HNSW cosine index),
   the `match_similar_tickets()` function, and `ticket_auto_analysis`.

   ```bash
   supabase db push
   ```

   It enables the `vector` extension itself. On a managed Supabase project you
   can also enable it from Dashboard → Database → Extensions first; the
   migration is a no-op in that case.

2. **Secrets** — the function reuses the ones already deployed for
   `sync-freshdesk` and `analyze-ticket`. Nothing new is strictly required:

   | Secret | Required | Notes |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | yes | already deployed for `analyze-ticket` |
   | `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY` | yes | already deployed for `sync-freshdesk` |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes | auto-injected |
   | `AUTO_ANALYZE_WEBHOOK_SECRET` | recommended | if set, callers must send it as `X-Auto-Analyze-Secret` |
   | `GEMINI_MODEL` | no | default `gemini-3.6-flash` |
   | `GEMINI_EMBED_MODEL` | no | default `gemini-embedding-001` |
   | `AUTO_ANALYZE_MIN_SIMILARITY` | no | cosine floor, default `0.68` |
   | `AUTO_ANALYZE_MAX_MATCHES` | no | default `5` |

   ```bash
   supabase secrets set AUTO_ANALYZE_WEBHOOK_SECRET="$(openssl rand -hex 24)"
   ```

3. **Deploy**

   ```bash
   supabase functions deploy auto-analyze-ticket --no-verify-jwt
   ```

   `--no-verify-jwt` is required: Freshdesk cannot present a Supabase JWT. The
   shared secret above is what actually authenticates the caller.

4. **Seed the corpus** — semantic search over zero embeddings finds nothing, so
   run the backfill until `remaining` reaches 0 (each call embeds up to 400
   resolved tickets, stopping at its own 25s budget):

   ```bash
   curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/auto-analyze-ticket" \
     -H "Content-Type: application/json" \
     -H "X-Auto-Analyze-Secret: <secret>" \
     -d '{"mode":"backfill"}'
   ```

   Newly resolved tickets are picked up automatically — every webhook run also
   tops up a slice of the corpus — so this is a one-time step. Schedule it
   nightly via `pg_cron` (same pattern as `supabase/cron.sql`) if you'd rather
   not rely on webhook traffic to keep it current.

5. **Wire the Freshdesk automation** — Admin → Workflows → Automations →
   **Ticket Creation**:

   - **When**: *Ticket is created* (no further conditions needed — every new
     ticket qualifies; the function's own `DONE_STATUSES` check is a no-op
     safety net for a stale/replayed webhook, not a real gate at creation time)
   - **Action**: *Trigger webhook* → `POST`, JSON,
     URL `https://<PROJECT_REF>.supabase.co/functions/v1/auto-analyze-ticket`
   - **Custom header**: `X-Auto-Analyze-Secret: <secret>`
   - **Body**:

     ```json
     { "freshdesk_webhook": { "ticket_id": "{{ticket.id}}", "ticket_status": "{{ticket.status}}" } }
     ```

   A flat `{"ticket_id": "{{ticket.id}}"}` works too — the parser accepts
   nested or flat, and `ticket_id` / `ticketId` / `id`, and a status as either
   a code or a label. The query text is the ticket's own subject +
   description (the customer's original problem statement) — there is no
   conversation thread to read yet at creation time, so nothing else is
   needed on the trigger side.

## Verifying it

```bash
# Force one ticket through the whole path (bypasses Freshdesk).
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/auto-analyze-ticket" \
  -H "Content-Type: application/json" -H "X-Auto-Analyze-Secret: <secret>" \
  -d '{"ticket_id": 12345}'
```

```sql
-- What happened, and why anything was skipped
select ticket_id, status, similar_count, confidence, median_resolve_minutes,
       recommended_assignee_name, error, created_at
from ticket_auto_analysis order by created_at desc limit 20;

-- How much of the resolved corpus is searchable
select count(*) filter (where e.ticket_id is not null) as embedded,
       count(*)                                        as resolved_total
from tickets t
left join ticket_embeddings e on e.ticket_id = t.id
where t.status in (4, 5);

-- Try the search by hand
select * from match_similar_tickets(12345, 5, 0.68);
```

To re-run a ticket during testing, delete its claim row —
`delete from ticket_auto_analysis where ticket_id = 12345;` — since the primary
key is exactly what stops a second analysis.

## Tuning

`AUTO_ANALYZE_MIN_SIMILARITY` is the dial that matters. Too low and agents get
confidently-worded notes about unrelated tickets, which destroys trust in the
feature faster than posting nothing ever would; too high and it rarely fires.
`0.68` is a starting point — check a sample with the `match_similar_tickets`
query above before moving it.

Embeddings use the same text template for the incoming ticket and for every
ticket in the corpus (subject + type/module/issue-type + description).
Conversation replies are deliberately excluded: the description is the
customer's actual problem statement, replies are mostly logistics, and keeping
the text a pure function of the ticket row is what makes `content_hash` a
reliable "needs re-embedding" signal.
