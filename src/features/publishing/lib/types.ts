import type { PostRow } from '@/types'

/** Image reference shape as projected from the post_images DB join. */
export interface PostImageRef {
  public_url: string
  position: number
}

/** Base post shape used by the publishing pipeline (route + scheduler). */
export type PostForPublish = Pick<
  PostRow,
  'id' | 'caption' | 'post_type' | 'publish_attempts' | 'client_id'
> & {
  post_images: PostImageRef[]
}

/** Instagram connection credentials from the social_connections table. */
export interface InstagramConnection {
  account_id: string
  access_token: string
  token_expires_at: string | null
}
