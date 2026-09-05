# Facebook Graph probe

Recorded by `scripts/fb-probe.mjs` against Graph v25.0. Tokens are redacted.
Write probe: **skipped**.

This is observed behaviour, not documentation — steps 4-6 of the Facebook plan are written
against what is below.

## Publishing a photo post — probed live 2026-09-05

Run against the connected Page with its Page token, using the SAME encoding
`src/lib/meta/graph-client.ts` uses: `Authorization: Bearer` header, `Content-Type:
application/json`, JSON body. Both posts were deleted immediately and the Page was verified
clean afterwards.

`POST /{page-id}/photos` — body `{"url": "<public https>", "published": false}` → **200**

```json
{ "id": "122168909192960180" }
```

`POST /{page-id}/feed` — body
`{"message": "…", "attached_media": [{"media_fbid": "…"}, {"media_fbid": "…"}]}` → **200**

```json
{ "id": "723701000827665_122168909288960180", "post_supports_client_mutation_id": true }
```

`DELETE /{post-id}` → **200** `{"success":true}`

**`attached_media` takes a JSON array.** The documentation spells it
`attached_media[0]={"media_fbid":"…"}` — a form encoding — and the shared client sends JSON. The
array form works, which is the single fact this probe existed to establish; guessing it wrong
fails at the moment nobody is watching.

**Publishing is two-phase, and it has to be.** A `/feed` call that publishes outright cannot be
retried: Graph's client retries a timed-out request and the ladder grants two more attempts, so
one lost response puts the same post on the Page up to three times. The split below is the same
one Instagram's container flow uses.

`POST /{page-id}/feed` — body `{"message": "…", "attached_media": […], "published": false}`
→ **200**, and the post is created but NOT live:

```json
{ "id": "723701000827665_122168928356960180", "post_supports_client_mutation_id": true }
```

`GET /{post-id}?fields=is_published,message` → `{"is_published": false, …}`

`POST /{post-id}` — body `{"is_published": true}` → **200** `{"success":true}`, and the post
reads back `is_published: true` with a real `permalink_url`.

**The same call a SECOND time → 200 `{"success":true}` again.** No duplicate, no error. That
idempotence is what makes the retry safe and is the reason this shape works at all.

**`page_story_id` is NOT an "is it published" signal — the documentation is wrong.** The Photo
node's reference says it "applies only to published photos"; probed, an unpublished photo that
belonged to no post at all already carried
`page_story_id: 723701000827665_122168928314960180`, derived from the photo's own id. An
idempotency guard built on it would have believed every photo was already published.

**The id is `<page-id>_<post-id>`** and is what `post_publications.external_post_id` stores.

**One image goes through the same path as several.** Probed both ways; a single photo attached
to a `/feed` post behaves identically, so there is no separate single-image code path.

**Order is preserved, and this is not documented.** Four distinct photos attached in a known
sequence read back through `?fields=attachments{subattachments{target}}` in exactly that order:

```
attached: 122168921648…, 122168921696…, 122168921744…, 122168921798…
read back: 122168921648…, 122168921696…, 122168921744…, 122168921798…
```

Meta's reference shows sequential indices in its example but states no ordering guarantee, so a
carousel reaching Facebook in slide order depends on this observation alone.

**Ten attachments are accepted** — `POST /feed` with ten `attached_media` entries returned 200.
No maximum is documented anywhere: not on the Page Photos reference (the only page documenting
`attached_media`), not on the Page Feed reference, not in the Pages API guide, and Meta's own
community carries the question unanswered. Ten is therefore the largest count VERIFIED, not a
documented ceiling, and that is what `MAX_ATTACHED_PHOTOS` records.

**The docs describe a different encoding than the one that works.** They spell `attached_media`
as indexed form parameters (`attached_media[0]={"media_fbid":"…"}`, form-urlencoded). The JSON
array above is what was actually accepted, twice, against the live Page.

