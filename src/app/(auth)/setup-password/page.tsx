import { SetupPasswordForm } from '@/features/auth/components/setup-password-form'
import { getAuthUserId } from '@/lib/auth/session'
import { provisionUserRecord } from '@/lib/auth/provision-user-record'

/**
 * Where an invite link and a password-recovery link land. A signed-in identity with no `users`
 * row is provisioned here as the dashboard layout does (`provisionUserRecord`, which says why), so
 * an invitee who opens the link and never reaches the dashboard is still a member. Best effort: a
 * failure is logged and the form still renders, since setting the password comes first and the
 * dashboard layout provisions again on the next visit. With no session, nothing happens here:
 * `SetupPasswordForm` (src/features/auth/components/setup-password-form.tsx) meets it on submit.
 */
export default async function SetupPasswordPage() {
  const userId = await getAuthUserId()
  if (userId) {
    await provisionUserRecord(userId).catch((err: unknown) =>
      console.error(`[auth:setup-password] provisioning failed for ${userId}:`, err)
    )
  }
  return <SetupPasswordForm />
}
