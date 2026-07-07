# Instagram Publishing Pipeline — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not skip steps. Do not modify files not listed here.
> The calendar is the primary publishing surface — posts are scheduled from there.

---

## How Instagram publishing actually works

Meta requires a two-step process. You cannot push an image directly.

**Step 1 — Create a media container**
POST to `/{ig-user-id}/media` with the image URL and post details.
Returns a `creation_id`. The image must be at a **publicly accessible HTTPS URL**.

**Step 2 — Publish the container**
POST to `/{ig-user-id}/media_publish` with the `creation_id`.
This is the moment the post goes live on Instagram.

For carousels (multiple images):
1. Create one container per image → get N `creation_id`s
2. Create a carousel container referencing all N IDs
3. Publish the carousel container

**Critical constraint:** The image URL must be publicly accessible at publish time.
This means images must be in Supabase Storage with public bucket access — not a signed URL.

---

## Architecture

```
User uploads image(s) in post editor
  → Images stored in Supabase Storage (public bucket)
  → Public URLs saved to posts table

Scheduler triggers at post's scheduled_at time
  → Reads post from DB, fetches client's Instagram token
  → Calls /media to create container(s) with image URL(s)
  → Polls container status until FINISHED (or 30s timeout)
  → Calls /media_publish to go live
  → Updates post status: scheduled → published / failed
```

---

## Database changes

```sql
-- Add publishing fields to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS
  image_urls       TEXT[]    DEFAULT '{}';   -- Supabase Storage public URLs

ALTER TABLE posts ADD COLUMN IF NOT EXISTS
  ig_creation_id   TEXT;                     -- container ID from step 1

ALTER TABLE posts ADD COLUMN IF NOT EXISTS
  ig_media_id      TEXT;                     -- published media ID from step 2

ALTER TABLE posts ADD COLUMN IF NOT EXISTS
  published_at     TIMESTAMPTZ;              -- when actually published

ALTER TABLE posts ADD COLUMN IF NOT EXISTS
  publish_error    TEXT;                     -- last error if failed

ALTER TABLE posts ADD COLUMN IF NOT EXISTS
  publish_attempts INTEGER   DEFAULT 0;      -- retry counter

-- Post status values (extend existing):
-- 'draft' | 'review' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'failed'
```

---

## File structure

| File | Change |
|---|---|
| `src/lib/instagram/publish.ts` | CREATE — Instagram API publish functions |
| `src/lib/instagram/storage.ts` | CREATE — image upload to Supabase Storage |
| `src/lib/instagram/scheduler.ts` | CREATE — find and publish due posts |
| `src/app/api/instagram/publish/route.ts` | CREATE — manual publish endpoint |
| `src/app/api/cron/publish/route.ts` | CREATE — scheduled cron endpoint |
| `src/app/api/posts/[id]/images/route.ts` | CREATE — image upload endpoint |
| `src/components/calendar/post-modal.tsx` | UPDATE — add image upload section |
| `src/components/posts/image-uploader.tsx` | CREATE — drag-drop image component |

---

## Step 1 — DB migration

> **File:** `supabase/migrations/[timestamp]_add_publishing_fields.sql`

```sql
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS image_urls       TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ig_creation_id   TEXT,
  ADD COLUMN IF NOT EXISTS ig_media_id      TEXT,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_error    TEXT,
  ADD COLUMN IF NOT EXISTS publish_attempts INTEGER     DEFAULT 0;
```

Also create a **public** Supabase Storage bucket for post images:

```sql
-- Run in Supabase dashboard → Storage → New bucket
-- Name: post-images
-- Public: YES (required — Instagram must be able to fetch the URL)
```

Or via the Supabase client:
```typescript
await supabase.storage.createBucket('post-images', { public: true })
```

### ✓ Step 1 Verification
- [ ] Columns exist on `posts` table
- [ ] `post-images` bucket exists in Supabase Storage
- [ ] Bucket is **public** — test by uploading a file and fetching the public URL directly in the browser

---

## Step 2 — Instagram publish functions

> **File:** `src/lib/instagram/publish.ts`