**A photo consumed by a post cannot be deleted on its own** — `DELETE /{photo-id}` answers
`(#100) Unsupported delete request … subcode 33`. Deleting the POST removes them, which is what
the cleanup relied on and the Page verified afterwards. An unpublished photo whose feed call
never happened is invisible on the Page and expires Meta-side.

## `/me/accounts` is not a reliable Page list — 2026-09-05

Probed live during the first real connect, after a Page had been ticked in Facebook's asset
picker and consent completed. All three calls used the same stored long-lived user token.

`GET /me/accounts` → **200**

```json
{ "data": [] }
```

`GET /me/permissions` → **200** — `pages_show_list`, `pages_read_engagement`,
`pages_manage_posts`, `pages_manage_engagement` all `"granted"`.

`GET /debug_token?input_token=<user>&access_token=<app-id>|<app-secret>` → **200**

```json
{ "data": { "type": "USER", "is_valid": true, "expires_at": 0,
  "granular_scopes": [
    { "scope": "pages_show_list",        "target_ids": ["723701000827665"] },
    { "scope": "pages_read_engagement",  "target_ids": ["723701000827665"] },
    { "scope": "pages_manage_posts",     "target_ids": ["723701000827665"] },
    { "scope": "pages_manage_engagement","target_ids": ["723701000827665"] },
    { "scope": "pages_manage_metadata",  "target_ids": ["659554973897366"] },
    { "scope": "business_management",    "target_ids": ["1010642534376034"] },
    { "scope": "instagram_basic" },
    { "scope": "instagram_manage_insights" } ] } }
```

So the permission is granted, the asset is named, and the list is empty. Nothing errors.

**Two shapes, two meanings.** `instagram_basic` carries no `target_ids` and Instagram works on
this same token, which is what establishes that an ABSENT `target_ids` means "every asset" —
the shape "opt in to all current and future Pages" produces. An absent SCOPE means not granted.
Empty and absent are different answers, so the parser must not default one to the other.

`pages_manage_metadata → 659554973897366` is a leftover from an earlier consent that ticked a
different Page. Grants accumulate per asset; they are not replaced wholesale on re-consent.

### The Page is fully reachable by id

`GET /723701000827665?fields=id,name,category,is_published,link,access_token,has_transitioned_to_new_page_experience`
→ **200**

```json
{ "id": "723701000827665", "name": "About Social Media", "category": "Social Media Agency",
  "is_published": true, "access_token": "<redacted>",
  "has_transitioned_to_new_page_experience": true }
```

That Page token debugs as `type: "PAGE"`, `expires_at: 0`, and both
`GET /{page}/feed` and `GET /{page}/published_posts` returned real posts with it. So the
connection works end to end; only the enumeration was broken.

`GET /{page}/roles` → **400**, *"A Page access token is required for this call for the new Pages
experience."* — the New Pages Experience is where the classic Page-role model, and the
`/me/accounts` edge built on it, stops answering.

`GET /me/businesses?fields=id,name,permitted_roles` → the user's own portfolio only
(`1010642534376034` "Paired Sox", `ADMIN`), whose `owned_pages` holds `659554973897366` and
whose `client_pages` is empty.

`GET /723701000827665?fields=business` → **403**, *"(#200) Requires business_management
permission to manage the object"* — asked alone, because one invalid field name fails the whole
call and `owner_business` is not a field on this node.

### Why the list was empty: two different reasons at once

Meta's v17.0 changelog, still in force at v25.0:

> The `GET /{user-id}/accounts` endpoint no longer returns Facebook pages that have been linked
> to a Meta business account, unless the app user has granted the `business_management`
> permission to the app **and has a role on the linked business account**.

Both Pages are excluded, and not for the same reason:

- **About Social Media** is linked to a business account. `business_management` IS granted, but
  only for `1010642534376034` — and the 403 above proves that is not the business this Page is
  linked to, which `/me/businesses` confirms by not listing any other. Second half of the
  condition unmet, so the edge drops it. `pages_show_list` still covers it, so it reads by id
  and its Page token publishes.
