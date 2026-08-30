import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_IMAGE_COLUMNS, POST_IMAGE_STORAGE_COLUMNS } from '@/lib/queries/select-columns'
import { POST_IMAGES_BUCKET } from '@/utils/constants'
import type { PostImageRow } from '@/types/index'

const BUCKET = POST_IMAGES_BUCKET

/** Storage prefix for wizard-draft visuals — files that have no `posts` row yet (attached on approve). */
export function draftVisualPrefix(clientId: string): string {
  return `${clientId}/drafts/`
}

export interface UploadResult {
  publicUrl: string
  storagePath: string
}

/** Upload bytes to any public bucket and return the durable public URL. Throws on failure. */
export async function uploadToBucket(
  bucket: string,
  storagePath: string,
  file: Buffer,
  contentType: string
): Promise<UploadResult> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage
    .from(bucket)
    .upload(storagePath, file, { contentType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data } = admin.storage.from(bucket).getPublicUrl(storagePath)
  return { publicUrl: data.publicUrl, storagePath }
}

/** Public URL for an object in the post-images bucket (public bucket — the URL is durable). */
export function publicPostImageUrl(storagePath: string): string {
  const admin = createAdminSupabaseClient()
  return admin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
}

/** Upload a post image to the public post-images bucket. */
export async function uploadPostImage(
  file: Buffer,
  fileName: string,
  contentType: string,
  clientId: string,
  postId: string
): Promise<UploadResult> {
  return uploadToBucket(
    BUCKET,
    `${clientId}/${postId}/${Date.now()}-${fileName}`,
    file,
    contentType
  )
}

/** Upload a wizard-draft visual (no `posts` row yet) under the client's drafts prefix. */
export async function uploadDraftVisual(
  file: Buffer,
  clientId: string,
  draftId: string,
  position: number
): Promise<UploadResult> {
  return uploadToBucket(
    BUCKET,
    `${draftVisualPrefix(clientId)}${draftId}/${position}-${Date.now()}.jpg`,
    file,
    'image/jpeg'
  )
}

/** Upload a canvas-element asset for an in-memory wizard draft (logo, cutout, generated vector). */
export async function uploadDraftAsset(
  file: Buffer,
  contentType: string,
  clientId: string,
  draftId: string,
  fileName: string
): Promise<UploadResult> {
  return uploadToBucket(
    BUCKET,
    `${draftVisualPrefix(clientId)}${draftId}/assets/${Date.now()}-${fileName}`,
    file,
    contentType
  )
}

/** Batch-delete draft visuals from storage (discarded wizard drafts). Logs on failure but does not throw. */
export async function deleteDraftVisuals(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return
  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from(BUCKET).remove(storagePaths)
  if (error) {
    console.error('Failed to delete draft visuals from storage:', error.message)
  }
}

/** Delete a post image from storage. Logs on failure but does not throw. */
export async function deletePostImage(storagePath: string): Promise<void> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from(BUCKET).remove([storagePath])
  if (error) {
    console.error(`Failed to delete ${storagePath} from storage:`, error.message)
  }
}

/** The row a position already holds — only the field that decides which file to clean up. */
export interface ExistingPostImage {
  storage_path: string
}

/** The image a position is about to hold, as every writer of one describes it. */
export interface PostImageWrite {
  postId: string
  position: number
  publicUrl: string
  storagePath: string
  fileName: string
  fileSize: number
  contentType: string
  /**
   * A file to keep alive even though the row pointing at it is being replaced — the canvas
   * editor's clean background must survive its own row becoming the flattened export.
   */
  preserveStoragePath?: string
}

/**
 * Put an image at `(post_id, position)`. The ONE way that happens.
 *
 * There were four, and three of them could lose a post's picture. Each deleted the existing row and
 * its storage object, then inserted — so an insert that failed left the position with no image at
 * all and the old file already gone. Deleting second was not an option for them either, because
 * `uq_post_images_post_position` rejects the second row while the first is still there.
 *
 * An upsert against that same unique index is one statement, so a failure leaves the existing row
 * exactly as it was, and the old file is only unlinked once the row already points somewhere else.
 *
 * `known` is the row when the caller has read it already — the canvas save route reads it for its
 * stale-edit check and the generator reads it for the reroll nonce, and re-reading here would be a
 * second identical query on paths that run once per generated slide. Pass `null` to say "I looked
 * and there was nothing"; omit it to have this read.
 */
