# Vantage Pre-Launch Audit Report

**Date:** 2026-06-12
**Scope:** Web app (`Platform/frontend`), mobile app (`Mobile`), marketing site (`Website/vantage_shadcn`)
**Goal:** Pre-launch readiness — security, PII safety, payment correctness, pricing coherence, web/mobile coherence, efficiency.

## Ship-readiness verdict

**Ship-ready after the two user action items below are completed** (rotate the Website credentials, create live-mode Stripe prices). Every P0 and P1 found in the code was fixed, verified with `tsc` + the test suite, and the database hardening was applied to production and re-verified clean by the Supabase advisor. The remaining open items are P2 defense-in-depth and P3 polish, listed at the end with exact recipes.

Work landed on the branch `audit/pre-launch` in all three repos (not yet pushed/merged — review the diffs, then merge).

| Surface | Result |
|---|---|
| Secrets / repo hygiene | Clean — no secrets in any git history; one on-disk credential file to rotate |
| Payments + pricing | Unified to one source of truth + one purchase path; all 6 prices verified in Stripe test mode |
| Org-scoping / IDOR / injection | 72 routes + 31 server actions audited; 2 P0 + 12 P1 fixed |
| Database (RLS) | All RLS-disabled ERRORs and search-path WARNs cleared; applied to prod |
| Mobile coherence | 5 broken endpoints built; design + core-feature parity confirmed |
| Website accuracy | Pricing + trust-bar claims aligned to reality |

---

## Decisions made (with you)

1. **Pricing source of truth = the website.** Canonical: **Starter $49 / Growth $99 / Pro $179** monthly; **$39 / $79 / $143** per month billed annually; **14-day** trial. The app code (was Growth $59 / Pro $99, 30-day trial, monthly-only) was brought into line.
2. **Single purchase path.** Website pricing CTAs now start the in-app free trial → in-app Stripe Checkout. The hardcoded Stripe Payment Links were removed.
3. **Fix P0/P1 as found; P2/P3 to this report.**
4. **Full live QA** where feasible without your live Stripe/Intuit credentials.

---

## P0 — fixed (cross-org write / cross-tenant data)

| # | Where | Issue | Fix |
|---|---|---|---|
| P0-1 | `app/actions/tags.ts` (`assignTag`, `removeTag`, `bulkAssignTag`) | `donor_tags` has no org column and the admin client bypasses RLS, so any caller with two UUIDs could tag/untag another org's donor. | Verify donor AND tag belong to the org before any `donor_tags` mutation. |
| P0-2 | `app/actions/pledges.ts` (`deletePledge`) | Unlinked donations (`pledge_id = null`) by `pledge_id` with no org filter, *before* checking pledge ownership — a foreign pledge id zeroed another org's pledge progress. | Verify pledge org-ownership first; scope the donation unlink by `org_id`. |

## P1 — fixed (cross-org read / privilege escalation / injection)

| # | Where | Issue | Fix |
|---|---|---|---|
| P1-1 | `app/actions/audit.ts` `logAuditEvent` | Exported from a `"use server"` file with no auth and caller-supplied `orgId`/`userId` — any client could forge audit entries into any org. | Moved to `lib/audit.ts` so it is no longer a callable endpoint. |
| P1-2 | `app/actions/dashboard-preferences.ts`, `app/actions/notifications.ts`, `app/actions/pledges.ts` (`updatePledge`) | Request body spread into upsert/update after the session keys, so a crafted payload could overwrite another tenant's row (`org_id`/`user_id`/`donor_id`). | Allowlist the known columns; never spread attacker input. |
| P1-3 | `app/actions/pipeline.ts` + `app/api/pipeline/opportunities/route.ts` (`createOpportunity`) | `donor_id` from the body was never verified org-owned; the pipeline join then leaked the foreign donor's name. | Verify donor org-ownership before insert. |
| P1-4 | `app/api/reports/[id]/route.ts` (DELETE, GET), `app/api/reports/generate/route.ts` (regenerate) | DELETE and regenerate had no creator check (PATCH already did); GET fetched by id without an org filter and didn't enforce private visibility. | Creator-only DELETE/regenerate; GET scoped by `org_id` + private-visibility enforcement. |
| P1-5 | `app/actions/team.ts` (`createInvitation`) | `role` inserted unvalidated — an admin could mint an `owner` invite and self-escalate. (DB also has a `role IN ('admin','member')` CHECK, which limited blast radius.) | Clamp role to `admin`/`member` at runtime. |
| P1-6 | `app/actions/team.ts` (`sendInviteEmail`) | Took a caller-controlled recipient email + invite URL → a branded "Accept Invitation" relay to any address pointing at any URL. | Derive recipient, role, and link server-side from the org-scoped invitation token. |
| P1-7 | `app/api/email/bulk-send/route.ts` | Recipient email taken from the body, unvalidated → CRLF injection into the raw `To:` header (BCC fan-out, rate-limit bypass). | Send to the verified donor's DB email; reject non-email values. |
| P1-8 | `lib/api-v1.ts` (`decodeCursor`) | Attacker-controlled `?cursor=` base64 was spliced into a PostgREST `.or()` filter unvalidated (same class as the prior `8d1cd0c` fix). | Validate timestamp + UUID before use (`lib/api-cursor.ts`, with regression test). Also: enforce trial expiry on the API plan gate. |
| P1-9 | `app/api/auth/link-pending-org/route.ts` | A forged `qb_pending_org_id` cookie let any authenticated user join an established org as member. | Only link to an *unclaimed* org (zero members); first claimer becomes owner. |
| P1-10 | `app/api/auth/link-stripe-checkout/route.ts` | First caller to present a valid `checkout_session_id` (it appears in the Payment-Link success URL) could attach someone else's paid subscription to their org. | Require the buyer's Stripe email to match the authenticated user; plus the one-time claim guard added earlier. |

