import { AuthSlider } from './auth-slider'

interface StaticCopy {
  headline: string
  italicWord?: string
  body: string
}

interface AuthLayoutProps {
  children: React.ReactNode
  staticCopy?: StaticCopy
}

function StaticLeftCopy({ headline, italicWord, body }: StaticCopy) {
  const parts = italicWord ? headline.split(italicWord) : [headline]
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: '40px', fontWeight: 400, color: '#ECE8E1', lineHeight: 1.3, marginBottom: '16px' }}>
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && italicWord && (
              <em style={{ fontStyle: 'italic', color: '#C07B55' }}>{italicWord}</em>
            )}
          </span>
        ))}
      </h2>
      <p style={{ fontSize: '16px', color: 'rgba(236,232,225,0.42)', lineHeight: 1.75, maxWidth: '380px' }}>
        {body}
      </p>
    </div>
  )
}

export function AuthLayout({ children, staticCopy }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">

      {/* Left panel — dark slate with logo + slider */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{ width: '52%', background: '#1A2630', flexShrink: 0 }}
      >
        {/* Background rings — decorative */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 400 600"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <ellipse cx="350" cy="300" rx="240" ry="240" stroke="rgba(236,232,225,0.03)" strokeWidth="70"/>
          <ellipse cx="350" cy="300" rx="160" ry="160" stroke="rgba(192,123,85,0.05)" strokeWidth="40"/>
          <ellipse cx="350" cy="300" rx="80" ry="80" stroke="rgba(236,232,225,0.04)" strokeWidth="20"/>
        </svg>

        {/* Logo mark */}
        <div className="relative z-10 inline-block" style={{
          borderLeft: '1.5px solid #C07B55',
          borderRight: '1.5px solid #C07B55',
          borderTop: '0.5px solid rgba(236,232,225,0.2)',
          borderBottom: '0.5px solid rgba(236,232,225,0.2)',
          padding: '18px 24px',
        }}>
          <div style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: '32px',
            fontWeight: 400,
            color: '#ECE8E1',
            letterSpacing: '5px',
          }}>
            KONTUUR
          </div>
          <div style={{
            fontSize: '9px',
            color: '#C07B55',
            letterSpacing: '8px',
            marginTop: '6px',
          }}>
            SOCIAL INTELLIGENCE
          </div>
        </div>

        {/* Slider or static copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-end pt-12">
          {staticCopy ? <StaticLeftCopy {...staticCopy} /> : <AuthSlider />}
        </div>
      </div>

      {/* Right panel — warm off-white with form */}
      <div
        className="flex flex-1 flex-col items-center justify-center p-8 lg:p-12"
        style={{ background: '#F4EFE6' }}
      >
        {/* Mobile logo — shown only below lg breakpoint */}
        <div className="flex lg:hidden mb-10 inline-block" style={{
          borderLeft: '1.5px solid #C07B55',
          borderRight: '1.5px solid #C07B55',
          borderTop: '0.5px solid rgba(44,62,80,0.2)',
          borderBottom: '0.5px solid rgba(44,62,80,0.2)',
          padding: '14px 20px',
        }}>
          <div style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: '24px',
            fontWeight: 400,
            color: '#1A2630',
            letterSpacing: '4px',
          }}>
            KONTUUR
          </div>
          <div style={{ fontSize: '8px', color: '#C07B55', letterSpacing: '6px', marginTop: '4px' }}>
            SOCIAL INTELLIGENCE
          </div>
        </div>

        {/* Form content passed from page */}
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>

    </div>
  )
}
