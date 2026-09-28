import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSvgAsset, uploadElementAsset } from '../asset-client'

const TARGET = { postId: 'p1' }
const FILE = new File(['x'], 'logo.png', { type: 'image/png' })

function answer(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

afterEach(() => vi.unstubAllGlobals())

describe('the asset routes’ answers', () => {
  it('is the stored file the route names', async () => {
    answer(Response.json({ publicUrl: 'https://cdn/p1/a.png', storagePath: 'c1/p1/a.png' }))
    expect(await uploadElementAsset(TARGET, FILE)).toEqual({
      publicUrl: 'https://cdn/p1/a.png',
      storagePath: 'c1/p1/a.png',
    })
  })

  it('throws the route’s own sentence on a failure', async () => {
    answer(Response.json({ error: 'File too large' }, { status: 413 }))
    await expect(uploadElementAsset(TARGET, FILE)).rejects.toThrow('File too large')
  })

  it('throws the fallback for a failure with no JSON body, such as an edge 502’s HTML page', async () => {
    answer(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(uploadElementAsset(TARGET, FILE)).rejects.toThrow('Asset upload failed')
  })

  it('throws the fallback for a success that names no stored file', async () => {
    answer(Response.json({ publicUrl: 'https://cdn/p1/a.png' }))
    await expect(uploadElementAsset(TARGET, FILE)).rejects.toThrow('Asset upload failed')
  })

  it('reports a vector’s dimensions, and refuses one that came back without them', async () => {
    answer(Response.json({ publicUrl: 'u', storagePath: 's', width: 300, height: 200 }))
    expect(await generateSvgAsset(TARGET, 'a leaf')).toEqual({
      publicUrl: 'u',
      storagePath: 's',
      width: 300,
      height: 200,
    })
    answer(Response.json({ publicUrl: 'u', storagePath: 's' }))
    await expect(generateSvgAsset(TARGET, 'a leaf')).rejects.toThrow('Vector generation failed')
  })
})
