import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const BUCKET = 'post-images'

export interface UploadResult {
  publicUrl: string
  storagePath: string
}

/** Upload a post image to the public storage bucket. */
export async function uploadPostImage(
  file: Buffer,
  fileName: string,
  contentType: string,
  clientId: string,
  postId: string
): Promise<UploadResult> {
  const admin = createAdminSupabaseClient()
  const storagePath = `${clientId}/${postId}/${Date.now()}-${fileName}`

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType, upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = admin.storage.from(BUCKET).getPublicUrl(storagePath)
  return { publicUrl: data.publicUrl, storagePath }
}

/** Delete a post image from storage. Logs on failure but does not throw. */
export async function deletePostImage(storagePath: string): Promise<void> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from(BUCKET).remove([storagePath])
  if (error) {
    console.error(`Failed to delete ${storagePath} from storage:`, error.message)
  }
}
