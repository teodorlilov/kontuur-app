import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const BUCKET = 'post-images'

export interface UploadResult {
  publicUrl: string
  storagePath: string
}

/** Upload bytes to a public storage bucket and return the public URL — the one place that touches
 *  `storage.upload` + `getPublicUrl`, shared by post images and generated plates. Throws on failure. */
export async function uploadToBucket(
  bucket: string,
  storagePath: string,
  file: Buffer,
  contentType: string
): Promise<UploadResult> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from(bucket).upload(storagePath, file, { contentType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data } = admin.storage.from(bucket).getPublicUrl(storagePath)
  return { publicUrl: data.publicUrl, storagePath }
}

/** Upload a post image to the public post-images bucket. */
export async function uploadPostImage(
  file: Buffer,
  fileName: string,
  contentType: string,
  clientId: string,
  postId: string
): Promise<UploadResult> {
  return uploadToBucket(BUCKET, `${clientId}/${postId}/${Date.now()}-${fileName}`, file, contentType)
}

/** Delete a post image from storage. Logs on failure but does not throw. */
export async function deletePostImage(storagePath: string): Promise<void> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from(BUCKET).remove([storagePath])
  if (error) {
    console.error(`Failed to delete ${storagePath} from storage:`, error.message)
  }
}
