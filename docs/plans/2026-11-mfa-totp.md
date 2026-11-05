# Plan: TOTP multi-factor authentication (Supabase Auth MFA)

**Status: proposed — not built. Needs owner approval (touches auth).**
Written 2026-11-03 for the Andrews University ITS review.

## Why

ITS will ask whether accounts can be protected with MFA. Today the only
factor is email + password (`frontend/components/login-form.tsx` calls
`signInWithPassword` and redirects). There is no SSO. TOTP (authenticator app)
MFA is built into Supabase Auth, so this is the cheapest credible answer:
no new vendor, no new cost, no new sub-processor.

## What the user sees

1. **Enroll** — Settings → Profile → new "Two-factor authentication" card.
   "Set up" shows a QR code plus the secret for manual entry. The user types a
   6-digit code to confirm, and the card shows "On" with a "Turn off" button
   that requires a fresh code.
2. **Sign in** — after a correct password, users with MFA on see a second step
   in the same login card: "Enter the 6-digit code from your authenticator
   app." Wrong codes show an inline error. There is no SMS.
3. **Org enforcement (phase 2)** — an owner can tick "Require two-factor for
   everyone" in Settings → Organization. Members without MFA are sent to the
   enrollment card on their next page load and can't use the app until they
   finish.

## Technical design

All calls are standard `supabase-js` (installed: 2.93.3, which has
`auth.mfa.enroll / challenge / verify / challengeAndVerify /
getAuthenticatorAssuranceLevel` and `auth.getClaims`).

| Piece | Change |
|---|---|
| `components/login-form.tsx` | After `signInWithPassword`, call `mfa.getAuthenticatorAssuranceLevel()`. If `nextLevel === "aal2"` and `currentLevel === "aal1"`, switch the card into a code step; `mfa.challengeAndVerify({ factorId, code })`, then continue to `link-pending-org` and `router.push(next)` as today. |
| New `components/settings/mfa-card.tsx` | Enroll (`mfa.enroll({ factorType: "totp" })` → QR → `challengeAndVerify`), list, and unenroll (`mfa.unenroll`, only from an aal2 session). Shadcn + Sonner toasts, light and dark mode. |
| New `lib/mfa.ts` (deep module) | `assuranceFor(user, jwtClaims)` → `"ok" \| "needs_challenge" \| "needs_enrollment"`. One pure decision function, unit-tested; every gate below calls it. |
| `proxy.ts` | For signed-in page requests: `needs_challenge` → redirect to `/login?step=mfa&next=…`, and `needs_enrollment` (phase 2) → `/settings?tab=profile&mfa=required`. Note: `/settings` is in `PUBLIC_PATHS` today, so the MFA gate must run *before* the public-path short-circuit for signed-in users, with only the enrollment card and sign-out exempt. |
| `lib/auth.ts` `getAuthenticatedUser()` | Cookie path: read the `aal` claim via `supabase.auth.getClaims()`. Bearer path (mobile): `admin.auth.getClaims(token)`. If `assuranceFor` says the session isn't good enough, return null, so every route returns 401 with `{ code: "mfa_required" }`. This is the real enforcement, because the app uses the service-role client and RLS can't do it. |
| `/api/v1` API keys | Unchanged. They are org-scoped machine credentials, not user sessions. Document this for ITS. |
| Feature flag | `MFA_ENABLED` / `NEXT_PUBLIC_MFA_ENABLED` via `lib/features.ts`. Ships dark; flipping it on shows the enroll card. |
| Phase 2 only — schema | `organizations.require_mfa boolean not null default false` (additive migration, then regenerate `types/database.ts`). **Schema change: separate approval.** |

## Mobile (must land before enforcement touches mobile users)

`Mobile/lib/auth-context.tsx` signs in with `signInWithPassword` too. A user
who turns on MFA will get an aal1 session on mobile, and the server gate will
reject its Bearer token. So:

- **Phase 1:** the server gate applies to Bearer tokens only for users who
  turned MFA on themselves. Ship the mobile code-entry screen in the same
  release train, before announcing the feature.
- **Phase 2 (org-required):** only after the mobile build with the challenge
  screen is live in both stores.

## Recovery

Supabase TOTP has no built-in backup codes.

- Let users enroll a second authenticator (Supabase allows up to 10 factors),
  and prompt for one at enrollment.
- **Lost device:** support runbook. The owner verifies identity, then a
  service-role script calls `auth.admin.mfa.deleteFactor` (logged to
  `audit_logs`). Phase 2 adds an owner-only "Reset member's 2FA" action in
  Settings → Team.

## Rollout (never breaks the paying customer)

1. Confirm in the Supabase dashboard (Auth → Multi-Factor) that TOTP is
   enabled. It is on by default.
2. Build phase 1 behind the flag. Unit-test `lib/mfa.ts`. Run a Playwright
   flow on a preview deploy with a throwaway test user (codes generated in
   the test with `otplib`).
3. Flag on in prod. Owner enrolls first and signs in on web and mobile.
4. Existing users see nothing unless they opt in. The paying customer is
   unaffected.
5. Phase 2 (org enforcement) as a separate PR, after mobile ships.

## Effort

Phase 1 is about 1.5–2 days (web 1 day, mobile screen 0.5 day, tests). Phase 2
is about 1 day plus the migration.

## Decisions for the owner

1. Approve phase 1 (opt-in TOTP, web + mobile)?
2. Approve the phase 2 schema column (`organizations.require_mfa`) now or later?
3. Lost-device recovery: is a support-run reset by email acceptable for the
   pilot, or do you want backup codes (custom table, about 1 extra day)?
