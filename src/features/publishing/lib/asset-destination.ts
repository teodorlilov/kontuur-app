import { NextResponse } from 'next/server'
import { verifyPostOwnership, type SupabaseServerClient } from '@/lib/auth/helpers'
import { fetchClientById } from '@/lib/queries/db'
import { uploadDraftAsset, uploadPostImage, type UploadResult } from './storage'

export interface AssetTarget {
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
export function foreignStoragePathResponse(clientId: string, storagePath: string): NextResponse | null {
  if (storagePath.startsWith(`${clientId}/`)) return null
  return NextResponse.json({ error: 'storagePath must belong to this client' }, { status: 400 })
}

export type AssetDestination =
  | {
      ok: true
      /** The owning client — source-path guards check against this, never a caller-supplied id. */
      clientId: string
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
    const post = await verifyPostOwnership(supabase, target.postId, agencyId)
    if (!post) return { ok: false, status: 404, error: 'Post not found' }
    const { postId } = target
    return {
      ok: true,
      clientId: post.client_id,
      upload: (file, contentType, fileName) => uploadPostImage(file, fileName, contentType, post.client_id, postId),
    }
  }
  if (target.clientId && target.draftId) {
    const client = await fetchClientById(supabase, target.clientId, agencyId)
    if (!client) return { ok: false, status: 404, error: 'Client not found' }
    const { clientId, draftId } = target
    return {
      ok: true,
      clientId,
      upload: (file, contentType, fileName) => uploadDraftAsset(file, contentType, clientId, draftId, fileName),
    }
  }
  return { ok: false, status: 400, error: 'postId, or clientId + draftId, is required' }
}
