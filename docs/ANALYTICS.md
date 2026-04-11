# Instagram Analytics — Implementation Plan

> **Implementation document for Claude Code.**
> Run `npx tsc --noEmit` after every step.
> **Rule: database first, then data layer, then UI. Never build UI against live API calls.**

---

## What this builds

A single-source-of-truth analytics page for every connected Instagram account.
All data comes from the Meta API and is stored locally in Supabase.
The UI reads from the database — zero live API calls on page load.

Three data sources, implemented in three phases:

| Phase | Data                              | API                   | Permissions                                                |
| ----- | --------------------------------- | --------------------- | ---------------------------------------------------------- |
| 1     | Account + post insights (organic) | `graph.instagram.com` | `instagram_business_manage_insights` ✅ already configured |
| 2     | Full post grid + media sync       | `graph.instagram.com` | Same                                                       |
| 3     | Paid ads insights                 | `graph.facebook.com`  | `ads_read` + Facebook Login — requires additional setup    |

---

## File Map

| File                                                   | Role                                                  |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `supabase/migrations/YYYYMMDD_instagram_analytics.sql` | Database schema                                       |
| `lib/meta/client.ts`                                   | Base fetch helper, rate limit handling                |
| `lib/meta/sync.ts`                                     | Three sync functions (media, insights, account daily) |
| `lib/meta/ads.ts`                                      | Ads sync (Phase 3)                                    |
| `lib/meta/tokens.ts`                                   | Token refresh logic                                   |
| `app/api/cron/ig-sync/route.ts`                        | Every 6h — media + post insights                      |
| `app/api/cron/ig-daily/route.ts`                       | Daily 3am — account metrics                           |
| `app/api/cron/ig-ads/route.ts`                         | Daily 4am — ads insights (Phase 3)                    |
| `app/api/cron/refresh-tokens/route.ts`                 | Daily 2am — keep tokens alive                         |
| `app/api/meta/connect/route.ts`                        | OAuth redirect (already exists from publishing)       |
| `app/api/meta/callback/route.ts`                       | OAuth callback (already exists from publishing)       |
| `app/api/meta/ads-connect/route.ts`                    | Facebook Login OAuth for ads (Phase 3)                |
| `app/api/meta/ads-callback/route.ts`                   | Facebook Login callback (Phase 3)                     |
| `app/(dashboard)/analytics/page.tsx`                   | Analytics page                                        |
| `app/(dashboard)/analytics/[clientId]/page.tsx`        | Per-client analytics                                  |
| `components/analytics/AccountMetrics.tsx`              | 4-card header row                                     |
| `components/analytics/ReachChart.tsx`                  | Daily reach/views line chart                          |
| `components/analytics/MediaTypeBreakdown.tsx`          | Bar chart by type                                     |
| `components/analytics/TopPosts.tsx`                    | Ranked list by save rate                              |
| `components/analytics/PostGrid.tsx`                    | All posts with hover metrics                          |
| `components/analytics/AdsSection.tsx`                  | Ads metrics or connect prompt                         |
| `components/analytics/DateRangePicker.tsx`             | 7d / 30d / 90d selector                               |
| `hooks/useAnalytics.ts`                                | Data fetching hooks (reads from Supabase)             |

---

## Build Order

```
── PHASE 1: Database & Data Layer ───────────────────────────────────────────
Step 1  → Database schema — all three tables
Step 2  → Base API client (rate limiting, error handling)
Step 3  → Media sync function (backfill + incremental)
Step 4  → Post insights sync function
Step 5  → Account daily sync function
Step 6  → Token refresh cron
Step 7  → Cron routes + vercel.json
Step 8  → Phase 1 verification

── PHASE 2: Analytics UI ────────────────────────────────────────────────────
Step 9  → Analytics page routing + client selector
Step 10 → DateRangePicker + useAnalytics hook
Step 11 → AccountMetrics cards
Step 12 → ReachChart (daily trend)
Step 13 → MediaTypeBreakdown bar chart
Step 14 → TopPosts ranked list
Step 15 → PostGrid with hover stats
Step 16 → Phase 2 verification

── PHASE 3: Paid Ads ────────────────────────────────────────────────────────
Step 17 → Facebook Login OAuth flow for ads
Step 18 → Ad account selector + storage
Step 19 → Ads daily sync function + cron
Step 20 → AdsSection component
Step 21 → Phase 3 verification
```

---

## Phase 1 — Database & Data Layer

---

## Step 1 — Database Schema

> **File:** `supabase/migrations/YYYYMMDD_instagram_analytics.sql`

