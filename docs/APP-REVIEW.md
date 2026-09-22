# Meta App Review — the submission playbook

Written 2026-09-06; rescoped the same day against the portal's own permission list;
`pages_read_user_content` added to the scope list and the submission 2026-09-22.

**What is already granted:** `instagram_business_basic`, `instagram_business_manage_insights`
and `instagram_business_content_publish` show **Advanced access granted**, with live API-call
counts — which also proves Business Verification is behind us. Nothing to submit for those.

**What this submission is for:** the five `pages_*` permissions the Facebook arc needs —
publishing, comments and engagement reads for Pages all run under Standard Access today,
meaning they work only for people holding a role on the Meta app.

**Also in this submission:** `instagram_business_manage_comments` — confirmed in the portal
as Standard access, "No App Review requested". It is why the comments queue still withholds
public commenters' bodies; this approval is what lifts that.

Everything a reviewer will exercise exists and is verified; what remains is portal
configuration, recording, and the submission text below.

---

## 1. Portal checklist — needs a human with portal access

Do these BEFORE recording anything; several are hard blockers.

1. **Business Verification — already satisfied.** The existing Advanced grants on the
   Instagram permissions could not exist without it. Nothing to start; one less long pole.
2. **Data Deletion Callback URL** → `https://kontuur.app/api/meta/data-deletion`.
   It currently points at `kontuur.io`, which does not resolve — an instant rejection.
   The endpoint verifies Meta's HMAC (both app secrets), erases the account's analytics,
   comments and connections, and answers with a confirmation URL at
   `https://kontuur.app/data-deletion?code=…`, which renders the code. All live.
3. **Valid OAuth Redirect URIs** → add `https://kontuur.app/api/meta/callback`
   (keep the dev URI alongside).
4. **Privacy Policy URL** → `https://kontuur.app/privacy` · **Terms** →
   `https://kontuur.app/terms`. Both pages are live.
5. **App icon, category, contact email** — completeness pass; empty fields stall reviews.
6. **The consent display name.** The Instagram consent screen shows the frozen name
   "PostApp-IG" (an old gotcha — the name did not follow the product rename). Check whether it
   can be corrected BEFORE recording screencasts; if not, expect the reviewer to see it and
   mention in reviewer notes that the app is Kontuur.
7. **Which app owns `pages_*`?** The screenshotted permission list is the app holding the
   `instagram_business_*` grants. The environment carries `META_APP_ID` separately — the
   Facebook consent flow runs on it. Find the `pages_*` rows (same app, further down, or the
   sibling app) — THAT list is where this submission is filed.

## 2. What is requested, and what deliberately is not

The scope lists are declared once, in `src/lib/meta/oauth-networks.ts` — the submission must
match them exactly.

**To submit — the Facebook five:**

| Permission | What the code does with it |
| --- | --- |
| `pages_show_list` | The Page chooser after Facebook consent — which Pages the person granted. |
| `pages_read_engagement` | The Page's own published posts with reaction/comment/share tallies (analytics posts table, and the post list the comment sync walks) and the Page day-series insights. |
| `pages_read_user_content` | Reading visitors' comments on those posts (`GET /{post-id}/comments` and the reply level below it), and deleting a visitor's comment. |
| `pages_manage_posts` | Publishing to the Page: unpublished photo uploads, the feed post over them, the flip to live. |
| `pages_manage_engagement` | Replying as the Page, hide/unhide. |

**To submit — plus the comments permission (confirmed Standard):**

| Permission | What the code does with it |
| --- | --- |
| `instagram_business_manage_comments` | The comments queue: read comments and replies, reply as the account, hide/unhide, delete. |

**Already Advanced — nothing to submit:** `instagram_business_basic`,
`instagram_business_manage_insights`, `instagram_business_content_publish`.

**Deliberately NOT requested** (say so in reviewer notes if asked):

- `business_management` — `/me/accounts` omits business-linked Pages without it, but the app
  recovers granted Pages from `debug_token`'s `granular_scopes` instead (probed, recorded in
  `docs/META-FB-PROBE.md`). Requesting a heavyweight permission to avoid a workaround Meta
  itself documents would widen the review for nothing.