- **Paired Socks** has no `pages_show_list` grant at all — only the stale
  `pages_manage_metadata` above. Not listable, and not readable either: reading it by id returns
  *"Object does not exist, cannot be loaded due to missing permission"*.

So a Page can be missing from `/me/accounts` while being fully usable, and another can be
missing while being entirely unusable. The edge does not distinguish them; the grant does.

**Business enumeration was considered and rejected.** Unioning `/{business-id}/owned_pages` and
`/client_pages` is the usual workaround, and here it would return the wrong Page: it needs
`business_management` on the portfolio, which this token has only for "Paired Sox" — surfacing
Paired Socks, the one Page that cannot be connected, while still missing the one that can. The
grant answers the question directly and needs no portfolio access.

**What the code does about it:** `fetchFacebookPages` reads `granular_scopes` and merges what it
names with whatever `/me/accounts` offers, then recovers any Page the edge omitted by reading it
by id. Publish capability comes from `pages_manage_posts` coverage — what the person granted the
app — falling back to `/me/accounts` `tasks` only when the grant record is unreadable. Pinned by
`src/lib/meta/__tests__/facebook-auth.test.ts`.

### Pages this user administers

`GET /me/accounts` → **200**

```json
{
  "data": [
    {
      "access_token": "{PAGE_TOKEN}",
      "category": "Clothing store",
      "category_list": [
        {
          "id": "186230924744328",
          "name": "Clothing Store"
        }
      ],
      "name": "Paired Socks",
      "id": "659554973897366",
      "tasks": [
        "MANAGE",
        "CREATE_CONTENT",
        "MODERATE",
        "MESSAGING",
        "ADVERTISE",
        "ANALYZE"
      ]
    }
  ],
  "paging": {
    "cursors": {
      "before": "QVFIVDFOSE53V3A5bFFKbTBCUVBKRVRvVHhPdmZAILUY0aS1WN0JfRmhkbk9tOHFVcVl5QnZA6YS1GNVRxemdoM2dtQXhFUmRaa0tQZAFU4WmVHUGdvV1JHejFn",
      "after": "QVFIVDFOSE53V3A5bFFKbTBCUVBKRVRvVHhPdmZAILUY0aS1WN0JfRmhkbk9tOHFVcVl5QnZA6YS1GNVRxemdoM2dtQXhFUmRaa0tQZAFU4WmVHUGdvV1JHejFn"
    }
  }
}
```

### Page node

`GET /659554973897366?fields=id,name,username,category,link,fan_count` (Page token) → **200**

```json
{
  "id": "659554973897366",
  "name": "Paired Socks",
  "category": "Clothing store",
  "link": "https://www.facebook.com/659554973897366",
  "fan_count": 1
}
```

### Page feed — the fields a post carries

`GET /659554973897366/feed?fields=id,message,created_time,permalink_url,full_picture,is_published&limit=3` (Page token) → **200**

