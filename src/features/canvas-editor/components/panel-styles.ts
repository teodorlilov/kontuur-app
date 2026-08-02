/** Shared inline styles for the editor's properties panel (matches the app's settings panels). */

export const PANEL_LABEL: React.CSSProperties = {
  fontSize: 'var(--text-label)',
  fontWeight: 500,
  color: 'var(--spring-text)',
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  marginBottom: '8px',
}

export const PANEL_CONTROL: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  fontSize: 'var(--text-caption)',
  fontFamily: 'var(--font-sans)',
}
