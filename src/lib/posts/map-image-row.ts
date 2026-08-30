import type { PostImageRow } from '@/types'
import type { PostImage } from '@/types/api'

/** Map a DB row (snake_case) to the PostImage interface (camelCase). */
export function mapImageRow(row: PostImageRow): PostImage {
  return {
    id: row.id,
    publicUrl: row.public_url,
    storagePath: row.storage_path,
    position: row.position,
    fileName: row.file_name,
    fileSize: row.file_size,
    contentType: row.content_type,
  }
}
