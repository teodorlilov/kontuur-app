import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const BUCKET = 'post-images'

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

/** Upload a post image to the public `post-images` bucket. */
export async function uploadPostImage(
  file: Buffer,
  fileName: string,
  contentType: string,
  clientId: string,
  postId: string
): Promise<UploadResult> {
  return uploadToBucket(BUCKET, `${clientId}/${postId}/${Date.now()}-${fileName}`, file, contentType)
}

/** Upload a wizard-draft visual (no `posts` row yet) under the client's drafts prefix. */
export async function uploadDraftVisual(
  file: Buffer,
  clientId: string,
  draftId: string,
  position: number
): Promise<UploadResult> {
  return uploadToBucket(BUCKET, `${draftVisualPrefix(clientId)}${draftId}/${position}-${Date.now()}.jpg`, file, 'image/jpeg')
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

/** Remove any existing image at a post position (storage file + row) so a new one can take its place. */
export async function replaceExistingImage(
  admin: SupabaseClient,
  postId: string,
  position: number
): Promise<void> {
  const { data: existing } = await admin
    .from('post_images')
    .select('id, storage_path')
    .eq('post_id', postId)
    .eq('position', position)
    .single()
  if (existing) {
    await deletePostImage(existing.storage_path)
    await admin.from('post_images').delete().eq('id', existing.id)
  }
}
