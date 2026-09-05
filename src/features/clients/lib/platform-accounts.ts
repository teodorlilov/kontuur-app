export interface PlatformAccount {
  id: string
  label: string
  initials: string
  note: string
  supported: boolean
}

/**
 * The accounts a client can connect, in the order the settings Connected accounts tab lists them.
 *
 * These labels are the *account* vocabulary, not the display-case platform names — the two
 * described different things and were never derived from each other. (The other list is gone
 * entirely now: a post is not written for a network.)
 *
 * Lived in `utils/constants.ts`, which holds constants that are SHARED. Its second consumer was
 * the onboarding sheet's platform row, deleted with the rest of the authoring-platform concept,
 * leaving one — so it belongs with that consumer rather than in the shared file.
 */
export const PLATFORM_ACCOUNTS: readonly PlatformAccount[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    initials: 'IG',
    note: 'Business or Creator account required',
    supported: true,
  },
  { id: 'linkedin', label: 'LinkedIn', initials: 'LI', note: 'Company pages', supported: false },
]
