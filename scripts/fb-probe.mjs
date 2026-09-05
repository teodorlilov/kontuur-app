/**
 * Step 0 of the Facebook plan: record what the Graph API actually returns, verbatim.
 *
 * The last Facebook integration was written against documentation and became a parallel branch
 * at every layer. This exists so the adapter is written against observed responses instead —
 * field sets, token shapes and error envelopes as they really arrive.
 *
 * Everything here needs a USER access token. An app token (`{id}|{secret}`) cannot reach
 * `/me/accounts` — Graph answers `code 2500, "An active access token must be used to query
 * information about the current user"` — and an Instagram Business token is issued by
 * instagram.com for graph.instagram.com, so it cannot read Pages either. Minting a user token
 * needs browser consent, which is the one step that cannot be automated:
 *
 *   1. https://developers.facebook.com/tools/explorer/
 *   2. Pick the Kontuur.app app, then "Get User Access Token"
 *   3. Tick: pages_show_list, pages_read_engagement, pages_manage_posts,
 *            pages_manage_engagement, read_insights
 *   4. Copy the token, then:
 *
 *        FB_USER_TOKEN=... node scripts/fb-probe.mjs            # read-only
 *        FB_USER_TOKEN=... node scripts/fb-probe.mjs --publish  # also drafts an UNPUBLISHED photo
 *
 * Read-only by default. `--publish` is the only part that writes to a real Page, and it stops at
 * an unpublished photo container — it never creates a visible post. Nothing is deleted.
 *
 * Writes docs/META-FB-PROBE.md. Tokens are redacted from everything it records.
 */

import { writeFileSync } from 'fs'

const TOKEN = process.env.FB_USER_TOKEN
const WRITES = process.argv.includes('--publish')
const GRAPH = 'https://graph.facebook.com/v25.0'

if (!TOKEN) {
  console.error('FB_USER_TOKEN is not set — see the header of this file for how to mint one.')
  process.exit(1)
}

/** Every token that passes through here is replaced before anything is written or printed. */
const redact = (text) =>
  String(text)
    .replaceAll(TOKEN, '{USER_TOKEN}')
    // `\s*` is load-bearing: this ran once without it, and because redaction happens AFTER
    // JSON.stringify(_, null, 2) inserts a space after the colon, a live Page token from
    // /me/accounts went into the file in plaintext.
    .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token": "{PAGE_TOKEN}"')

const log = []

async function call(label, path, init) {
  const url = `${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN)}`
  let status, body
  try {
    const res = await fetch(url, init)
    status = res.status
    body = await res.text()
  } catch (err) {
    status = 'network error'
    body = String(err)
  }
  // Pretty-print when it parses; a failed call's raw envelope is worth as much as a good one's.
  let rendered = redact(body)
  try {
    rendered = redact(JSON.stringify(JSON.parse(body), null, 2))
  } catch {
    /* not JSON — keep the raw text */
  }
  log.push(
    `### ${label}\n\n\`${init?.method ?? 'GET'} /${redact(path)}\` → **${status}**\n\n\`\`\`json\n${rendered}\n\`\`\`\n`
  )
  console.log(`${status === 200 ? 'ok  ' : 'FAIL'} ${label}`)
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const accounts = await call('Pages this user administers', 'me/accounts')
const page = accounts?.data?.[0]

if (!page) {
  log.push(
    '> `/me/accounts` returned no Page. Everything below needs one, so the run stopped here.\n'
  )
} else {
  // The Page token rides in the /me/accounts response; every Page-scoped call below uses it.
  const pageToken = page.access_token
  const pageCall = async (label, path, init) => {
    const url = `${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(pageToken)}`
    let status, body
    try {
      const res = await fetch(url, init)
      status = res.status
      body = await res.text()
    } catch (err) {
      status = 'network error'
      body = String(err)
    }
    let rendered = String(body).replaceAll(pageToken, '{PAGE_TOKEN}')
    try {
      rendered = JSON.stringify(JSON.parse(rendered), null, 2)
    } catch {
      /* raw */
    }
    log.push(
      `### ${label}\n\n\`${init?.method ?? 'GET'} /${path}\` (Page token) → **${status}**\n\n\`\`\`json\n${rendered}\n\`\`\`\n`
    )
    console.log(`${status === 200 ? 'ok  ' : 'FAIL'} ${label}`)
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }

  await pageCall('Page node', `${page.id}?fields=id,name,username,category,link,fan_count`)
  await pageCall(
    'Page feed — the fields a post carries',
    `${page.id}/feed?fields=id,message,created_time,permalink_url,full_picture,is_published&limit=3`
  )

  const feed = await pageCall('Published posts (for the comment probe)', `${page.id}/posts?limit=1`)
  const postId = feed?.data?.[0]?.id
  if (postId) {
    await pageCall(
      'Comments on a Page post — field set and reply threading',
      `${postId}/comments?fields=id,message,from,created_time,like_count,parent,comment_count&limit=5`
    )
  } else {
    log.push('> The Page has no published post, so the comment field set could not be read.\n')
  }

  /**
   * Insights, ONE metric per call, deliberately.
   *
   * A single invalid metric name fails the whole request, so a batched call reads as "none of
   * these exist" — which is exactly how the previous integration concluded Page metrics were
   * gone and shipped zeros for months.
   */
  for (const metric of [
    'page_impressions',
    'page_post_engagements',
    'page_fans',
    'page_views_total',
    'page_daily_follows_unique',
  ]) {
    await pageCall(`Insight: ${metric}`, `${page.id}/insights?metric=${metric}&period=day`)
  }

  if (WRITES) {
    // The publish contract: photos are uploaded unpublished, then one /feed post references them.
    const photo = await pageCall(
      'Upload an UNPUBLISHED photo (nothing becomes visible)',
      `${page.id}/photos?published=false&url=${encodeURIComponent('https://picsum.photos/1080/1080')}`,
      { method: 'POST' }
    )
    log.push(
      photo?.id
        ? `> Unpublished photo id \`${photo.id}\`. The next step would be \`POST /${page.id}/feed\` with \`attached_media[0]={"media_fbid":"${photo.id}"}\` — NOT run, so nothing was posted.\n`
        : '> The unpublished photo upload failed; its envelope is above.\n'
    )
  } else {
    log.push('> Publish probe skipped. Re-run with `--publish` to exercise the photos→feed pair.\n')
  }
}

const doc = `# Facebook Graph probe

Recorded by \`scripts/fb-probe.mjs\` against Graph v25.0. Tokens are redacted.
Write probe: **${WRITES ? 'run' : 'skipped'}**.

This is observed behaviour, not documentation — steps 4-6 of the Facebook plan are written
against what is below.

${log.join('\n')}`

writeFileSync('docs/META-FB-PROBE.md', doc)
console.log('\n→ docs/META-FB-PROBE.md')
