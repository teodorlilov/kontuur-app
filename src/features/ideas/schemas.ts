import { z } from 'zod'
import { PLATFORMS } from '@/utils/constants'

/**
 * Caps on what the public form can send.
 *
 * The submit route is the only unauthenticated write in the app and runs on the
 * service-role client, so "a client typed too much" and "someone is posting a
 * megabyte at the endpoint" have to be told apart before the insert, not after.
 * Generous against real use: the longest field is a paragraph describing a post.
 * Exported so the form enforces the same numbers (maxLength, add-card cap)
 * instead of letting a client hit them as a rejection.
 */
export const IDEA_TEXT_MAX = 2000
export const EXTRA_NOTES_MAX = 2000
export const MAX_IDEAS_PER_SUBMISSION = 10

/**
 * Ids one mark-as-read may carry.
 *
 * Loose because the inbox still loads every idea an agency has ever received, so the
 * client legitimately sends as many ids as it rendered; paginating that read is what
 * would let this tighten to a page (docs/TECH-DEBT.md §7). Exported so the view
 * chunks to the same number instead of silently no-opping past it.
 */
export const MARK_READ_MAX = 500

/**
 * Every id crossing this boundary is a database uuid. Declared once and named per
 * use below, so a caller passing a client id where an idea id belongs still fails
 * on the argument rather than on a shape the two happen to share.
 */
const uuid = z.uuid()

/**
 * One idea brief as a client submits it through the public link.
 *
 * This is the single definition of that shape: the public form, the submit
 * route and the insert helper previously each hand-wrote their own copy, and
 * they had already drifted apart.
 *
 * `''` is admitted alongside the real values because the form ships every field on
 * every brief, empty until typed — so an empty string is how it says "not chosen",
 * and `submitIdeas` is what turns it into a null column.
 */
export const ideaBriefSchema = z.object({
  ideaText: z.string().trim().min(1).max(IDEA_TEXT_MAX),
  extraNotes: z.string().max(EXTRA_NOTES_MAX).optional(),
  platform: z.literal('').or(z.enum(PLATFORMS)).optional(),
  targetDate: z.literal('').or(z.iso.date()).optional(),
})

/** Public submission payload: the client's link token plus at least one brief. */
export const submitIdeasSchema = z.object({
  token: z.string().min(1),
  ideas: z.array(ideaBriefSchema).min(1).max(MAX_IDEAS_PER_SUBMISSION),
})

/** Server-action arg: the client whose idea link is being issued. */
export const ensureIdeaTokenSchema = uuid

/**
 * Server-action arg: the ideas being taken out of, or put back into, the inbox.
 *
 * Bounded by the same cap as mark-as-read, for the same reason — the client sends what
 * it rendered, and a bulk dismiss can carry a whole page of selected rows.
 */
export const ideaIdsSchema = z.array(uuid).min(1).max(MARK_READ_MAX)

/** Server-action arg: the ideas a rendered page has just shown the agency. */
export const markIdeasReadSchema = z.array(uuid).min(1).max(MARK_READ_MAX)

/** Server-action arg: the approved post that fulfils an idea. */
export const linkGeneratedPostSchema = z.object({ ideaId: uuid, postId: uuid })

export type IdeaBrief = z.infer<typeof ideaBriefSchema>
export type SubmitIdeasInput = z.infer<typeof submitIdeasSchema>

/**
 * Maps a submit-payload zod failure to a message the client can act on.
 *
 * The public form displays the route's `error` verbatim, and every failure used
 * to collapse into "At least one idea brief is required" — shown to a client
 * staring at eleven filled-in cards. First issue wins: one clear instruction
 * beats a list.
 */
export function submitIdeasErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'At least one idea brief is required'

  const [root, , field] = issue.path
  // Path length matters: the batch cap fails at ['ideas'] while an oversize
  // field fails at ['ideas', n, field] — both are too_big under 'ideas'.
  if (root === 'ideas' && issue.path.length === 1 && issue.code === 'too_big') {
    return `You can send up to ${MAX_IDEAS_PER_SUBMISSION} ideas at once`
  }
  if (field === 'ideaText' && issue.code === 'too_big') {
    return `An idea can be up to ${IDEA_TEXT_MAX.toLocaleString('en-US')} characters`
  }
  if (field === 'extraNotes' && issue.code === 'too_big') {
    return `Notes can be up to ${EXTRA_NOTES_MAX.toLocaleString('en-US')} characters`
  }
  if (field === 'platform') return 'Choose a platform from the list, or leave it empty'
  if (field === 'targetDate') return 'The target date must be a real date'
  return 'At least one idea brief is required'
}
