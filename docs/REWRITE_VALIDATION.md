# File Centralization Plan

> **Implementation document for Claude Code.**
> Run `npx tsc --noEmit` after every individual file move before touching the next.
> **Rule: pure moves only — no logic changes, no content changes, no renames beyond what is listed.**

---

## Target Structure

```
features/ai/
├── generation/
│   ├── generation-criteria.ts        ← MOVED from lib/content-rules/
│   ├── generate-posts.ts
│   ├── rewrite.ts
│   ├── perform-rewrite.ts
│   ├── generator-factory.ts
│   ├── post-generator.ts
│   ├── carousel-generator.ts
│   ├── reels-generator.ts
│   ├── writing-context.ts
│   ├── types.ts
│   └── prompts/
│       ├── prompt-sections.ts
│       ├── formality-guidance.ts
│       └── source-grounding.ts
│
└── validation/
    ├── validate-post.ts              ← MOVED from features/ai/generation/
    ├── types/
    │   └── scoring.ts                ← MOVED from types/scoring.ts
    ├── content-rules/
    │   ├── validation-criteria.ts    ← MOVED + RENAMED from lib/content-rules/evaluation-criteria.ts
    │   ├── text-analysis.ts          ← MOVED from lib/content-rules/
    │   └── compute-scores.ts         ← MOVED from lib/content-rules/
    └── prompts/
        ├── validate-quality.ts       ← MOVED from features/ai/prompts/validation/
        ├── validate-language.ts      ← MOVED from features/ai/prompts/validation/
        ├── validate-source-grounding.ts  ← MOVED from features/ai/prompts/validation/
        └── language-validation-rules.ts  ← MOVED from features/ai/prompts/validation/
```

**Directories deleted after all moves:**
- `lib/content-rules/` — emptied by steps 1-3
- `features/ai/prompts/validation/` — emptied by steps 6-9

**Note on `lib/content-rules/constants.ts`:** This file is not listed for a move. Confirm whether it stays in `lib/content-rules/` or moves alongside `compute-scores.ts`. If it moves, treat it as an additional step matching the pattern in Step 3.

---

## Build Order

```
Step 1  → Move generation-criteria.ts → features/ai/generation/
Step 2  → Move text-analysis.ts → features/ai/validation/content-rules/
Step 3  → Move + rename evaluation-criteria.ts → features/ai/validation/content-rules/validation-criteria.ts
Step 4  → Move compute-scores.ts → features/ai/validation/content-rules/
Step 5  → Move types/scoring.ts → features/ai/validation/types/scoring.ts
Step 6  → Move language-validation-rules.ts → features/ai/validation/prompts/
Step 7  → Move validate-quality.ts → features/ai/validation/prompts/
Step 8  → Move validate-language.ts → features/ai/validation/prompts/
Step 9  → Move validate-source-grounding.ts → features/ai/validation/prompts/
Step 10 → Move validate-post.ts → features/ai/validation/
Step 11 → Delete empty directories
Step 12 → Verification
```

---

## Import Path Reference

Every file that imports from the moved locations must update. Use this table.

| Old path | New path |
|---|---|
| `@/lib/content-rules/generation-criteria` | `@/ai/generation/generation-criteria` |
| `@/lib/content-rules/evaluation-criteria` | `@/ai/validation/content-rules/validation-criteria` |
| `@/lib/content-rules/text-analysis` | `@/ai/validation/content-rules/text-analysis` |
| `@/lib/content-rules/compute-scores` | `@/ai/validation/content-rules/compute-scores` |
| `@/types/scoring` | `@/ai/validation/types/scoring` |
| `@/ai/prompts/validation/validate-quality` | `@/ai/validation/prompts/validate-quality` |
| `@/ai/prompts/validation/validate-language` | `@/ai/validation/prompts/validate-language` |
| `@/ai/prompts/validation/validate-source-grounding` | `@/ai/validation/prompts/validate-source-grounding` |
| `@/ai/prompts/validation/language-validation-rules` | `@/ai/validation/prompts/language-validation-rules` |
| `@/ai/generation/validate-post` | `@/ai/validation/validate-post` |

