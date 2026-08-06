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
      {/* leading: the prompt role is set display-tight at 1.15; this headline wraps to
          two or three serif lines on the dark panel and needs the extra air. */}
      <h2 className="text-prompt font-display font-normal text-ink-inv leading-[1.3] mb-4">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && italicWord && (
              <em className="italic text-spring-text">{italicWord}</em>
            )}
          </span>
        ))}
      </h2>
      {/* leading: reading copy on the dark panel opens past the lead role's 1.6 —
          low-contrast text at 42% needs the extra line gap to stay scannable. */}
      <p className="text-lead text-ink-inv/42 leading-[1.75] max-w-[380px]">{body}</p>
    </div>
  )
}

export function AuthLayout({ children, staticCopy }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — dark slate with logo + slider */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden w-[52%] shrink-0 bg-forest-deep">
        {/* Background rings — decorative */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 400 600"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <ellipse
            cx="350"
            cy="300"
            rx="240"
            ry="240"
            stroke="rgba(242,245,241,0.03)"
            strokeWidth="70"
          />
          <ellipse
            cx="350"
            cy="300"
            rx="160"
            ry="160"
            stroke="rgba(46,158,104,0.05)"
            strokeWidth="40"
          />
          <ellipse
            cx="350"
            cy="300"
            rx="80"
            ry="80"
            stroke="rgba(242,245,241,0.04)"
            strokeWidth="20"
          />
        </svg>

        {/* Logo mark */}
        <div className="relative z-10 inline-block border-x-[1.5px] border-x-spring-text border-y border-y-ink-inv/20 px-6 py-[18px]">
          {/* tracking: the wordmark is letterspaced type, not running text — it departs
              from the metric role's -0.02em by design. */}
          <div className="text-metric font-display font-normal text-ink-inv tracking-[5px]">
            KONTUUR
          </div>
          {/* tracking: the strapline is spaced wider than the wordmark above it, past
              the label role's 0.16em, so the two lines read as one lockup. */}
          <div className="text-label text-spring-text tracking-[8px] mt-1.5">
            SOCIAL INTELLIGENCE
          </div>
        </div>

        {/* Slider or static copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-end pt-12">
          {staticCopy ? <StaticLeftCopy {...staticCopy} /> : <AuthSlider />}
        </div>
      </div>

      {/* Right panel — warm off-white with form */}
      <div className="flex flex-1 flex-col items-center justify-center p-8 lg:p-12 bg-paper">
        {/* Mobile logo — shown only below lg breakpoint */}
        <div className="flex lg:hidden mb-10 inline-block border-x-[1.5px] border-x-spring-text border-y border-y-ink/20 px-5 py-3.5">
          {/* tracking: the wordmark is letterspaced type, not running text — it departs
              from the headline role's -0.02em by design. */}
          <div className="text-headline font-display font-normal text-ink tracking-[4px]">
            KONTUUR
          </div>
          {/* tracking: the strapline is spaced wider than the wordmark above it, past
              the label role's 0.16em, so the two lines read as one lockup. */}
          <div className="text-label text-spring-text tracking-[6px] mt-1">SOCIAL INTELLIGENCE</div>
        </div>

        {/* Form content passed from page */}
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
