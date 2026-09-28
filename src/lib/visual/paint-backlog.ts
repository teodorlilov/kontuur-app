import 'server-only'

import type { AdminClient } from '@/lib/supabase/admin'
import { mapWithConcurrency } from '@/lib/concurrency'
import type { EntitledClient } from '@/lib/billing/entitled-clients'
import { poolLeft } from '@/lib/billing/post-allowance'
import { AllowanceError, readUsageByAgency, runMetered } from '@/lib/billing/usage'
import { imagesWaiting } from '@/lib/billing/copy'
import { notify } from '@/lib/notifications/notify'
import { MS_PER_HOUR } from '@/utils/constants'
import type { PostImage } from '@/types/api'
import { generatePostVisual } from './generate-post-visual'
import { pickVisualBacklog, type BacklogPost, type VisualJob } from './visual-backlog'
import { readPostVisualPages } from './post-visuals'

/**
 * The run's image budget. A post is painted whole, so it must hold the largest carousel
 * (`MAX_CAROUSEL_SLIDES`, pinned in src/lib/visual/__tests__/paint-backlog.test.ts); one
 * gpt-image-2 generation runs about 52 s, so about ten fit the cron's 240 s (`TIME_BUDGET_MS`,
 * src/app/api/cron/visuals/route.ts) on two lanes, and the time budget stops the rest for the next
 * tick.
 */
export const MAX_IMAGES_PER_RUN = 12

/**
 * Minimum gap between two attempts on the same post. Three attempts an hour apart are three
 * samples of the same outage; at six hours the three span half a day, so exhausting the cap means
 * the post itself cannot be painted — which is the only thing the cap should ever mean.
 */
const RETRY_SPACING_MS = 6 * MS_PER_HOUR

/** Two generations at once — the provider's and the time budget's comfortable width. */
const CONCURRENCY = 2

interface PaintableBacklog {
  jobs: VisualJob[]
  /** Every post read, by id — what the attempt write increments from. */
  postsById: Map<string, BacklogPost>
  /**
   * Per workspace, how many posts its image pool could not pay for whole, with the entitlement its
   * bell is worded on; null when the read was cut short.
   */
  refusedByAgency: Map<string, ImagesWaiting> | null
}

/** A workspace's posts this tick could not paint for its pool, and the entitlement they wait on. */
interface ImagesWaiting {
  posts: number
  entitlement: EntitledClient['entitlement']
}

/**
 * This tick's work: every entitled workspace's image pool, then the paintable review-queue backlog
 * read page by page and picked until the run budget is filled or the rows run out. Paged, not a
 * fixed window, so neither fully painted posts awaiting review nor a spent pool starves the rest.
 * Past a few thousand undecided posts this becomes a stored "owes pictures" flag, as
 * `fetchEntitledClients` notes for its list.
 * A read failing before any post arrives throws; a later one is logged, what was picked is still
 * painted, and `refusedByAgency` is null, since a partial count would under-report the bell.
 */
export async function selectPaintableBacklog(
  admin: AdminClient,
  entitled: ReadonlyMap<string, EntitledClient>,
  now: Date
): Promise<PaintableBacklog> {
  if (entitled.size === 0) return { jobs: [], postsById: new Map(), refusedByAgency: new Map() }
  const owners = new Map([...entitled.values()].map((owner) => [owner.agencyId, owner]))
  const usage = await readUsageByAgency(
    [...owners.values()].map((owner) => ({
      agencyId: owner.agencyId,
      periodKey: owner.entitlement.periodKey,
    }))
  )
  const imagesLeft = new Map(
    [...owners.values()].map((owner) => {
      const committed = usage.get(owner.agencyId)!.committed
      return [owner.agencyId, poolLeft(owner.entitlement.limits, committed, 'image') ?? Infinity]
    })
  )
  const agencyOf = new Map([...entitled].map(([clientId, owner]) => [clientId, owner.agencyId]))
  const retryCutoff = new Date(now.getTime() - RETRY_SPACING_MS).toISOString()

  const posts: BacklogPost[] = []
  const imagesByPost = new Map<string, PostImage[]>()
  const generatingByPost = new Map<string, number[]>()
  let complete = true
  let pick: ReturnType<typeof pickVisualBacklog> = { jobs: [], refused: [] }
  try {
    const pages = readPostVisualPages(admin, [...entitled.keys()], ['pending_review'], retryCutoff)
    for await (const page of pages) {
      posts.push(...page.posts)
      for (const [id, images] of page.imagesByPost) imagesByPost.set(id, images)
      for (const [id, positions] of page.generatingByPost) generatingByPost.set(id, positions)
      pick = pickVisualBacklog(
        posts,
        imagesByPost,
        {
          maxImagesPerRun: MAX_IMAGES_PER_RUN,
          retrySpacingMs: RETRY_SPACING_MS,
          agencyOf,
          imagesLeft,
          generatingByPost,
        },
        now
      )
      const planned = pick.jobs.reduce((sum, job) => sum + job.positions.length, 0)
      if (planned >= MAX_IMAGES_PER_RUN) break
    }
  } catch (err) {
    if (posts.length === 0) throw err
    console.error(`[cron/visuals] backlog page after ${posts.length} posts failed:`, err)
    complete = false
  }

  let refusedByAgency: Map<string, ImagesWaiting> | null = null
  if (complete) {
    refusedByAgency = new Map()
    for (const post of pick.refused) {
      const owner = entitled.get(post.client_id)
      if (!owner) continue
      const waiting = refusedByAgency.get(owner.agencyId)
      refusedByAgency.set(owner.agencyId, {
        posts: (waiting?.posts ?? 0) + 1,
        entitlement: owner.entitlement,
      })
    }
  }
  return {
    jobs: pick.jobs,
    postsById: new Map(posts.map((post) => [post.id, post])),
    refusedByAgency,
  }
}