---

## Step 1 — Move generation-criteria.ts

```bash
mkdir -p src/features/ai/generation
git mv src/lib/content-rules/generation-criteria.ts \
       src/features/ai/generation/generation-criteria.ts
```

Find all files that import from the old path:
```bash
grep -r "lib/content-rules/generation-criteria" src/ --include="*.ts" -l
```

Update every import found. Expected consumers:
- `features/ai/generation/prompts/prompt-sections.ts`
- `features/ai/generation/prompts/formality-guidance.ts` (if it imports from here)
- `features/ai/validation/content-rules/evaluation-criteria.ts` (current location — will move in Step 3)
- `features/ai/validation/content-rules/text-analysis.ts` (current location — will move in Step 2)
- `features/ai/prompts/validation/validate-quality.ts` (current location)
- Any rewrite or generation files that import openers/structures directly

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `lib/content-rules/generation-criteria.ts` does not exist
- [ ] `features/ai/generation/generation-criteria.ts` exists
- [ ] `grep -r "lib/content-rules/generation-criteria" src/` — returns nothing

---

## Step 2 — Move text-analysis.ts

```bash
mkdir -p src/features/ai/validation/content-rules
git mv src/lib/content-rules/text-analysis.ts \
       src/features/ai/validation/content-rules/text-analysis.ts
```

Find all files that import from the old path:
```bash
grep -r "lib/content-rules/text-analysis" src/ --include="*.ts" -l
```

Expected consumers:
- `features/ai/generation/validate-post.ts` (current location — will move in Step 10)
- Any test files for text-analysis

`text-analysis.ts` imports from `generation-criteria.ts`. After Step 1 moved `generation-criteria.ts`, update the internal import inside `text-analysis.ts`:
```typescript
// Old:
import { MIN_SHORT_SENTENCE_WORDS, ... } from '@/lib/content-rules/generation-criteria'
// New (after Step 1):
import { MIN_SHORT_SENTENCE_WORDS, ... } from '@/ai/generation/generation-criteria'
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `lib/content-rules/text-analysis.ts` does not exist
- [ ] `features/ai/validation/content-rules/text-analysis.ts` exists
- [ ] `grep -r "lib/content-rules/text-analysis" src/` — returns nothing

---

## Step 3 — Move + Rename evaluation-criteria.ts → validation-criteria.ts

This step is two operations: move the file and rename it. Do both atomically with `git mv`.

```bash
git mv src/lib/content-rules/evaluation-criteria.ts \
       src/features/ai/validation/content-rules/validation-criteria.ts
```

Find all files that import from the old path:
```bash
grep -r "lib/content-rules/evaluation-criteria" src/ --include="*.ts" -l
```

Update every import found — note the new filename `validation-criteria` not `evaluation-criteria`:

```typescript
// Old:
import { ... } from '@/lib/content-rules/evaluation-criteria'
// New:
import { ... } from '@/ai/validation/content-rules/validation-criteria'
```

Expected consumers:
- `features/ai/generation/prompts/prompt-sections.ts` (imports `formatAiTellPatterns`)
- `features/ai/generation/prompts/validate-quality.ts` (current location)
- `lib/content-rules/compute-scores.ts` (current location — will move in Step 4)

`validation-criteria.ts` imports from `generation-criteria.ts`. That import is already updated after Step 1 — verify it still resolves correctly with:
```typescript
import { ... } from '@/ai/generation/generation-criteria'
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `lib/content-rules/evaluation-criteria.ts` does not exist
- [ ] `features/ai/validation/content-rules/validation-criteria.ts` exists
- [ ] `grep -r "evaluation-criteria" src/` — returns nothing (old name gone)
- [ ] `grep -r "lib/content-rules/evaluation-criteria" src/` — returns nothing

