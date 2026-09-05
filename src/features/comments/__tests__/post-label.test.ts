import { describe, expect, it } from 'vitest'
import { postTitle, postOrigin } from '../lib/post-label'

/**
 * What the queue calls a post it knows almost nothing about.
 *
 * The header sat above every Facebook conversation reading "Post on Instagram", because the
 * fallback was written in rather than taken from the comment. Naming the wrong network over
 * someone's words is the one thing a header must not do, and nothing else in the suite looked
 * at this string.
 */

const GROUP = { caption: null, postId: null, platform: 'instagram' }

describe('postTitle', () => {
  it('names the network the conversation actually happened on', () => {
    expect(postTitle({ ...GROUP, platform: 'facebook' })).toBe('Post on Facebook')
    expect(postTitle({ ...GROUP, platform: 'instagram' })).toBe('Post on Instagram')
  })

  it('prefers the caption over any label', () => {
    expect(postTitle({ ...GROUP, platform: 'facebook', caption: 'Summer gave me sunsets' })).toBe(
      'Summer gave me sunsets'
    )
  })

  it('says untitled only when we hold the post but it has no caption', () => {
    // "Untitled post" claims a record; with no post row there is none to claim, which read as
    // a failed load rather than a post published elsewhere.
    expect(postTitle({ ...GROUP, postId: 'post-1' })).toBe('Untitled post')
  })
})

describe('postOrigin', () => {
  it('explains a missing post, and stays quiet when there is nothing to explain', () => {
    expect(postOrigin({ postId: null })).toBe('no matching post in Kontuur')
    expect(postOrigin({ postId: 'post-1' })).toBeNull()
  })
})