## Database hardening — applied to production & verified

Migrations `20260612000001_rls_lockdown` and `20260612000002_push_tokens`, plus `revoke_public_execute_definer_functions`:

- **Enabled RLS** on 6 PostgREST-exposed tables that had it off — most importantly `api_keys` (anon could read key hashes / insert keys). The app uses the service-role client (bypasses RLS), so nothing breaks; anon/authenticated are now deny-by-default.
- **Dropped** the always-true `saved_reports` policy (any signed-in user could read/write every org's reports via PostgREST).
- **Revoked PUBLIC execute** on `match_donors` (callable cross-org with the anon key → donor-embedding leak) and the `clear_donor_assignments` trigger fn. `service_role` keeps its explicit grant.
- **Pinned `search_path`** on 8 flagged functions; **dropped** the `org-logos` bucket listing policy.

Re-ran `get_advisors`: **all `rls_disabled_in_public` ERRORs and all `function_search_path_mutable` WARNs cleared.** Remaining advisor items are INFO (RLS-enabled-no-policy = intended deny-all) or accepted (see P2).

## Payments & pricing — unified and verified

- `lib/subscription.ts`: prices/trial aligned to canonical; annual billing added (`getStripePriceId(plan, interval)` reads `STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>`); billing settings gained a monthly/annual toggle.
- `components/signup-form.tsx`: trial copy uses `TRIAL_DURATION_DAYS`, preselects tier from the website's `?plan=` handoff.
- Website `pricing-cards.tsx` + `pricing/page.tsx`: all `buy.stripe.com` Payment Links replaced with app-signup links.
- Donation-option ids (category/campaign/fund) are now validated against the org's options on every create/bulk path; `gift_*` name lookups are org-scoped.
- **Live Stripe test-mode check:** created a checkout session for each canonical price — **Starter $49/$468, Growth $99/$948, Pro $179/$1716** — all correct. The `.env.local` test price IDs were repointed to freshly-created prices with the right amounts (the previous IDs were from a different Stripe account and 404'd).
- Regression test `lib/subscription.test.ts` pins the canonical numbers so they can't silently drift again.

## Live runtime verification (dev server)

- **Security headers present** (`proxy.ts`): HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and a full CSP — confirmed via `curl`. *(Correction: the recon's "no security headers" finding was wrong — `proxy.ts` is Next.js 16's renamed middleware and already does this, plus CSRF Origin validation and plan gating. A duplicate CSP I briefly added to `next.config.mjs` was reverted.)*
- **Auth gating:** `/api/billing`, `/api/stripe/status` → 401; `/api/push-token`, `/api/account` mutations without a valid Origin → 403 (CSRF).
- **Webhook** rejects a missing signature → 400. **Public API v1** rejects missing/bad key → 401.

## Mobile coherence

- **5 broken endpoints built** on the Platform (`/api/billing`, `/api/billing/portal`, `/api/push-token`, `/api/account` DELETE, `/api/account/export`) with shapes matched to the existing mobile callers. The mobile billing screen, push registration, account deletion, and data export were previously calling routes that 404'd in production. `Mobile/docs/API_PARITY.md` updated.
- **Design:** Geist font shared; spacing/radius tokens matched; the brighter mobile gradient (`#147F6F→#21FFFF` vs web `#007A3F→#21E0D6`) is **documented as an intentional platform adaptation** in `constants/theme.ts` — keep it.
- **Feature parity:** core flows present (donors, donations, dashboard, interactions, tasks, reports, routes/map, AI chat). Intentionally web-only: pipeline, pledges, bulk email, CSV import — acceptable per the "core features, not 100%" goal.
- **Mobile security** (from recon, confirmed): tokens in SecureStore; Sentry + PostHog PII scrubbers; HTTPS-only on Android; account deletion now satisfies App Store Guideline 5.1.1(v).

---

## Open items — recommended, not blocking launch

These are P2 (defense-in-depth) / P3 (polish). Each has a recipe.

### P2-A — Encrypt QuickBooks OAuth tokens at rest
`qb_access_token` / `qb_refresh_token` are stored plaintext, while Gmail tokens use AES-256-GCM (`lib/encryption.ts`). Behind the service-role boundary, so not API-exposed — a DB/service-key leak would expose them. **Not auto-fixed** because it touches 7 files in the live QB sync path (`quickbooks/callback`, `lib/quickbooks/request.ts`, `lib/quickbooks/writeback.ts`, `lib/sync/run-sync.ts`, `app/actions/donations.ts`, `app/actions/import.ts`, `quickbooks/status`) and I can't exercise the full Intuit OAuth + refresh loop end-to-end without your sandbox. **Recipe:** add `encryptToken`/`decryptToken` wrappers where `decryptToken` tries `decrypt()` and falls back to treating the value as plaintext (so existing rows keep working); `encrypt()` on every write; each org re-encrypts on its next token refresh. Test against your QB sandbox before shipping.

### P2-B — Stripe webhook idempotency + ordering
`app/api/stripe/webhook/route.ts` has no processed-`event.id` dedup and no event-timestamp ordering, so a delayed `customer.subscription.updated` arriving after `deleted` could resurrect a canceled sub. **Recipe:** persist processed `event.id`s in a small table; ignore events older than the row's `updated_at`; re-validate `plan_id` against the allowlist before writing.

### P2-C — Global rate limiting
`lib/rate-limit.ts` is in-memory per serverless instance, so the public API's 60/min and the transcribe/email caps are per-instance, not global. Acceptable at launch scale; move to Upstash/Redis if the public API gets real traffic. Add a duration cap to `/api/transcribe` (cost abuse).

### P2-D — QuickBooks realm takeover
`quickbooks/callback` lets a user who completes Intuit OAuth for a realm already linked to another org silently move the realm and null the other org's tokens. Require owner confirmation + audit-log before reassigning a realm already bound elsewhere.

### P2-E — Misc error-detail leakage
A handful of routes return raw Postgres/`error.message` text to the client (`tasks/*`, `voice-commit`, `voice-parse`, several `reports/*`). Map to generic messages + `console.error` server-side (the donations route already does this).

### P3 — Polish
- **Privacy-policy subprocessor list:** names OpenAI, Anthropic, QuickBooks, Supabase, Vercel — add **Stripe, Resend, Mapbox** for GDPR completeness (legal copy; review with counsel).
- **Public API resource naming:** the API says `contacts` while the whole product says `donors`. Cheapest moment to rename `/api/v1/contacts` → `/api/v1/donors` is now (no external consumers yet). Your call — it's a naming decision, not a bug.
- **Public API future writes:** v1 is read-only today, so `proxy.ts`'s mutation-only CSRF doesn't block it. If you add write endpoints, exempt `/api/v1` from Origin-CSRF (the API key is the CSRF defense).
- **`reports/schema` debug endpoint** discloses column names — gate behind a dev flag or remove.

---

## User action items (I can't do these)

1. **Rotate the Website credentials** in `Website/vantage_shadcn/.env.local` — it holds a live Neon Postgres URL + Resend key on disk. (They are **not** in git history — verified across all 94/11/11 commits.) The website doesn't use them at runtime (`@vercel/postgres`/`resend` are unused imports), so you can also just delete the file.
2. **Create live-mode Stripe prices** for all six tiers at the canonical amounts and set `STRIPE_PRICE_*_MONTHLY` / `STRIPE_PRICE_*_ANNUAL` in production. (I created the **test-mode** prices and verified the amounts; live mode needs your live key.)
3. **Deactivate the old website Payment Links** in the Stripe dashboard so old bookmarks/shared links can't still buy through them.
4. **Enable Leaked Password Protection** in Supabase Auth (advisor WARN — one toggle).

## Manual E2E payment test (run with `stripe listen` + your test keys)

1. Signup → 14-day trial starts → in-app checkout each tier × {monthly, annual} with `4242…` → webhook → `subscriptions` row correct → caps unlock.
2. Decline `4000 0000 0000 0002`; 3DS `4000 0027 6000 3184`; abandon checkout — no partial state.
3. Portal: upgrade / downgrade / cancel → state correct; behavior when downgrading below current donor count.
4. Resend the same webhook event (idempotency — see P2-B) and an out-of-order update-after-delete.

---

## Coverage

- **Security sweep:** 72 API route files + 31 `"use server"` files, across 8 parallel audit packets, each with a per-endpoint checklist (auth · org-scope · IDOR · injection · mass-assignment · role · leakage). Findings: 2 P0, 12 P1, ~18 P2 — all P0/P1 fixed, P2 triaged above.
- **Builds:** `npm run build` green on Platform and Website; `tsc` clean; 42 Vitest tests pass (added: pricing canonical guard, cursor-injection guard).
- **Commits:** 9 on Platform, 2 on Website, 1 on Mobile — all on `audit/pre-launch`.