---

## Step 4 — Move compute-scores.ts

```bash
git mv src/lib/content-rules/compute-scores.ts \
       src/features/ai/validation/content-rules/compute-scores.ts
```

Find all files that import from the old path:
```bash
grep -r "lib/content-rules/compute-scores" src/ --include="*.ts" -l
```

Expected consumers:
- `features/ai/generation/validate-post.ts` (current location)
- `features/ai/generation/perform-rewrite.ts` (current location)
- `features/ai/prompts/validation/validate-quality.ts` (current location)
- `features/ai/prompts/validation/validate-language.ts` (current location)
- `features/ai/prompts/validation/validate-source-grounding.ts` (current location)
- Any test files for compute-scores

`compute-scores.ts` imports from `evaluation-criteria.ts` (now `validation-criteria.ts`) and `text-analysis.ts`. Both were moved in Steps 2-3 — update internal imports:
```typescript
// Old:
import { ... } from '@/lib/content-rules/evaluation-criteria'
import type { SentenceVarietyResult } from '@/lib/content-rules/text-analysis'
// New:
import { ... } from '@/ai/validation/content-rules/validation-criteria'
import type { SentenceVarietyResult } from '@/ai/validation/content-rules/text-analysis'
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `lib/content-rules/compute-scores.ts` does not exist
- [ ] `features/ai/validation/content-rules/compute-scores.ts` exists
- [ ] `grep -r "lib/content-rules/compute-scores" src/` — returns nothing

---

## Step 5 — Move types/scoring.ts

```bash
mkdir -p src/features/ai/validation/types
git mv src/types/scoring.ts \
       src/features/ai/validation/types/scoring.ts
```

Find all files that import from the old path:
```bash
grep -r "@/types/scoring\|from.*types/scoring" src/ --include="*.ts" -l
```

Update every import:
```typescript
// Old:
import type { QualityResult, ... } from '@/types/scoring'
// New:
import type { QualityResult, ... } from '@/ai/validation/types/scoring'
```

**Update `types/index.ts`** — the re-export for `scoring` now points to the new location:
```typescript
// Old:
export * from './scoring'
// New:
export * from '@/ai/validation/types/scoring'
```

This keeps any consumer that imports from `@/types` (via index) working without changes.

Expected direct consumers:
- `features/ai/prompts/validation/validate-quality.ts`
- `features/ai/prompts/validation/validate-language.ts`
- `features/ai/prompts/validation/validate-source-grounding.ts`
- `lib/content-rules/compute-scores.ts` → now `features/ai/validation/content-rules/compute-scores.ts`
- `features/ai/generation/validate-post.ts`
- `features/ai/generation/perform-rewrite.ts`
- `app/api/` route files

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `types/scoring.ts` does not exist
- [ ] `features/ai/validation/types/scoring.ts` exists
- [ ] `types/index.ts` re-exports from new location
- [ ] `grep -r "from '@/types/scoring'" src/` — returns nothing (all import via index or new path)

---

## Step 6 — Move language-validation-rules.ts

```bash
mkdir -p src/features/ai/validation/prompts
git mv src/features/ai/prompts/validation/language-validation-rules.ts \
       src/features/ai/validation/prompts/language-validation-rules.ts
```

Find all files that import from the old path:
```bash
grep -r "prompts/validation/language-validation-rules" src/ --include="*.ts" -l
```

Expected consumer:
- `features/ai/prompts/validation/validate-language.ts` (current location — will move in Step 8)

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `features/ai/prompts/validation/language-validation-rules.ts` does not exist
- [ ] `features/ai/validation/prompts/language-validation-rules.ts` exists

---

## Step 7 — Move validate-quality.ts

```bash
git mv src/features/ai/prompts/validation/validate-quality.ts \
       src/features/ai/validation/prompts/validate-quality.ts
