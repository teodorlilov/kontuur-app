import { z } from 'zod'
import type { PostImageRow } from '@/types'
import type { PostImage } from '@/types/api'
import { readRouteBody } from '@/utils/read-route-body'

/**
 * The stored-image columns `mapImageRow` reads. Narrower than the row on purpose: the image routes
 * answer with `POST_IMAGE_COLUMNS` (src/lib/queries/select-columns.ts:672), which carries no
 * `source`, so a whole-row type would be a claim about fields the browser never receives.
 */
type MappableImageRow = Pick<
  PostImageRow,
  'id' | 'public_url' | 'storage_path' | 'position' | 'file_name' | 'file_size' | 'content_type'
>

/**
 * What every image route answers on success — the row `putPostImage` stored
 * (src/features/assets/lib/storage.ts:117), as far as `mapImageRow` reads it. Checked against the
 * generated row type, so a column change breaks the build here rather than every picture.
 */
const imageResponseSchema = z.object({
  image: z.object({
    id: z.string(),
    public_url: z.string(),
    storage_path: z.string(),
    position: z.number(),
    file_name: z.string().nullable(),
    file_size: z.number().nullable(),
    content_type: z.string().nullable(),
  }) satisfies z.ZodType<MappableImageRow>,
})

/** Map a DB row (snake_case) to the PostImage interface (camelCase). */
export function mapImageRow(row: MappableImageRow): PostImage {
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

/**
 * The picture an image route stored — generate, upload, canvas save, Canva import — or an Error in
 * the route's own words, `fallback` when it gave none or its success carries no row
 * (`readRouteBody`). A status the caller treats as its own outcome (a 409, a 402) is read before
 * this.
 */
export async function readImageResponse(res: Response, fallback: string): Promise<PostImage> {
  const { image } = await readRouteBody(res, imageResponseSchema, fallback)
  return mapImageRow(image)
}
