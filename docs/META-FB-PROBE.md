# Facebook Graph probe

Recorded by `scripts/fb-probe.mjs` against Graph v25.0. Tokens are redacted.
Write probe: **skipped**.

This is observed behaviour, not documentation — steps 4-6 of the Facebook plan are written
against what is below.

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

### Comments on a Page post — field set and reply threading

`GET /659554973897366_122168377616832251/comments?fields=id,message,from,created_time,like_count,parent,comment_count&limit=5` (Page token) → **200**

```json
{
  "data": []
}
```

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
