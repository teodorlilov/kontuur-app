import { NextResponse } from 'next/server'
import { fetchOwnedPost, type SupabaseServerClient } from '@/lib/auth/helpers'
import { fetchClientById } from '@/lib/queries/db'
import { uploadDraftAsset, uploadPostImage, type UploadResult } from './storage'

interface AssetTarget {
  clientId?: string
  draftId?: string
  postId?: string
}

function formString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** The asset-target ids as multipart routes receive them. */
export function assetTargetFromForm(formData: FormData): AssetTarget {
  return {
    clientId: formString(formData.get('clientId')),
    draftId: formString(formData.get('draftId')),
    postId: formString(formData.get('postId')),
  }
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
       * The VERIFIED post this asset belongs to, or null for a draft target.
       *
       * Non-null means ownership passed for exactly this id, so it is the one safe to write colours
       * onto — a route reaching for the caller-supplied `postId` instead would be trusting a field
       * this resolver exists to check.
       */
      postId: string | null
      /**
       * The colour pair a POST target already wears, from the row the ownership check read.
       *
       * Null for a draft target, which has no row — that caller sends its pair on the request
       * instead. Carried here so the generate route does not query the same post a second time for
       * two columns the check has already fetched.
       */
      storedScheme: { ground: string | null; accent: string | null } | null
      upload: (file: Buffer, contentType: string, fileName: string) => Promise<UploadResult>
    }
  | { ok: false; status: 400 | 404; error: string }

/**
 * Validate a canvas-asset target (a persisted post OR an in-memory wizard draft) and return an
 * uploader bound to the right storage path family — the ONE ownership + destination decision
 * shared by every route that stores editor assets (uploads, cutouts, vectors, inpaints).
 */
export async function resolveAssetDestination(
  supabase: SupabaseServerClient,
  agencyId: string,
  target: AssetTarget
): Promise<AssetDestination> {
  if (target.postId) {
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
  if (target.clientId && target.draftId) {
    const client = await fetchClientById(supabase, target.clientId, agencyId)
    if (!client) return { ok: false, status: 404, error: 'Client not found' }
    const { clientId, draftId } = target
    return {
      ok: true,
      clientId,
      postId: null,
      // A draft has no row to read a pair from; the caller sends one when it has it.
      storedScheme: null,
      upload: (file, contentType, fileName) =>
        uploadDraftAsset(file, contentType, clientId, draftId, fileName),
    }
  }
  return { ok: false, status: 400, error: 'postId, or clientId + draftId, is required' }
}
