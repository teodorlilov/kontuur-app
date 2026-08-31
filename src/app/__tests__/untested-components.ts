/**
 * Interactive components that have no component test yet.
 *
 * NOT an exemption list — debt, and it may only ever shrink. `component-tests.test.ts`
 * fails if a new component is added without a test AND fails if you cover one of these
 * without deleting its line, so the number here is always the real number.
 *
 * 81 of 87 on 2026-08-18, the day component testing started existing at all. That is the
 * honest starting point, not a target anyone should feel behind on: the four that are
 * covered were chosen because they carry the most risk per line — the shared controls
 * every surface renders, the two deliberately-suppressed `set-state-in-effect` effects,
 * and team invites, where a defect is a security defect.
 *
 * Working order, if you want one:
 *   1. Whatever you are already touching. A component you are changing is the cheapest
 *      one to cover, because you have its behaviour in your head right now.
 *   2. `features/auth/*` — the other half of "a bug here is a security bug".
 *   3. `features/canvas-editor/*` — where §7.12 counted the eight defects. Note its
 *      layout and Konva failures are NOT reachable from jsdom; cover the hooks and
 *      keyboard routing here and leave the rest to the browser pass.
 *
 * Kept in its own file so the diff that clears an entry is one line, and so the guard's
 * logic and its backlog cannot drift into the same merge conflict.
 */
export const UNTESTED_COMPONENTS: string[] = [
  'app/(onboarding)/clients/new/page.tsx',
  'app/(public)/approve/[token]/page.tsx',
  'app/auth/callback/invite-handler.tsx',
  'components/layout/command-palette.tsx',
  'components/layout/contour-field.tsx',
  'components/layout/notifications-bell.tsx',
  'components/layout/page-header/sticky-shell.tsx',
  'components/layout/shell-context.tsx',
  'components/layout/sidebar.tsx',
  'components/posts/carousel-slides.tsx',
  'components/draft-editing/draft-rail.tsx',
  'components/draft-editing/insight-panel.tsx',
  'components/draft-editing/work-column.tsx',
  'components/providers/auth-provider.tsx',
  'components/scheduling/batch-schedule-modal.tsx',
  'components/ui/image-lightbox.tsx',
  'features/auth/components/auth-dialog-provider.tsx',
  'features/auth/components/reset-view.tsx',
  'features/auth/components/setup-password-form.tsx',
  'features/auth/components/sign-up-view.tsx',
  'features/calendar/components/approval-tools.tsx',
  'features/calendar/components/day-column.tsx',
  'features/calendar/components/queue-rail.tsx',
  'features/calendar/components/week-grid.tsx',
  'features/canvas-editor/components/arc-handle.tsx',
  'features/canvas-editor/components/brush-surface.tsx',
  'features/canvas-editor/components/busy-hint.tsx',
  'features/canvas-editor/components/canvas-editor-overlay.tsx',
  'features/canvas-editor/components/color-swatches.tsx',
  'features/canvas-editor/components/editor-stage.tsx',
  'features/canvas-editor/components/image-node.tsx',
  'features/canvas-editor/components/workspace/apply-style-panel.tsx',
  'features/canvas-editor/components/workspace/layers-section.tsx',
  'features/canvas-editor/components/workspace/lockups-section.tsx',
  'features/canvas-editor/components/workspace/prompt-row.tsx',
  'features/canvas-editor/components/workspace/toolbar-popover.tsx',
  'features/clients/components/settings/brand-profile-tab.tsx',
  'features/clients/components/settings/client-settings-form.tsx',
  'features/clients/components/settings/connected-accounts-tab.tsx',
  'features/dashboard/components/briefing-actions.tsx',
  'features/dashboard/components/client-coverage.tsx',
  'features/dashboard/components/count-up.tsx',
  'features/dashboard/components/pending-review-list.tsx',
  'features/generate/components/done/done-view.tsx',
  'features/generate/components/flow-chrome.tsx',
  'features/generate/components/generate-flow.tsx',
  'features/generate/components/setup/brief-list.tsx',
  'features/ideas/components/idea-form-client.tsx',
  'features/ideas/components/idea-form-tab.tsx',
  'features/ideas/components/ideas-view.tsx',
  'features/marketing/components/landing/engine.tsx',
  'features/marketing/components/landing/hero.tsx',
  'features/marketing/components/nav.tsx',
  'features/onboarding/components/draft-sheet.tsx',
  'features/onboarding/components/step-entry.tsx',
  'components/posts/canva-design-picker.tsx',
  'components/posts/image-slot.tsx',
  'features/review/components/review-queue.tsx',
  'features/review/components/send-to-client-dialog.tsx',
  'features/settings/components/account-tab.tsx',
  'features/settings/components/integrations-tab.tsx',
  'features/settings/components/settings-view.tsx',
  'features/settings/components/team-tab.tsx',
  'features/sources/components/manual-add-modal.tsx',
  'features/sources/components/page-group-list.tsx',
  'features/sources/components/page-picker-modal.tsx',
  'features/sources/components/source-row.tsx',
  'features/sources/components/sources-manager.tsx',
  'features/sources/components/stepper/extras-step.tsx',
  'features/sources/components/stepper/pillar-source-stepper.tsx',
  'features/sources/components/stepper/rss-step.tsx',
  'features/sources/components/stepper/scan-step.tsx',
  'features/sources/components/stepper/summary-step.tsx',
  'features/sources/components/stepper/website-pages-step.tsx',
  'features/visual-identity/components/style-options.tsx',
]
