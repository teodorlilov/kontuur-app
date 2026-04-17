## Code Quality Rules (non-negotiable)

### No duplication
- Before writing any function, search the codebase for existing functions
  that do the same thing. Use the existing one. Do not create a second version.
- If the same logic appears in two places, extract it before adding a third.
- If you find duplication while working on something else, note it but do not
  fix it unless it is in scope. Do not refactor things not asked for.

### Single source of truth
- Constants belong in one file and are imported everywhere else.
  Never define the same string, number, or config value twice.
- Type definitions belong in one place. Never redefine a type that already exists.
- DB column select strings belong in select-columns.ts. Use them.

### Functions
- Every function does one thing. If you need "and" to describe it, split it.
- If a function is called from more than one place, it lives in a shared file.
- If a function is only called from one place, it lives in that file.
- No function longer than 40 lines. If it is longer, decompose it.

### Naming
- Function names are verbs: fetchClient, buildPrompt, validatePost.
- Boolean variables and functions are questions: isLoading, hasError, canPublish.
- No abbreviations except: id, url, db, api, ctx, err, res, req.
- Names describe what the thing IS, not what it does for the caller.

### Imports
- No unused imports. Remove them.
- No circular imports. If you need to create one to make something work,
  the abstraction is wrong — stop and ask.

### Error handling
- Every async function that touches the DB or an external API has a try/catch
  or propagates the error explicitly. No silent failures.
- Errors are logged once at the boundary where they are caught.
  Do not log and rethrow — pick one.

### Comments
- No comments that describe WHAT the code does. The code describes that.
- Comments only explain WHY — non-obvious decisions, workarounds, constraints.
- Every exported function has a one-line JSDoc describing its purpose.

### TypeScript
- No `any`. If you do not know the type, use `unknown` and narrow it.
- No type assertions (`as SomeType`) unless you can explain why in a comment.
- Prefer type inference over explicit annotation where the type is obvious.

### Before making any change:
1. Search for existing implementations of what you are about to write.
   If one exists, use it. Do not create a duplicate.
2. If a change requires the same logic in more than one place, extract it
   to a shared utility first, then use it in both places.
3. After each fix, check the file you just modified for any remaining
   duplication or dead code introduced by the change and remove it.

### After completing each fix:
- Run: npx tsc --noEmit
- Run: grep -r "console.log" src/ --include="*.ts" --include="*.tsx"
  and remove any console.log you added or uncovered.
- State which files were modified and why each modification was necessary.
- If you had to make a decision (e.g. where to put a shared function),
  state what the decision was and why.

### Do not:
- Rename things that are not broken
- Refactor files not mentioned in the current step
- Add abstractions "for future flexibility" — only abstract what is
  needed right now
- Leave TODO comments — either fix it or do not touch it

### Before writing any new function or utility, run:
grep -r "functionNameOrConcept" src/
to check if it already exists somewhere in the codebase.
If it does, import and use it. Only create something new if nothing
suitable exists.