```json
{
  "data": [
    {
      "id": "659554973897366_122168377616832251",
      "message": "hello world",
      "created_time": "2026-04-06T17:50:09+0000",
      "permalink_url": "https://www.facebook.com/122184998852832251/posts/122168377616832251",
      "is_published": true
    }
  ],
  "paging": {
    "cursors": {
      "before": "QVFIVDRuQjZAnSktqajdFZAFh4TlRBekJfNS10ZA3VxTEdORXR6YkR0ZA0hlcG9xY0M5dGhHSjZA0SDZAMZA2ZANWDNmSl9zNUxDVl9MR0ZAoU2dhQUlxaUV3RWZAHWXRNTGdCNl9RMTdBY0czMHI2RURDUVVqMnRhWHBjeTZAIem9GM00xVkZAxM1BvMzFHZAjBBZAkh4aC1tYnl3ZAFF5Y01MdEhxbmNzcEo3U1FpRFZAaOFVzY2psU0xiYXV5SHk2MkFjU1RINTFIcXpMMmN3RWJvZAHpGOWg0WW90ZA2xYTG5aNWVBYjhPdGI3R0ZAoVV92aHhNQUJ6X002U0tQSVhsZA2dnVE1pcUFhY0ZATZAzZADc1hxblZAxaHlvd3RnZAXhHY0hUdV85V3dZASTdOeHlrOElXTUZAvTW1UTkNQY0s4MFg4aGFnbjdFTHBSb2FKbWZA1QzZAHbTh3bnNVZAmNBYmRpVE5PZAGQ5Rno5TFZAYVW5XOTExcjFFc1NSSzNJZA0YzeGRpdVpjamR0N1pXTU50LWRRMHl6VkR5Qnh6a0c4SFI4cE9TTTlzNnB0U21nVDhkVjZAqcVJDZAWxXQ25DWTdOSndHcHNLcC1WZA21FM3lmQkxXR25YYnVCdFpEYkh5ZA1NJNGltRll3ai16bWhselNiei1Qa3VkQ0s3NlEzeHlKcFo3UXVNeWU3ZAWxZAX01HdHFWXzVRLURFbHFYYmtKSTN2OUZABQXZAlc1NNc0F1YktsRTU5TXhDRFpLNzhZAWnRCemR5RnNGY2lfTzFlcVRYNXF4bU9SWDRLRHJ5bHhtOU40dXJ0UWtXWnNkOWVZAd0YwQ2tJUGZAqRjdzTktCb0M4ZAUE3ZAktuUW1tQlF6d09IdmdUc3pSVUw2RHpyQllBb2hlMExzSzljZAzNGYm9EQmJhQWdRNWhjY3JoMDJaVVVlLTFNSXFKU195SS16SGRJbjA4MUVUQU5wNi1PM2pVMFpLRVZAuX2RVWEVSaEdJdwZDZD",
      "after": "QVFIVDk5U2RDYUR1STZA0YlVQeTdaX0pGRnRLT1JWRnRXLWs1MUxheGt3U3M2Rk94YzRVSXZAIajl0cFozQVVSdWlGdTZAUNnEwM3hNUjdyWjBXcmVISEU4TkhZAaW1DakNUNWtkWTV4TElpYUlCQVcwcDUzQUdyUVNIWUpnTmpnaDYyaktfaDZAZAUlpQSXh0cC14OVU3VVRVcnJidzJsY0xuTWpyWVhfeXRmSl9JRXl6eFJNaUFnSXVCYTRLdk83cW5nUDBJODAxSGV3c2hYd3dwNTNBYmF1ZAnMzUHhnaU1IQVN1ZAm5lTTJvYnV5allqanZA3VzB2eS1ZARzRHVGduQjNiS2ZAmenduUU5yMzBCSVdGbk0xeENGUlVWTy0xaWs2QU5NYTBkWlVrTTRuN0FadEp3Y3dSU1RJdVZAiVFB3enVFTWNxMGV3bDhuV1M3NjVkS2NpMldKb19zZAGVNRTk0aTFGWm5aNWFYNXBqc2I4TEgyREJEMnM3U0psNmpwb2VweFJzVmU3Ym82U1VLNThHWllaQ2lhWXE5QlZAWdURTY2kwS2M2Wk44UGpaMmdNTElGZAGRZAa3pMNDNTZA0txcnRzQzdQaGt6eUtKZAHEybDJSOXNKVWl1aWJPZAWpVdEpfQktwWktwbGczdERWVVhQUnpkN0F5ZAWNGRGpVemF3REVEdlo5dEJ0blF3VjN4OVd2YTNBQllseTJnLWNxRDFPTW9QVWdRMTlka3g4eWVQYk84VkI4bDhaSE9jZAHN5dGJnYkZAKLXhYSFVUNnJzakM3SV84ckV0RFNkbm5DWE14NnhoZADR3T2FHb21JRm9qYzVZANXR2dlUwUFJnS0JuYjFod3U0bVd2ZA2J1NjNjUDhrRHVQbFViSEZAoOFdDemppMlNqMENacGJrdlFxYVN6c2Vybkdqdm1xdmJyVkZA6eGtYZA21jVnh2LWJNQmZAyTVlTSVlOdGlrcXRzZAjFGZAnNiWmFqdwZDZD"
    }
  }
}
```