```sql
-- All Instagram media on the account (organic only)
-- Synced from GET /<ig-user-id>/media
CREATE TABLE ig_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ig_media_id     TEXT NOT NULL UNIQUE,
  -- All fields below are direct API response values
  media_type      TEXT NOT NULL,          -- IMAGE | CAROUSEL_ALBUM | VIDEO | REELS
  caption         TEXT,
  permalink       TEXT,
  thumbnail_url   TEXT,
  published_at    TIMESTAMPTZ NOT NULL,
  like_count      INTEGER DEFAULT 0,
  comments_count  INTEGER DEFAULT 0,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Lifetime post insights
-- Synced from GET /<ig-media-id>/insights
-- All metric fields are direct API response values
CREATE TABLE ig_media_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_media_id     TEXT NOT NULL REFERENCES ig_media(ig_media_id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Direct API fields
  reach           INTEGER DEFAULT 0,
  views           INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  saved           INTEGER DEFAULT 0,
  avg_watch_time  DECIMAL(8,2),           -- Reels only
  reels_skip_rate DECIMAL(5,2),           -- Reels only, Dec 2025 addition
  reposts         INTEGER DEFAULT 0,      -- Dec 2025 addition
  -- Computed from API fields — industry standard formulas
  engagement_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN reach > 0
    THEN ROUND(((likes + comments + shares + saved)::DECIMAL / reach) * 100, 2)
    ELSE 0 END
  ) STORED,
  save_rate       DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN reach > 0
    THEN ROUND((saved::DECIMAL / reach) * 100, 2)
    ELSE 0 END
  ) STORED,
  UNIQUE(ig_media_id)
);

-- Daily account snapshots
-- Synced from GET /<ig-user-id>/insights with period=day
-- All fields are direct API response values
CREATE TABLE ig_account_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  -- Direct API fields
  reach           INTEGER DEFAULT 0,
  views           INTEGER DEFAULT 0,
  profile_views   INTEGER DEFAULT 0,
  follows         INTEGER DEFAULT 0,
  follower_count  INTEGER DEFAULT 0,
  UNIQUE(client_id, date)
);

-- Paid ads daily snapshots (Phase 3)
-- Synced from Marketing API GET /act_<id>/insights
CREATE TABLE ig_ads_daily (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ad_account_id       TEXT NOT NULL,
  date                DATE NOT NULL,
  campaign_id         TEXT,
  campaign_name       TEXT,
  -- Direct Marketing API fields
  spend               DECIMAL(10,2) DEFAULT 0,
  impressions         INTEGER DEFAULT 0,
  reach               INTEGER DEFAULT 0,
  clicks              INTEGER DEFAULT 0,
  cpc                 DECIMAL(8,4),
  cpm                 DECIMAL(8,4),
  ctr                 DECIMAL(6,4),
  conversions         INTEGER DEFAULT 0,
  instagram_follows   INTEGER DEFAULT 0,
  UNIQUE(client_id, ad_account_id, campaign_id, date)
);

-- Ad accounts connected by agencies (Phase 3)
CREATE TABLE ig_ad_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ad_account_id     TEXT NOT NULL,           -- 'act_123456789'
  ad_account_name   TEXT,
  facebook_token    TEXT NOT NULL,            -- encrypted
  token_expires_at  TIMESTAMPTZ,
  connected_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active         BOOLEAN DEFAULT true,
  UNIQUE(client_id, ad_account_id)
);

-- Indexes
CREATE INDEX idx_ig_media_client_published
  ON ig_media(client_id, published_at DESC);

CREATE INDEX idx_ig_media_insights_client
  ON ig_media_insights(client_id);

CREATE INDEX idx_ig_account_daily_client_date
  ON ig_account_daily(client_id, date DESC);

CREATE INDEX idx_ig_ads_daily_client_date
  ON ig_ads_daily(client_id, date DESC);

-- RLS: agencies can only access their own clients' data
ALTER TABLE ig_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_media_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_account_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_ads_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_own_clients" ON ig_media
  USING (client_id IN (
    SELECT id FROM clients WHERE agency_id = auth.uid()
  ));

-- Repeat for the other four tables
```

### ✓ Step 1 Verification

- [ ] `supabase db push` — no errors
- [ ] All five tables exist in Supabase dashboard
- [ ] Computed columns `engagement_rate` and `save_rate` visible in table schema
- [ ] RLS policies active on all tables

---

## Step 2 — Base API Client

> **File:** `lib/meta/client.ts`

Single function that all sync operations use. Handles token errors, rate limits,
and empty responses consistently so callers do not repeat this logic.

```typescript
export interface GraphOptions {
  token: string
  params?: Record<string, string>
  method?: 'GET' | 'POST'
  body?: Record<string, string>
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public subcode?: number
  ) {
    super(message)
  }
}

const BASE = 'https://graph.instagram.com/v25.0'

export async function graphRequest<T>(path: string, opts: GraphOptions): Promise<T> {
  const url = new URL(`${BASE}${path}`)

  if (opts.method !== 'POST') {
    url.searchParams.set('access_token', opts.token)
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      url.searchParams.set(k, v)
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    ...(opts.method === 'POST'
      ? {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            access_token: opts.token,
            ...opts.body,
          }),
        }
      : {}),
  })

  const data = await res.json()

  if (data.error) {
    const { message, code, error_subcode } = data.error
    // Code 190 = expired/invalid token — trigger refresh
    // Code 32 = rate limit
    throw new MetaApiError(message, code, error_subcode)
  }

  return data as T
}

// Respect rate limit: 200 calls/hour per account
// 500ms between calls = max 120/min = safe
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
```

### ✓ Step 2 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Call `graphRequest('/me', { token: testToken, params: { fields: 'id,username' } })` — returns profile

---

## Step 3 — Media Sync Function