export async function putPostImage(
  admin: SupabaseClient,
  write: PostImageWrite,
  known?: ExistingPostImage | null
): Promise<PostImageRow> {
  const existing =
    known !== undefined
      ? known
      : ((
          await admin
            .from('post_images')
            .select(POST_IMAGE_STORAGE_COLUMNS)
            .eq('post_id', write.postId)
            .eq('position', write.position)
            .maybeSingle()
        ).data as ExistingPostImage | null)

  const { data, error } = await admin
    .from('post_images')
    .upsert(
      {
        post_id: write.postId,
        public_url: write.publicUrl,
        storage_path: write.storagePath,
        position: write.position,
        file_name: write.fileName,
        file_size: write.fileSize,
        content_type: write.contentType,
      },
      { onConflict: 'post_id,position' }
    )
    .select(POST_IMAGE_COLUMNS)
    .single()
  if (error) throw new Error(`post_images upsert failed: ${error.message}`)

  // Only now is the old file unreferenced. Best-effort: a leaked object costs storage, while
  // failing here would throw away an image the post is already pointing at.
  const stale = existing?.storage_path
  if (stale && stale !== write.storagePath && stale !== write.preserveStoragePath) {
    await deletePostImage(stale).catch((err: unknown) => {
      console.warn(`[storage] could not delete replaced image ${stale}:`, err)
    })
  }
  return data as PostImageRow
}

/** Move a storage object into a post's folder (drafts → post relocation on approve).
 *  Returns the new location, or null on failure (logged; the caller keeps the old path). */
export async function movePostImageObject(
  fromPath: string,
  clientId: string,
  postId: string
): Promise<UploadResult | null> {
  const admin = createAdminSupabaseClient()
  const toPath = `${clientId}/${postId}/${Date.now()}-${fromPath.split('/').pop()}`
  const { error } = await admin.storage.from(BUCKET).move(fromPath, toPath)
  if (error) {
    console.error(`Failed to move ${fromPath} to ${toPath}:`, error.message)
    return null
  }
  const { data } = admin.storage.from(BUCKET).getPublicUrl(toPath)
  return { publicUrl: data.publicUrl, storagePath: toPath }
}

/** How many entries one `.list()` call returns. Also the page size the walk below advances by. */
const LIST_PAGE_SIZE = 100

/** Paths per `.remove()` call. Bounds both the request body and the blast radius of one failure. */
const REMOVE_CHUNK_SIZE = 100

/** One `.list()` entry. Mirrors storage-js's `FileObject`, narrowed to the two fields the walk
 *  reads — declared here rather than imported because `@supabase/storage-js` is not a direct
 *  dependency, and adding it just for a type would register as an unused one. */
interface StorageEntry {
  name: string
  id: string | null
}

/**
 * Every object path beneath a prefix, depth-first.
 *
 * Supabase's `.list()` is neither recursive nor unbounded, so a client's tree —
 * `{clientId}/{postId}/…` and `{clientId}/drafts/{draftId}/assets/…` — has to be walked a page
 * at a time. Folders come back with a null `id`; that is the only thing distinguishing them
 * from objects.
 *
 * The lister is injected so the walk can be tested without a live storage client.
 */
export async function collectPrefixObjects(
  list: (prefix: string, offset: number) => Promise<StorageEntry[]>,
  prefix: string
): Promise<string[]> {
  const paths: string[] = []
  const folders: string[] = []

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const page = await list(prefix, offset)
    for (const entry of page) {
      const path = `${prefix}/${entry.name}`
      if (entry.id === null) folders.push(path)
      else paths.push(path)
    }
    if (page.length < LIST_PAGE_SIZE) break
  }

  for (const folder of folders) {
    paths.push(...(await collectPrefixObjects(list, folder)))
  }

  return paths
}

/**
 * Delete every object under a client-scoped prefix. Returns how many were removed.
 *
 * Never throws: this runs after the client's rows are already gone, so a storage hiccup would
 * turn a completed deletion into a reported failure the user cannot retry.
 *
 * TECH-DEBT §2.2 warns that a *drafts* cleanup job must skip paths still referenced by
 * `post_canvas_docs.doc->background->>storagePath`. This sweep is exempt: it only ever runs for
 * a client whose posts — and therefore whose canvas docs — have been deleted with it.
 */
export async function removeStoragePrefix(bucket: string, prefix: string): Promise<number> {
  // A prefix of '' lists the bucket root, so a bad caller would empty the bucket for every
  // client at once. There is no valid empty or traversing prefix, so refuse rather than clamp.
  if (!prefix || prefix.startsWith('/') || prefix.includes('..')) {
    console.error(`Refusing to sweep storage: unsafe prefix ${JSON.stringify(prefix)}`)
    return 0
  }

  const admin = createAdminSupabaseClient()

  // The walk throws on a list error so a half-enumerated tree can never read as a complete
  // one — but this function is best-effort by contract, so the throw stops here.
  let paths: string[]
  try {
    paths = await collectPrefixObjects(async (at, offset) => {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(at, { limit: LIST_PAGE_SIZE, offset })
      if (error) throw new Error(`Storage list failed for ${at}: ${error.message}`)
      return data ?? []
    }, prefix)
  } catch (err) {
    console.error(`Failed to enumerate ${bucket}/${prefix}:`, err)
    return 0
  }

  let removed = 0
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK_SIZE) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK_SIZE)
    const { error } = await admin.storage.from(bucket).remove(chunk)
    // Keep going: a partial sweep leaves fewer orphans than an aborted one.
    if (error)
      console.error(`Failed to remove ${chunk.length} objects from ${bucket}:`, error.message)
    else removed += chunk.length
  }

  return removed
}