```typescript
const IG_API = 'https://graph.facebook.com/v21.0'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PublishResult {
  success:   boolean
  mediaId?:  string
  error?:    string
}

interface ContainerStatus {
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'
  status:      string
}

// ── Single image post ───────────────────────────────────────────────────────

export async function publishSingleImage(
  igUserId:    string,
  accessToken: string,
  imageUrl:    string,
  caption:     string
): Promise<PublishResult> {
  try {
    // Step 1: Create container
    const containerRes = await fetch(
      `${IG_API}/${igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url:    imageUrl,
          caption,
          access_token: accessToken,
        }),
      }
    )
    const container = await containerRes.json()
    if (!containerRes.ok || !container.id) {
      return { success: false, error: container.error?.message ?? 'Container creation failed' }
    }

    // Step 2: Wait for container to be ready
    const ready = await waitForContainer(container.id, accessToken)
    if (!ready) {
      return { success: false, error: 'Container processing timeout' }
    }

    // Step 3: Publish
    return await publishContainer(igUserId, container.id, accessToken)

  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Carousel post ───────────────────────────────────────────────────────────

export async function publishCarousel(
  igUserId:    string,
  accessToken: string,
  imageUrls:   string[],
  caption:     string
): Promise<PublishResult> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    return { success: false, error: 'Carousel requires 2–10 images' }
  }

  try {
    // Step 1: Create one container per image (IS_CAROUSEL_ITEM = true)
    const childIds: string[] = []

    for (const imageUrl of imageUrls) {
      const res = await fetch(`${IG_API}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url:        imageUrl,
          is_carousel_item: true,
          access_token:     accessToken,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.id) {
        return { success: false, error: `Child container failed: ${data.error?.message}` }
      }
      childIds.push(data.id)
    }

    // Step 2: Create carousel container
    const carouselRes = await fetch(`${IG_API}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type:   'CAROUSEL',
        children:     childIds.join(','),
        caption,
        access_token: accessToken,
      }),
    })
    const carousel = await carouselRes.json()
    if (!carouselRes.ok || !carousel.id) {
      return { success: false, error: carousel.error?.message ?? 'Carousel container failed' }
    }

    // Step 3: Wait for carousel container
    const ready = await waitForContainer(carousel.id, accessToken)
    if (!ready) {
      return { success: false, error: 'Carousel container timeout' }
    }

    // Step 4: Publish
    return await publishContainer(igUserId, carousel.id, accessToken)

  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Reel (video) ────────────────────────────────────────────────────────────
// Reels use video_url instead of image_url and media_type: REELS

export async function publishReel(
  igUserId:    string,
  accessToken: string,
  videoUrl:    string,
  caption:     string
): Promise<PublishResult> {
  try {
    const containerRes = await fetch(`${IG_API}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type:   'REELS',
        video_url:    videoUrl,
        caption,
        access_token: accessToken,
      }),
    })
    const container = await containerRes.json()
    if (!containerRes.ok || !container.id) {
      return { success: false, error: container.error?.message ?? 'Reel container failed' }
    }

    // Reels take longer to process — poll for up to 2 minutes
    const ready = await waitForContainer(container.id, accessToken, 120_000)
    if (!ready) {
      return { success: false, error: 'Reel processing timeout' }
    }

    return await publishContainer(igUserId, container.id, accessToken)

  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function waitForContainer(
  containerId:  string,
  accessToken:  string,
  timeoutMs:    number = 30_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const interval = 3_000 // poll every 3s

  while (Date.now() < deadline) {
    const res = await fetch(
      `${IG_API}/${containerId}?fields=status_code,status&access_token=${accessToken}`
    )
    const data: ContainerStatus = await res.json()

    if (data.status_code === 'FINISHED') return true
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') return false

    // IN_PROGRESS — wait and retry
    await new Promise(r => setTimeout(r, interval))
  }

  return false // timeout
}

async function publishContainer(
  igUserId:    string,
  creationId:  string,
  accessToken: string
): Promise<PublishResult> {
  const res = await fetch(`${IG_API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id:  creationId,
      access_token: accessToken,
    }),
  })
  const data = await res.json()

  if (!res.ok || !data.id) {
    return { success: false, error: data.error?.message ?? 'Publish failed' }
  }

  return { success: true, mediaId: data.id }
}
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `publishSingleImage` function exists and is typed correctly
- [ ] `publishCarousel` handles 2–10 images
- [ ] `waitForContainer` polls and returns false on timeout

