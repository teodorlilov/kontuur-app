-- Clear the scores no judge ever assigned.
--
-- When the quality call failed, `assemblePostValidation` substituted
-- NEUTRAL_FALLBACK_SCORE = 7 for both overall_score and human_score. That 7 cleared
-- QUALITY_FLOOR (5), met REWRITE_SCORE_THRESHOLD (7) so `reads_as_human` became
-- true, and rendered in a green pill — indistinguishable from a real verdict. The
-- code no longer fabricates it; these are the rows written before that.
--
-- IDENTIFICATION IS PROBABILISTIC, DELIBERATELY SO.
--
-- The failure branch writes a distinctive shape: both scores exactly 7, empty
-- ai_tells, empty issues, null worst_offending_phrase, null health_compliant, and
-- null source_claims. The last conjunct is the sharpest: the real branch writes
-- flagged_claims normalized to [] at minimum, never null — so a null there can only
-- come from the failure branch (or a pre-grounding row). Without it, a genuine
-- clean 7/7 on a grounded post (source_claims []) would match and be wiped. For
-- the rest, `normalizeQualityResponse` defaulted the same fields the same way, so
-- a genuine unremarkable 7/7 remains indistinguishable from one the judge never
-- read. `validationWarnings` would have been the clean marker and was never
-- persisted.
--
-- The cost asymmetry decides it. A false positive nulls a real 7: the post shows
-- "Not scored", triage flags it `not_validated`, and a human glances at it — nothing
-- is destroyed, and validation_json.criteria is left intact. A false negative leaves
-- a fabricated 7 being averaged into client insights and bulk-approved as a clean
-- score. Prefer the cheap error.
--
-- Run this first and put the number in the deploy notes — a large count is itself a
-- finding about judge reliability:
--
--   select status, count(*) from posts
--   where quality_score_avg = 7
--     and validation_json #>> '{scores,human_score}' = '7'
--     and (validation_json #> '{criteria,ai_tells}' is null
--       or (jsonb_typeof(validation_json #> '{criteria,ai_tells}') = 'array'
--         and jsonb_array_length(validation_json #> '{criteria,ai_tells}') = 0))
--     and (validation_json #> '{criteria,issues}' is null
--       or (jsonb_typeof(validation_json #> '{criteria,issues}') = 'array'
--         and jsonb_array_length(validation_json #> '{criteria,issues}') = 0))
--     and validation_json #> '{criteria,worst_offending_phrase}' = 'null'::jsonb
--     and validation_json #> '{criteria,health_compliant}' = 'null'::jsonb
--     and (validation_json #> '{criteria,source_claims}' is null
--       or validation_json #> '{criteria,source_claims}' = 'null'::jsonb)
--   group by status;
--
-- All statuses, not just drafts: scheduled and published rows feed the client
-- averages in insights.ts, whose query already filters nulls, so clearing them
-- shrinks the sample toward `insufficient_data` — the honest failure mode.
--
-- Both stores are patched in one statement. Leaving validation_json at 7 would keep
-- the fabrication alive: the review page reads the blob before the column.

update posts
set
  quality_score_avg = null,
  validation_json = jsonb_set(
    jsonb_set(validation_json, '{scores,overall_score}', 'null'::jsonb, false),
    '{scores,human_score}',
    'null'::jsonb,
    false
  )
-- The typeof guards are load-bearing twice over: jsonb_array_length ERRORS on a
-- non-array (it does not return null), so a single malformed legacy row would
-- abort the whole migration; and a malformed field is not the failure-branch
-- fingerprint, so such a row must be skipped, not wiped.
where quality_score_avg = 7
  and validation_json is not null
  and validation_json #>> '{scores,human_score}' = '7'
  and (validation_json #> '{criteria,ai_tells}' is null
    or (jsonb_typeof(validation_json #> '{criteria,ai_tells}') = 'array'
      and jsonb_array_length(validation_json #> '{criteria,ai_tells}') = 0))
  and (validation_json #> '{criteria,issues}' is null
    or (jsonb_typeof(validation_json #> '{criteria,issues}') = 'array'
      and jsonb_array_length(validation_json #> '{criteria,issues}') = 0))
  and validation_json #> '{criteria,worst_offending_phrase}' = 'null'::jsonb
  and validation_json #> '{criteria,health_compliant}' = 'null'::jsonb
  -- The real judge branch writes flagged_claims as [] at minimum, never null.
  and (validation_json #> '{criteria,source_claims}' is null
    or validation_json #> '{criteria,source_claims}' = 'null'::jsonb);

-- No prompt contamination to unwind: fetchTopPostsByClient selects exemplar captions
-- at `.gte(quality_score_avg, 7.5)`, so a fabricated 7 was never held up to the model
-- as a client's best work.

notify pgrst, 'reload schema';