> **File:** `lib/meta/sync.ts`

Fetches all posts on the account and stores them in `ig_media`.
Called at connection time (backfill) and daily (new posts).

```typescript
export async function syncAccountMedia(
  igUserId: string,
  accessToken: string,
  clientId: string,
  supabase: SupabaseClient
): Promise<number> {
  let synced = 0
  let nextUrl: string | null = null

  // First page
  const firstPage = await graphRequest<{ data: IgMediaObject[]; paging: Paging }>(
    `/${igUserId}/media`,
    {
      token: accessToken,
      params: {
        fields:
          'id,caption,media_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count',
        limit: '50',
      },
    }
  )

  const processPage = async (items: IgMediaObject[]) => {
    const rows = items.map((m) => ({
      client_id: clientId,
      ig_media_id: m.id,
      media_type: m.media_type,
      caption: m.caption ?? null,
      permalink: m.permalink ?? null,
      thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
      published_at: m.timestamp,
      like_count: m.like_count ?? 0,
      comments_count: m.comments_count ?? 0,
      synced_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('ig_media').upsert(rows, { onConflict: 'ig_media_id' })

    if (error) throw error
    synced += rows.length
  }

  await processPage(firstPage.data)
  nextUrl = firstPage.paging?.next ?? null

  // Follow pagination (Instagram returns 50 per page)
  while (nextUrl) {
    const page = await fetch(nextUrl).then((r) => r.json())
    await processPage(page.data ?? [])
    nextUrl = page.paging?.next ?? null
    await sleep(300) // stay well within rate limit
  }

  return synced
}
```

### ✓ Step 3 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Call for a test account — rows appear in `ig_media`
- [ ] Re-run — no duplicate rows (upsert on `ig_media_id`)
- [ ] Pagination followed for accounts with 50+ posts

---

## Step 4 — Post Insights Sync Function

> **File:** `lib/meta/sync.ts`

Fetches lifetime insights for each post and stores in `ig_media_insights`.
Skips posts younger than 20 hours (insights not ready).
Skips posts older than 90 days (API returns nothing).

```typescript
export async function syncMediaInsights(
  clientId: string,
  accessToken: string,
  supabase: SupabaseClient
): Promise<{ synced: number; skipped: number; empty: number }> {
  const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const { data: posts } = await supabase
    .from('ig_media')
    .select('ig_media_id, media_type, published_at')
    .eq('client_id', clientId)
    .gte('published_at', cutoff90d.toISOString())
    .order('published_at', { ascending: false })

  let synced = 0,
    skipped = 0,
    empty = 0

  for (const post of posts ?? []) {
    const hoursOld = (Date.now() - new Date(post.published_at).getTime()) / 3_600_000

    if (hoursOld < 20) {
      skipped++
      continue // too fresh — insights not populated yet
    }

    const isReels = post.media_type === 'REELS'
    const metrics = [
      'reach',
      'views',
      'likes',
      'comments',
      'shares',
      'saved',
      ...(isReels ? ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'] : []),
    ].join(',')

    try {
      const data = await graphRequest<{ data: InsightMetric[] }>(`/${post.ig_media_id}/insights`, {
        token: accessToken,
        params: { metric: metrics },
      })

      if (!data.data?.length) {
        empty++
        continue // API returned nothing — post not yet eligible
      }

      const values: Record<string, number> = {}
      for (const item of data.data) {
        values[item.name] = item.values?.[0]?.value ?? 0
      }

      await supabase.from('ig_media_insights').upsert(
        {
          ig_media_id: post.ig_media_id,
          client_id: clientId,
          fetched_at: new Date().toISOString(),
          reach: values.reach ?? 0,
          views: values.views ?? 0,
          likes: values.likes ?? 0,
          comments: values.comments ?? 0,
          shares: values.shares ?? 0,
          saved: values.saved ?? 0,
          avg_watch_time: values.ig_reels_avg_watch_time ?? null,
        },
        { onConflict: 'ig_media_id' }
      )

      synced++
    } catch (err) {
      if (err instanceof MetaApiError && err.code === 100) {
        // Post not supported for insights (e.g. very old post)
        skipped++
        continue
      }
      throw err
    }

    await sleep(500) // 200 calls/hour limit — stay safe
  }

  return { synced, skipped, empty }
}
```

### ✓ Step 4 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Run for test account — `ig_media_insights` rows populated
- [ ] Posts under 20h old: skipped, no error
- [ ] Re-run: existing rows updated (upsert), no duplicates
- [ ] `engagement_rate` and `save_rate` computed columns have correct values

---

## Step 5 — Account Daily Sync Function

> **File:** `lib/meta/sync.ts`

Fetches account-level daily metrics and stores in `ig_account_daily`.
Called for a specific date — the cron passes yesterday.

