import { PostGenerator } from './post-generator'
import { CarouselGenerator } from './carousel-generator'
import { ReelsGenerator } from './reels-generator'
import type { ContentGenerator } from './base-generator'
import type { BaseGenerateInput } from './types'
import type { PostType } from '@/types/api'

export class GeneratorFactory {
  /**
   * Returns the correct ContentGenerator for the requested post type.
   *
   * To add a new content type:
   * 1. Create a new subclass of ContentGenerator
   * 2. Add a case here
   * Zero changes needed in the service or route handler.
   */
  static create(postType: PostType): ContentGenerator<BaseGenerateInput, unknown> {
    switch (postType) {
      case 'single':
        return new PostGenerator()
      case 'carousel':
        return new CarouselGenerator()
      case 'reels':
        return new ReelsGenerator()
      default: {
        const exhaustive: never = postType
        throw new Error(`Unknown post type: ${exhaustive}`)
      }
    }
  }
}
