/**
 * Client-side "save file" for a hosted image. A plain `<a download>` is ignored on
 * cross-origin URLs (our visuals live on Supabase storage), so fetch the bytes first
 * and download via an object URL. Falls back to opening the image in a new tab.
 */
export async function downloadImageFile(url: string, filename?: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename ?? filenameFromUrl(url, blob.type)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

function filenameFromUrl(url: string, mimeType: string): string {
  const last = new URL(url, window.location.origin).pathname.split('/').pop()
  if (last && last.includes('.')) return last
  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  return `visual.${ext}`
}
