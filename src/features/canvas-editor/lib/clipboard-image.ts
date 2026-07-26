/**
 * Extract a pasted/dropped image as either raw bytes or a remote URL. A ClipboardEvent's
 * `clipboardData` and a drop's `dataTransfer` share the same DataTransfer surface, so paste and
 * drop both read through here — no duplicated extraction logic.
 */

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** The first image File on a paste/drop transfer (right-click "Copy Image"), or null. */
export function imageFileFromTransfer(source: DataTransfer): File | null {
  return Array.from(source.files).find((file) => file.type.startsWith('image/')) ?? null
}

/** An image URL from a paste/drop transfer: an <img> in the HTML flavour first, then a plain URL. */
export function imageUrlFromTransfer(source: DataTransfer): string | null {
  const html = source.getData('text/html')
  if (html) {
    const src = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('img')
      ?.getAttribute('src')
    if (src && isHttpUrl(src)) return src
  }

  const uriList = source.getData('text/uri-list')
  if (uriList) {
    const first = uriList
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'))
    if (first && isHttpUrl(first)) return first
  }

  const plain = source.getData('text/plain').trim()
  return plain && isHttpUrl(plain) ? plain : null
}
