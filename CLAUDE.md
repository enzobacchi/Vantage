# CLAUDE.md

Context file for Claude Code (claude.ai/code) and Cursor when working in this repository. This is the **single source of truth for how the code works** — `.cursorrules` and `AGENTS.md` just point here. Update this file in the same change set as any architecture shift.

## Start Here

**Always read PROJECT_CONTEXT.md first before taking any action, and update the task checklist as items are completed.**

`PROJECT_CONTEXT.md` (repo root) owns three things this file deliberately does not: the stack summary, the **Slop-Free Zones** (code where a casual change causes silent data loss, cross-tenant leakage, or unrecoverable state), and the active task checklist. This file is the reference manual — architecture, conventions, commands, key files, env vars. When the two disagree about **work state**, `PROJECT_CONTEXT.md` wins. When they disagree about **how the code works**, this file wins and `PROJECT_CONTEXT.md` should be corrected to point here rather than restating it.

## Product

**Vantage** is an AI-powered donor CRM for small-to-midsize nonprofits and ministries. It replaces manual data entry with intelligent automation and integrates directly with accounting software (QuickBooks today; other accounting integrations are roadmap — see `PROJECT_CONTEXT.md`).

**Target user**: Faith-based organizations and small nonprofits with 1–5 staff managing donors, receipts, and bookkeeping — typically under 5,000 donors.

## Commands