```

Find all files that import from the old path:
```bash
grep -r "prompts/validation/validate-quality" src/ --include="*.ts" -l
```

Expected consumers:
- `features/ai/generation/validate-post.ts`
- `features/ai/generation/perform-rewrite.ts`
- Any route handlers

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `features/ai/prompts/validation/validate-quality.ts` does not exist
- [ ] `features/ai/validation/prompts/validate-quality.ts` exists
- [ ] `grep -r "prompts/validation/validate-quality" src/` — returns nothing

---

## Step 8 — Move validate-language.ts

```bash
git mv src/features/ai/prompts/validation/validate-language.ts \
       src/features/ai/validation/prompts/validate-language.ts
```

Internal import update inside `validate-language.ts`:
```typescript
// Old:
import { buildLanguageValidationRules } from './language-validation-rules'
// New (sibling in same folder — relative import unchanged):
import { buildLanguageValidationRules } from './language-validation-rules'
```

The relative import stays correct automatically since both files are now in `features/ai/validation/prompts/`.

Find all files that import from the old path:
```bash
grep -r "prompts/validation/validate-language" src/ --include="*.ts" -l
```

Expected consumers:
- `features/ai/generation/validate-post.ts`
- `features/ai/generation/perform-rewrite.ts`

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `features/ai/prompts/validation/validate-language.ts` does not exist
- [ ] `features/ai/validation/prompts/validate-language.ts` exists
- [ ] `grep -r "prompts/validation/validate-language" src/` — returns nothing

---

## Step 9 — Move validate-source-grounding.ts

```bash
git mv src/features/ai/prompts/validation/validate-source-grounding.ts \
       src/features/ai/validation/prompts/validate-source-grounding.ts
```

Find all files that import from the old path:
```bash
grep -r "prompts/validation/validate-source-grounding" src/ --include="*.ts" -l
```

Expected consumers:
- `features/ai/generation/validate-post.ts`
- `features/ai/generation/perform-rewrite.ts`

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `features/ai/prompts/validation/validate-source-grounding.ts` does not exist
- [ ] `features/ai/validation/prompts/validate-source-grounding.ts` exists
- [ ] `grep -r "prompts/validation/validate-source-grounding" src/` — returns nothing

---

## Step 10 — Move validate-post.ts

```bash
git mv src/features/ai/generation/validate-post.ts \
       src/features/ai/validation/validate-post.ts
```

Find all files that import from the old path:
```bash
grep -r "generation/validate-post\|ai/generation/validate-post" src/ --include="*.ts" -l
```

Expected consumers:
- `features/ai/generation/generate-posts.ts`
- `features/ai/generation/perform-rewrite.ts`
- Any API route handlers

Internal imports inside `validate-post.ts` — update to new paths:
```typescript
// All three validators now in validation/prompts/
import { validateQuality } from '@/ai/validation/prompts/validate-quality'
import { validateLanguage } from '@/ai/validation/prompts/validate-language'
import { validateSourceGrounding } from '@/ai/validation/prompts/validate-source-grounding'

// compute-scores now in validation/content-rules/
import { deriveSlopFromQuality, computeCriteriaScore, createDefaultQuality }
  from '@/ai/validation/content-rules/compute-scores'

// text-analysis now in validation/content-rules/
import { analyzeSentenceVariety, countWords, countHashtags, detectBannedPhrases }
  from '@/ai/validation/content-rules/text-analysis'

// generation-criteria now in generation/
import { getBannedPhrasesForLanguage }
  from '@/ai/generation/generation-criteria'

// scoring types now in validation/types/
import type { QualityResult, QualityContext, LanguageValidationResult, SourceGroundingResult, SlopDetection }
  from '@/ai/validation/types/scoring'
