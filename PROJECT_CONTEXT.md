# PROJECT_CONTEXT.md

Entry point for every coding agent in this repo. Read this before acting, then use `CLAUDE.md` as the reference manual (architecture, conventions, commands, key files, env vars).

Update the checklist in section 3 as you complete items, in the same change set as the work — a stale checklist is worse than none. Keep this file under ~200 lines: risk posture and work state only, no architecture tutorials. When this file and `CLAUDE.md` disagree about **work state**, this file wins; about **how the code works**, `CLAUDE.md` wins and this file should be corrected to point there.

## 1. Stack

- **Framework**: Next.js App Router with `frontend/proxy.ts` as middleware (Next 16 naming), React, strict TypeScript. Single app in `frontend/`; the root `package.json` proxies all scripts.
- **UI**: Tailwind CSS-first — no `tailwind.config`, tokens live in `frontend/app/globals.css`. shadcn/ui (new-york) + Radix + Lucide.
- **Data**: Supabase Postgres + pgvector, Supabase Auth (cookie for web, Bearer token for mobile).
- **AI**: Vercel AI SDK — Anthropic for the chat agent, OpenAI for donor insights and embeddings.
- **Services**: Stripe (billing), Resend (email), Mapbox (geo), QuickBooks and Gmail (OAuth).
- **Test / CI / deploy**: Vitest (node environment only — no jsdom, so component tests are not runnable as configured), ESLint, GitHub Actions gating lint + test + build, deployed on Vercel.
- **Adjacent**: a sibling Expo app at `../Mobile` shares this backend. See `Mobile/docs/API_PARITY.md` before changing any API response shape.

Versions are deliberately not pinned here. Authoritative sources: `frontend/package.json` for versions, `CLAUDE.md` for architecture and conventions.

## 2. Slop-Free Zones

Code where a plausible-looking change causes silent data loss, cross-tenant leakage, unrecoverable state, or a broken legal promise. In these zones:

1. State which zone you are entering before you edit.
2. Get explicit human sign-off. No "while I'm here" cleanups, no drive-by refactors.
3. Read the whole unit, not the line you came for. Several of these are pairs that must change together.
4. **Nothing here is redundant because it looks redundant.** The defense-in-depth is intentional.

### Tier 1 — sign-off required; failures are silent or irreversible

#### Multi-tenant org scoping

- **Where**: `frontend/lib/auth.ts` (`requireUserOrg`, `getCurrentUserOrg`, `pickBestMembership`), `frontend/lib/supabase/` (`admin.ts` is the service-role client and bypasses RLS), `frontend/proxy.ts`.
- **Why it bites**: RLS is deliberately deny-all with enforcement in application code — see the RLS-lockdown migration in `supabase/migrations/`. A dropped scope filter has **no second line of defense**; the query just succeeds across tenants and nothing errors.
- **Rules**: Scope every query by org. `frontend/lib/supabase/scoped.ts` is column-inconsistent — the donors builder filters on `org_id`, the others on `organization_id`; check which you are using rather than "fixing" the mismatch. `pickBestMembership` is duplicated as `pickGatingOrgId` in `proxy.ts`; change both or neither, or data access and plan gating will disagree.

#### Database migrations

- **Where**: `supabase/migrations/` (`YYYYMMDDHHMMSS_snake_case.sql`).
- **Why it bites**: **This folder is not a complete schema.** The core tenant and donor tables predate it and are created by no migration here — you cannot rebuild the database from this directory. Migrations are applied by hand or via the Supabase MCP straight at production; CI never applies them. Idempotency is uneven, and one already-applied file was later edited in place.
- **Rules**: Never edit an existing migration — always add a new timestamped file. Verify the live schema with `mcp__supabase__list_tables` before assuming any table or column exists. Treat "applied" as a production fact, not a repo fact.

#### Generated database types