All root-level scripts proxy to `/frontend`:

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build (also runs TypeScript type-check)
npm run lint     # ESLint check
npm test         # Vitest — unit tests colocated in lib/ as *.test.ts (node env only; no jsdom, so component tests aren't runnable as configured)
```

Run a single test from `frontend/` (don't forward paths through the root proxy script): `npx vitest run lib/subscription.test.ts`, or `npx vitest` for watch mode. Standalone typecheck (no dedicated script): `npx tsc --noEmit` from `frontend/`.

CI (`.github/workflows/ci.yml`) gates every PR and pushes to `main` on lint + tests + build. The CI build uses placeholder env vars (fake Supabase anon key), so build-time code must tolerate missing real env. Match lint+test+build locally before pushing.

Dev scripts (run via `npx tsx` from `frontend/`): `scripts/seed-qb-sandbox.ts` seeds a QuickBooks sandbox with nonprofit data; `scripts/test-ai-report-queries.ts` is an AI report-builder eval against the live chat model (needs `ANTHROPIC_API_KEY`).

## Architecture

**Single Next.js 16 application** in `/frontend` (App Router, React 19). There is no separate backend service.

- **Server Actions** (`frontend/app/actions/`) — all mutations. ~28 action files (list the directory for the current set) covering auth, audit, crm, dashboard, donations, donors, email-rate-limit, feedback, folders, import, legal, lists, notifications, onboarding(+progress), pipeline, pledges, receipt-templates, reports, search, settings, tags, team, plus api-keys, custom-fields, dashboard-preferences, report-shares, year-end-receipts.
- **API Routes** (`frontend/app/api/`) — reads, streaming, OAuth, webhooks. Major route groups: chat, dashboard (metrics + smart-actions), donors (list, detail, insights, score, search, map, states, geocode), donations (list, options, recent, trend), email (send + bulk-send), interactions, tags, reports, pipeline, organization, quickbooks (auth, callback, status), stripe (checkout, confirm, portal, status, webhook), cron (sync, digest, trial-reminders — schedules declared in `frontend/vercel.json`), sync, export, tasks, feedback, account, auth, billing, gmail, notifications, push-token, receipts, routes, team, transcribe.
- **Public/mobile API** (`frontend/app/api/v1/`) — the versioned external API namespace (Bearer/API-key auth). See `docs/api-v1.md`, `frontend/lib/api-v1.ts`, `frontend/lib/api-auth.ts`. API keys are SHA-256 hashed in the `api_keys` table, scope- and plan-gated, rate-limited.
- **No client state management** — server-driven via Server Components and Actions. Client state uses `useState` only.

### Multi-Tenant Org Scoping

**Every data query must be scoped by `org_id`.** This is the most critical architectural invariant.

- `frontend/lib/auth.ts` exports `getCurrentUserOrg()`, `getCurrentUserOrgWithRole()`, and `requireUserOrg()` (throws instead of returning null — preferred for new code).
- Call one of these at the top of **every** server action and API route before touching the database.
- The admin Supabase client **bypasses RLS** — org scoping must be enforced in application code.
- Auth supports both cookie-based (web) and Bearer token (mobile) authentication.
- Use scoped query builders in `frontend/lib/supabase/scoped.ts` which pre-filter by `org_id`.

### Mobile parity

A sibling Expo app lives at `/Users/enzobacchiocchi/Developer/Vantage/Mobile` (it has its own `CLAUDE.md`) and shares this Supabase backend. When you modify an API route under `frontend/app/api/`, check `Mobile/docs/API_PARITY.md` — if the route is marked `consumed`, the mobile client reads that shape and may break. Update the mobile call site (typically in `Mobile/lib/` or `Mobile/app/**`) in the same change set when the contract shifts.

### Key Domain Concepts

- **Donor Lifecycle**: Computed status — `New` (≤6mo), `Active`, `Lapsed` (>12mo), `Lost` (>24mo). Calculated by `frontend/lib/donor-lifecycle.ts`, not a free-form field.
- **Donor Health Score**: Deterministic 0–100 score computed by `frontend/lib/donor-score.ts` (no LLM). Five weighted factors: recency (30%), frequency (25%), monetary trend (20%), engagement (15%), consistency (10%). Labels: Excellent/Good/Fair/At Risk/Cold. Includes trend analysis (rising/stable/declining/new/inactive) and suggested ask amounts.
- **Pledges**: Recurring or one-time giving commitments. Frequencies: `one_time`, `monthly`, `quarterly`, `annual`. Statuses: `active`, `fulfilled`, `cancelled`, `overdue`. Linked to donations via `pledge_id` FK. Progress tracked by `frontend/lib/pledge-helpers.ts`.
- **Interactions**: Touchpoints (email, call, meeting, note, task) in the `interactions` table with direction (inbound/outbound) and status (pending/completed). Full CRUD via `/api/interactions`.
- **Reports**: Dynamic — store filter criteria as JSON in `saved_reports`, not result snapshots. The criteria schema and query execution live in `frontend/lib/reports/` (`filter-schema.ts`, `run-filter-query.ts`).
- **Opportunities**: Fundraising pipeline with stages: identified → qualified → solicited → committed → closed_won/lost.
- **Donation Options**: Org-scoped categories, campaigns, and funds in `org_donation_options`.
- **Tags**: Org-scoped tags assignable to donors, with bulk tag operations.
- **Smart Actions**: AI-generated dashboard recommendations (thank_donor, at_risk, re_engage, pipeline, task_overdue, follow_up, milestone) with priority levels. Served by `/api/dashboard/smart-actions`.

### AI / Intelligence Layer

- **Donor AI Briefing**: `GET /api/donors/[id]/insights` returns a pre-visit briefing `{ summary, givingHistory, lastConversation, talkingPoints[] }` via OpenAI. Prompt + parsing live in `frontend/lib/donor-briefing.ts` (`lastConversation` is forced to `null` when the donor has no interactions). PII is redacted before LLM calls (`frontend/lib/pii-redaction.ts`) and unredacted in the response. UI: `components/donors/donor-briefing-card.tsx`, shown at the top of the donor profile, in the CRM side sheet, in the chat donor popup, and from the map popup's "AI Briefing" button (opens a sheet over the map, `autoGenerate`).
- **Chat Agent — "Scout, the Vantage Agent"**: Claude Haiku 4.5 via Vercel AI SDK + `@ai-sdk/anthropic`. Opens as a centred floating window (`ChatOverlay` in `components/chat/chat-overlay.tsx`, Radix Dialog) from the bottom chat bar or Cmd+J; full-page mode at `/chat`. Persisted to `chat_history`. Tools live in `frontend/lib/chat/tools.ts` (read it for the current set) — read tools plus the write tools `create_donor`, `create_donation`, `log_interaction`, `create_task`, and `create_custom_report`. PII redaction in `frontend/lib/chat/pii-redactor.ts` (+ `pii-helpers.ts`): `ChatPIIRedactor.wrapTools()` redacts only the model's copy of each tool result (`toModelOutput`) — names, street address/zip, custom fields, campaign/fund/category names — and unredacts placeholders in tool inputs; the client still gets raw outputs for cards. The chat route must pass the same wrapped tools to `convertToModelMessages` so replayed history is redacted. Before redacting any text, the route calls `registerReplayedToolOutputs` so values seen only in replayed tool outputs are known; `toModelOutput` also re-hides values restored into that call's arguments, and replayed tool `errorText` is redacted in `redactReplayedText`. Every write tool except `create_custom_report` uses a **two-phase confirm gate**: first call returns `{ requires_confirmation: true, preview }`; the write only happens on a second call with `confirm: true`, and only for the exact change previewed in the user's previous chat request, once. The server enforces it (`lib/chat/confirm-gate.ts`): each preview stores a hash in `chat_pending_writes`, made approvable by `gate.finalize()` when that request finishes; the chat route's `openConfirmGate` takes that user's finished rows at the start of each request and passes the gate to `buildTools`, whose write tools `consume` it before inserting. Stored server-side because mobile and reloaded web chat replay history as text only. The prompt (`lib/chat/system-prompt.ts`) drives the preview-then-ask flow. The chat client sends the browser `timeZone`, so the system prompt's "today"/weekday list is the user's local date. Previews render as one `ChatActionCard` (`components/chat/chat-action-card.tsx`) with Confirm/Cancel that send a reply. Tasks are `interactions` rows with `type: "task"`, `status: "pending"`; tool-written dates are stored at noon UTC. The mobile app consumes the same stream — its tool handling (`Mobile/lib/chat/stream.ts`) and `Mobile/components/chat/ToolPill.tsx` labels must stay in sync with `tools.ts`.
- **Smart Actions**: Dashboard recommendations generated via API, surfaced in `frontend/components/smart-actions.tsx`.
- **Weekly Digest**: AI-summarized weekly digest emails via `frontend/lib/digest-ai.ts` + `/api/cron/digest`.
- **Semantic Search**: pgvector embeddings stored on `donors` table via Supabase `match_donors` RPC. Not yet exposed in UI.
- Always redact PII before sending any donor data to LLMs. Never auto-execute AI suggestions — always require human approval.

### Database

Supabase (PostgreSQL + pgvector). Migrations in `/supabase/migrations/` — **this folder is not a complete schema and is applied by hand at production**; read `PROJECT_CONTEXT.md` → Slop-Free Zones before adding or applying one.

Key tables: `organizations`, `organization_members`, `donors`, `donations`, `donor_notes`, `interactions`, `opportunities`, `pledges`, `saved_reports`, `report_folders`, `report_shares`, `saved_lists`, `org_donation_options`, `receipt_templates`, `tags`, `donor_tags`, `chat_history`, `subscriptions`, `subscription_usage`, `audit_logs`, `notification_preferences`, `donor_merge_history`, `api_keys`, `custom_field_definitions`, `dashboard_preferences`, `email_send_log`, `gmail_credentials`, `push_tokens`, `stripe_webhook_events`, `chat_pending_writes`.

Atomic RPCs (July 2026 hardening): `increment_usage` (usage metering, called from `lib/subscription.ts`; migration `20260704000000_atomic_usage_increment`) and `try_consume_email_quota` (email send/bulk-send quota; migration `20260705000000_audit_hardening`). Use these — do not read-modify-write usage counters.

RLS is enabled but the admin client bypasses it — **always scope queries manually by `org_id`**.

Generated TypeScript types: `frontend/types/database.ts` — regenerate via the Supabase MCP tool `mcp__supabase__generate_typescript_types` (project: `Vantage`) after any schema change, then re-append the hand-written tail block of aliases and string-literal unions (`Interaction`, `Donation`, `OrgDonationOption`, `PaymentMethod`, `DonorType`, `ReceiptTemplateCategory`, `SubscriptionPlan`, `SubscriptionStatus`, `UsageMetric`, `Subscription`, `SubscriptionUsage`, `AuditLog`, `NotificationPreferences`, `DonorMergeHistory`) — the generator can't reproduce the narrow unions because the underlying DB columns are typed `text`, not Postgres enums.

### Authentication

Supabase Auth with dual auth paths: cookie-based (web) and Bearer token (mobile).

`getCurrentUserOrg()` looks up the user's `organization_members` row and returns `{ userId, orgId }`. If no membership exists, it auto-creates an org and links the user as owner. When a user belongs to multiple orgs, it prefers the shared org over a solo auto-created one.

Roles: `owner`, `admin`, `member` — checked via `getCurrentUserOrgWithRole()`.

Because a user with no membership gets a fresh org on next sign-in, anything that removes a membership for good (org deletion, removing a team member) must also delete that user's login when they belong to no other org — use `removeOrphanedLogins()` in `frontend/lib/org-teardown.ts`. Removing a member goes through `removeOrgMember()` in `frontend/lib/team-members.ts`, which already does this.

### Integrations

- **QuickBooks**: Full OAuth 2.0 flow + sync (customers → donors, sales receipts/invoices → donations). The sync engine is `frontend/lib/sync/run-sync.ts` (behind `/api/sync` and `/api/cron/sync`); OAuth client, request wrapper, write-back, and token crypto live in `frontend/lib/quickbooks/`; data-parsing helpers in `frontend/lib/quickbooks-helpers.ts`. Supports sandbox and production environments.
- **Stripe**: Subscription billing — checkout sessions, billing portal, webhook handling. Client in `frontend/lib/stripe.ts`. Stripe → `subscriptions` row mapping lives in `frontend/lib/stripe-subscription-sync.ts`, shared by the webhook and `POST /api/stripe/confirm` (Settings → Billing calls it on return from Checkout, so an upgrade never depends solely on webhook delivery). Usage tracking via `subscription_usage` table with limits on AI insights, email sends, and donor count.
- **Resend**: Transactional and bulk email. Single send at `POST /api/email/send`, bulk send at `POST /api/email/bulk-send` (rate-limited to 10/hour). Templates in `frontend/lib/email-templates.ts`: password reset, new donation, milestone, team activity, system alert, weekly digest.
- **Gmail**: OAuth send-as-user integration (`frontend/lib/gmail/`, routes under `/api/gmail/`). Tokens stored encrypted in `gmail_credentials`; config via `GOOGLE_OAUTH_*` env vars.
- **Mapbox**: Donor geospatial visualization. Geocoding + interactive map with status/giving filters.
- **OpenAI**: Donor insight generation, semantic search embeddings, weekly digest AI summaries.
- **Anthropic**: Claude Haiku 4.5 powers the chat agent via `@ai-sdk/anthropic`.
- **Voice transcription**: `/api/transcribe` (mobile-first), feature-flagged via `TRANSCRIBE_ENABLED` / `NEXT_PUBLIC_TRANSCRIBE_ENABLED`.
- **Push notifications**: `/api/push-token` + `push_tokens` table (mobile clients register Expo push tokens).

### Security & Hardening (July 2026 audit — see `docs/AUDIT-2026-07.md`)

- **Rate limiting**: `frontend/lib/rate-limit.ts` — Upstash Redis REST (`UPSTASH_REDIS_REST_URL/_TOKEN`) with in-memory fallback when unset.
- **Secrets at rest**: `frontend/lib/encryption.ts` — AES-256-GCM (key: `ENCRYPTION_KEY`) for QuickBooks and Gmail OAuth tokens.
- **Request parsing**: mutation routes parse bodies through `readJsonObject()` in `frontend/lib/http.ts` — use it for any new mutation route instead of raw `req.json()`.
- **Usage metering**: always via the atomic RPCs above, never direct counter updates.
- **Feature flags**: server+public env pairs (e.g. `EMAIL_ENABLED`/`NEXT_PUBLIC_EMAIL_ENABLED`) resolved in `frontend/lib/features.ts`.
- Cron routes authenticate with `CRON_SECRET`.
- **Integration health checks**: `frontend/lib/health-checks.ts` — validates the Stripe key, Resend key, and every org's QuickBooks connection (reconnect flag + stale-sync detection); runs daily piggybacked on `/api/cron/sync` (Hobby cron cap) and emails `FEEDBACK_EMAIL_TO` when something is broken.

### Onboarding

Multi-step onboarding wizard (`frontend/components/onboarding-wizard.tsx`) with welcome, import, QuickBooks, and email steps. Onboarding checklist (`frontend/components/onboarding-checklist.tsx`) tracks 4 milestones: donors added, QB connected, emails sent, templates configured. Completion stored on `organizations.onboarding_completed_at`.

## UI Conventions

- **Shadcn UI** exclusively — no other component libraries.
- **Lucide React** icons only, at **1.5px stroke width**.
- **Both light and dark mode** — always implement design changes for both modes. Use theme-aware tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) instead of hardcoded colors. Test that new UI looks correct in both themes.
- Light-mode specifics when hardcoded values are needed: `bg-white` / `bg-zinc-50/50` backgrounds, `text-zinc-950` headings, `text-zinc-500` metadata, `border-zinc-200` borders.
- **Accent color**: Green-to-cyan gradient (`from-[#007A3F] to-[#21E0D6]`) matching the Vantage logo icon (`public/vantage-icon.png`, wordmarks `public/vantage-wordmark-{dark,light}.png`). **Reserved for AI features and standout product features only** — do not use on standard CRUD buttons (e.g. Create Report, Save). Apply via `bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white hover:opacity-90 border-0`. For gradient borders, use a `p-[1px]` wrapper with the gradient background and `bg-card` inner div. Secondary AI tints use the `teal-*` palette.
- **Scout** (the Vantage Agent) has its own mascot mark, `ScoutAvatar` (`components/chat/scout-avatar.tsx`): a telescope on the gradient disc, used inside the chat window. Entry points (chat bar, header button) keep the Vantage logo.
- `shadow-sm` only. `hover:bg-accent` for interactive elements. Honor `prefers-reduced-motion` for any new animation.
- User feedback via **Sonner `toast`** — never `alert()`.
- A short-lived "Evergreen" rebrand (forest/spring palette, Summit logo) was abandoned in Oct 2026 — don't reintroduce `brand-*` tokens or the Summit mark. A backup of that work lives outside the repo in `Vantage/backups/evergreen-rebrand-2026-10-29/`.

## Coding Standards

- Strict TypeScript — never use `any`. DB types come from `frontend/types/database.ts`.
- PII redaction required before any LLM API call (`frontend/lib/pii-redaction.ts`, `frontend/lib/chat/pii-helpers.ts`).
- Donor lifecycle statuses are computed (New/Active/Lapsed/Lost) — never store them as free-form fields.
- Reports store filter criteria as JSON, not result snapshots.
- New mutation API routes: parse bodies with `readJsonObject()` (`frontend/lib/http.ts`) and scope by org before any query.
- Any sum/count over rows (donations, donors) must read every row via `fetchAllRows()` (`frontend/lib/supabase/fetch-all.ts`) — PostgREST silently caps a plain `.select()` at 1000 rows. Prefer a SQL aggregate/RPC when you only need the total.

## Key Files

| Path | Purpose |
|------|---------|
| `frontend/lib/auth.ts` | Org-scoping helpers (call before every DB query) |
| `frontend/lib/supabase/scoped.ts` | Pre-filtered query builders by org_id |
| `frontend/lib/supabase/admin.ts` | Admin Supabase client (bypasses RLS) |
| `frontend/lib/supabase/server.ts` | Server Supabase client (cookie + Bearer token) |
| `frontend/lib/pii-redaction.ts` | Redact/unredact PII for LLM calls |
| `frontend/lib/donor-lifecycle.ts` | Donor lifecycle status computation |
| `frontend/lib/donor-score.ts` | Donor health score (0–100, deterministic) |
| `frontend/lib/pledge-helpers.ts` | Pledge formatting and progress calculation |
| `frontend/lib/quickbooks-helpers.ts` | QB data parsing and API helpers |
| `frontend/lib/sync/run-sync.ts` | QuickBooks sync engine (largest lib module) |
| `frontend/lib/quickbooks/` | QB OAuth client, request wrapper, write-back, token crypto |
| `frontend/lib/reports/` | Saved-report filter schema + query execution |
| `frontend/lib/cron-auth.ts` | `CRON_SECRET` enforcement for `/api/cron/*` |
| `frontend/lib/email-templates.ts` | Email HTML templates (receipts, digest, alerts) |
| `frontend/lib/stripe.ts` | Stripe client |
| `frontend/lib/org-teardown.ts` | Org deletion (cancel Stripe → donations → donors → org row) and removal of logins left with no org |
| `frontend/lib/team-members.ts` | Removing a team member: role guards (owner/admin/last owner/self), per-org personal cleanup, orphaned-login removal. Used by `removeMember` and `DELETE /api/team/members/[id]` |
| `frontend/lib/subscription.ts` | Subscription limits and usage checking (atomic `increment_usage` RPC) |
| `frontend/lib/http.ts` | `readJsonObject()` — hardened JSON body parsing for mutation routes |
| `frontend/lib/rate-limit.ts` | Global rate limiting (Upstash Redis, in-memory fallback) |
| `frontend/lib/encryption.ts` | AES-256-GCM encryption for stored OAuth tokens |
| `frontend/lib/api-v1.ts` + `frontend/lib/api-auth.ts` | Public v1 API helpers + API-key auth |
| `frontend/lib/features.ts` | Feature-flag resolution (server + public env pairs) |
| `frontend/lib/format.ts` | Currency formatting |
| `frontend/lib/digest-ai.ts` | AI-generated weekly digest summaries |
| `frontend/lib/chat/` | Chat agent tools, system prompt, PII helpers |
| `frontend/components/chat/` | Chat overlay, provider, messages, input |
| `frontend/components/donors/` | Donor detail cards (insights, notes, tags, pledges, health score) |
| `frontend/components/email/` | Email compose dialog with bulk send |
| `frontend/components/smart-actions.tsx` | Smart actions dashboard component |
| `frontend/components/onboarding-wizard.tsx` | Multi-step onboarding flow |
| `frontend/components/onboarding-checklist.tsx` | Onboarding milestone tracker |
| `frontend/components/views/` | Top-level view components (CRM, map, reports, donations, pipeline, tasks, dashboard, settings, chat) |
| `frontend/app/settings/` | Settings pages with sidebar nav (profile, org, team, billing, donation options, email templates, notifications, integrations, year-end receipts, audit log) |
| `frontend/types/database.ts` | Generated TypeScript types for DB schema |
| `frontend/app/actions/` | All server actions (mutations) |
| `frontend/app/api/` | All API routes (reads, streaming, OAuth, webhooks, cron) |
| `supabase/migrations/` | Database migrations |

## Environment Variables

In `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase anonymous key (public)
NEXT_PUBLIC_MAPBOX_TOKEN      # Mapbox GL JS token
NEXT_PUBLIC_APP_URL           # App URL (for redirects)
SUPABASE_SERVICE_ROLE_KEY     # Admin key — NEVER expose as NEXT_PUBLIC_*
QB_CLIENT_ID                  # QuickBooks OAuth client ID
QB_CLIENT_SECRET              # QuickBooks OAuth client secret
QB_REDIRECT_URI               # QuickBooks OAuth redirect URI
QB_ENVIRONMENT                # "sandbox" or "production"
RESEND_API_KEY                # Resend email API key
OPENAI_API_KEY                # OpenAI API key
ANTHROPIC_API_KEY             # Anthropic API key (chat agent)
STRIPE_SECRET_KEY             # Stripe secret key
STRIPE_WEBHOOK_SECRET         # Stripe webhook signing secret
STRIPE_PRICE_{ESSENTIALS,GROWTH,PRO,ENTERPRISE}_{MONTHLY,ANNUAL}  # Price IDs per tier/interval
NEXT_PUBLIC_EMAIL_ENABLED     # "true" to show donor email UI; default "false"
EMAIL_ENABLED                 # Server-side mirror of email flag (for API gate)
TRANSCRIBE_ENABLED            # Voice transcription flag (+ NEXT_PUBLIC_TRANSCRIBE_ENABLED mirror)
CRON_SECRET                   # Auth for /api/cron/* routes
ENCRYPTION_KEY                # AES-256-GCM key for QB/Gmail tokens (lib/encryption.ts)
GOOGLE_OAUTH_CLIENT_ID        # Gmail integration OAuth
GOOGLE_OAUTH_CLIENT_SECRET    # Gmail integration OAuth
GOOGLE_OAUTH_REDIRECT_URI     # Gmail integration OAuth
UPSTASH_REDIS_REST_URL        # Rate limiting (optional; in-memory fallback if unset)
UPSTASH_REDIS_REST_TOKEN      # Rate limiting
FEEDBACK_EMAIL_TO             # Destination for in-app feedback
DEBUG_PII_REDACTION           # "true" logs PII-redaction diagnostics in the donor insights route (debug only)
```

Note: some map code reads `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` as well as `NEXT_PUBLIC_MAPBOX_TOKEN` — set both to the same value until unified.

## Deployment

Vercel. The root `package.json` proxies all scripts to `/frontend`. Single Vercel project pointing at the repo root.

Two gotchas:

- `/` redirects to `https://vantagedonorai.com/` in every non-development env (`frontend/next.config.mjs`) — don't test `/` against preview/prod deploys.
- Security headers/CSP live in `frontend/proxy.ts` middleware (with a second header layer in `frontend/vercel.json`) — deliberately not in `next.config.mjs`; don't add CSP there or the two sources get intersected. The two layers currently **disagree** on Permissions-Policy and HSTS; see `PROJECT_CONTEXT.md` Tier 1.

## MCP Servers

MCP servers are configured in `.mcp.json` (Shadcn, GitHub, Supabase, Vercel; Gmail via claude.ai connector). Discover available tools at runtime rather than trusting a hand-written list here. Two standing rules:

- After any schema change, regenerate `frontend/types/database.ts` via the Supabase MCP `generate_typescript_types` (project: `Vantage`), then re-append the hand-written union-type tail block (see Database section).
- Prefer MCP tools over manual CLI/browser workflows for GitHub, Supabase, and Vercel operations.