```typescript
export async function syncAccountDaily(
  igUserId: string,
  accessToken: string,
  clientId: string,
  date: Date,
  supabase: SupabaseClient
): Promise<void> {
  const since = Math.floor(date.getTime() / 1000)
  const until = Math.floor((date.getTime() + 86_400_000) / 1000)

  const data = await graphRequest<{ data: InsightMetric[] }>(`/${igUserId}/insights`, {
    token: accessToken,
    params: {
      metric: 'reach,views,profile_views,follows,follower_count',
      period: 'day',
      since: String(since),
      until: String(until),
    },
  })

  if (!data.data?.length) return // no data for this date yet

  const values: Record<string, number> = {}
  for (const metric of data.data) {
    values[metric.name] = metric.values?.[0]?.value ?? 0
  }

  const dateStr = date.toISOString().split('T')[0]!

  await supabase.from('ig_account_daily').upsert(
    {
      client_id: clientId,
      date: dateStr,
      reach: values.reach ?? 0,
      views: values.views ?? 0,
      profile_views: values.profile_views ?? 0,
      follows: values.follows ?? 0,
      follower_count: values.follower_count ?? 0,
    },
    { onConflict: 'client_id,date' }
  )
}
```

**Backfill helper** — call at connection time to fill the last 90 days:

```typescript
export async function backfillAccountDaily(
  igUserId: string,
  accessToken: string,
  clientId: string,
  supabase: SupabaseClient,
  days = 90
): Promise<void> {
  for (let i = 1; i <= days; i++) {
    const date = new Date(Date.now() - i * 86_400_000)
    await syncAccountDaily(igUserId, accessToken, clientId, date, supabase)
    await sleep(300)
  }
}
```

### ✓ Step 5 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Run backfill for test account — `ig_account_daily` has ~90 rows
- [ ] Re-run for same date — upsert, no duplicate rows
- [ ] `follower_count`, `reach`, `views` all non-zero for recent dates

---

## Step 6 — Token Refresh

> **File:** `lib/meta/tokens.ts`

Long-lived tokens expire after 60 days of non-use.
The daily cron refreshes any token that expires within 14 days.

```typescript
export async function refreshLongLivedToken(currentToken: string): Promise<{
  accessToken: string
  expiresAt: Date
}> {
  const data = await fetch(
    `https://graph.instagram.com/refresh_access_token?` +
      `grant_type=ig_refresh_token&access_token=${currentToken}`
  ).then((r) => r.json())

  if (data.error) {
    throw new MetaApiError(data.error.message, data.error.code)
  }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

export async function refreshAllTokens(supabase: SupabaseClient): Promise<void> {
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  const { data: accounts } = await supabase
    .from('client_instagram_accounts')
    .select('id, access_token, token_expires_at')
    .eq('is_active', true)
    .lt('token_expires_at', in14Days.toISOString())

  for (const account of accounts ?? []) {
    try {
      const { accessToken, expiresAt } = await refreshLongLivedToken(account.access_token)

      await supabase
        .from('client_instagram_accounts')
        .update({
          access_token: accessToken, // encrypt before storing in production
          token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', account.id)
    } catch (err) {
      // Token fully expired — mark inactive, agency must reconnect
      if (err instanceof MetaApiError && err.code === 190) {
        await supabase
          .from('client_instagram_accounts')
          .update({ is_active: false })
          .eq('id', account.id)

        console.error(`Token expired for account ${account.id} — marked inactive`)
      } else {
        throw err
      }
    }

    await sleep(500)
  }
}
```

### ✓ Step 6 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Refresh runs on a token expiring in 10 days — new token stored
- [ ] Fully expired token — account marked `is_active = false`, no crash

---

## Step 7 — Cron Routes

> **Files:** `app/api/cron/ig-sync/route.ts`, `app/api/cron/ig-daily/route.ts`,
> `app/api/cron/refresh-tokens/route.ts`, `vercel.json`

All cron routes verify the `CRON_SECRET` header before running.

```typescript
// app/api/cron/ig-sync/route.ts
// Every 6 hours — syncs media list + post insights for all active accounts
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceSupabaseClient()

  const { data: accounts } = await supabase
    .from('client_instagram_accounts')
    .select('client_id, ig_user_id, access_token')
    .eq('is_active', true)

  const results = await Promise.allSettled(
    (accounts ?? []).map(async (account) => {
      await syncAccountMedia(account.ig_user_id, account.access_token, account.client_id, supabase)
      return syncMediaInsights(account.client_id, account.access_token, supabase)
    })
  )

  const failed = results.filter((r) => r.status === 'rejected').length
  return Response.json({ processed: accounts?.length ?? 0, failed })
}

// app/api/cron/ig-daily/route.ts
// Daily 3am — yesterday's account metrics for all active accounts
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceSupabaseClient()
  const yesterday = new Date(Date.now() - 86_400_000)

  const { data: accounts } = await supabase
    .from('client_instagram_accounts')
    .select('client_id, ig_user_id, access_token')
    .eq('is_active', true)

  await Promise.allSettled(
    (accounts ?? []).map((account) =>
      syncAccountDaily(
        account.ig_user_id,
        account.access_token,
        account.client_id,
        yesterday,
        supabase
      )
    )
  )

  return Response.json({ date: yesterday.toISOString().split('T')[0] })
}

// app/api/cron/refresh-tokens/route.ts
// Daily 2am — refresh tokens expiring within 14 days
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceSupabaseClient()
  await refreshAllTokens(supabase)
  return Response.json({ ok: true })
}
```

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/ig-sync", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/ig-daily", "schedule": "0 3 * * *" },
    { "path": "/api/cron/refresh-tokens", "schedule": "0 2 * * *" }
  ]
}
```

