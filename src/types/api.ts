// Imported from './database' rather than the './index' barrel, which re-exports
// this file — going through it would make the two circular.
import type { Tables } from './database'
import type { SlideText } from './slide'
import type { PostColumns, UserColumns } from '@/lib/queries/select-columns'
import type { PublicationSummary } from '@/lib/posts/publish-state'
// Imported rather than only re-exported at the foot of the file: `ValidationData` below is
// built from these, and a bare `export … from` re-export does not bring a name into scope here.
import type {
  LanguageIssueType,
  LanguageValidationResult as LanguageResult,
  SlopDetection,
  SourceGroundingResult,
  ValidationCriteria,
  ValidationScores,
} from '@/ai/validation/types'

type PostRow = Tables<'posts'>
type NotificationRow = Tables<'notifications'>
type SocialConnectionRow = Tables<'social_connections'>

// ---- Shared enums / unions ----

export type PostType = 'single' | 'carousel'

export interface PostImage {
  id: string
  publicUrl: string
  storagePath: string
  position: number
  fileName: string | null
  fileSize: number | null
  contentType: string | null
}

// ---- Generate ----

/**
 * A campaign or announcement written ahead of the researched mix — and the shape a
 * client idea takes once it reaches generation.
 *
 * `platform` follows the empty-string convention `targetDate` set: the editor ships
 * every field, `''` until chosen. Empty inherits the run's platform; a value
 * overrides it for that one post — so an idea asked for on Instagram can ride along
 * with researched posts written for LinkedIn in a single run. The wire schema
 * (`priorityPostSchema`) narrows the value to `PLATFORMS`.
 */
export interface PriorityPost {
  title: string
  brief: string
  targetDate: string
}

/** A slide as it is stored: its text, plus the position metadata the writer stamps on. */
export interface CarouselSlide extends SlideText {
  slide_number?: number
  slide_role?: 'cover' | 'content' | 'cta'
}

// ---- URL Analysis ----

export interface UrlAnalysisResponse {
  detected_business_name: string | null
  detected_niche: string
  detected_niche_confidence: 'high' | 'medium' | 'low'
  detected_target_audience: string[]
  detected_tone: string
  detected_content_pillars: Array<{ pillar: string; weight: number }>
  detected_services_products: string[]
  detected_language: string
  detected_language_formality: string
  detected_is_health_niche: boolean
  detected_avoid_topics: string | null
}

// ---- Research ----

// ---- Pillars ----

// ---- Client Ideas ----

// The single definition. It was restated as a zod enum in the ideas feature to
// validate PATCH /api/ideas; that route is gone, and nothing parses a status off the
// wire — the values reaching `ClientIdea` come from the column, which 20260817
// constrains to exactly these three ('generating' was retired there: nothing has
// written it since the generate routes merged, and stranded rows migrate to 'new').
export type IdeaStatus = 'new' | 'generated' | 'dismissed'

export interface ClientIdea {
  id: string
  clientId: string
  clientName: string
  clientNiche: string | null
  ideaText: string
  extraNotes: string | null
  targetDate: string | null
  status: IdeaStatus
  generatedPostId: string | null
  submittedAt: string
  readAt: string | null
}

// ---- Approval ----

/** A post as the public approval page reads it, plus the note the client left. */
export type ApprovalPostData = Pick<
  PostRow,
  'id' | 'caption' | 'post_type' | 'scheduled_at' | 'pillar'
> & {
  slides_json: unknown
  client_note: string | null
  images: PostImage[]
}

export interface ApprovalBatchData {
  posts: ApprovalPostData[]
  clientName: string
  agencyName: string
  status: string
  expiresAt: string
}

// ---- Comments ----

/** What we can do about a comment, once it is in front of someone. */
export type CommentStatus = 'needs_reply' | 'answered' | 'hidden'

/**
 * One comment as the queue renders it.
 *
 * Deliberately not `Tables<'ig_comments'>`: the stored row carries the scoping
 * columns the read already spent (`client_id`, `ig_account_id`, `ig_media_id`) and
 * none of the derivation the surface needs. `status` and `replies` are computed on
 * the server so the browser never has to know what "answered" means.
 */
export interface QueuedComment {
  id: string
  /** Null when the app lacks Advanced Access — Instagram returns the id alone. */
  authorUsername: string | null
  text: string | null
  commentedAt: string | null
  likeCount: number | null
  hidden: boolean
  status: CommentStatus
  /** Threaded under this comment, oldest first. Includes our own replies. */
  replies: QueuedCommentReply[]
}

export interface QueuedCommentReply {
  id: string
  authorUsername: string | null
  text: string | null
  commentedAt: string | null
  /** True when the reply was posted by the client's own connected account. */
  fromUs: boolean
}

/**
 * A post and everything said under it — the queue's unit, because a comment read
 * without the post it answers is half a sentence.
 *
 * `postId` is null for media published outside Kontuur, which is a normal case: the
 * agency may have posted from the Instagram app before connecting. Those groups
 * still render, from `thumbnailUrl` and the comments themselves.
 */
export interface CommentGroup {
  igMediaId: string
  postId: string | null
  clientId: string
  clientName: string
  caption: string | null
  pillar: string | null
  publishedAt: string | null
  imageUrl: string | null
  /** Instagram's own link to the post, when the nightly metrics sync has recorded one. */
  permalink: string | null
  comments: QueuedComment[]
}

