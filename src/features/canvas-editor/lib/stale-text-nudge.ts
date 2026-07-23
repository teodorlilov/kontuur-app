import { toast } from '@/components/ui/toast'

/** Copy changed on a post that already has visuals: baked text may now be stale. v1 policy is a
 *  nudge (never auto-recompose on persisted posts) — shared by the review and calendar surfaces. */
export function nudgeStaleBakedText(imageCount: number): void {
  if (imageCount === 0) return
  toast.info('Text on the visuals may be outdated — open a slide in the editor to refresh it.')
}