Add to `.env.local`:

```bash
CRON_SECRET=your-random-secret-here
```

### ✓ Step 7 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Call `/api/cron/ig-sync` with wrong secret — 401 returned
- [ ] Call with correct secret — sync runs, rows appear in tables
- [ ] Vercel dashboard shows three crons scheduled

---

## Step 8 — Phase 1 Verification

```bash
npx tsc --noEmit
npm run build
```

### Data pipeline end-to-end test

1. Connect a test Instagram account via the existing OAuth flow
2. Trigger the backfill manually:
   - Call `syncAccountMedia` — `ig_media` populated
   - Call `syncMediaInsights` — `ig_media_insights` populated for eligible posts
   - Call `backfillAccountDaily` — `ig_account_daily` has ~90 rows
3. Verify Supabase data:
   - [ ] `ig_media`: rows present, `media_type` values correct
   - [ ] `ig_media_insights`: `engagement_rate` and `save_rate` computed correctly
   - [ ] `ig_account_daily`: daily rows for last 90 days, non-zero values
4. Trigger token refresh — new `token_expires_at` stored
5. All cron routes respond correctly

---

## Phase 2 — Analytics UI

---

## Step 9 — Analytics Page Routing

> **Files:** `app/(dashboard)/analytics/page.tsx`,
> `app/(dashboard)/analytics/[clientId]/page.tsx`

The analytics index shows a client selector if the agency manages multiple clients.
Clicking a client loads the per-client analytics page.

```typescript
// app/(dashboard)/analytics/[clientId]/page.tsx
export default async function ClientAnalyticsPage({
  params,
  searchParams,
}: {
  params: { clientId: string }
  searchParams: { range?: '7d' | '30d' | '90d' }
}) {
  const range = searchParams.range ?? '30d'

  // Verify the client belongs to the logged-in agency
  const client = await getClientForCurrentAgency(params.clientId)
  if (!client) notFound()

  // Check if Instagram is connected
  const igAccount = await getInstagramAccount(params.clientId)

  return (
    <AnalyticsPageClient
      client={client}
      igAccount={igAccount}
      initialRange={range}
    />
  )
}
```

### ✓ Step 9 Verification

- [ ] `/analytics/[clientId]` loads without error
- [ ] Wrong client ID returns 404
- [ ] `igAccount` is null when Instagram not connected — shows connect prompt

---

## Step 10 — DateRangePicker + useAnalytics Hook

> **Files:** `components/analytics/DateRangePicker.tsx`, `hooks/useAnalytics.ts`

The date range drives all queries. Changing it re-fetches from Supabase.
No API calls — all data reads from local tables.

```typescript
// hooks/useAnalytics.ts
export function useAnalytics(clientId: string, range: '7d' | '30d' | '90d') {
  const since = useMemo(() => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    return new Date(Date.now() - days * 86_400_000).toISOString()
  }, [range])

  const accountMetrics = useSWR(['account-metrics', clientId, since], () =>
    fetchAccountMetrics(clientId, since)
  )

  const dailyTrend = useSWR(['daily-trend', clientId, since], () =>
    fetchDailyTrend(clientId, since)
  )

  const mediaTypeBreakdown = useSWR(['media-type', clientId, since], () =>
    fetchMediaTypeBreakdown(clientId, since)
  )

  const topPosts = useSWR(['top-posts', clientId, since], () => fetchTopPosts(clientId, since, 5))

  const allMedia = useSWR(['all-media', clientId, since], () => fetchAllMedia(clientId, since))

  return { accountMetrics, dailyTrend, mediaTypeBreakdown, topPosts, allMedia }
}
```

```typescript
// Data fetching functions — all read from Supabase, no API calls
async function fetchAccountMetrics(clientId: string, since: string) {
  const { data } = await supabase
    .from('ig_account_daily')
    .select('reach, views, profile_views, follows, follower_count, date')
    .eq('client_id', clientId)
    .gte('date', since.split('T')[0]!)
    .order('date', { ascending: true })

  if (!data?.length) return null

  return {
    totalReach: data.reduce((s, r) => s + r.reach, 0),
    totalViews: data.reduce((s, r) => s + r.views, 0),
    totalProfileViews: data.reduce((s, r) => s + r.profile_views, 0),
    newFollowers: data.reduce((s, r) => s + r.follows, 0),
    // Period-over-period delta: compare first half vs second half
    reachDelta: computeDelta(data, 'reach'),
    viewsDelta: computeDelta(data, 'views'),
  }
}
```

### ✓ Step 10 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Changing range re-fetches and updates UI
- [ ] No API calls made from the browser (confirm in Network tab)

---

## Step 11 — AccountMetrics Cards

> **File:** `components/analytics/AccountMetrics.tsx`

Four cards: Reach, Views, Profile visits, New followers.
Each shows the period total and a delta vs the previous period.