- **Where**: `frontend/types/database.ts`.
- **Why it bites**: The file ends with a hand-written tail block of narrow union types. A naive full regeneration silently deletes it, and because the underlying columns are `text` rather than Postgres enums, **no type error surfaces** — the narrowing just evaporates.
- **Rules**: Regenerate, then re-append the tail block. Procedure is in `CLAUDE.md` under Database.

#### Stripe billing webhook

- **Where**: `frontend/app/api/stripe/webhook/route.ts`, `frontend/lib/stripe.ts`, `frontend/lib/subscription.ts`.
- **Why it bites**: Four guards, none optional. Signature verification runs on the **raw** body — parsing JSON first breaks it and lets anyone forge a subscription upgrade. Idempotency is an insert-first claim against `stripe_webhook_events`, with an intentional escape hatch when the table is missing. An out-of-order guard stops a delayed `updated` event resurrecting a canceled subscription. The plan-id allowlist blocks forged metadata. `lib/stripe.ts` pins the Stripe `apiVersion` because period dates are read off subscription items.
- **Rules**: Do not reorder, "simplify", or bypass any of the four. Pricing constants in `lib/subscription.ts` (the one area with real test coverage) and the public pricing page must move in the same release.

#### Encryption at rest

- **Where**: `frontend/lib/encryption.ts`, `frontend/lib/quickbooks/token-crypto.ts`.
- **Why it bites**: AES-256-GCM with a three-segment `iv:authTag:ciphertext` format. Rotating the key or changing the algorithm, delimiter, or segment order makes **every stored QuickBooks and Gmail OAuth token permanently undecryptable**. There is no recovery without the original key.
- **Rules**: Treat the key and the ciphertext format as frozen. Note that `token-crypto.ts` writes plaintext with only a console warning when the key is unset, and its `looksEncrypted()` heuristic is coupled to that segment format — the two files must change together.

#### PII to LLM boundary

- **Where**: `frontend/lib/pii-redaction.ts` (insights path, untested), `frontend/lib/chat/` redactors (tested), and the donor insights route.
- **Why it bites**: The insights route applies whole-payload redaction **on top of** per-field redaction. That is not duplication — it catches donor columns added later that nobody remembered to redact. `app/privacy/page.tsx` and `app/terms/page.tsx` promise users that PII is redacted before it reaches AI providers, so this is a legal commitment, not a nicety.
- **Rules**: Never send un-redacted donor data to any model. Never delete the whole-payload layer as redundant. Re-hydrate only on the way back out.

#### Chat write-confirm gate

- **Where**: `frontend/lib/chat/tools.ts` (`create_donor`, `create_donation`, `log_interaction`, `create_task`), `frontend/lib/chat/confirm-gate.ts` (server-side approval check for `log_interaction`/`create_task`; `create_donor`/`create_donation` are still prompt-gated only), and `frontend/lib/chat/system-prompt.ts`.
- **Why it bites**: A two-phase human-approval gate stops the model writing donor and donation rows into a nonprofit's financial records unattended. It is enforced in two places and both must survive — the prompt alone is unenforceable, the tool alone loses the preview-then-approve behavior.
- **Rules**: Never default `confirm` to true, never hoist an insert above its gate. In `create_donor` the duplicate-name check returns *before* the gate; treat check and gate as a single unit when editing either.

#### Public API v1 pipeline

- **Where**: `frontend/lib/api-v1.ts`, `frontend/lib/api-auth.ts`, `frontend/lib/cron-auth.ts`, `frontend/lib/rate-limit.ts`.
- **Why it bites**: The `withApiV1` middleware order (key auth, then scope, then plan, then rate limit, then handler) is load-bearing. The donor field allowlist must never become `select *` or the public API leaks embeddings, internal notes, and scoring.
- **Rules**: Preserve the pipeline order and the allowlist. `cron-auth.ts` compares secrets with `timingSafeEqual` — do not "simplify" it to `===`. The rate-limit in-memory fallback is per-instance, not a global limit.

#### Security headers and CSP

