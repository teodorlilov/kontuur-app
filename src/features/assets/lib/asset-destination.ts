import { NextResponse } from 'next/server'
import { fetchOwnedPost, type SupabaseServerClient } from '@/lib/auth/helpers'
import { uploadPostImage, type UploadResult } from './storage'

interface AssetTarget {
  postId?: string
}

function formString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** The asset-target id as multipart routes receive it. */
export function assetTargetFromForm(formData: FormData): AssetTarget {
  return { postId: formString(formData.get('postId')) }
}

/** The 400 for a caller-supplied source path outside the verified owner's folder, or null when
 *  it belongs — routes that READ an existing stored file (cutout, inpaint) share this guard. */
export function foreignStoragePathResponse(
  clientId: string,
  storagePath: string
): NextResponse | null {
  if (storagePath.startsWith(`${clientId}/`)) return null
  return NextResponse.json({ error: 'storagePath must belong to this client' }, { status: 400 })
}

type AssetDestination =
  | {
      ok: true
      /** The owning client — source-path guards check against this, never a caller-supplied id. */
      clientId: string
      /**
       * The VERIFIED post this asset belongs to. Ownership passed for exactly this id, so it is the
       * one safe to write colours onto — a route reaching for the caller-supplied `postId` instead
       * would be trusting a field this resolver exists to check.
       */
      postId: string
      /**
       * The colour pair the post already wears, from the row the ownership check read. Carried here
       * so the generate route does not query the same post a second time for two columns the check
       * has already fetched.
       */
      storedScheme: { ground: string | null; accent: string | null }
      upload: (file: Buffer, contentType: string, fileName: string) => Promise<UploadResult>
    }
  | { ok: false; status: 400 | 404; error: string }

/**
 * Validate a canvas-asset target — the post the editor is saving against — and return an uploader
 * bound to its storage folder: the ONE ownership + destination decision shared by every route that
 * stores editor assets (uploads, cutouts, vectors, inpaints).
 */
export async function resolveAssetDestination(
  supabase: SupabaseServerClient,
  agencyId: string,
  target: AssetTarget
): Promise<AssetDestination> {
  if (!target.postId) return { ok: false, status: 400, error: 'postId is required' }
  const post = await fetchOwnedPost(supabase, target.postId, agencyId)
  if (!post) return { ok: false, status: 404, error: 'Post not found' }
  const { postId } = target
  return {
    ok: true,
    clientId: post.client_id,
    postId,
    storedScheme: { ground: post.visual_ground, accent: post.visual_accent },
    upload: (file, contentType, fileName) =>
      uploadPostImage(file, fileName, contentType, post.client_id, postId),
  }
}
