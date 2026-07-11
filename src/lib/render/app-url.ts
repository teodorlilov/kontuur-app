/**
 * The deployment's own base URL. The render function points Chromium back at this same deployment's
 * `/render/[id]` page, and the render-service seam POSTs to `/api/render` here. Reuses the app's
 * existing `NEXT_PUBLIC_APP_URL` rather than introducing a second base-url env var.
 */
export function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}