- **Where**: `frontend/proxy.ts` (intended single source, full CSP), `frontend/next.config.mjs` (deliberately empty), `frontend/vercel.json` (edge headers).
- **Why it bites**: Two CSP sources get intersected by the browser, silently breaking the richer allowlist — which is why `next.config.mjs` stays empty. `vercel.json` nonetheless sets overlapping headers and **currently contradicts** `proxy.ts`; see the Tier 1 checklist item.
- **Rules**: Add CSP changes in `proxy.ts` only. Do not casually edit the CSRF-exempt or billing-exempt path lists in `proxy.ts` — removing the Stripe prefix locks a lapsed customer out of paying you.

### Tier 2 — silent-wrongness zones: no crash, no test, just wrong numbers

- `frontend/lib/donor-score.ts` — the factor weights must sum to 100 (the consumer assumes it), and the tuning constants are undocumented magic numbers. Deterministic and untested, so drift is invisible.
- `frontend/lib/donor-lifecycle.ts` — the thresholds are the product definition, not defaults. The status sort order puts Lapsed and Lost first **on purpose**, for re-engagement priority.
- Usage and email quotas — always the atomic `increment_usage` / `try_consume_email_quota` RPCs. A JS read-modify-write silently reopens the race and lets orgs exceed paid limits.
- Mobile-consumed API routes — anything marked `consumed` in `Mobile/docs/API_PARITY.md` has an out-of-repo consumer that breaks silently and cannot be hotfixed.

## 3. Task Checklist — Active Roadmap

Tick items as you complete them, in the same change set as the work. Add discovered work here rather than starting a new doc. Do not tick anything you have not verified.

### 3.1 Tier 1 — in-flight and blocked (roughly in this order)

- [ ] **Merge `main` into `audit/hardening-2026-07` before committing anything else.** This branch is not a descendant of `main` and lacks the QuickBooks FK retarget commit. Legacy `gift_*` readers still live here in the donations API route and in chat tools (two call sites there). Committing the rebrand from this branch reintroduces the July FK regression. Resolve the filename collision on the shared `20260705000000_*` migration timestamp as part of the merge.
- [ ] **Overdue** (was due ~Jul 19): drop the `gift_*` legacy tables, the donations payment-type column, and the July backup table; then regenerate `frontend/types/database.ts` and re-append the tail block. Blocked by the merge above.
- [ ] Fix the `proxy.ts` / `frontend/vercel.json` header conflict. `Permissions-Policy` has microphone and geolocation **exactly inverted** between the two, and the HSTS max-age disagrees. Voice entry and the donor map each depend on one of those. Make `proxy.ts` the source and have `vercel.json` agree or stop setting them.
- [ ] QuickBooks write-back sandbox end-to-end test (push, pull, no duplicate) before enabling the customer toggle. Keep write-back OFF during the Bloomerang history import — cron would push historical gifts into live books.
- [ ] Email the API v1 beta tester that the API is live, with `docs/api-v1.md`.
- [ ] Add archive banners to `frontend/PRODUCTION_READY.md` and `frontend/ENV_VERCEL.md` — both predate the current architecture and PRODUCTION_READY still tells you to run migrations from a `backend/` directory that no longer exists.

Open items from `docs/AUDIT-2026-07.md` (rationale stays in the audit doc):

- [ ] Unify the two PII redactors
- [ ] Refactor the oversized report-create route and trim its casts
- [ ] Drop the donation-options backup table once stable
- [ ] Verify and drop the unused-index advisories
- [ ] Adopt a shared `parseJson(schema)` helper on the remaining mutation routes
- [ ] Add a total-row cap to import
- [ ] Remove `dangerouslySetInnerHTML` from the year-end-receipts settings component

User-action items from `AUDIT_REPORT.md` (superseded in scope by the July audit; these remain):

- [ ] Rotate the leaked Website `.env.local` credentials
- [ ] Create live-mode Stripe prices for all tiers and deactivate the old website payment links
- [ ] Enable Supabase Leaked Password Protection
- [ ] Run the manual end-to-end payment test
- [x] Add Stripe, Resend, and Mapbox to the privacy-policy subprocessor list

