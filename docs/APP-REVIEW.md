# Meta App Review — the submission playbook

Written 2026-09-06; rescoped the same day against the portal's own permission list.

**What is already granted:** `instagram_business_basic`, `instagram_business_manage_insights`
and `instagram_business_content_publish` show **Advanced access granted**, with live API-call
counts — which also proves Business Verification is behind us. Nothing to submit for those.

**What this submission is for:** the four `pages_*` permissions the Facebook arc just shipped
— publishing, comments and engagement reads for Pages all run under Standard Access today,
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

**To submit — the Facebook four:**

| Permission | What the code does with it |
| --- | --- |
| `pages_show_list` | The Page chooser after Facebook consent — which Pages the person granted. |
| `pages_read_engagement` | The Page's published posts with comment tallies (comment sync, analytics posts table) and the Page day-series insights. |
| `pages_manage_posts` | Publishing to the Page: unpublished photo uploads, the feed post over them, the flip to live. |
| `pages_manage_engagement` | Page comment moderation: reply, hide/unhide, delete. |

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

### instagram_business_manage_comments

**Usage text:** "The Comments queue collects comments across the agency's client accounts so
they can be answered from one place. We read comments and their replies, post replies as the
connected account, hide/unhide, and delete."

**Steps / screencast:** Fresh consent → leave a comment on a recent post from a second
account (on screen) → Comments → Check now → the comment appears → Reply from the queue →
show the reply live on instagram.com → Hide it → show it hidden → Unhide.

### pages_show_list

**Usage text:** "Facebook consent yields access to the Pages a person administers; Kontuur
lists exactly the Pages they granted so they can choose which Page a client publishes to.
Nothing is connected until a Page is explicitly picked."

**Steps / screencast:** Client → Settings → Connected accounts → Connect Facebook → consent
with the asset picker on screen (tick a Page) → the chooser lists the granted Page(s) →
Connect one → the Page name appears on the connection card.

### pages_manage_posts

**Usage text:** "Approved posts publish to the connected Facebook Page, scheduled or on
demand. Photos are uploaded unpublished, a feed post is created over them, then made live —
the two-phase shape that prevents duplicates on retries. Carousels become multi-photo posts."

**Steps / screencast:** Fresh consent + Page chosen (as above) → Calendar → approved post →
tick Facebook → Publish now → show the post live on the Page. Include one multi-image post.

### pages_read_engagement

**Usage text:** "We read the Page's own published posts and their engagement tallies to show
the agency their client's performance: the analytics posts table (reactions, comments,
shares), the Page's daily engagement/views/follower series, and the post identities the
comments queue renders conversations under."

**Steps / screencast:** With the Page connected → Analytics → the Instagram | Facebook
switcher → Facebook → the report renders: engagement trend, follower flow, posts table with
real tallies.

### pages_manage_engagement

**Usage text:** "Page comments join the same queue as Instagram's. We reply as the Page,
hide/unhide, and delete, so agencies moderate every client conversation from one place."

**Steps / screencast:** Comment on a Page post from a personal profile (on screen) →
Comments → Check now → the comment appears labelled Facebook → Reply → show the reply on
facebook.com as the Page → Hide → show hidden → Unhide.

## 5. Known gotchas from this app's own history

- **Fresh consent in every recording** — the prior review round established this.
- **Live-mode token shape** — the wrapped/flat short-lived token parse (@1e766b6) is handled;
  nothing to do, recorded so nobody "simplifies" it before review.
- **Granular scopes are the Page-list truth** — a reviewer whose test Page is linked to a Meta
  business may see `/me/accounts` empty; the chooser still lists the Page (recovered by id).
  That is the designed behavior, per `docs/META-FB-PROBE.md`.
- **After approval:** reconnects are needed for tokens to carry newly-approved scopes (tokens
  never gain permissions after issue — the queue's "predates comment moderation" message).
  Also revisit the withheld banner: whether Facebook withholds under Standard Access becomes
  observable once a non-role user comments, and the banner is Instagram-scoped today.

## 6. Submission-day order

1. Portal checklist (§1) green, Business Verification confirmed.
2. Demo agency account created and seeded; credentials into the submission.
3. Record the five screencasts against the demo account — fresh consent each.
4. Paste usage texts, steps, and notes (§4, §3) per permission; submit.
5. While waiting: nothing in-app blocks — Standard Access keeps working for role-holders.
