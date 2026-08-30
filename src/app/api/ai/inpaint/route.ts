import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { downloadFalFile, editImageWithMask, uploadFalTempFile } from '@/lib/visual/fal'
import {
  assetTargetFromForm,
  foreignStoragePathResponse,
  resolveAssetDestination,
} from '@/features/assets/lib/asset-destination'
import { publicPostImageUrl } from '@/features/assets/lib/storage'

export const maxDuration = 120

const MAX_PROMPT_CHARS = 500

// gpt-image-2 requires output dimensions in multiples of 16 (our sources already comply;
// arbitrary manual uploads round to the nearest valid size — a marginal resample).
function roundTo16(value: number): number {
  return Math.max(16, Math.round(value / 16) * 16)
}

interface InpaintFields {
  mask: File
  prompt: string
  storagePath: string
  width: number
  height: number
}

function parseInpaintFields(formData: FormData): InpaintFields | string {
  const mask = formData.get('mask') as File | null // FormData.get() returns File | string | null
  if (!mask || mask.type !== 'image/png') return 'A PNG mask is required'

  const prompt = formData.get('prompt')
  if (typeof prompt !== 'string' || !prompt.trim()) return 'prompt is required'
  if (prompt.length > MAX_PROMPT_CHARS) return `prompt must be under ${MAX_PROMPT_CHARS} characters`

  const storagePath = formData.get('storagePath')
  if (typeof storagePath !== 'string' || !storagePath) return 'storagePath is required'

  const width = Number(formData.get('width'))
  const height = Number(formData.get('height'))
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return 'width and height are required'
  }
  return { mask, prompt: prompt.trim(), storagePath, width, height }
}

/** Inpaint the masked region of a clean background; stores and returns the new clean image. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited

  const formData = await request.formData()
  const fields = parseInpaintFields(formData)
  if (typeof fields === 'string') return NextResponse.json({ error: fields }, { status: 400 })

  const destination = await resolveAssetDestination(
    auth.supabase,
    auth.agencyId,
    assetTargetFromForm(formData)
  )
  if (!destination.ok)
    return NextResponse.json({ error: destination.error }, { status: destination.status })
  const foreignPath = foreignStoragePathResponse(destination.clientId, fields.storagePath)
  if (foreignPath) return foreignPath

  try {
    const maskUrl = await uploadFalTempFile(fields.mask)
    const editedUrl = await editImageWithMask({
      imageUrl: publicPostImageUrl(fields.storagePath),
      maskUrl,
      prompt: fields.prompt,
      width: roundTo16(fields.width),
      height: roundTo16(fields.height),
    })
    const buffer = await downloadFalFile(editedUrl)
    const { publicUrl, storagePath } = await destination.upload(
      buffer,
      'image/jpeg',
      'inpainted.jpg'
    )
    return NextResponse.json({ publicUrl, storagePath })
  } catch (err) {
    console.error('[inpaint] failed:', err)
    const message = err instanceof Error ? err.message : 'Inpainting failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