Data-exit and legal-promise gaps from the Nov 2026 pitch fact check (plan: one PR and one prod deploy each, in this order):

- [x] Privacy page names sub-processors; Terms and Privacy contacts moved to `@vantagedonorai.com`; Terms §10 retention reworded to match the code (no auto-purge exists — data is kept while locked and deleted on request)
- [x] Merge the chat PII redaction widening from `security/its-review-prep`, plus fixes for four residual leak paths (replayed text, echoed tool arguments, error text, the new user message)
- [x] Export: billing-exempt `/api/export` + `/api/account/export` in `proxy.ts`; "Export your data" card in web Settings; exports now page past PostgREST's 1,000-row cap (they were silently truncated)
- [x] Org deletion: cancel Stripe first, check every delete step, remove members' logins that have no other org (otherwise `lib/auth.ts` auto-creates a fresh trial org) — `lib/org-teardown.ts`. Found while testing: since the June RLS lockdown, every `organization_members` delete failed (trigger `clear_donor_assignments_on_member_removal` referenced `donors` unqualified under `search_path = ''`), breaking web org deletion and mobile account deletion. Fixed by migration `20261105000000_fix_clear_donor_assignments_search_path.sql`, **applied to production 2026-11-05**. End-to-end delete of a throwaway org verified.
- [x] Remove a team member (web Settings → Team + `DELETE /api/team/members/[id]` for mobile) — `lib/team-members.ts`. Owners remove anyone but themselves (never the last owner); admins remove members only. Also revokes org API keys they created, deletes their Gmail token, push tokens and notification prefs for the org, and their login if they have no other org. Accepted race: two owners removing each other at the same instant can leave zero owners (needs a DB guard; not built). Mobile `docs/API_PARITY.md` row still says `pending`: flip it to `built` when the Mobile repo is next touched.
- [x] Enterprise copy: "10,000+ donors (custom limits)" instead of "Unlimited" (code caps every plan at `ABSOLUTE_DONOR_CEILING`; `effectiveDonorCap()` in `lib/subscription.ts`). The billing donor meter now shows the real cap. Website FAQ + pricing card: separate vantage-website PR. Raising one org above 10,000 still needs a code change (no per-org override).
- [ ] Port the server-side chat confirm gate from the uncommitted `audit/hardening-2026-07` working tree
- [ ] TOTP MFA per `docs/plans/2026-11-mfa-totp.md` (auth + mobile; separate session)

### 3.2 Roadmap (not built)

Verified absent from the codebase. Not current stack — do not describe these as existing.

- [ ] Smart ingestion: OCR check scanning and bank-statement parsing (nearest existing: CSV import, voice entry)
- [ ] AI thank-you letter generation (no thank-you template exists yet)
- [ ] Automated proactive task creation — **half-built**: recommendations exist, but nothing writes task or interaction rows. The missing half is creation plus a human-approval step; never auto-execute (see `CLAUDE.md`)
- [ ] Semantic search in the UI — backend is ready (donor embeddings and the match RPC), zero call sites
- [ ] Public API v1 write endpoints — already publicly announced as planned on the API docs page. Prerequisite: exempt `/api/v1` from Origin-CSRF
- [ ] Additional accounting integrations: Xero, FreshBooks, Sage
- [ ] Run the `impeccable` document pass to produce `DESIGN.md`

### 3.3 Accepted risks — do not "fix"

Reviewed during audit and intentionally kept. Re-raising these is noise; changing them breaks things.

- The `vector` extension living in the `public` schema
- The membership-lookup function being executable by anon/authenticated — required to back the RLS policies
- The narrow PII-redaction field set: city, state, and zip are intentionally passed through for geo features

### 3.4 Already built — do not re-add as roadmap

Older notes claim these are pending. They shipped.

- Donor health scoring
- The AI chat agent, at its full current tool set with the confirm gate — not the small early version