---

## Step 3 — Supabase Storage upload helper

> **File:** `src/lib/instagram/storage.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'

const BUCKET = 'post-images'

export interface UploadResult {
  publicUrl: string
  path:      string
}

export async function uploadPostImage(
  file:        File | Buffer,
  fileName:    string,
  contentType: string,
  workspaceId: string,
  postId:      string
): Promise<UploadResult> {
  const supabase = await createServerSupabaseClient()

  // Organise by workspace/post to avoid collisions
  const path = `${workspaceId}/${postId}/${Date.now()}-${fileName}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return { publicUrl: data.publicUrl, path }
}

export async function deletePostImage(path: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase.storage.from(BUCKET).remove([path])
}

export async function getPublicUrl(path: string): Promise<string> {
  const supabase = await createServerSupabaseClient()
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
```

**Critical:** The bucket must be public. Signed URLs expire and Instagram cannot
fetch an expired URL at publish time. Always use `getPublicUrl`, never `createSignedUrl`.

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Upload a test file and verify the returned `publicUrl` is accessible in a browser without authentication
- [ ] URL format: `https://[project].supabase.co/storage/v1/object/public/post-images/[path]`

---

## Step 4 — Image upload API endpoint

> **File:** `src/app/api/posts/[id]/images/route.ts`

Accepts multipart form data. Validates file type and size. Uploads to storage.
Returns the public URL. Updates `posts.image_urls` array.

```typescript
import { NextResponse } from 'next/server'
import { uploadPostImage }  from '@/lib/instagram/storage'

const MAX_SIZE_MB   = 8          // Instagram max: 8MB for images
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png']

export async function POST(
  req:    Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file     = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG and PNG files are accepted' },
      { status: 400 }
    )
  }

  // Validate size
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `File must be under ${MAX_SIZE_MB}MB` },
      { status: 400 }
    )
  }

  // Verify post belongs to this workspace
  const supabase = await createServerSupabaseClient()
  const { data: post } = await supabase
    .from('posts')
    .select('id, image_urls, workspace_id')
    .eq('id', params.id)
    .eq('workspace_id', session.workspaceId)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  // Upload
  const buffer = Buffer.from(await file.arrayBuffer())
  const { publicUrl, path } = await uploadPostImage(
    buffer,
    file.name,
    file.type,
    session.workspaceId,
    params.id
  )

  // Append URL to post
  const updatedUrls = [...(post.image_urls ?? []), publicUrl]
  await supabase
    .from('posts')
    .update({ image_urls: updatedUrls })
    .eq('id', params.id)

  return NextResponse.json({ publicUrl, path, imageUrls: updatedUrls })
}

export async function DELETE(
  req:    Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { path, url } = await req.json()

  const supabase = await createServerSupabaseClient()
  const { data: post } = await supabase
    .from('posts')
    .select('id, image_urls')
    .eq('id', params.id)
    .eq('workspace_id', session.workspaceId)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  // Delete from storage
  await deletePostImage(path)

  // Remove URL from array
  const updatedUrls = (post.image_urls ?? []).filter((u: string) => u !== url)
  await supabase
    .from('posts')
    .update({ image_urls: updatedUrls })
    .eq('id', params.id)

  return NextResponse.json({ imageUrls: updatedUrls })
}
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] POST with a valid JPEG returns `publicUrl`
- [ ] POST with a file over 8MB returns 400
- [ ] POST with a PDF or GIF returns 400
- [ ] DELETE removes the file from storage and updates the DB array

---

## Step 5 — Image uploader component

> **File:** `src/components/posts/image-uploader.tsx`

```typescript
'use client'

interface ImageUploaderProps {
  postId:      string
  imageUrls:   string[]       // current images saved on the post
  maxImages?:  number         // default 10 (carousel limit)
  onChange:    (urls: string[]) => void
}
```

### Layout

```
┌─────────────────────────────────────────────────┐
│  Images  (2 / 10)                               │
├─────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌──────────────────────┐  │
│ │ img 1  │ │ img 2  │ │  Drop files here or  │  │
│ │  [×]   │ │  [×]   │ │   click to upload    │  │
│ └────────┘ └────────┘ │  JPEG or PNG, ≤8MB   │  │
│                        └──────────────────────┘  │
│  ℹ First image is the cover. Drag to reorder.   │
└─────────────────────────────────────────────────┘
```

```typescript
const [uploading, setUploading] = useState(false)
const [error,     setError]     = useState<string | null>(null)
const inputRef = useRef<HTMLInputElement>(null)

async function handleFiles(files: FileList | File[]) {
  const fileArray = Array.from(files)
  const remaining = (maxImages ?? 10) - imageUrls.length
  const toUpload  = fileArray.slice(0, remaining)

  if (fileArray.length > remaining) {
    setError(`Max ${maxImages ?? 10} images. ${fileArray.length - remaining} file(s) skipped.`)
  }

  setUploading(true)
  setError(null)

  const newUrls: string[] = []
  for (const file of toUpload) {
    const form = new FormData()
    form.append('file', file)

    const res  = await fetch(`/api/posts/${postId}/images`, { method: 'POST', body: form })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Upload failed')
      break
    }
    newUrls.push(data.publicUrl)
  }

  onChange([...imageUrls, ...newUrls])
  setUploading(false)
}

