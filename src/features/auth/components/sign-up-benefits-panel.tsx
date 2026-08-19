import { Check } from 'lucide-react'

/**
 * What the product does, in four lines, each one a feature that ships.
 *
 * No metrics, no logos, no testimonials — see the honesty rule in DESIGN.md's
 * sibling plan. Every claim here is demonstrated live further down the landing
 * page the dialog is sitting on top of.
 */
const BENEFITS = [
  "Posts written and designed in each client's own brand identity",
  'Clients approve with one tap — a link, no logins',
  'Publishes itself to Instagram, on schedule',
  'Analytics with an AI summary and client-ready reports',
] as const

/** Total dash length of the contour paths — long enough to hide either one. */
const DASH = 620

interface SignUpBenefitsPanelProps {
  /** How many of the three fields carry a value, 0–3. Draws the contour in. */
  filled: number
}

/**
 * The dark half of the sign-up dialog.
 *
 * The two contour lines draw themselves as the form fills — the name Kontuur is
 * the line that describes a shape without filling it, so the shape completing
 * as the visitor completes theirs is the one piece of motion on this surface
 * that means something.
 *
 * Lime is legible here and only here: on Pine Deep it inverts to 10.87:1 and
 * becomes the figure. The same colour on the white half would measure 1.35:1.
 */
export function SignUpBenefitsPanel({ filled }: SignUpBenefitsPanelProps) {
  return (
    <aside className="surface-dark relative hidden flex-col justify-between overflow-hidden p-10 md:flex">
      <svg
        className="pointer-events-none absolute inset-0 size-full"
        viewBox="0 0 440 640"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M-10,150 C90,120 190,175 290,148 C360,130 410,158 450,142"
          fill="none"
          stroke="rgba(242,245,241,0.16)"
          strokeWidth="1.5"
          strokeDasharray={DASH}
          // Computed from form state — the one case an inline style is correct.
          style={{
            strokeDashoffset: filled >= 1 ? 0 : DASH,
            transition: 'stroke-dashoffset 1.1s var(--ease-contour)',
          }}
        />
        <path
          d="M-10,520 C90,490 200,545 300,518 C370,500 415,528 450,512"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeDasharray={DASH}
          style={{
            strokeDashoffset: filled >= 3 ? 0 : DASH,
            transition: 'stroke-dashoffset 1.1s var(--ease-contour)',
          }}
        />
      </svg>

      <div className="relative">
        <p
          // Fluid Hero Exception — a marketing headline, clamped for the column.
          style={{ fontSize: 'clamp(22px, 2.2vw, 28px)' }}
          // leading/tracking: an off-ramp size carries no role line-height.
          className="font-semibold leading-[1.25] tracking-[-0.02em] text-ink-inv"
        >
          From blank feed to{' '}
          <em className="font-display font-normal italic text-accent">booked calendar</em>.
        </p>

        <ul className="mt-7 flex list-none flex-col gap-4">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex gap-3 text-caption text-ink-inv/85">
              <Check
                size={14}
                strokeWidth={2.2}
                aria-hidden
                className="mt-0.5 flex-none text-accent"
              />
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative mt-8 text-label uppercase text-ink-inv/40">
        Built for agencies &amp; solo marketers
      </p>
    </aside>
  )
}
