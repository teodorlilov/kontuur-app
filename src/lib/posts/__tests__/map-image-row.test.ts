import { describe, expect, it } from 'vitest'
import { readImageResponse } from '../map-image-row'

/** A row as the image routes answer with it: `POST_IMAGE_COLUMNS`, so no `source`. */
const ROUTE_ROW = {
  id: 'img-1',
  post_id: 'p1',
  public_url: 'https://cdn/p1/0.jpg',
  storage_path: 'c1/p1/0.jpg',
  position: 0,
  file_name: 'visual-0.jpg',
  file_size: 10,
  content_type: 'image/jpeg',
  created_at: '2026-09-20T08:00:00.000Z',
}

describe('readImageResponse', () => {
  it('maps the stored row a route answers with, though it carries no `source`', async () => {
    await expect(
      readImageResponse(Response.json({ image: ROUTE_ROW }), 'Upload failed')
    ).resolves.toEqual({
      id: 'img-1',
      publicUrl: 'https://cdn/p1/0.jpg',
      storagePath: 'c1/p1/0.jpg',
      position: 0,
      fileName: 'visual-0.jpg',
      fileSize: 10,
      contentType: 'image/jpeg',
    })
  })

  it('throws the route’s own sentence on a failure', async () => {
    const res = Response.json({ error: 'File too large' }, { status: 400 })
    await expect(readImageResponse(res, 'Upload failed')).rejects.toThrow('File too large')
  })

  it('throws the fallback, not a TypeError, for a success without a row or a failure without a sentence', async () => {
    await expect(readImageResponse(Response.json({ ok: true }), 'Import failed')).rejects.toThrow(
      'Import failed'
    )
    await expect(
      readImageResponse(new Response('<html>Bad gateway</html>', { status: 502 }), 'Import failed')
    ).rejects.toThrow('Import failed')
  })
})
