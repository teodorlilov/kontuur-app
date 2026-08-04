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
// inside the budget — the backlog self-heals across daily runs.
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

  const { data: rows, error } = await admin
    .from('posts')
    .select(VISUAL_BACKLOG_POST_COLUMNS)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[cron/visuals] failed to load pending posts:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const posts = (rows ?? []) as BacklogPost[]
  const imagesByPost = await fetchImagesByPost(posts.map((p) => p.id))
  const jobs = pickVisualBacklog(posts, imagesByPost, {
    qualityFloor: QUALITY_FLOOR,
    maxAttempts: MAX_VISUAL_ATTEMPTS,
    maxImagesPerRun: MAX_IMAGES_PER_RUN,
  })

  // Count the attempt up front — a run that fails mid-post still counted, so
  // a post whose generations keep dying cannot eat every future run.
  for (const job of jobs) {
    const post = posts.find((p) => p.id === job.postId)
    if (!post) continue
    await admin
      .from('posts')
      .update({ visuals_attempts: post.visuals_attempts + 1 })
      .eq('id', job.postId)
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