- `read_insights` — Page insights answer to the stored Page token WITHOUT it (probed live
  2026-09-06).

**Why `pages_read_user_content` is in the list (decided 2026-09-22).** Meta describes
`pages_read_engagement` as reading content posted BY the Page, and `pages_read_user_content` as
"read user generated content on the Page, for example posts, comments and ratings by users or
other Pages … also allows your app to delete comments posted by users on the Page". The form's
own text for `pages_manage_engagement` draws the same line ("if you have access to
`pages_read_user_content`, you can also … delete comments posted by other Pages"). The comment
sync reads visitors' comments and the queue deletes them, so both land under it. The
2026-09-05 probe read and deleted a visitor comment WITHOUT the scope, but that visitor was an
app role-holder, whose data Standard Access returns regardless — it proves nothing about a
stranger's comment, and no test can before approval because the other four scopes are
Standard too. Requesting it costs one description block and no extra recording; omitting it
risks an approved app whose Facebook queue shows counts and never a customer's comment.

**Consequence:** every Facebook connection made before 2026-09-22 carries a token without this
scope. Reconnect the Page before recording, and expect customers' connections to need the
same after approval (§5).

## 3. Reviewer access package

Reviewers log into the product and follow the steps; prepare:

- **A demo agency account** on `https://kontuur.app` (fresh email + password to paste into the
  submission's test-credentials field). Seed it with ONE client that has **no connections** —
  the reviewer must perform fresh consent themselves, and every screencast must show it too.
- Reviewers connect **their own** Instagram professional account / Facebook Page test assets.
- **The Standard-Access chicken-and-egg, stated in reviewer notes:** comment bodies from
  people without a role on the app are withheld until this very approval. The queue explains
  this in-product (the withheld banner). The screencasts therefore carry the demonstration,
  recorded with a role-holding account where everything is visible.

## 4. Per-permission submission text and screencast scripts

Every screencast MUST begin from a disconnected state and show the consent dialog — a
recording that opens already-connected is the known rejection (this app's own history).
Disconnect first via Client → Settings → Connected accounts. The Facebook dialog always
re-shows the asset picker (`auth_type=rerequest`), which makes fresh consent easy to show.

**The form's question, per permission:** *"Please provide a detailed description of how your
app uses the permission or feature requested, how it adds value for a person using your app,
and why it's necessary for app functionality."* Each block below answers the three parts in
that order and is written to be pasted whole into the textarea. The Graph calls named in them
are the ones the code makes — if a call changes, the text changes with it.

Six permissions, five recordings: `pages_read_user_content` and `pages_manage_engagement` are
the read and write halves of the same Facebook comments flow, so one recording is uploaded
for both.

### instagram_business_manage_comments

```text
How Kontuur uses it: Kontuur is a social media tool for marketing agencies and the small businesses they serve. After a person connects their Instagram professional account, the Comments page gathers the comments on that account's recent posts into one queue. With this permission we read the comments and their replies (GET /{media-id}/comments), post a reply as the connected account (POST /{comment-id}/replies), hide or unhide a comment (POST /{comment-id}?hide=true|false), and delete a comment (DELETE /{comment-id}). Every action is a signed-in user pressing a button on one specific comment; nothing is automated, and nothing is read from accounts the user has not connected themselves.

How it adds value for the person: An agency runs several client accounts, and a business owner runs theirs on top of everything else. Instead of logging in and out of each Instagram account to find new comments, they see every conversation in one list, answer it there, and hide or remove spam and abuse the moment it appears. The queue sorts comments into Needs reply, Answered and Hidden, so nothing is answered twice or missed.

Why it is necessary: The Comments page cannot exist without it. Reading comments, replying, hiding and deleting are exactly the operations this permission covers, and no other permission lets an account respond to its own audience. Without it the queue can show only how many comments a post has, with no text and no way to answer.
```

**Steps / screencast:** Fresh consent → leave a comment on a recent post from a second
account (on screen) → Comments → Check now → the comment appears → Reply from the queue →
show the reply live on instagram.com → Hide it → show it hidden → Unhide.

### pages_show_list

```text
How Kontuur uses it: When a person connects Facebook, Kontuur calls GET /me/accounts (and reads the granted Page ids from the token's granular scopes, for Pages that belong to a business) to list the Pages they ticked in Facebook's consent dialog. The list is shown once, as a chooser. The person picks the one Page that belongs to the client they are setting up, and Kontuur stores that Page's id, name and Page access token. Pages that are not picked are discarded and never contacted again.

How it adds value for the person: Agency staff usually manage many Pages, and each Kontuur client should publish to exactly one. The chooser lets them attach the right Page to the right client by name, without copying ids, and confirms the connection by showing the Page's name on the client's settings card.

Why it is necessary: It is the only way to learn which Pages a person administers and to obtain the Page access token that every later call — publishing, insights, comments — is made with. Without it there is nothing to choose from and no Page connection can be made.
```

**Steps / screencast:** Client → Settings → Connected accounts → Connect Facebook → consent
with the asset picker on screen (tick a Page) → the chooser lists the granted Page(s) →
Connect one → the Page name appears on the connection card.

### pages_manage_posts

```text
How Kontuur uses it: Kontuur drafts posts with the client, and once a post is approved and given a date it is published to the connected Facebook Page — at the scheduled time by our publisher, or immediately when the user presses "Publish now". Each image is uploaded to the Page unpublished (POST /{page-id}/photos with published=false), then one feed post is created that carries the caption and attaches those photos (POST /{page-id}/feed). A post with several images becomes one multi-photo post. Only posts a user has explicitly approved are published; Kontuur never posts on its own initiative and never edits or deletes existing Page content.

How it adds value for the person: The agency plans a month of content, gets the client's sign-off, and then does not have to be at a keyboard at 9:00 on a Tuesday to post it. Instagram and Facebook publish from the same approved post, so the client's two channels stay consistent without the work being done twice.

Why it is necessary: Publishing to a Page is the product's core function for Facebook, and this is the permission that allows creating posts and uploading photos as the Page. Without it an approved post could only be exported and pasted into Facebook by hand, which is the exact chore the product exists to remove.
```

**Steps / screencast:** Fresh consent + Page chosen (as above) → Calendar → approved post →
tick Facebook → Publish now → show the post live on the Page. Include one multi-image post.

### pages_read_engagement

```text
How Kontuur uses it: With the Page connected, Kontuur reads two things. First, the Page's own published posts (GET /{page-id}/published_posts) with their reaction, comment and share tallies, which fill the Facebook posts table in Analytics and tell the Comments page which posts to look under for new comments. Second, the Page's daily insights (GET /{page-id}/insights for page_follows, page_daily_follows_unique, page_daily_unfollows_unique, page_post_engagements and page_views_total), captured once a night and shown as trends. Only the connected Page's own content and aggregate metrics are read under this permission; no follower profiles are requested. Visitors' comments are covered separately by pages_read_user_content.

How it adds value for the person: The agency shows the client how their Page is doing — what each post earned, how the follower count moved, how engagement has trended over the last weeks — beside the same report for Instagram, on one screen, without pulling exports from Meta Business Suite. It also grounds the next round of drafts: the writer can see which posts worked.

Why it is necessary: It is the permission that allows reading a Page's posts, engagement and insights. Without it the Facebook side of Analytics is blank, and the Comments page cannot know which Page posts exist to check.
```

**Steps / screencast:** With the Page connected → Analytics → the Instagram | Facebook
switcher → Facebook → the report renders: engagement trend, follower flow, posts table with
real tallies.

### pages_read_user_content

```text
How Kontuur uses it: Kontuur is a social media tool for marketing agencies and the small businesses they serve. After a person connects a Facebook Page to one of their clients, the Comments page gathers the comments visitors leave on that Page's posts into one queue, alongside the client's Instagram comments. With this permission we read those comments (GET /{post-id}/comments, and GET /{comment-id}/comments for the replies under each) when the signed-in user presses "Check now" or on a periodic sync, and we delete a visitor's comment (DELETE /{comment-id}) when the user chooses to remove it. Only comments on the connected Page's own posts are read; nothing is read from Pages the user has not connected, and Kontuur never reads ratings, visitor posts or mentions.

How it adds value for the person: An agency runs several client Pages, and a business owner runs theirs on top of everything else. Instead of opening each Page in Facebook to find new comments, they see every conversation in one list, sorted into Needs reply, Answered and Hidden, and remove spam or abuse the moment it appears — with the Instagram comments for the same client in the same list.

Why it is necessary: This is the permission that allows an app to read content visitors post on a Page and to delete visitors' comments; pages_read_engagement covers only what the Page itself posts. Without it the Comments page can show only how many comments a Page post has, with no text, nothing to reply to, and nothing to remove — the queue would be empty for Facebook.
```

**Steps / screencast:** the same recording as `pages_manage_engagement` below — the comment
appearing in the queue after Check now is the read; the delete at the end is this permission's
write.

### pages_manage_engagement

```text
How Kontuur uses it: Comments left on the connected Page's posts join the same Comments queue as Instagram's (read under pages_read_user_content). When a signed-in user acts on one, Kontuur replies as the Page (POST /{comment-id}/comments) or hides and unhides it (POST /{comment-id} with is_hidden). Each action is a deliberate click on one comment. A hide that Facebook refuses (for instance on the Page's own comment) is shown as refused and the comment goes back where it was; when a hide succeeds, the person is told that the author and their friends can still see it. Kontuur does not like content as the Page and does not act on comments automatically.

How it adds value for the person: Agencies moderate every client conversation — Instagram and Facebook — from one place. They answer customers' questions promptly as the Page, hide spam and abuse before other visitors see it, and remove what has no place there, without switching between Pages inside Facebook.

Why it is necessary: Replying to and hiding comments as the Page are exactly what this permission grants. Without it Facebook comments would sit in the queue as read-only text, and the person would have to leave Kontuur and open Facebook to respond — which defeats the point of a shared queue.
```

**Steps / screencast:** Comment on a Page post from a personal profile (on screen) →
Comments → Check now → the comment appears labelled Facebook → Reply → show the reply on
facebook.com as the Page → Hide → show hidden → Unhide → Delete → show it gone on facebook.com.

## 5. Known gotchas from this app's own history

- **Fresh consent in every recording** — the prior review round established this.
- **Live-mode token shape** — the wrapped/flat short-lived token parse (@1e766b6) is handled;
  nothing to do, recorded so nobody "simplifies" it before review.
- **Granular scopes are the Page-list truth** — a reviewer whose test Page is linked to a Meta
  business may see `/me/accounts` empty; the chooser still lists the Page (recovered by id).
  That is the designed behavior, per `docs/META-FB-PROBE.md`.
- **After approval:** reconnects are needed for tokens to carry newly-approved scopes (tokens
  never gain permissions after issue — the queue's "predates comment moderation" message).
  Facebook connections made before 2026-09-22 additionally lack `pages_read_user_content`
  altogether, approval or not.
  Also revisit the withheld banner: whether Facebook withholds under Standard Access becomes
  observable once a non-role user comments, and the banner is Instagram-scoped today.

## 6. Submission-day order

1. Portal checklist (§1) green, Business Verification confirmed.
2. Demo agency account created and seeded; credentials into the submission.
3. Reconnect the Page (the scope list changed 2026-09-22), then record the five screencasts
   against the demo account — fresh consent each, with all five `pages_*` rows visible in the
   consent dialog.
4. Per permission: paste the §4 block into the description textarea, upload that
   permission's recording, tick the "I agree … allowed usage" box, Save. Reviewer notes (§3)
   go in the submission's general notes field. Then submit.
5. While waiting: nothing in-app blocks — Standard Access keeps working for role-holders.
