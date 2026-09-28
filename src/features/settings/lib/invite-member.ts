import 'server-only'

import type { User, UserResponse } from '@supabase/supabase-js'
import { deleteAuthIdentity } from '@/lib/auth/delete-auth-identity'
import type { AdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'
import { MS_PER_DAY } from '@/utils/constants'
import { resolveAppUrl } from '@/utils/url'

/** A pending invite as `pending_invite_for_email` returns it (migration 20260861). */
type PendingInvite = Database['public']['Functions']['pending_invite_for_email']['Returns'][number]

interface InviteRequest {
  agencyId: string
  inviterId: string
  email: string
  role: 'admin' | 'member'
}

type InviteFailure = { ok: false; status: 409 | 500; error: string }

/** An invite that went out; its notice, when it has one, says what could not be finished. */
type InviteMemberResult = { ok: true; notice: string | null } | InviteFailure

/**
 * What each auth admin call is given: the invite's metadata, with the call's own tag, and the
 * page its link lands on.
 */
type InviteOptions = {
  data: { agency_name: string; invite_tag: string }
  redirectTo: string
}

/** The login an auth admin call named, and whether that call created it. */
type NamedLogin = { ok: true; login: User; isCreated: boolean } | InviteFailure

/**
 * How long another workspace's pending invite holds its address, from its latest send
 * (`recordResend`). The link lives a day at most (Supabase caps the email OTP expiry, which it
 * uses, at 86,400 s: Authentication → Providers → Email) and forgot-password sends nothing without
 * a `users` row (src/app/api/auth/forgot-password/route.ts), so after that day the inviting
 * workspace's resend is the way in; this keeps the address for it through a week of resends.
 * After it the invite has lapsed and no longer blocks (`reclaimOlderLogin`).
 */
const PENDING_INVITE_HOLD_DAYS = 7

const ROLE_UNSAVED =
  'The invite was sent, but the new role could not be saved. Send it again to change the role.'

const SEND_FAILED: InviteFailure = {
  ok: false,
  status: 500,
  error: 'Could not send the invite. Please try again.',
}
const RECORD_FAILED: InviteFailure = {
  ok: false,
  status: 500,
  error: 'Could not record the invite. Please try again.',
}
const HELD_ELSEWHERE: InviteFailure = {
  ok: false,
  status: 409,
  error: 'This email has a pending invite to another workspace.',
}
const HAS_ACCOUNT: InviteFailure = {
  ok: false,
  status: 409,
  error: 'This email already has an account. They cannot be invited again.',
}

/**
 * Invite a teammate by email into `agencyId`; the caller has checked the inviter is its admin.
 * The invite is a `team_invites` row, the only thing `createUserRecord`
 * (src/lib/auth/create-user-record.ts) joins a workspace by — never `user_metadata`, which anyone
 * can write at sign-up, so that carries only the email's `agency_name` and `nameLogin`'s tag. The
 * row may only name a login an invite of THIS workspace created, so `probeLogin` settles whose
 * login it is before any email, and exactly one email goes out, once a row names that login. A
 * refusal (409) is an answer and goes unlogged; every failure is logged here, once.
 */
export async function inviteMember(
  admin: AdminClient,
  request: InviteRequest
): Promise<InviteMemberResult> {
  const { agencyId, email } = request
  const [members, pending, agency] = await Promise.all([
    admin.from('users').select('id').eq('agency_id', agencyId).eq('email', email),
    admin.rpc('pending_invite_for_email', { p_email: email }),
    admin.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
  ])
  const readError = members.error ?? pending.error ?? agency.error
  if (readError) {
    console.error(`[team:invite] reads failed for ${agencyId}:`, readError.message)
    return SEND_FAILED
  }
  if ((members.data ?? []).length > 0) {
    return { ok: false, status: 409, error: 'This email is already a team member' }
  }
  const pendingInvite = pending.data?.[0] ?? null
  if (pendingInvite && pendingInvite.agency_id !== agencyId && holdsAddress(pendingInvite)) {
    return HELD_ELSEWHERE
  }

  const agencyName = agency.data?.name ?? 'Your team'
  const probed = await probeLogin(admin, email, agencyName)
  if (!probed.ok) return probed
  if (probed.isCreated) return claimNewLogin(admin, request, agencyName, probed.login.id)
  if (pendingInvite?.agency_id === agencyId && pendingInvite.auth_user_id === probed.login.id) {
    return resendInvite(admin, request, agencyName, pendingInvite)
  }
  return reclaimOlderLogin(admin, request, agencyName, probed.login.id)
}

/** Whether a pending invite still holds its address: younger than `PENDING_INVITE_HOLD_DAYS`. */
function holdsAddress(invite: PendingInvite): boolean {
  return Date.now() - Date.parse(invite.created_at) < PENDING_INVITE_HOLD_DAYS * MS_PER_DAY
}

/**
 * Ask the auth admin API, through `call`, for the address's login, and whether this call created
 * it: `isCreated` is the login carrying this call's fresh random `invite_tag`. That is exact, with
 * no clock compared, because GoTrue stores the metadata only on a login the call creates, and
 * neither an existing login nor a public sign-up to an unconfirmed address has it rewritten
 * (supabase/auth, internal/api/mail.go `adminGenerateLink`, invite.go `Invite`, signup.go). A
 * confirmed login is refused like GoTrue's own "already been registered"; any other error is
 * logged under `step`.
 */
async function nameLogin(
  step: 'probe' | 'send',
  agencyName: string,
  call: (options: InviteOptions) => Promise<UserResponse>
): Promise<NamedLogin> {
  const inviteTag = crypto.randomUUID()
  const response = await call({
    data: { agency_name: agencyName, invite_tag: inviteTag },
    redirectTo: `${resolveAppUrl()}/auth/callback`,
  })
  if (response.error) {
    if (response.error.message.includes('already been registered')) return HAS_ACCOUNT
    console.error(`[team:invite] ${step} failed:`, response.error.message)
    return { ok: false, status: 500, error: response.error.message }
  }
  const login = response.data.user
  if (login.email_confirmed_at) return HAS_ACCOUNT
  return { ok: true, login, isCreated: login.user_metadata.invite_tag === inviteTag }
}

/**
 * Learn whose login the address holds, sending no email: `generateLink` returns a link "to be sent
 * via a custom email provider" (node_modules/@supabase/auth-js/src/GoTrueAdminApi.ts), and this
 * discards it. With type invite it CREATES the login for a new address (supabase/auth,
 * internal/api/mail.go `adminGenerateLink`), which `isCreated` reports (`nameLogin`). GoTrue's
 * `/invite` (internal/api/invite.go) has no send-frequency check, so the one send straight after is
 * not refused. Still to watch on the live project: the email a new invitee receives.
 */
function probeLogin(admin: AdminClient, email: string, agencyName: string): Promise<NamedLogin> {
  return nameLogin('probe', agencyName, (options) =>
    admin.auth.admin.generateLink({ type: 'invite', email, options })
  )
}

/**
 * Send the one invite email, which must reach `loginId`, the login already decided and named by a
 * row. Another login means the address changed hands after the probe (a take-back elsewhere, or a
 * workspace deletion, removed `loginId`), so nothing is recorded. If this send created that login —
 * it carries the send's own tag (`nameLogin`) — it is deleted at once: its emailed link would,
 * once clicked, confirm an account no row names, which `createUserRecord`
 * (src/lib/auth/create-user-record.ts) cannot provision and every later invite refuses as already
 * registered. A login without the tag is someone else's and stays.
 */
async function sendInvite(
  admin: AdminClient,
  request: InviteRequest,
  agencyName: string,
  loginId: string
): Promise<InviteMemberResult> {
  const sent = await nameLogin('send', agencyName, (options) =>
    admin.auth.admin.inviteUserByEmail(request.email, options)
  )
  if (!sent.ok) return sent
  if (sent.login.id === loginId) return { ok: true, notice: null }
  console.error(`[team:invite] the send named login ${sent.login.id}, not ${loginId}`)
  if (sent.isCreated) await deleteAuthIdentity(admin, sent.login.id, 'team:invite')
  return SEND_FAILED
}

/**
 * Claim a login this operation's probe created, then send its one email. The row goes in first,
 * so a take-back racing it from another workspace (`reclaimOlderLogin`) sees a live invite and
 * refuses. Only the call whose probe created a login inserts its row, and no other writer sets
 * `auth_user_id` (scripts/table-writers.json), so a failed insert is never a rival's claim. A
 * failed insert or send deletes the login, with any row (cascade, migration 20260861), and answers
 * 500, since a refusal would not be true of a deleted login. If a workspace delete took the row
 * before the re-read after the email (`isClaimStanding`), the login goes too; a delete after the
 * re-read is not seen (`deleteWorkspace`, src/features/settings/actions/workspace-actions.ts).
 */
async function claimNewLogin(
  admin: AdminClient,
  request: InviteRequest,
  agencyName: string,
  loginId: string
): Promise<InviteMemberResult> {
  const claim = await admin
    .from('team_invites')
    .insert({
      agency_id: request.agencyId,
      role: request.role,
      auth_user_id: loginId,
      invited_by: request.inviterId,
    })
    .select('id')
    .single()
  if (claim.error) {
    console.error(`[team:invite] invite row failed for ${request.agencyId}:`, claim.error.message)
    await deleteAuthIdentity(admin, loginId, 'team:invite')
    return RECORD_FAILED
  }
  const sent = await sendInvite(admin, request, agencyName, loginId)
  if (!sent.ok) {
    if (sent.status === 409) {
      console.error(`[team:invite] the send refused claimed login ${loginId} as registered`)
    }
    await deleteAuthIdentity(admin, loginId, 'team:invite')
    return sent.status === 500 ? sent : SEND_FAILED
  }
  if (await isClaimStanding(admin, claim.data.id)) return sent
  await deleteAuthIdentity(admin, loginId, 'team:invite')
  return SEND_FAILED
}

/**
 * Whether the invite row `claimNewLogin` wrote is still there after its email. A read that fails
 * cannot say, so it counts as gone: the caller then deletes the login and the admin sends again.
 * Either way it is logged here.
 */
async function isClaimStanding(admin: AdminClient, inviteId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('team_invites')
    .select('id')
    .eq('id', inviteId)
    .maybeSingle()
  if (error) console.error(`[team:invite] invite row ${inviteId} re-read failed:`, error.message)
  else if (!data) console.error(`[team:invite] invite row ${inviteId} was gone after its send`)
  return data !== null
}

/**
 * A resend to the login `invite`, this workspace's pending row, names: its one email, then the row
 * takes the new role and inviter (`recordResend`). A failed send records nothing and deletes only
 * a login the send itself created (`sendInvite`); the invitee's login stays.
 */
async function resendInvite(
  admin: AdminClient,
  request: InviteRequest,
  agencyName: string,
  invite: PendingInvite
): Promise<InviteMemberResult> {
  const sent = await sendInvite(admin, request, agencyName, invite.auth_user_id)
  if (!sent.ok) return sent
  return recordResend(admin, request, invite.id)
}

/**
 * The probe named an older unconfirmed login that no pending row of this workspace names — a
 * self-signup, possibly an attacker's with a password they chose, or a racing or lapsed invite
 * elsewhere. Nothing is emailed yet. Re-read the holder: this workspace's is a resend; another's
 * live invite refuses and deletes nothing, since a racing invite writes its row before its email
 * (`claimNewLogin`). Otherwise the login is deleted (a lapsed row cascades, migration 20260861) and
 * the address probed again, which must come back created by that probe — a sign-up slipping in
 * after the delete does not, and nothing is sent — then claimed like any other.
 */
async function reclaimOlderLogin(
  admin: AdminClient,
  request: InviteRequest,
  agencyName: string,
  loginId: string
): Promise<InviteMemberResult> {
  const { data, error } = await admin.rpc('pending_invite_for_email', { p_email: request.email })
  if (error) {
    console.error(`[team:invite] pending re-read failed for ${loginId}:`, error.message)
    return SEND_FAILED
  }
  const holder = data?.[0] ?? null
  if (holder?.agency_id === request.agencyId) {
    return resendInvite(admin, request, agencyName, holder)
  }
  if (holder && holdsAddress(holder)) return HELD_ELSEWHERE

  if (!(await deleteAuthIdentity(admin, loginId, 'team:invite'))) return SEND_FAILED
  const reprobed = await probeLogin(admin, request.email, agencyName)
  if (!reprobed.ok) return reprobed
  if (!reprobed.isCreated) {
    console.error(`[team:invite] the second probe named login ${reprobed.login.id}, not its own`)
    return SEND_FAILED
  }
  return claimNewLogin(admin, request, agencyName, reprobed.login.id)
}

/**
 * A resend, after its email went out: this workspace's pending invite takes the new role and
 * inviter, and `created_at` becomes this send's time, so the address is held for a full
 * `PENDING_INVITE_HOLD_DAYS` from the link just emailed. A failed update still answers ok, since
 * the invite went out, with `ROLE_UNSAVED` as its notice: the row keeps its old role, inviter and
 * send time.
 */
async function recordResend(
  admin: AdminClient,
  request: InviteRequest,
  inviteId: string
): Promise<InviteMemberResult> {
  const { error } = await admin
    .from('team_invites')
    .update({
      role: request.role,
      invited_by: request.inviterId,
      created_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
  if (error) {
    console.error(`[team:invite] resend update failed for ${inviteId}:`, error.message)
    return { ok: true, notice: ROLE_UNSAVED }
  }
  return { ok: true, notice: null }
}
