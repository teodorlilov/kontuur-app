# Operations

Every product operation that writes the database, and the ONE function that performs it.

## Why this file exists

A 2026-08-31 audit of all 31 tables found **64 columns written by two or more places that meant the
same thing** — three implementations of "save the reviewer's copy", two of "approve a draft", two
routes that each implemented "send for approval" end to end. Every one was locally reasonable the
day it was added, because nothing said a function already existed. This is that missing thing.

## How to use it

**Before writing a database write, find the operation here and call its function.** Needing a
different cache tag, a different Supabase client, or one extra field is a reason to pass an option
— not to fork the write. If the operation genuinely is not listed, it is new: add a row.

Backed by two gates in `npm run check`:

- `npm run writers` — table → the files allowed to write it, each with a reason. Fails when a table
  gains an unlisted writer, when an entry goes stale, **and when a writer file has no operation in
  this document**. That last check is what keeps this file honest: the first version of it covered
  26 of 43 writer files while claiming to be complete.
- `npm run arch` — flags a module that has drifted out of the feature that owns it.

**What the gate still cannot see:** it counts FILES, not operations. Two functions in ONE file
doing the same thing is invisible to it — and that is exactly where the original defect lived
(three implementations of one write, two of them in `post-actions.ts`). That part a person keeps
true.

## The registry


### Clients

| Operation | Function | File |
| --- | --- | --- |
| Backfill pillar IDs for pre-ID clients (lazy, on first sources-page open) | `ClientSourcesPage` | [app/(dashboard)/clients/[id]/sources/page.tsx](../src/app/(dashboard)/clients/[id]/sources/page.tsx) |
| Clear a deleted pillar off every source | `removeDeletedPillarIds` | [lib/clients/sync-source-pillars.ts](../src/lib/clients/sync-source-pillars.ts) |
| Create a client and its five required rows | `provisionClient` | [features/clients/lib/provision-client.ts](../src/features/clients/lib/provision-client.ts) |
| Delete a client and everything it owns | `deleteClient` | [features/clients/actions/client-actions.ts](../src/features/clients/actions/client-actions.ts) |
| Refresh what the engine learned from this client's edits (style memo) | `distillStyleMemo` | [ai/learning/distill-style-memo.ts](../src/ai/learning/distill-style-memo.ts) |
| Save a client's settings | `updateClient` | [features/clients/actions/client-actions.ts](../src/features/clients/actions/client-actions.ts) |

### Account

| Operation | Function | File |
| --- | --- | --- |
| Edit workspace name and timezone | `PUT` | [app/api/settings/account/route.ts](../src/app/api/settings/account/route.ts) |
| Provision an account on sign-up | `createUserRecord` | [lib/auth/create-user-record.ts](../src/lib/auth/create-user-record.ts) |
| Remove a teammate | `removeTeamMember` | [features/settings/actions/team-actions.ts](../src/features/settings/actions/team-actions.ts) |

### Sources

| Operation | Function | File |
| --- | --- | --- |
| Add an RSS or website source | `createSource` | [features/sources/actions/source-actions.ts](../src/features/sources/actions/source-actions.ts) |
| Delete a source | `deleteSource` | [features/sources/actions/source-actions.ts](../src/features/sources/actions/source-actions.ts) |
| Edit a source | `updateSource` | [features/sources/actions/source-actions.ts](../src/features/sources/actions/source-actions.ts) |
| Record the outcome of fetching a source | `reportStatus` | [ai/research/sources/research-source.ts](../src/ai/research/sources/research-source.ts) |
| Turn web research on/off and set its filters | `setWebResearch` | [features/sources/actions/source-actions.ts](../src/features/sources/actions/source-actions.ts) |
| Upload a document as a source | `uploadSource` | [features/sources/actions/source-actions.ts](../src/features/sources/actions/source-actions.ts) |

### Connections