async function handleDelete(url: string, index: number) {
  const res = await fetch(`/api/posts/${postId}/images`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (res.ok) {
    onChange(imageUrls.filter((_, i) => i !== index))
  }
}
```

**Drag-and-drop:**
```typescript
function handleDrop(e: React.DragEvent) {
  e.preventDefault()
  if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
}
```

**Image thumbnail:**
- Fixed 80×80px square, `object-fit: cover`, rounded 8px
- Delete button: 18px × 18px circle, top-right corner, `×` glyph, slate background
- "Cover" label on first image: 10px, muted, below thumbnail

**Upload zone:**
- Dashed border `1.5px rgba(44,62,80,0.20)`, border-radius 10px
- Hidden `<input type="file" accept="image/jpeg,image/png" multiple ref={inputRef}/>`
- Click zone calls `inputRef.current?.click()`
- Drag-over: border turns terracotta `#C07B55`, background `rgba(192,123,85,0.04)`
- Loading state: spinner replaces the upload zone content

**Error display:**
```tsx
{error && (
  <div style={{
    marginTop: '8px', fontSize: '11px', color: '#A32D2D',
    background: '#FCEBEB', padding: '7px 10px', borderRadius: '6px',
  }}>
    {error}
  </div>
)}
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Single file click-to-upload works
- [ ] Drag-and-drop works
- [ ] Multiple files upload sequentially, thumbnails appear as each completes
- [ ] Delete button removes thumbnail and calls DELETE endpoint
- [ ] First image shows "Cover" label
- [ ] Uploading more than maxImages shows error and uploads only up to limit
- [ ] Component accepts `.jpg` and `.png` only (browser file picker enforced)
- [ ] Upload zone greys out and shows spinner while uploading

---

## Step 6 — Add image uploader to post modal

> **File:** `src/components/calendar/post-modal.tsx` (existing)

Find the section where caption/content is edited. Add `ImageUploader` below it.

```typescript
// In the modal's edit state, add:
import { ImageUploader } from '@/components/posts/image-uploader'

// In JSX, below the caption textarea:
<div style={{ marginTop: '16px' }}>
  <div style={{
    fontSize: '12px', fontWeight: 500, color: 'var(--sl)',
    marginBottom: '8px', letterSpacing: '0.3px',
  }}>
    Images
  </div>
  <ImageUploader
    postId={post.id}
    imageUrls={imageUrls}
    maxImages={post.postType === 'carousel' ? 10 : 1}
    onChange={setImageUrls}
  />

  {/* Post type indicator */}
  {imageUrls.length > 1 && (
    <div style={{
      marginTop: '8px', fontSize: '11px', color: 'var(--mu)',
      display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      <span style={{
        background: 'rgba(44,62,80,0.07)', padding: '2px 8px',
        borderRadius: '4px', fontSize: '10px', fontWeight: 500,
      }}>
        Carousel · {imageUrls.length} images
      </span>
    </div>
  )}
</div>
```

**Max images rule:**
- Single image post (`postType === 'single'`): `maxImages={1}`
- Carousel (`postType === 'carousel'`): `maxImages={10}`
- Reel: no image upload (video only — leave this for a future plan)

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] ImageUploader appears in the post modal edit view
- [ ] Carousel posts allow up to 10 images
- [ ] Single posts limit to 1 image
- [ ] Images persist after saving the post (saved to DB, not just state)

---

## Step 7 — Scheduler logic

> **File:** `src/lib/instagram/scheduler.ts`

This is the function that runs on a cron trigger. Finds posts due for publishing
and publishes them.

```typescript
import { publishSingleImage, publishCarousel } from './publish'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function publishDuePosts(): Promise<void> {
  const supabase = await createServerSupabaseClient()

  // Find posts scheduled for now (within the past 5 minutes, not yet published)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data: posts } = await supabase
    .from('posts')
    .select(`
      id, caption, image_urls, post_type, scheduled_at,
      publish_attempts,
      clients (
        id,
        instagram_user_id,
        instagram_access_token
      )
    `)
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .gte('scheduled_at', fiveMinutesAgo)
    .lt('publish_attempts', 3)   // max 3 attempts
    .limit(10)                   // process in batches

  if (!posts || posts.length === 0) return

  for (const post of posts) {
    await publishPost(supabase, post)
  }
}

async function publishPost(supabase: any, post: any): Promise<void> {
  const client = post.clients

  // Guard: must have Instagram connected
  if (!client?.instagram_user_id || !client?.instagram_access_token) {
    await markFailed(supabase, post.id, 'Client has no Instagram connected')
    return
  }

  // Guard: must have at least one image
  if (!post.image_urls || post.image_urls.length === 0) {
    await markFailed(supabase, post.id, 'Post has no images')
    return
  }

  // Mark as publishing (prevents duplicate runs)
  await supabase
    .from('posts')
    .update({
      status:           'publishing',
      publish_attempts: post.publish_attempts + 1,
    })
    .eq('id', post.id)

  // Call the appropriate publish function
  let result
  if (post.image_urls.length === 1) {
    result = await publishSingleImage(
      client.instagram_user_id,
      client.instagram_access_token,
      post.image_urls[0],
      post.caption ?? ''
    )
  } else {
    result = await publishCarousel(
      client.instagram_user_id,
      client.instagram_access_token,
      post.image_urls,
      post.caption ?? ''
    )
  }

  if (result.success) {
    await supabase
      .from('posts')
      .update({
        status:      'published',
        ig_media_id: result.mediaId,
        published_at: new Date().toISOString(),
        publish_error: null,
      })
      .eq('id', post.id)
  } else {
    const attempts = post.publish_attempts + 1
    await supabase
      .from('posts')
      .update({
        status:        attempts >= 3 ? 'failed' : 'scheduled',
        publish_error: result.error,
      })
      .eq('id', post.id)
  }
}

async function markFailed(supabase: any, postId: string, reason: string): Promise<void> {
  await supabase
    .from('posts')
    .update({ status: 'failed', publish_error: reason })
    .eq('id', postId)
}
```

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `publishDuePosts` fetches only posts with `status = 'scheduled'` and `scheduled_at <= now()`
- [ ] Posts with `publish_attempts >= 3` are excluded (no infinite retry)
- [ ] On success: status → `published`, `ig_media_id` and `published_at` set
- [ ] On failure: status → `scheduled` (retry) or `failed` (after 3 attempts)
- [ ] Posts with no images set status → `failed` immediately

---

## Step 8 — Cron endpoint

> **File:** `src/app/api/cron/publish/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { publishDuePosts } from '@/lib/instagram/scheduler'

// This endpoint is called by Vercel Cron every minute
export async function GET(req: Request) {
  // Security: verify cron secret so only Vercel can trigger this
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await publishDuePosts()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Publish cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

**`vercel.json` — add cron config:**
```json
{
  "crons": [
    {
      "path": "/api/cron/publish",
      "schedule": "* * * * *"
    }
  ]
}
```

**`.env.local` — add:**
```
CRON_SECRET=your-random-secret-here
```

> **Note:** Vercel Cron runs every minute minimum. This is accurate enough for social scheduling.
> Vercel sets the `Authorization: Bearer <CRON_SECRET>` header automatically.

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] `vercel.json` has cron entry
- [ ] `CRON_SECRET` set in environment variables
- [ ] GET without correct auth header returns 401
- [ ] After deploy: check Vercel dashboard → Cron Jobs — job appears and runs

---

## Step 9 — Manual publish endpoint

> **File:** `src/app/api/instagram/publish/route.ts`

For publishing immediately (not scheduled) — used when user clicks "Publish now"
from the calendar.

```typescript
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await req.json()
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  const supabase = await createServerSupabaseClient()

  // Fetch post with client Instagram credentials
  const { data: post } = await supabase
    .from('posts')
    .select(`
      id, caption, image_urls, post_type, status,
      clients ( instagram_user_id, instagram_access_token )
    `)
    .eq('id', postId)
    .eq('workspace_id', session.workspaceId)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  if (post.status === 'published') {
    return NextResponse.json({ error: 'Already published' }, { status: 400 })
  }

  if (!post.image_urls || post.image_urls.length === 0) {
    return NextResponse.json({ error: 'Post has no images' }, { status: 400 })
  }

  const client = post.clients
  if (!client?.instagram_user_id || !client?.instagram_access_token) {
    return NextResponse.json({ error: 'No Instagram connected' }, { status: 400 })
  }

  // Mark as publishing
  await supabase.from('posts').update({ status: 'publishing' }).eq('id', postId)

  // Publish
  let result
  if (post.image_urls.length === 1) {
    result = await publishSingleImage(
      client.instagram_user_id,
      client.instagram_access_token,
      post.image_urls[0],
      post.caption ?? ''
    )
  } else {
    result = await publishCarousel(
      client.instagram_user_id,
      client.instagram_access_token,
      post.image_urls,
      post.caption ?? ''
    )
  }

  if (result.success) {
    await supabase.from('posts').update({
      status:        'published',
      ig_media_id:   result.mediaId,
      published_at:  new Date().toISOString(),
      publish_error: null,
    }).eq('id', postId)

    return NextResponse.json({ ok: true, mediaId: result.mediaId })
  } else {
    await supabase.from('posts').update({
      status:        'failed',
      publish_error: result.error,
    }).eq('id', postId)

    return NextResponse.json({ error: result.error }, { status: 500 })
  }
}
```

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] POST with valid postId publishes immediately and returns `mediaId`
- [ ] Returns 400 if post has no images
- [ ] Returns 400 if already published
- [ ] Returns 400 if no Instagram connected
- [ ] Post status updates correctly in DB on both success and failure

---

## Step 10 — Calendar: Publish Now button

> **File:** `src/components/calendar/post-modal.tsx` (existing)

For approved posts with images, show a "Publish now" button alongside the
"Schedule" button.

```typescript
const [publishing, setPublishing] = useState(false)
const [publishError, setPublishError] = useState<string | null>(null)

async function handlePublishNow() {
  setPublishing(true)
  setPublishError(null)

  const res = await fetch('/api/instagram/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId: post.id }),
  })
  const data = await res.json()

  if (res.ok) {
    onClose()          // close the modal
    router.refresh()   // refresh the calendar
  } else {
    setPublishError(data.error ?? 'Publish failed')
    setPublishing(false)
  }
}
```

```tsx
{/* Show only when: post is approved, has images, not yet published */}
{post.status === 'approved' && imageUrls.length > 0 && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <button
      onClick={handlePublishNow}
      disabled={publishing}
      style={{
        padding: '10px 20px',
        background: publishing ? 'rgba(44,62,80,0.25)' : '#C07B55',
        color: '#ECE8E1', border: 'none', borderRadius: '9px',
        fontSize: '13px', fontWeight: 500, cursor: publishing ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: '7px',
      }}
    >
      {publishing ? (
        <>
          <span style={{ /* spinner */ }}/> Publishing...
        </>
      ) : (
        <>Publish to Instagram now</>
      )}
    </button>

    {publishError && (
      <div style={{
        fontSize: '11px', color: '#A32D2D',
        background: '#FCEBEB', padding: '8px 10px', borderRadius: '6px',
      }}>
        {publishError}
      </div>
    )}
  </div>
)}
```

### ✓ Step 10 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] "Publish to Instagram now" button shows only for approved posts with images
- [ ] Button shows spinner while publishing
- [ ] On success: modal closes, calendar refreshes, post shows as published
- [ ] On failure: error message shown below button, button re-enables

---

## Step 11 — Calendar visual: published status

> **File:** wherever calendar post chips are rendered

Published posts should show a green dot or "Published" indicator so the manager
can see at a glance what went live.

```typescript
const STATUS_COLORS = {
  draft:      'rgba(44,62,80,0.20)',
  review:     '#2C5F8A',
  approved:   '#5A8A4A',
  scheduled:  '#C07B55',
  publishing: '#C07B55',
  published:  '#5A8A4A',
  failed:     '#A32D2D',
}

// In the post chip:
<div style={{
  width: '6px', height: '6px', borderRadius: '50%',
  background: STATUS_COLORS[post.status] ?? 'var(--mu)',
  flexShrink: 0,
}}/>
```

For failed posts, show a warning icon in the chip instead of the dot.

### ✓ Step 11 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Published posts show green dot
- [ ] Failed posts show red indicator
- [ ] Scheduled posts show terracotta dot
- [ ] Publishing (in-progress) shows terracotta animated

---

## Step 12 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Full publish flow test

**Single image:**
1. Open a post in the calendar → edit mode
2. Upload one JPEG image → thumbnail appears
3. Click "Publish to Instagram now"
4. Wait 5–10 seconds
5. Check Instagram — post should be live
6. Check DB — `status: published`, `ig_media_id` set, `published_at` set

**Carousel:**
1. Open a carousel post → upload 3 images
2. Publish now
3. Check Instagram — carousel with 3 images

**Scheduled post:**
1. Set `scheduled_at` to 2 minutes from now
2. Wait for cron to trigger
3. Check DB and Instagram after the time passes

**Error case:**
1. Upload an image, then delete it from Supabase Storage directly
2. Try to publish → should fail gracefully with a clear error message
3. Check DB — `status: failed`, `publish_error` set

### Instagram-specific checks
- [ ] Single image appears on Instagram feed
- [ ] Carousel swipeable on Instagram
- [ ] Caption renders correctly including line breaks
- [ ] Emoji in caption renders correctly
- [ ] No duplicate posts (publishing status prevents double-runs)

---

## Token expiry — important

Long-lived Instagram access tokens expire after **60 days**. Without a refresh system,
all client connections will silently break after two months.

Add a cron job that refreshes tokens before they expire:

```typescript
// GET /{access-token}?grant_type=ig_refresh_token&access_token={access-token}
// Call weekly for all connected clients
// Update instagram_access_token and instagram_token_expires_at in clients table
```

This is a separate plan — but flag it as high priority before going live with real clients.

---

## What is NOT in this plan

| Feature | Why excluded |
|---|---|
| Reel (video) publishing | Video upload is more complex — separate plan |
| Story publishing | Requires additional permissions — future |
| Hashtag injection | Post-generation concern, not publishing |
| Scheduled caption editing | Edit the post before scheduled_at — no new logic |
| Retry UI for failed posts | Failed posts can be retried by re-approving |

---

## Implementation order for Claude Code

```
Step 1  → DB migration + create storage bucket
Step 2  → lib/instagram/publish.ts
Step 3  → lib/instagram/storage.ts
Step 4  → api/posts/[id]/images/route.ts
Step 5  → components/posts/image-uploader.tsx
Step 6  → post-modal.tsx (add ImageUploader)
         ↑ verify upload works before building scheduler
Step 7  → lib/instagram/scheduler.ts
Step 8  → api/cron/publish/route.ts + vercel.json
Step 9  → api/instagram/publish/route.ts
Step 10 → post-modal.tsx (Publish Now button)
Step 11 → calendar post chip status colours
Step 12 → end-to-end verification
```

---

*Kontuur — Instagram Publishing Pipeline*
*Supabase Storage (public bucket) → Media container → Publish.*
*Cron runs every minute for scheduled posts. Manual publish available from calendar.*
*Max 3 retry attempts on failure. Token refresh required separately.*