// ---- Calendar ----

/**
 * A calendar row: everything a `POST_COLUMNS` select returns, plus the joined
 * name, images and approval state the calendar resolves alongside them.
 *
 * Derived from `PostColumns` rather than restating its own `Pick`. The
 * hand-written version listed 15 of the 23 columns the query already fetched, so
 * `topic_summary`, `published_at` and four others arrived over the wire on every load
 * and were invisible to the type system — and it disagreed with the equivalent list
 * in `/review`.
 *
 * The two `Omit`ed columns are narrowed below: the raw ones are `Json`, and every
 * surface parses them into its own shape rather than trusting the column.
 */
export type CalendarPost = Omit<PostColumns, 'slides_json' | 'validation_json'> & {
  client_name: string
  /**
   * Where this post went, one entry per destination.
   *
   * The calendar used to read `posts.status` for 'published' and `publish_error` for why a
   * publish failed. Both moved here when a post gained more than one destination — a post
   * live on Instagram and failed on Facebook has two answers, and one column could only
   * ever hold one of them. `publishStateOf` reduces these to the single word a cell shows.
   */
  publications: PublicationSummary[]
  /** Parsed on the way in, unlike the raw column. */
  slides_json: CarouselSlide[] | null
  /**
   * Adapted server-side by `toValidationData`, exactly as /review does it — the raw
   * `validation_json` blob no longer crosses the wire at all.
   *
   * The card used to call `parseStoredValidation` in the browser, which put the ~280 KB zod
   * chunk in the calendar's client bundle for one panel. Null means the stored blob predates
   * every readable shape; the quality panel is omitted, which is what it already did.
   */
  validation: ValidationData | null
  images: PostImage[]
  approval_status: string | null
  approval_client_note: string | null
  approval_responded_at: string | null
  /**
   * When the client's approval link stops working.
   *
   * Carried because a post sitting at `pending` says nothing about whether anyone can
   * still act on it: a lapsed link and a link nobody has opened yet look identical on
   * every surface, and the answer decides whether the agency waits or re-sends.
   */
  approval_expires_at: string | null
}

/**
 * A post's validation evidence in the shape every review surface renders.
 *
 * Lives here rather than in `types/post.ts` because all five of its members already reach
 * consumers through this file: post.ts imports from api.ts, so declaring it there and
 * referencing it from `CalendarPost` above would have made the two files circular.
 */
export interface ValidationData {
  language: LanguageResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
  criteria: ValidationCriteria
  scores: ValidationScores
}

// ---- Dashboard Change Requests ----

export interface DashboardChangeRequest {
  id: string
  clientId: string
  clientName: string
  caption: string | null
  postType: string
  slidesJson: CarouselSlide[] | null
  scheduledAt: string | null
  clientNote: string | null
  respondedAt: string | null
  postNumber: number
}

// ---- Generation runs ----

/** A generation batch currently composing, as surfaced by the app shell. */
export interface ActiveRun {
  id: string
  clientName: string
  targetCount: number
  doneCount: number
  startedAt: string
}

// ---- Notifications ----

/**
 * The bell keys its title, body and icon off this closed set, and falls back to reading the
 * MESSAGE when a row has no type. `approval_sent` was missing: sending an approval wrote a
 * type-less row whose message says "Approval link generated…", which contains no "approved", so
 * the fallback's else branch labelled it "requested changes" — the bell told the agency their
 * client had rejected a batch they had just sent out.
 */
export type NotificationType =
  | 'client_approved_all'
  | 'client_feedback'
  | 'posts_ready'
  | 'approval_sent'

export type EnrichedNotification = Pick<
  NotificationRow,
  | 'id'
  | 'agency_id'
  | 'message'
  | 'is_read'
  | 'created_at'
  | 'client_id'
  | 'post_id'
  | 'feedback_text'
  | 'review_token'
> & {
  /** Narrowed from the column's plain string to the kinds the UI actually renders. */
  type: NotificationType | null
}

// ---- Settings / Team ----

/**
 * Derived, not restated. The hand-written version typed `created_at` as `string` over a nullable
 * column and was applied by a cast, so the member list rendered a null as 1 January 1970.
 */
export type TeamMember = UserColumns

export interface AgencyInfo {
  id: string
  name: string
  plan: string
  mode: string
  subscription_status: string
  trial_ends_at: string
  plan_client_limit: number
  timezone: string
}

export type SettingsTab = 'team' | 'account' | 'integrations' | 'profile'

// ---- Meta Connections ----

export type MetaConnection = Pick<
  SocialConnectionRow,
  'id' | 'account_id' | 'account_name' | 'token_expires_at' | 'created_at'
> & {
  /** Narrowed from the column's plain string: the table also holds 'canva' rows,
   *  which every consumer of this type filters out. */
  platform: 'instagram'
}

// ---- API error ----

// Re-export validation types so consumers import from '@/types/api'. Names come from the
// import at the top of this file, so the source module is named once.
export type {
  LanguageIssueType,
  LanguageResult,
  SlopDetection,
  SourceGroundingResult,
  ValidationCriteria,
  ValidationScores,
}

export type { SlideText } from './slide'

export type { ClientSource, SourceSuggestion, DiscoverPagesResponse } from './sources'