```

### ✓ Step 10 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `features/ai/generation/validate-post.ts` does not exist
- [ ] `features/ai/validation/validate-post.ts` exists
- [ ] `grep -r "generation/validate-post" src/` — returns nothing

---

## Step 11 — Delete Empty Directories

Only run after Step 10 passes `tsc` with zero errors.

```bash
# Should be empty after steps 1-4
rmdir src/lib/content-rules/ 2>/dev/null && echo "lib/content-rules removed" \
  || echo "lib/content-rules not empty — check for remaining files"

# Should be empty after steps 6-9
rmdir src/features/ai/prompts/validation/ 2>/dev/null && echo "prompts/validation removed" \
  || echo "prompts/validation not empty — check for remaining files"

# Check if features/ai/prompts/ is now empty
ls src/features/ai/prompts/ 2>/dev/null || echo "prompts/ also empty — remove it"
rmdir src/features/ai/prompts/ 2>/dev/null || true
```

If either directory is not empty, list remaining files before deleting:
```bash
ls src/lib/content-rules/
ls src/features/ai/prompts/validation/
```

Remaining files in `lib/content-rules/` are likely `constants.ts` (not listed for a move in this plan — confirm separately) and any test files. Move test files alongside their source files.

### ✓ Step 11 Verification
- [ ] `lib/content-rules/` does not exist (or contains only `constants.ts` if that stays)
- [ ] `features/ai/prompts/validation/` does not exist
- [ ] `features/ai/prompts/` does not exist (if it only contained `validation/`)

---

## Step 12 — Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Structure audit
```bash
ls src/features/ai/generation/
# generation-criteria.ts  generate-posts.ts  rewrite.ts  perform-rewrite.ts
# generator-factory.ts  post-generator.ts  carousel-generator.ts  reels-generator.ts
# writing-context.ts  types.ts  prompts/

ls src/features/ai/validation/
# validate-post.ts  types/  content-rules/  prompts/

ls src/features/ai/validation/content-rules/
# validation-criteria.ts  text-analysis.ts  compute-scores.ts

ls src/features/ai/validation/prompts/
# validate-quality.ts  validate-language.ts  validate-source-grounding.ts
# language-validation-rules.ts

ls src/features/ai/validation/types/
# scoring.ts
```

### Import audit — confirm old paths are gone
```bash
grep -r "lib/content-rules/" src/               # nothing
grep -r "prompts/validation/validate-" src/     # nothing
grep -r "generation/validate-post" src/         # nothing
grep -r "evaluation-criteria" src/              # nothing (renamed)
grep -r "from.*types/scoring" src/ | grep -v "validation/types"  # nothing
```

### Functional verification
- [ ] Generate a single post — quality + language validation fires
- [ ] Generate a carousel — slide validation fires
- [ ] Rewrite a post — corrections applied
- [ ] Research pipeline runs — no import errors

---

## Summary

| File | Old location | New location |
|---|---|---|
| `generation-criteria.ts` | `lib/content-rules/` | `features/ai/generation/` |
| `evaluation-criteria.ts` | `lib/content-rules/` | `features/ai/validation/content-rules/validation-criteria.ts` |
| `text-analysis.ts` | `lib/content-rules/` | `features/ai/validation/content-rules/` |
| `compute-scores.ts` | `lib/content-rules/` | `features/ai/validation/content-rules/` |
| `scoring.ts` | `types/` | `features/ai/validation/types/` |
| `validate-quality.ts` | `features/ai/prompts/validation/` | `features/ai/validation/prompts/` |
| `validate-language.ts` | `features/ai/prompts/validation/` | `features/ai/validation/prompts/` |
| `validate-source-grounding.ts` | `features/ai/prompts/validation/` | `features/ai/validation/prompts/` |
| `language-validation-rules.ts` | `features/ai/prompts/validation/` | `features/ai/validation/prompts/` |
| `validate-post.ts` | `features/ai/generation/` | `features/ai/validation/` |

---

*PostFlow — File Centralization*
*One move per step. `npx tsc --noEmit` after every step.*