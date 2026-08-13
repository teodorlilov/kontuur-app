import { ImageResponse } from 'next/og'

export const alt = 'Kontuur — beautiful client posts, written, designed and published'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The social card, generated rather than screenshotted.
 *
 * The previous one was `public/dashboard.png` — a capture of a dashboard that
 * two redesigns ago stopped existing, still being served to every link preview.
 * A file-convention OG cannot go stale that way: it is rebuilt from this markup
 * every deploy, and it is the same headline the hero actually shows.
 *
 * Geist is fetched rather than imported because `next/font` hands components a
 * class name, not the font bytes `ImageResponse` needs. The fetch is wrapped:
 * if it fails, the card still renders in the runtime's default face rather than
 * failing the build over a picture.
 */
async function loadGeist(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Geist:wght@${weight}`,
      // A browser UA gets woff2 back, which ImageResponse cannot read.
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' } }
    ).then((response) => response.text())

    const url = /src:\s*url\((https:\/\/[^)]+)\)/.exec(css)?.[1]
    if (!url) return null
    return await fetch(url).then((response) => response.arrayBuffer())
  } catch {
    return null
  }
}

export default async function OpengraphImage() {
  const [regular, semibold] = await Promise.all([loadGeist(400), loadGeist(600)])

  const fonts = [
    regular && { name: 'Geist', data: regular, weight: 400 as const, style: 'normal' as const },
    semibold && { name: 'Geist', data: semibold, weight: 600 as const, style: 'normal' as const },
  ].filter((font) => font !== null)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          // Near-White Paper, never flat white — DESIGN.md § Neutral.
          background: '#fbfcfa',
          padding: 72,
          fontFamily: 'Geist',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* The constant lime: a plate carrying Forest Ink at 13.65:1. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 16,
              background: '#cfea45',
              color: '#0f1512',
              fontSize: 34,
              fontWeight: 600,
            }}
          >
            k
          </div>
          {/* satori needs an explicit display on any node with more than one
              child — it has no CSS defaults to fall back on. */}
          <div style={{ display: 'flex', fontSize: 34, color: '#0f1512' }}>
            kontuur<span style={{ color: '#164430' }}>.</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 76,
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.08,
            color: '#0f1512',
            maxWidth: 900,
          }}
        >
          Beautiful client posts — written, designed &amp; published.
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: '#57625a' }}>
          The AI social studio for agencies
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined }
  )
}
