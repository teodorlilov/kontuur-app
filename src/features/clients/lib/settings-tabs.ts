export type SettingsTab =
  | 'basic'
  | 'brand'
  | 'visual'
  | 'schedule'
  | 'accounts'
  | 'insights'
  | 'ideas'

/**
 * The client settings sections, in reading order.
 *
 * Data rather than a component, so the page header's tab rail and the panel
 * switch below it read one list instead of two.
 */
export const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTab; label: string }> = [
  { id: 'basic', label: 'Basic info' },
  { id: 'brand', label: 'Brand profile' },
  { id: 'visual', label: 'Visual identity' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'accounts', label: 'Connected accounts' },
  { id: 'insights', label: 'Content insights' },
  { id: 'ideas', label: 'Idea link' },
]
