# AGENTS.md — Vantage Platform

Applies to every coding agent working in this repo (Claude Code, Codex CLI, Cursor).

## Read first

**Always read PROJECT_CONTEXT.md first before taking any action, and update the task checklist as items are completed.**

Then use `CLAUDE.md` as the reference manual — it is the single source of truth for product context, architecture, commands, coding standards, and UI conventions. Do not duplicate its content here; update `CLAUDE.md` instead. (`.cursorrules` follows the same convention.)

`PROJECT_CONTEXT.md` owns the stack summary, the Slop-Free Zones, and the task checklist. `CLAUDE.md` owns everything about how the code works.

## Non-negotiables

- **Slop-Free Zones** (`PROJECT_CONTEXT.md` section 2): no casual or drive-by changes. Name the zone you are touching and get explicit human sign-off.
- **Every database query is scoped by organization.** RLS is deny-all by design — it will not catch your mistake. See the org-scoping invariant in `CLAUDE.md`.
- **Never edit an existing file in `supabase/migrations/`.** Add a new timestamped migration, and verify the live schema before assuming it matches the repo.
- Keep the checklist honest: tick what you finished, add what you discovered, tick nothing you have not verified.
- When architecture, a command, or a key file changes, update `CLAUDE.md` in the same change set. When work state changes, update `PROJECT_CONTEXT.md`.

## Verify before claiming done

From the repo root (all scripts proxy to `frontend/`): `npm run lint && npm test && npm run build`.
UI changes: verify in a real browser, in both light and dark mode.

## Notes for non-Claude agents

- This file is written by hand, not generated from `CLAUDE.md`. Do not mirror `CLAUDE.md` into it with a find-and-replace — a previous automated copy renamed the Anthropic-powered chat agent to "Codex Haiku 4.5" and invented a "Codex.ai" URL.
- Global cross-tool working agreements live in `~/.claude/AGENTS.md`. Claude Code loads them automatically; other harnesses may not — read that file if yours can.
- Codex CLI: the local `.codex/hooks.json` (git-ignored) runs a UI check after every file edit. Don't disable it.