| Operation | Function | File |
| --- | --- | --- |
| Connect a Canva account to the signed-in user | `GET` | [app/api/canva/callback/route.ts](../src/app/api/canva/callback/route.ts) |
| Connect an Instagram account to a client | `GET` | [app/api/meta/callback/route.ts](../src/app/api/meta/callback/route.ts) |
| Disconnect Canva | `disconnectCanvaConnection` | [features/settings/actions/canva-actions.ts](../src/features/settings/actions/canva-actions.ts) |
| Disconnect a social account | `disconnectConnection` | [features/clients/actions/connection-actions.ts](../src/features/clients/actions/connection-actions.ts) |
| Meta-mandated erasure | `eraseAccountData` | [app/api/meta/data-deletion/route.ts](../src/app/api/meta/data-deletion/route.ts) |
| Refresh expiring Instagram tokens | `refreshExpiringTokens` | [features/publishing/lib/refresh-tokens.ts](../src/features/publishing/lib/refresh-tokens.ts) |
| Refresh the Canva token | `getCanvaToken` | [app/api/canva/canva-auth.ts](../src/app/api/canva/canva-auth.ts) |
| Stamp the outcome of a metrics sync on the connection | `syncAllClientMetrics` | [features/analytics/lib/sync-metrics.ts](../src/features/analytics/lib/sync-metrics.ts) |

### Analytics

| Operation | Function | File |
| --- | --- | --- |
| Archive a report for a period | `archiveReport` | [features/analytics/actions/report-actions.ts](../src/features/analytics/actions/report-actions.ts) |
| Delete an archived report | `deleteReport` | [features/analytics/actions/report-actions.ts](../src/features/analytics/actions/report-actions.ts) |
| Purge an account's analytics | `purgeAccountAnalytics` | [features/analytics/lib/purge-account-metrics.ts](../src/features/analytics/lib/purge-account-metrics.ts) |
| Record measured best posting times | `refreshObservedBestTime` | [features/analytics/lib/online-followers.ts](../src/features/analytics/lib/online-followers.ts) |
| Sync a client's Instagram metrics | `syncAllClientMetrics` | [features/analytics/lib/sync-metrics.ts](../src/features/analytics/lib/sync-metrics.ts) |
| Write a day of account metrics | `upsertAccountMetricDays` | [features/analytics/lib/account-metrics-store.ts](../src/features/analytics/lib/account-metrics-store.ts) |
| Write a media's row | `upsertPostMetricRows` | [features/analytics/lib/post-metrics-store.ts](../src/features/analytics/lib/post-metrics-store.ts) |

### Publishing

A post is content; a **publication** is that content on one network. Everything about an
attempt — its lock, its retry budget, its reference, its outcome — belongs to the
publication, which is why none of these operations touch `posts`.

| Operation | Function | File |
| --- | --- | --- |
| Record where a post is going | `createPublications` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Take a destination for a publish attempt | `claimPublication` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Persist a resumable reference mid-publish | `setPublishRef` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Record a destination as published | `markPublicationPublished` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Record a destination as failed | `markPublicationFailed` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Put a failed destination back in the queue | `rearmPublication` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |

### Comments

`purgeAccountAnalytics` above erases `ig_comments` too — it is the one table in that purge holding
data about people who are neither the agency nor its client, which makes that line the part of
Meta's data-deletion callback that erases third parties.

| Operation | Function | File |
| --- | --- | --- |
| Sync a client's Instagram comments | `syncClientComments` | [features/comments/lib/sync-comments.ts](../src/features/comments/lib/sync-comments.ts) |
| Reply to a comment as the client | `replyToComment` | [features/comments/actions/comment-actions.ts](../src/features/comments/actions/comment-actions.ts) |
| Hide or unhide a comment | `setCommentHidden` | [features/comments/actions/comment-actions.ts](../src/features/comments/actions/comment-actions.ts) |
| Delete a comment | `deleteComment` | [features/comments/actions/comment-actions.ts](../src/features/comments/actions/comment-actions.ts) |

### Generation

| Operation | Function | File |
| --- | --- | --- |
| Close a generation run | `finishGenerationRun` | [lib/generation/runs.ts](../src/lib/generation/runs.ts) |
| Generate a client's batch of drafts when its slot comes due | `GET` | [app/api/cron/generate/route.ts](../src/app/api/cron/generate/route.ts) |
| Log a discarded draft | `recordDiscardedDraft` | [lib/queries/discarded-drafts.ts](../src/lib/queries/discarded-drafts.ts) |
| Open a generation run | `startGenerationRun` | [lib/generation/runs.ts](../src/lib/generation/runs.ts) |
| Record a theme a run produced | `trackGenerationTheme` | [lib/generation/runs.ts](../src/lib/generation/runs.ts) |
| Record topics a post covered | `recordPostTopics` | [lib/queries/post-history.ts](../src/lib/queries/post-history.ts) |
| Write the weekly intelligence briefing | `writeWeeklyBriefing` | [features/dashboard/lib/write-briefing.ts](../src/features/dashboard/lib/write-briefing.ts) |

