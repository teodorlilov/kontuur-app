import { NextResponse, type NextRequest } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createSemaphore } from '@/lib/concurrency'
import { fetchImagesByPost } from '@/features/publishing/lib/fetch-post-images'
import { generatePostVisual } from '@/lib/visual/generate-post-visual'
import { pickVisualBacklog, type BacklogPost } from '@/lib/visual/visual-backlog'
import { VISUAL_BACKLOG_POST_COLUMNS } from '@/lib/queries/select-columns'
import { QUALITY_FLOOR } from '@/utils/constants'

export const maxDuration = 300
// Stop launching new generations past this point so in-flight ones finish
// before Vercel kills the function at maxDuration.
const TIME_BUDGET_MS = 240_000
// One gpt-image-2 generation runs ~52s; two lanes fit roughly this many
// inside the budget — the backlog self-heals across hourly runs.
const MAX_IMAGES_PER_RUN = 12
const MAX_VISUAL_ATTEMPTS = 3
const CONCURRENCY = 2

/**
 * Paint the missing visuals for pending_review posts so they arrive in the
 * queue as finished creatives. Runs after the generate cron; quality-gated so
 * likely-discards get no art spend. Text composition stays browser-side —
 * the queue bakes copy onto these clean images on first open.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const admin = createAdminSupabaseClient()

  // Server-side mirror of pickVisualBacklog's gates: an hourly tick must not ship
  // every pending post's slides_json across the wire to conclude nothing is due.
  // A null score is ELIGIBLE on both sides — it means the judge did not run, which
  // is our failure, not the post's. `.gte` alone would silently exclude it, since
  // SQL three-valued logic makes NULL >= 5 unknown.
  const { data: rows, error } = await admin
    .from('posts')
    .select(VISUAL_BACKLOG_POST_COLUMNS)
    .eq('status', 'pending_review')
    .lt('visuals_attempts', MAX_VISUAL_ATTEMPTS)
    .or(`quality_score_avg.is.null,quality_score_avg.gte.${QUALITY_FLOOR}`)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[cron/visuals] failed to load pending posts:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const posts = (rows ?? []) as BacklogPost[]
  if (posts.length === 0) {
    return NextResponse.json({
      posts: 0,
      generated: 0,
      failed: 0,
      skipped_no_copy: 0,
      skipped_for_time: 0,
      duration_ms: Date.now() - startedAt,
    })
  }
  const imagesByPost = await fetchImagesByPost(posts.map((p) => p.id))
  const jobs = pickVisualBacklog(posts, imagesByPost, {
    qualityFloor: QUALITY_FLOOR,
    maxAttempts: MAX_VISUAL_ATTEMPTS,
    maxImagesPerRun: MAX_IMAGES_PER_RUN,
  })

  // The attempt is counted when a post's first position actually starts — a
  // run that dies mid-post is still counted, but a job the time budget never
  // reached is not. Counting up front burned the attempt cap on unstarted
  // tail jobs of every over-full run, which hourly cadence makes permanent.
  const attemptCounted = new Set<string>()
  const countAttempt = async (postId: string) => {
    const post = posts.find((p) => p.id === postId)
    if (!post) return
    const { error: attemptError } = await admin
      .from('posts')
      .update({ visuals_attempts: post.visuals_attempts + 1 })
      .eq('id', postId)
    // An uncounted attempt lets a permanently failing post retry forever and
    // hold a slot in every run's backlog.
    if (attemptError) {
      console.error(`[cron/visuals] attempt count failed for post ${postId}:`, attemptError.message)
    }
  }

  const semaphore = createSemaphore(CONCURRENCY)
  let generated = 0
  let failed = 0
  let skippedNoCopy = 0
  let skippedForTime = 0

  await Promise.all(
    jobs.flatMap((job) =>
      job.positions.map(async (position) => {
        const release = await semaphore.acquire()
        try {
          if (Date.now() - startedAt > TIME_BUDGET_MS) {
            skippedForTime++
            return
          }
          // Synchronous check-and-add, so two lanes on one post count once.
          if (!attemptCounted.has(job.postId)) {
            attemptCounted.add(job.postId)
            await countAttempt(job.postId)
          }
          const result = await generatePostVisual({
            postId: job.postId,
            clientId: job.clientId,
            position,
          })
          if (result.ok) generated++
          else skippedNoCopy++
        } catch (err) {
          failed++
          console.error(`[cron/visuals] post ${job.postId} position ${position} failed:`, err)
        } finally {
          release()
        }
      })
    )
  )

  return NextResponse.json({
    posts: jobs.length,
    generated,
    failed,
    skipped_no_copy: skippedNoCopy,
    skipped_for_time: skippedForTime,
    duration_ms: Date.now() - startedAt,
  })
}