```typescript
export function AccountMetrics({ data, loading }: {
  data: AccountMetricsData | null
  loading: boolean
}) {
  const cards = [
    { label: 'Reach',          value: data?.totalReach,        delta: data?.reachDelta },
    { label: 'Views',          value: data?.totalViews,        delta: data?.viewsDelta },
    { label: 'Profile visits', value: data?.totalProfileViews, delta: data?.profileViewsDelta },
    { label: 'New followers',  value: data?.newFollowers,      delta: data?.followersDelta },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
      {cards.map(card => (
        <MetricCard key={card.label} {...card} loading={loading} />
      ))}
    </div>
  )
}

function MetricCard({ label, value, delta, loading }) {
  const isPositive = (delta ?? 0) >= 0
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {loading ? '—' : (value?.toLocaleString() ?? '—')}
      </div>
      {delta !== undefined && !loading && (
        <div className={`metric-delta ${isPositive ? 'delta-up' : 'delta-down'}`}>
          {isPositive ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% vs last period
        </div>
      )}
    </div>
  )
}
```

### ✓ Step 11 Verification

- [ ] Four cards render with real data from `ig_account_daily`
- [ ] Delta shows correct sign and percentage
- [ ] Loading state shows `—` not 0
- [ ] All numbers formatted with `toLocaleString()` (no raw floats)

---

## Step 12 — ReachChart

> **File:** `components/analytics/ReachChart.tsx`

Line chart: reach (blue) and views (teal) over the selected period.
One data point per day from `ig_account_daily`.

```typescript
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export function ReachChart({ data }: { data: DailyRow[] }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <span className="chart-title">Daily reach & views</span>
        <div className="chart-legend">
          <LegendItem color="#378ADD" label="Reach" />
          <LegendItem color="#1D9E75" label="Views" />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tickFormatter={d => new Date(d).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              value.toLocaleString(),
              name === 'reach' ? 'Reach' : 'Views',
            ]}
            labelFormatter={d => new Date(d).toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'long' })}
          />
          <Line dataKey="reach" stroke="#378ADD" strokeWidth={1.5} dot={false} />
          <Line dataKey="views" stroke="#1D9E75" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### ✓ Step 12 Verification

- [ ] Chart renders with real data
- [ ] X-axis labels use Bulgarian locale date format
- [ ] Tooltip shows formatted numbers
- [ ] No raw float values visible anywhere

---

## Step 13 — MediaTypeBreakdown

> **File:** `components/analytics/MediaTypeBreakdown.tsx`

Horizontal bar chart comparing average engagement rate by media type.
Data comes from `ig_media` joined with `ig_media_insights`.

```typescript
// Query in useAnalytics:
async function fetchMediaTypeBreakdown(clientId: string, since: string) {
  const { data } = await supabase
    .from('ig_media_insights')
    .select('engagement_rate, ig_media!inner(media_type, published_at, client_id)')
    .eq('ig_media.client_id', clientId)
    .gte('ig_media.published_at', since)
    .gt('reach', 0)

  // Group by media_type and compute averages
  const byType: Record<string, number[]> = {}
  for (const row of data ?? []) {
    const type = row.ig_media.media_type
    byType[type] ??= []
    byType[type]!.push(row.engagement_rate)
  }

  return Object.entries(byType)
    .map(([type, rates]) => ({
      type: formatMediaType(type), // 'CAROUSEL_ALBUM' → 'Carousel'
      avgEngagementRate: rates.reduce((s, r) => s + r, 0) / rates.length,
      postCount: rates.length,
    }))
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
}
```

### ✓ Step 13 Verification

- [ ] Bars render with correct relative widths
- [ ] `CAROUSEL_ALBUM` displays as "Carousel", not raw API value
- [ ] Post count shown below chart for context

---

## Step 14 — TopPosts

> **File:** `components/analytics/TopPosts.tsx`

Ranked list of top 5 posts by save rate.
Each row: rank, thumbnail, caption preview, date + type, save rate.

```typescript
async function fetchTopPosts(clientId: string, since: string, limit: number) {
  const { data } = await supabase
    .from('ig_media_insights')
    .select(
      `
      save_rate, engagement_rate,
      ig_media!inner(ig_media_id, caption, media_type, thumbnail_url, published_at, permalink, client_id)
    `
    )
    .eq('ig_media.client_id', clientId)
    .gte('ig_media.published_at', since)
    .gt('reach', 50) // filter out zero-reach posts
    .order('save_rate', { ascending: false })
    .limit(limit)

  return data ?? []
}
```

### ✓ Step 14 Verification

- [ ] 5 posts listed, highest save rate first
- [ ] Caption truncated correctly with ellipsis
- [ ] Clicking a row opens the Instagram permalink in a new tab

---

## Step 15 — PostGrid

> **File:** `components/analytics/PostGrid.tsx`

Full grid of all posts in the date range.
Hover reveals reach, saves, and engagement rate.
Badge shows media type using Instagram's own classification.

```typescript
export function PostGrid({ posts, loading }: { posts: PostWithInsights[], loading: boolean }) {
  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="card-title">All posts</div>
      <div className="post-grid">
        {posts.map(post => (
          <PostThumb key={post.ig_media_id} post={post} />
        ))}
      </div>
      {posts.length === 0 && !loading && (
        <p style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '2rem' }}>
          No posts in this period
        </p>
      )}
    </div>
  )
}