### Posts

| Operation | Function | File |
| --- | --- | --- |
| Change a post's status | `updatePost` | [lib/actions/post-actions.ts](../src/lib/actions/post-actions.ts) |
| Create a post from an approved wizard draft | `POST` | [app/api/posts/route.ts](../src/app/api/posts/route.ts) |
| Delete a post and sweep its files | `deletePost` | [lib/actions/post-actions.ts](../src/lib/actions/post-actions.ts) |
| Derive status from a slot | `statusForSlot` | [lib/posts/status-for-slot.ts](../src/lib/posts/status-for-slot.ts) |
| Keep an AI rewrite | `persistRewrite` | [lib/actions/post-actions.ts](../src/lib/actions/post-actions.ts) |
| Publish a post now, from the calendar | `POST` | [app/api/posts/[id]/publish/route.ts](../src/app/api/posts/[id]/publish/route.ts) |
| Save a post's copy | `savePostCopy` | [lib/actions/post-actions.ts](../src/lib/actions/post-actions.ts) |
| Schedule, move, unschedule, or approve | `schedulePosts` | [lib/actions/post-actions.ts](../src/lib/actions/post-actions.ts) |

### Publishing

A post is content; a **publication** is one attempt to put that content on one network. Every
operation below is about a destination, not about a post — which is why none of them writes
`posts`. The one exception is the slot itself, listed under Posts.

| Operation | Function | File |
| --- | --- | --- |
| Record where a post is going | `assignDestinations` | [features/publishing/lib/destinations.ts](../src/features/publishing/lib/destinations.ts) |
| Ask where a post COULD go | `resolveDestinations` | [features/publishing/lib/destinations.ts](../src/features/publishing/lib/destinations.ts) |
| Write the destination rows | `createPublications` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Drop the destinations of an unscheduled post | `withdrawPendingPublications` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Take a destination for an attempt | `claimPublication` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Persist the reference a network handed back | `setPublishRef` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Record a destination published | `markPublicationPublished` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Record a destination failed | `markPublicationFailed` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Put a failed destination back in the queue | `rearmPublication` | [features/publishing/lib/publication-store.ts](../src/features/publishing/lib/publication-store.ts) |
| Publish one destination, ladder and all | `publishOnePublication` | [features/publishing/lib/publish-post.ts](../src/features/publishing/lib/publish-post.ts) |
| Finish a deferred publish | `resumePendingPublication` | [features/publishing/lib/publish-post.ts](../src/features/publishing/lib/publish-post.ts) |
| Fail a destination and notify | `failPublication` | [features/publishing/lib/publish-post.ts](../src/features/publishing/lib/publish-post.ts) |
| Retry a failed destination | `rearmFailedPublication` | [features/calendar/actions/post-recovery.ts](../src/features/calendar/actions/post-recovery.ts) |

### Approval

| Operation | Function | File |
| --- | --- | --- |
| Clear an answered change request | `resolveChangeRequest` | [lib/actions/post-actions.ts](../src/lib/actions/post-actions.ts) |
| Client answers the batch | `submitApproval` | [features/approval-portal/actions/approval-actions.ts](../src/features/approval-portal/actions/approval-actions.ts) |
| Mint the batch's tokens | `createApprovalBatch` | [features/approval-portal/lib/approval-batch.ts](../src/features/approval-portal/lib/approval-batch.ts) |
| Send a week for sign-off (link or email) | `sendForApproval` | [features/approval-portal/lib/send-for-approval.ts](../src/features/approval-portal/lib/send-for-approval.ts) |

### Visuals

