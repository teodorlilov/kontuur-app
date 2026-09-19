import 'server-only'

import { removeStoragePrefix } from '@/lib/storage/remove-prefix'
import { CLIENT_FILES_BUCKET, POST_IMAGES_BUCKET } from '@/utils/constants'

/**
 * Remove everything one client ever put in storage: its post images and its uploaded files,
 * both kept under a `{clientId}/` prefix. Returns how many objects each bucket gave up, for the
 * caller's trace line.
 *
 * Only after the client's rows are gone, never before: sweeping first would strip a live
 * client's images if the delete then failed. Best-effort by contract, like `removeStoragePrefix`
 * — the rows are already deleted either way, so a storage hiccup must not turn a finished
 * deletion into a failure the person cannot retry. Called by `deleteClient` for one client and
 * by `deleteWorkspace` for each client the workspace had.
 */
export async function sweepClientStorage(
  clientId: string
): Promise<{ images: number; files: number }> {
  const [images, files] = await Promise.all([
    removeStoragePrefix(POST_IMAGES_BUCKET, clientId),
    removeStoragePrefix(CLIENT_FILES_BUCKET, clientId),
  ])
  return { images, files }
}