### Published posts (for the comment probe)

`GET /659554973897366/posts?limit=1` (Page token) → **200**

```json
{
  "data": [
    {
      "created_time": "2026-04-06T17:50:09+0000",
      "message": "hello world",
      "id": "659554973897366_122168377616832251"
    }
  ],
  "paging": {
    "cursors": {
      "before": "QVFIVEFRS0M1TVRlR3IwYUlBVEhJRWM4STN5amNjRVlKc1Vadko1eEFtSmhDb25ONVVtdmI2N0FsZAWtUMUpjSnplVXVOSEhSZAlBiUDhPclpKbW5ONUlUR2RfOVpRUGZADX0tZAVXpVZAFJnMmJVSHFNWVJ4RGtoemE2SkdzY28zOFQ5WmlsYmVHZAjhxSGZA1U0RBemlRMU8zOWlpTlBHNnZACVnlrQnVRR2g0endBSzRMYVNYMEZAlMERyWnh0MXkxZA040RGluQ2thZAVhYQzNQX3A3RjJBRTBiTU00SkpWLTlha1ZA6cmZAiMm90ZA2lOQ2owcDFOU1poRFFYSklSVXBTemVhRmpFZA2dPMk1lb0R0cVJfY0R0dU9HR2YwOVdnd2dvc0pLZA3RlaXdOZA1FsVUdHbGpxcDdUUGdQbHU0ZAnBmRWRNRjVLYkFWSUVrcjBBR3RrN29EYnVYY192UTJKSWhFcV9hOUlVVlVTQnJQbkNfTWdDcE9MVXJfeFRqSHVSYmJqenVPOGUyOWNlaDZALV0cyMmdKbDZAIWXp1TWRIUnRnODFVYlZAnTHpQcE13MjdjZAXdMcGEtZAzVRaXhqa3ZAQcDJ4LVdzM2lTNFlJUFhqdVd3M1o1b2hVSFduQy1tSXJCV2JiSEhubXN0a2ZAXbExBNVpPQzdBYmNQUmVnQXZAYNFlpMWU3azVld1lhRVg3d0V0SS0yVVE0ZA185enRBaldVU2lyMHlBcHBIN2loMXRqWlVaV0lZASk9OLUFrX3AxNlZAFSzFKdGtJVVBkcwZDZD",
      "after": "QVFIVHBHZA3hfRkJTcUFjMDFGUTdJRmRsbzhjR09wUlViYndldjZAjRkM2RGhNLVNMclBjcnh0V1VoMVkyOEtFNlZABVW5ua1ltMERVV3ZAVQXhWZAEJSUk5NdjNkbnpaRFJTaGI3X3IwSjEtQ3h3QjRZAY2VoWTVXNFg0b1h5QUNzUXlSY2JCMElkM2w4OFRyQ0Nqek0tMmpJRmJDM1EwZAjB0RElvTUtpYVJ6U3ZAhbXYzekZA3S3ZAIWVFpTU1mYXhXdnJhWHBSbTdhaXVNVFZARTHA3RkhuVVlTaHpTdEJJZAVIxY0xkMWVjQzE5UW11OHVibmtEdzhTU3d2cnBLbDRTQ1JfTUx2ZAEhxV2xqdlRlel90MHF3cURXQzhYcU43MjdjaURhS0hmdnhYeUQtWGQ1UHJESHlmNHczZAzQ5WVN5eDFVeVpncXQxa1JWN0oyQnhPMjM2bGtlWmRHS2x5OW56aGktSW83b3pUNEpsVEt2bjhSczgtbklDck5tckdPak5lalJ1Y1kyV1NvMzFsOFpYN3NWSnpESnprUUN2ZAGpHYWxBbmY3OGF4d2NUU0lfX1FEal9PWGhzOXUtNG5HYkRlWVVoaU9jeUJLWjlNeDZAQQ3E5Nk9pWGxUbFJUZAURVQTRjbXNPM05BNWxaVFR5MmRnZAmhBeS05a3ppaFdWYzlKT1RCTWZA3TVFVbjhoOUh0VlBRcGYwTlhFX2NMNmpIcFFfSVpaU1ZAzcE10dFc2dzFvYmQzUFlMcVRRQmZAFRGFkaExLc0w0ZAzQtagZDZD"
    }
  }
}
```

