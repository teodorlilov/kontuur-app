// No 'use client': this panel is static markup, and the settings page now passes it in as an
// element rather than importing it into the client view — so none of it reaches the browser.
import { Bell, Lock, Mail, User } from 'lucide-react'
import { RailBox, RailText } from '@/components/ui/form'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * Placeholder for personal account settings.
 *
 * Genuinely unbuilt — there is no `users.name` or `avatar_url` column, no profile route, and no
 * notification-preferences table. It reads as "not here yet" rather than offering controls that
 * would fail, and stays a placeholder until that backend exists.
 */
const UPCOMING = [
  { label: 'Display name and profile photo', Icon: User },
  { label: 'Email address', Icon: Mail },
  { label: 'Password and security', Icon: Lock },
  { label: 'Email notification preferences', Icon: Bell },
]

export function ProfileTab() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <StatusPill tone="warn">Coming soon</StatusPill>
        <span className="text-[13px] text-text2">
          Personal settings are separate from the agency workspace.
        </span>
      </div>

      <ul>
        {UPCOMING.map(({ label, Icon }) => (
          <li
            key={label}
            className="flex items-center gap-3 border-t border-line py-3.5 text-[13.5px] text-text3 first:border-t-0"
          >
            <Icon size={16} aria-hidden className="flex-none" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Context rail for the Profile panel. */
export function ProfileRail() {
  return (
    <RailBox title="In the meantime">
      <RailText>
        Your sign-in email is managed by the workspace admin. To change your password, sign out and
        use the &ldquo;Forgot password&rdquo; link.
      </RailText>
    </RailBox>
  )
}
