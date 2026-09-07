import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReportPostRow } from '../lib/instagram/build-report'
import { FacebookPostsTable } from '../components/facebook/facebook-posts-table'
import { PostsTable } from '../components/instagram/posts-table'

/**
 * What a Facebook row may claim about itself.
 *
 * Facebook's post list offers no media-type vocabulary, so the sync stores null deliberately
 * (sync-facebook-metrics.ts). Every shared renderer used to answer that null with
 * `?? TYPE_META.IMAGE`, so each row read "6 Sep · single" and wore an "S" badge — videos and
 * link posts included. The builder's null already means "unknown"; only the renderer was
 * overriding it.
 */
function row(overrides: Partial<ReportPostRow> = {}): ReportPostRow {
  return {
    externalPostId: 'p1',
    postId: null,
    caption: 'A Page post',
    postedAt: '2026-09-06T10:00:00Z',
    postedDayKey: '2026-09-06',
    mediaType: null,
    mediaProductType: null,
    permalink: null,
    thumbnailUrl: null,
    reach: null,
    views: null,
    interactions: 40,
    saved: null,
    follows: null,
    profileVisits: null,
    likeCount: 30,
    commentsCount: 8,
    shares: 2,
    medianRatio: null,
    missing: null,
    ...overrides,
  }
}

describe('the post type chip', () => {
  it('says nothing about a post whose type the network never reported', () => {
    render(<FacebookPostsTable posts={[row()]} medianInteractions={40} />)
    expect(screen.queryByText(/single/)).not.toBeInTheDocument()
    // The day still shows, without a dangling separator behind it.
    expect(screen.getByText('6 Sept')).toBeInTheDocument()
  })

  it('names the network a Facebook post was removed from', () => {
    render(<FacebookPostsTable posts={[row({ missing: 'removed' })]} medianInteractions={40} />)
    expect(screen.getByText('6 Sept · no longer on Facebook')).toBeInTheDocument()
  })

  it('still names the type when Instagram reports one', () => {
    render(
      <PostsTable
        posts={[row({ mediaType: 'CAROUSEL_ALBUM', reach: 900, interactions: 40 })]}
        medianReach={900}
      />
    )
    expect(screen.getByText('6 Sept · carousel')).toBeInTheDocument()
  })
})