### Comments on a Page post — probed against a real comment, 2026-09-05

The earlier run here returned `{"data": []}` and proved nothing: it was aimed at Paired Socks,
a Page this app cannot read, and which had no comments. Re-run against a genuine visitor
comment on the connected Page.

`GET /{post-id}/comments?fields=id,message,from,created_time,like_count,parent,comment_count,can_hide,is_hidden`
→ **200**

```json
{ "data": [ {
  "id": "122167637282960180_1386857980259623",
  "message": "cool",
  "from": { "name": "Teodor Lilov", "id": "28443907705226419" },
  "created_time": "2026-09-05T14:33:01+0000",
  "like_count": 0, "comment_count": 0,
  "can_hide": true, "is_hidden": false } ] }
```

**Every field name differs from Instagram's.** `message` not `text`, `created_time` not
`timestamp`, `comment_count` not `replies`, `is_hidden` not `hidden`. `from` is an object with
a display NAME, where Instagram gives a `username` handle — both answer "who said it", so both
land in `author_username`, but the column holds a different KIND of string per network.

**`POST /{comment-id}/comments`** with `message` → **200** `{"id": …}`. Replying uses the same
edge as commenting; the parent is the path, not a parameter.

**Replies are not on the post's edge.** After the reply, `GET /{post-id}/comments` still returned
one item — the top-level comment, now with `comment_count: 1`. The reply is reachable only at
`GET /{comment-id}/comments`. So a full sync is two levels: the post's comments, then one call
per comment whose `comment_count` is above zero.

**A reply carries its whole parent, not an id.** `GET /{reply-id}?fields=parent` →

```json
{ "parent": { "id": "122167637282960180_1386857980259623",
              "message": "cool",
              "from": { "name": "Teodor Lilov", "id": "28443907705226419" },
              "created_time": "2026-09-05T14:33:01+0000" } }
```

**A Page cannot hide its own comment, and Graph says so per comment.** `can_hide` was `true` on
the visitor's comment and `false` on the Page's own reply, and `POST /{comment-id}`
`{"is_hidden": true}` on that reply returned **403**:

```json
{ "error": { "message": "(#200) Can not hide or unhide this comment", "code": 200 } }
```

So `can_hide` is a per-comment capability to read, not a blanket one to assume — the moderation
UI must not offer hide on a comment Graph has already said no to.

**`DELETE /{comment-id}`** → **200** `{"success":true}`.

**Comment ids are `{post-id}_{comment-id}`**, and a reply's id is keyed to the POST, not to its
parent comment — `122167637282960180_1584549173454318` replied to
`122167637282960180_1386857980259623`.

`GET /{page-id}/published_posts?fields=comments.summary(true).limit(0)` returns
`{"total_count": N, "can_comment": bool, "order": …}` per post, which is the cheap count the
sync compares before fetching anything.

### Insight: page_impressions

`GET /659554973897366/insights?metric=page_impressions&period=day` (Page token) → **400**