function PostThumb({ post }: { post: PostWithInsights }) {
  const ins = post.ig_media_insights?.[0]

  return (
    <a href={post.permalink} target="_blank" rel="noopener" className="post-thumb">
      {post.thumbnail_url && (
        <img
          src={post.thumbnail_url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <span className={`post-type-badge badge-${post.media_type.toLowerCase().replace('_album','')}`}>
        {formatMediaType(post.media_type)}
      </span>
      {ins && (
        <div className="post-overlay">
          <span className="post-stat">reach {ins.reach.toLocaleString()}</span>
          <span className="post-stat">saves {ins.saved.toLocaleString()}</span>
          <span className="post-stat">ER {ins.engagement_rate.toFixed(1)}%</span>
        </div>
      )}
    </a>
  )
}
```

### ✓ Step 15 Verification

- [ ] Grid renders all posts in date range
- [ ] Hover shows real metrics from `ig_media_insights`
- [ ] Posts without insights yet: no hover overlay, no errors
- [ ] Media type badge uses correct colour per type
- [ ] Clicking opens Instagram permalink

---

## Step 16 — Phase 2 Verification

```bash
npx tsc --noEmit
npm run build
```

### Full UI walkthrough

- [ ] Analytics page loads in < 500ms (reading from Supabase, not API)
- [ ] 7d / 30d / 90d range selector updates all sections
- [ ] AccountMetrics: 4 cards with non-zero values
- [ ] ReachChart: smooth line, correct date labels
- [ ] MediaTypeBreakdown: bars for each type present in the period
- [ ] TopPosts: 5 posts ranked by save rate
- [ ] PostGrid: all posts visible, hover works on posts with insights
- [ ] No console errors, no unformatted float values visible anywhere

---

## Phase 3 — Paid Ads

---

## Step 17 — Facebook Login OAuth for Ads

> **Files:** `app/api/meta/ads-connect/route.ts`,
> `app/api/meta/ads-callback/route.ts`

Separate OAuth flow using the existing Facebook Login app (the one created before
the Instagram app). Requests `ads_read` permission and stores the Facebook token.

```typescript
// app/api/meta/ads-connect/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')

  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!, // the original Facebook app
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/meta/ads-callback`,
    scope: 'ads_read,ads_management,instagram_basic,pages_read_engagement',
    response_type: 'code',
    state: clientId ?? '',
  })

  return NextResponse.redirect(`https://www.facebook.com/v25.0/dialog/oauth?${params}`)
}

// app/api/meta/ads-callback/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const clientId = searchParams.get('state')

  // Exchange code for token (Facebook flow, not Instagram)
  const tokenRes = await fetch('https://graph.facebook.com/v25.0/oauth/access_token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/meta/ads-callback`,
      code: code!,
    }),
  }).then((r) => r.json())

  // Get list of ad accounts this user has access to
  const adAccounts = await fetch(
    `https://graph.facebook.com/v25.0/me/adaccounts?` +
      `fields=id,name,account_status&access_token=${tokenRes.access_token}`
  ).then((r) => r.json())

  // Store each ad account with the Facebook token
  const supabase = createServerSupabaseClient()
  for (const account of adAccounts.data ?? []) {
    await supabase.from('ig_ad_accounts').upsert(
      {
        client_id: clientId,
        ad_account_id: account.id,
        ad_account_name: account.name,
        facebook_token: tokenRes.access_token, // encrypt in production
        connected_at: new Date().toISOString(),
        is_active: account.account_status === 1,
      },
      { onConflict: 'client_id,ad_account_id' }
    )
  }

  return NextResponse.redirect('/dashboard?success=ads_connected')
}
```

### ✓ Step 17 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] OAuth flow completes — ad accounts stored in `ig_ad_accounts`
- [ ] `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` added to `.env.local`

---

## Step 18 — Ad Account Selector + Storage

When a client has multiple ad accounts, the UI shows a selector.
The selected ad account drives the ads sync and display.

```typescript
// If only one ad account — use it automatically
// If multiple — add a selector to the analytics page header
const activeAdAccount =
  adAccounts.length === 1
    ? adAccounts[0]
    : (adAccounts.find((a) => a.id === selectedAdAccountId) ?? adAccounts[0])
```

### ✓ Step 18 Verification

- [ ] Single ad account: no selector shown, account used automatically
- [ ] Multiple accounts: selector renders, switching updates the ads section

---

## Step 19 — Ads Daily Sync Function + Cron

> **Files:** `lib/meta/ads.ts`, `app/api/cron/ig-ads/route.ts`

```typescript
// lib/meta/ads.ts
export async function syncAdsDailyInsights(
  adAccountId: string,
  facebookToken: string,
  clientId: string,
  since: string,
  until: string,
  supabase: SupabaseClient
): Promise<void> {
  const data = await fetch(
    `https://graph.facebook.com/v25.0/${adAccountId}/insights?` +
      `fields=campaign_id,campaign_name,spend,impressions,reach,clicks,` +
      `cpc,cpm,ctr,actions,instagram_follows&` +
      `time_range={"since":"${since}","until":"${until}"}&` +
      `level=campaign&` +
      `access_token=${facebookToken}`
  ).then((r) => r.json())

  const rows = (data.data ?? []).map((c: any) => ({
    client_id: clientId,
    ad_account_id: adAccountId,
    date: since,
    campaign_id: c.campaign_id,
    campaign_name: c.campaign_name,
    spend: parseFloat(c.spend ?? '0'),
    impressions: parseInt(c.impressions ?? '0'),
    reach: parseInt(c.reach ?? '0'),
    clicks: parseInt(c.clicks ?? '0'),
    cpc: c.cpc ? parseFloat(c.cpc) : null,
    cpm: c.cpm ? parseFloat(c.cpm) : null,
    ctr: c.ctr ? parseFloat(c.ctr) : null,
    instagram_follows: extractAction(c.actions, 'follow'),
  }))

  if (rows.length) {
    await supabase
      .from('ig_ads_daily')
      .upsert(rows, { onConflict: 'client_id,ad_account_id,campaign_id,date' })
  }
}

