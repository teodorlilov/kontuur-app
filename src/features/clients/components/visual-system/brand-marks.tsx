/**
 * The brand's generated starter vector marks. SVG is sanitised at ingest and shown via a data-URL
 * `<img>` (no script execution), so it renders crisply at any size. Shared by the onboarding review and
 * the settings Visual system tab so both surfaces show the brand's marks identically.
 */
export function BrandMarks({ svgs }: { svgs: string[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: 'var(--color-terracotta)',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Brand marks
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {svgs.map((svg, i) => (
          <div
            key={i}
            style={{
              width: 72,
              height: 72,
              borderRadius: 8,
              border: '0.5px solid var(--color-border-1)',
              background: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL, not a remote asset */}
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