| Operation | Function | File |
| --- | --- | --- |
| Attach a whole carousel at once | `putPostImages` | [features/assets/lib/storage.ts](../src/features/assets/lib/storage.ts) |
| Attach an approved draft's canvas documents | `insertCanvasDocs` | [lib/canvas/doc-store.ts](../src/lib/canvas/doc-store.ts) |
| Claim a post's colour pair | `resolveScheme` | [lib/visual/post-color.ts](../src/lib/visual/post-color.ts) |
| Generate a slide's AI image | `generateVisual` | [lib/visual/generate-visual.ts](../src/lib/visual/generate-visual.ts) |
| Generate and store a post slide's visual | `generatePostVisual` | [lib/visual/generate-post-visual.ts](../src/lib/visual/generate-post-visual.ts) |
| Paint missing visuals for pending drafts (cron) | `GET` | [app/api/cron/visuals/route.ts](../src/app/api/cron/visuals/route.ts) |
| Put an image at a slide position | `putPostImage` | [features/assets/lib/storage.ts](../src/features/assets/lib/storage.ts) |
| Record image spend | `recordImageSpend` | [lib/visual/image-spend.ts](../src/lib/visual/image-spend.ts) |
| Remove a slide image | `DELETE` | [app/api/posts/[id]/images/route.ts](../src/app/api/posts/[id]/images/route.ts) |
| Store a client's visual identity | `upsertVisualIdentity` | [lib/visual/queries.ts](../src/lib/visual/queries.ts) |
| Store a slide's editable canvas document | `upsertCanvasDoc` | [lib/canvas/doc-store.ts](../src/lib/canvas/doc-store.ts) |
| Upload a slide image the user picked | `uploadSlideImage` | [lib/posts/upload-slide-image.ts](../src/lib/posts/upload-slide-image.ts) |
| Upload or replace a slide image over HTTP | `POST` | [app/api/posts/[id]/images/route.ts](../src/app/api/posts/[id]/images/route.ts) |

### Notifications

| Operation | Function | File |
| --- | --- | --- |
| Mark bell notifications read (one, or all unread) | `markAllRead` | [components/layout/shell-context.tsx](../src/components/layout/shell-context.tsx) |
| Raise an agency notification | `notify` | [lib/notifications/notify.ts](../src/lib/notifications/notify.ts) |

### Storage

| Operation | Function | File |
| --- | --- | --- |
| Sweep every object under a prefix | `removeStoragePrefix` | [lib/storage/remove-prefix.ts](../src/lib/storage/remove-prefix.ts) |

### Ideas

| Operation | Function | File |
| --- | --- | --- |
| Dismiss an idea or restore a dismissed one | `setIdeasStatus` | [features/ideas/lib/ideas.ts](../src/features/ideas/lib/ideas.ts) |
| Link an approved post back to the idea that asked for it | `linkIdeaToPost` | [features/ideas/lib/ideas.ts](../src/features/ideas/lib/ideas.ts) |
| Mark ideas as read | `markIdeasRead` | [features/ideas/lib/ideas.ts](../src/features/ideas/lib/ideas.ts) |
| Mint or reuse a client's public idea link | `getOrCreateToken` | [features/ideas/lib/ideas.ts](../src/features/ideas/lib/ideas.ts) |
| Submit ideas through the public link | `submitIdeas` | [features/ideas/lib/ideas.ts](../src/features/ideas/lib/ideas.ts) |

## Deliberate multiple writers

Columns written by more than one function, correctly. Each was checked; the reasoning is here so
nobody "fixes" them:

- **`social_connections.access_token`** — four writers. Minting a connection, rotating a token
  without the user, and retiring one the platform has killed are three moments in a connection's
  life, across two providers with different grant endpoints and opposite failure policies. Same
  column, different operations.
- **`posts.status`** — `schedulePosts` derives it from the slot and the publish-now route stamps
  the same pair when it gives a tray post one; `updatePost` handles the one transition a slot
  cannot express (`pending_review`, i.e. undo). `publishOnePost` was listed here as moving the
  column through the publish lifecycle. It no longer touches `posts` at all — that lifecycle is
  `post_publications.status`, one row per destination.
- **`client_sources.pillar_ids`** — `updateSource` is the user scoping a source;
  `removeDeletedPillarIds` is a cascade of a pillar deletion.
- **Deleting a client vs. Meta-mandated erasure** — `deleteClient` leans on the database cascade
  (24 of 31 tables); `purgeAccountAnalytics` deliberately reimplements it, because no client row is
  being deleted in either of its two cases.

## Keeping it true

Every function named here was verified to exist at its path when the row was written, and the gate
re-checks coverage on every build. If you move a function, update its row — a stale entry is worse
than none. A readability audit on 2026-09-01 found that nine of its nine confirmed findings were
documents describing code that had moved.

