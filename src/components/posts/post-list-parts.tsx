/** Shared sub-components for post list items (generation results + review). */

/**
 * The selected row is "where you are standing", but a 2.5px lime bar on light is
 * 1.35:1 and invisible — thin active marks are Deep Pine.
 */
export function ActiveBar() {
  return <div className="absolute inset-y-[10%] left-0 w-[2.5px] rounded-r-xs bg-forest" />
}

/** Two-line caption preview for a post row. */
export function CaptionPreview({ caption }: { caption: string | null }) {
  return (
    // leading-[1.45]: the role's own leading is tuned for single-line labels and
    // sets these two clamped lines too tight against each other.
    <div className="mb-[7px] line-clamp-2 text-micro leading-[1.45] text-text2">
      {caption ?? ''}
    </div>
  )
}