/** What one paint tick did, by position. */
interface PaintOutcome {
  generated: number
  failed: number
  skippedNoCopy: number
  skippedInFlight: number
  skippedAllowance: number
  skippedForTime: number
}

/**
 * Record a failed attempt on a post: the counter and its stamp in one write, since the two are one
 * attempt and a gap between them is a window where the cap and the spacing disagree. An uncounted
 * attempt lets a permanently failing post retry forever, so a failed write is logged.
 */
async function countAttempt(admin: AdminClient, post: BacklogPost): Promise<void> {
  const { error } = await admin
    .from('posts')
    .update({
      visuals_attempts: post.visuals_attempts + 1,
      visuals_attempted_at: new Date().toISOString(),
    })
    .eq('id', post.id)
  if (error) {
    console.error(`[cron/visuals] attempt count failed for post ${post.id}:`, error.message)
  }
}

/**
 * Paint the picked positions until `deadline`, each as a metered spend against its workspace's
 * entitlement (`runMetered`). An attempt is counted once per post per tick, and only for a failure
 * of the post's own — a thrown generation, or no post or copy to paint from; a position the time
 * budget never reached, one another invocation is painting (`in_flight`) or one the pool refused
 * costs the post nothing.
 */
export async function paintBacklog(
  admin: AdminClient,
  backlog: Pick<PaintableBacklog, 'jobs' | 'postsById'>,
  entitled: ReadonlyMap<string, EntitledClient>,
  deadline: number
): Promise<PaintOutcome> {
  const outcome: PaintOutcome = {
    generated: 0,
    failed: 0,
    skippedNoCopy: 0,
    skippedInFlight: 0,
    skippedAllowance: 0,
    skippedForTime: 0,
  }
  const attempted = new Set<string>()
  const failedOnce = async (postId: string) => {
    if (attempted.has(postId)) return
    attempted.add(postId)
    const post = backlog.postsById.get(postId)
    if (post) await countAttempt(admin, post)
  }
  const positions = backlog.jobs.flatMap((job) =>
    job.positions.map((position) => ({ ...job, position }))
  )
  await mapWithConcurrency(positions, CONCURRENCY, async ({ postId, clientId, position }) => {
    if (Date.now() > deadline) {
      outcome.skippedForTime++
      return
    }
    const owner = entitled.get(clientId)
    try {
      const result = await runMetered(
        {
          agencyId: owner?.agencyId ?? null,
          clientId,
          flow: 'generation',
          entitlement: owner?.entitlement,
        },
        () => generatePostVisual({ postId, clientId, position })
      )
      if (result.ok) outcome.generated++
      else if (result.reason === 'in_flight') outcome.skippedInFlight++
      else {
        outcome.skippedNoCopy++
        await failedOnce(postId)
      }
    } catch (err) {
      if (err instanceof AllowanceError) {
        outcome.skippedAllowance++
        return
      }
      outcome.failed++
      console.error(`[cron/visuals] post ${postId} position ${position} failed:`, err)
      await failedOnce(postId)
    }
  })
  return outcome
}

/**
 * One bell per workspace per period whose review-queue posts this tick could not paint for its
 * image pool (`images_waiting:<period>`, distinct from the generate cron's allowance bell), with
 * the count of those posts in the message and never in the key. A bell that cannot be written is
 * logged: the pictures wait either way.
 */
export async function ringImagesWaiting(
  admin: AdminClient,
  refusedByAgency: ReadonlyMap<string, ImagesWaiting>
): Promise<void> {
  for (const [agencyId, { posts, entitlement }] of refusedByAgency) {
    try {
      await notify(admin, {
        agencyId,
        type: 'allowance_reached',
        message: imagesWaiting(posts, entitlement),
        dedupKey: `images_waiting:${entitlement.periodKey}`,
      })
    } catch (err) {
      console.error(`[cron/visuals] images-waiting bell failed for ${agencyId}:`, err)
    }
  }
}
