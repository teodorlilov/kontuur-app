import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PostThumb } from '../components/table/post-thumb'

describe('PostThumb', () => {
  /** `alt=""` on purpose: the caption rendered beside the thumb already names the post. */
  it('shows the post’s own image when Instagram gave us one', () => {
    render(
      <PostThumb
        thumbnailUrl="https://scontent-lhr11-1.cdninstagram.com/v/t51.82787-15/777.jpg"
        mediaType="CAROUSEL_ALBUM"
      />
    )
    expect(screen.getByRole('presentation', { hidden: true })).toBeInTheDocument()
  })

  /** A broken-image glyph in a client report is worse than no image at all. */
  it('falls back to the lettered badge when the signed url has expired', () => {
    const { container } = render(
      <PostThumb thumbnailUrl="https://expired.cdninstagram.com/gone.jpg" mediaType="VIDEO" />
    )
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('R')).toBeInTheDocument()
  })

  it('uses the badge when no image was stored at all', () => {
    render(<PostThumb thumbnailUrl={null} mediaType="IMAGE" />)
    expect(screen.getByText('S')).toBeInTheDocument()
  })
})
