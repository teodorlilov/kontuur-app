import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * Sweeping a storage prefix, for any bucket.
 *
 * Lifted out of `features/assets` because it is not about assets: `deleteClient` sweeps a client's
 * two prefixes and `deletePost` sweeps one post's, and neither is in that feature. What stayed
 * behind is the part that genuinely belongs there — the post-image row writer and the uploads.
 */

/** How many entries one `.list()` call returns. Also the page size the walk below advances by. */
const LIST_PAGE_SIZE = 100

/** Paths per `.remove()` call. Bounds both the request body and the blast radius of one failure. */
const REMOVE_CHUNK_SIZE = 100

/** One `.list()` entry. Mirrors storage-js's `FileObject`, narrowed to the two fields the walk
 *  reads — declared here rather than imported because `@supabase/storage-js` is not a direct
 *  dependency, and adding it just for a type would register as an unused one. */
interface StorageEntry {
  name: string
  id: string | null
}

/**
 * Every object path beneath a prefix, depth-first.
 *
 * Supabase's `.list()` is neither recursive nor unbounded, so a client's tree —
 * `{clientId}/{postId}/…` and `{clientId}/drafts/{draftId}/assets/…` — has to be walked a page
 * at a time. Folders come back with a null `id`; that is the only thing distinguishing them
 * from objects.
 *
 * The lister is injected so the walk can be tested without a live storage client.
 */
export async function collectPrefixObjects(
  list: (prefix: string, offset: number) => Promise<StorageEntry[]>,
  prefix: string
): Promise<string[]> {
  const paths: string[] = []
  const folders: string[] = []

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const page = await list(prefix, offset)
    for (const entry of page) {
      const path = `${prefix}/${entry.name}`
      if (entry.id === null) folders.push(path)
      else paths.push(path)
    }
    if (page.length < LIST_PAGE_SIZE) break
  }

  for (const folder of folders) {
    paths.push(...(await collectPrefixObjects(list, folder)))
  }

  return paths
}

/**
 * Delete every object under a client-scoped prefix. Returns how many were removed.
 *
 * Never throws: this runs after the client's rows are already gone, so a storage hiccup would
 * turn a completed deletion into a reported failure the user cannot retry.
 *
 * TECH-DEBT §2.2 warns that a *drafts* cleanup job must skip paths still referenced by
 * `post_canvas_docs.doc->background->>storagePath`. This sweep is exempt: it only ever runs for
 * a client whose posts — and therefore whose canvas docs — have been deleted with it.
 */
export async function removeStoragePrefix(bucket: string, prefix: string): Promise<number> {
  // A prefix of '' lists the bucket root, so a bad caller would empty the bucket for every
  // client at once. There is no valid empty or traversing prefix, so refuse rather than clamp.
  if (!prefix || prefix.startsWith('/') || prefix.includes('..')) {
    console.error(`Refusing to sweep storage: unsafe prefix ${JSON.stringify(prefix)}`)
    return 0
  }

  const admin = createAdminSupabaseClient()

  // The walk throws on a list error so a half-enumerated tree can never read as a complete
  // one — but this function is best-effort by contract, so the throw stops here.
  let paths: string[]
  try {
    paths = await collectPrefixObjects(async (at, offset) => {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(at, { limit: LIST_PAGE_SIZE, offset })
      if (error) throw new Error(`Storage list failed for ${at}: ${error.message}`)
      return data ?? []
    }, prefix)
  } catch (err) {
    console.error(`Failed to enumerate ${bucket}/${prefix}:`, err)
    return 0
  }

  let removed = 0
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK_SIZE) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK_SIZE)
    const { error } = await admin.storage.from(bucket).remove(chunk)
    // Keep going: a partial sweep leaves fewer orphans than an aborted one.
    if (error)
      console.error(`Failed to remove ${chunk.length} objects from ${bucket}:`, error.message)
    else removed += chunk.length
  }

  return removed
}
