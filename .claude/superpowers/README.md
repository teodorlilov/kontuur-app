# Superpowers (local port)

The 14 skills in `.claude/skills/` prefixed below are a vendored copy of
[obra/superpowers](https://github.com/obra/superpowers) v6.3.0 (MIT, Jesse Vincent),
ported from the plugin layout to plain project skills.

`LICENSE` in this directory is the upstream MIT license, retained as required.

## What was ported

| Skill | Purpose |
| --- | --- |
| `using-superpowers` | Entry point: how and when to reach for the other skills |
| `brainstorming` | Explore intent and design before any implementation |
| `writing-plans` | Turn a spec into a task-by-task implementation plan |
| `executing-plans` | Work a written plan with review checkpoints |
| `subagent-driven-development` | Execute plan tasks via subagents in-session |
| `dispatching-parallel-agents` | Fan out 2+ independent tasks |
| `test-driven-development` | RED-GREEN-REFACTOR, watch the test fail first |
| `systematic-debugging` | Root-cause a bug before proposing fixes |
| `verification-before-completion` | Evidence before claiming done |
| `requesting-code-review` | Get work reviewed before merge |
| `receiving-code-review` | Handle feedback with rigor, not agreement |
| `using-git-worktrees` | Isolated workspace for feature work |
| `finishing-a-development-branch` | Decide how to integrate completed work |
| `writing-skills` | Author and test new skills |

## Changes from upstream

1. **Namespace rewrite.** Plugin skills are invoked as `superpowers:name`; project
   skills are just `name`. All 26 cross-references were rewritten accordingly.
2. **SessionStart hook re-rooted.** `session-start` in this directory is the upstream
   `hooks/session-start` with `CLAUDE_PLUGIN_ROOT` replaced by a path relative to the
   script, and the multi-runtime output branch (Cursor / Copilot CLI) reduced to
   Claude Code's `hookSpecificOutput.additionalContext` shape.
3. **Nothing else changed.** Skill bodies, supporting files, and prompt templates are
   verbatim upstream.

## The hook is not wired up yet

`session-start` is executable and produces valid hook JSON, but registering it
requires a `SessionStart` entry in `.claude/settings.local.json`. Add this inside the
existing `"hooks"` object, next to `PostToolUse` and `Stop`:

```json
"SessionStart": [
  {
    "matcher": "startup|clear|compact",
    "hooks": [
      {
        "type": "command",
        "command": "[ ! -x \"${CLAUDE_PROJECT_DIR}/.claude/superpowers/session-start\" ] || \"${CLAUDE_PROJECT_DIR}/.claude/superpowers/session-start\"",
        "timeout": 10,
        "statusMessage": "Loading superpowers"
      }
    ]
  }
],
```

Without it the skills still work — they're listed and invocable, and Claude can load
them on its own when relevant. The hook is what injects the full `using-superpowers`
skill at every session start, which is what makes the methodology engage
aggressively rather than opportunistically.

## Turning skills on and off

Per-skill, via the `/skills` menu: highlight a skill, `Space` cycles
`on` / `name-only` / `user-only` / `off`, `Enter` writes `skillOverrides` to
`.claude/settings.local.json`. Or set `disable-model-invocation: true` in a skill's
frontmatter to keep it available as `/name` while preventing automatic use.

## Updating

There is no auto-update on a vendored copy. To refresh:

```bash
git clone --depth 1 https://github.com/obra/superpowers.git /tmp/superpowers
cp -R /tmp/superpowers/skills/* .claude/skills/
grep -rl 'superpowers:[a-z-]' .claude/skills | tr '\n' '\0' \
  | xargs -0 perl -pi -e 's/\bsuperpowers:([a-z][a-z-]*)/$1/g'
```