```json
{
  "error": {
    "message": "(#100) The value must be a valid insights metric",
    "type": "OAuthException",
    "code": 100,
    "fbtrace_id": "AK5w64sspf_nMUi-7r8eg31"
  }
}
```

### Insight: page_post_engagements

`GET /659554973897366/insights?metric=page_post_engagements&period=day` (Page token) → **200**

```json
{
  "data": [
    {
      "name": "page_post_engagements",
      "period": "day",
      "values": [
        {
          "value": 0,
          "end_time": "2026-09-03T07:00:00+0000"
        },
        {
          "value": 0,
          "end_time": "2026-09-04T07:00:00+0000"
        }
      ],
      "title": "Daily Post Engagements",
      "description": "Daily: The number of times people have engaged with your posts through like, comments and shares and more.",
      "id": "659554973897366/insights/page_post_engagements/day"
    }
  ],
  "paging": {
    "previous": "https://graph.facebook.com/v25.0/659554973897366/insights?access_token={PAGE_TOKEN}&metric=page_post_engagements&period=day&since=1788159600&until=1788332400",
    "next": "https://graph.facebook.com/v25.0/659554973897366/insights?access_token={PAGE_TOKEN}&metric=page_post_engagements&period=day&since=1788505200&until=1788678000"
  }
}
```

### Insight: page_fans

`GET /659554973897366/insights?metric=page_fans&period=day` (Page token) → **400**

```json
{
  "error": {
    "message": "(#100) The value must be a valid insights metric",
    "type": "OAuthException",
    "code": 100,
    "fbtrace_id": "A70V_qsBgrC4a_MX0cZ3gfB"
  }
}
```

### Insight: page_views_total

`GET /659554973897366/insights?metric=page_views_total&period=day` (Page token) → **200**

```json
{
  "data": [
    {
      "name": "page_views_total",
      "period": "day",
      "values": [
        {
          "value": 0,
          "end_time": "2026-09-03T07:00:00+0000"
        },
        {
          "value": 0,
          "end_time": "2026-09-04T07:00:00+0000"
        }
      ],
      "title": "Daily Total views count per Page",
      "description": "Daily: Total views count per Page",
      "id": "659554973897366/insights/page_views_total/day"
    }
  ],
  "paging": {
    "previous": "https://graph.facebook.com/v25.0/659554973897366/insights?access_token={PAGE_TOKEN}&metric=page_views_total&period=day&since=1788159600&until=1788332400",
    "next": "https://graph.facebook.com/v25.0/659554973897366/insights?access_token={PAGE_TOKEN}&metric=page_views_total&period=day&since=1788505200&until=1788678000"
  }
}
```

### Insight: page_daily_follows_unique

`GET /659554973897366/insights?metric=page_daily_follows_unique&period=day` (Page token) → **200**

```json
{
  "data": [
    {
      "name": "page_daily_follows_unique",
      "period": "day",
      "values": [
        {
          "value": 0,
          "end_time": "2026-09-03T07:00:00+0000"
        },
        {
          "value": 0,
          "end_time": "2026-09-04T07:00:00+0000"
        }
      ],
      "title": "Daily New Follows",
      "description": "Daily: The number of Meta Accounts that followed your Page in the selected time period. This metric is estimated (Unique Users)",
      "id": "659554973897366/insights/page_daily_follows_unique/day"
    }
  ],
  "paging": {
    "previous": "https://graph.facebook.com/v25.0/659554973897366/insights?access_token={PAGE_TOKEN}&metric=page_daily_follows_unique&period=day&since=1788159600&until=1788332400",
    "next": "https://graph.facebook.com/v25.0/659554973897366/insights?access_token={PAGE_TOKEN}&metric=page_daily_follows_unique&period=day&since=1788505200&until=1788678000"
  }
}
```

> Publish probe skipped. Re-run with `--publish` to exercise the photos→feed pair.