function extractAction(actions: any[], actionType: string): number {
  return parseInt(actions?.find((a) => a.action_type === actionType)?.value ?? '0')
}
```

```json
// vercel.json — add ads cron
{ "path": "/api/cron/ig-ads", "schedule": "0 4 * * *" }
```

### ✓ Step 19 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Run sync for a test ad account with active campaigns — `ig_ads_daily` populated
- [ ] `spend` has correct decimal precision
- [ ] Re-run — upsert, no duplicates

---

## Step 20 — AdsSection Component

> **File:** `components/analytics/AdsSection.tsx`

Shows ads metrics when connected, or a connect prompt when not.

```typescript
export function AdsSection({ clientId, adAccount, range }: {
  clientId: string
  adAccount: AdAccount | null
  range: string
}) {
  if (!adAccount) {
    return (
      <div className="ads-banner">
        <div>
          <p style={{ fontSize: '14px', fontWeight: 500 }}>Paid ads</p>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Connect a Meta ad account to see spend, reach, and follower gains from campaigns.
          </p>
        </div>
        <a href={`/api/meta/ads-connect?clientId=${clientId}`} className="connect-btn">
          Connect ad account
        </a>
      </div>
    )
  }

  // Ads connected — show metrics
  return (
    <div>
      <div className="section-label">Paid ads — {adAccount.ad_account_name}</div>
      <AdsMetricRow clientId={clientId} adAccountId={adAccount.ad_account_id} range={range} />
      <AdsCampaignTable clientId={clientId} adAccountId={adAccount.ad_account_id} range={range} />
    </div>
  )
}
```

Ads metric cards: total spend, avg CPM, avg CPC, total follower gains from ads.
Campaign table: campaign name, spend, reach, clicks, CTR, CPC, follows — one row per campaign.

### ✓ Step 20 Verification

- [ ] No ad account: banner with connect link renders
- [ ] Ad account connected: metric cards show real data from `ig_ads_daily`
- [ ] Campaign table sortable by spend, reach, CTR

---

## Step 21 — Phase 3 Verification

```bash
npx tsc --noEmit
npm run build
```

- [ ] Facebook Login OAuth completes — ad account stored
- [ ] Ads cron runs — `ig_ads_daily` populated for yesterday
- [ ] AdsSection renders with real campaign data
- [ ] Organic and ads sections clearly visually separated
- [ ] Numbers never show raw floats (spend to 2dp, rates to 1dp)
- [ ] No console errors

---

## Environment Variables Summary

```bash
# Instagram API (already set up)
META_APP_ID=27367382429518496
META_APP_SECRET=your_instagram_app_secret
META_REDIRECT_URI=https://your-domain.com/api/meta/callback

# Facebook API (needed for ads — Phase 3)
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Cron security (all phases)
CRON_SECRET=your-random-secret-min-32-chars

# Supabase (already set up)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # needed for cron routes (bypass RLS)
```

---

## Complete Dependency Map

```
OAuth callback (existing)
  └── syncAccountMedia          → ig_media
  └── backfillAccountDaily      → ig_account_daily (90 days)
  └── syncMediaInsights         → ig_media_insights

Cron: ig-sync (every 6h)
  └── syncAccountMedia          → ig_media (new posts)
  └── syncMediaInsights         → ig_media_insights (new insights)

Cron: ig-daily (3am)
  └── syncAccountDaily          → ig_account_daily (yesterday)

Cron: refresh-tokens (2am)
  └── refreshAllTokens          → client_instagram_accounts (new expiry)

Cron: ig-ads (4am) [Phase 3]
  └── syncAdsDailyInsights      → ig_ads_daily (yesterday)

Analytics page (reads only — zero API calls)
  ├── AccountMetrics            ← ig_account_daily
  ├── ReachChart                ← ig_account_daily
  ├── MediaTypeBreakdown        ← ig_media + ig_media_insights
  ├── TopPosts                  ← ig_media + ig_media_insights
  ├── PostGrid                  ← ig_media + ig_media_insights
  └── AdsSection [Phase 3]      ← ig_ads_daily
```

---

_PostFlow — Instagram Analytics Implementation_
_Phase 1 (data layer) must be running and verified before building Phase 2 (UI)._
_Never display a number that has not passed through toLocaleString(), toFixed(), or Math.round()._
