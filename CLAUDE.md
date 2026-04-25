# CLAUDE.md

Context file for Claude Code (claude.ai/code) and Cursor when working in this repository.

## Product

**Vantage** is an AI-powered donor CRM for small-to-midsize nonprofits and ministries. It replaces manual data entry with intelligent automation and integrates directly with accounting software (QuickBooks today, Xero/FreshBooks/Sage planned).

**Target user**: Faith-based organizations and small nonprofits with 1–5 staff managing donors, receipts, and bookkeeping — typically under 5,000 donors.

## Commands

All root-level scripts proxy to `/frontend`:

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build (also runs TypeScript type-check)
npm run lint     # ESLint check
```

No test framework — linting and `npm run build` (TypeScript) are the quality gates.

## Architecture

**Single Next.js 16 application** in `/frontend` (App Router, React 19). There is no separate backend service.

- **Server Actions** (`frontend/app/actions/`) — all mutations. 23 action files covering: auth, audit, crm, dashboard, donations, donors, email-rate-limit, feedback, folders, import, legal, lists, notifications, onboarding, onboarding-progress, pipeline, pledges, receipt-templates, reports, search, settings, tags, team.
- **API Routes** (`frontend/app/api/`) — reads, streaming, OAuth, webhooks. Major route groups: chat, dashboard (metrics + smart-actions), donors (list, detail, insights, score, search, map, states, geocode), donations (list, options, recent, trend), email (send + bulk-send), interactions, tags, reports, pipeline, organization, quickbooks (auth, callback, status), stripe (checkout, portal, status, webhook), cron (sync, digest), sync, export, tasks, feedback.
- **No client state management** — server-driven via Server Components and Actions. Client state uses `useState` only.

### Multi-Tenant Org Scoping

**Every data query must be scoped by `org_id`.** This is the most critical architectural invariant.

- `frontend/lib/auth.ts` exports `getCurrentUserOrg()` and `getCurrentUserOrgWithRole()`.
- Call one of these at the top of **every** server action and API route before touching the database.
- The admin Supabase client **bypasses RLS** — org scoping must be enforced in application code.
- Auth supports both cookie-based (web) and Bearer token (mobile) authentication.
- Use scoped query builders in `frontend/lib/supabase/scoped.ts` which pre-filter by `org_id`.

### Mobile parity

A sibling Expo app lives at `/Users/enzobacchiocchi/Developer/Vantage/Mobile` and shares this Supabase backend. When you modify an API route under `frontend/app/api/`, check `Mobile/docs/API_PARITY.md` — if the route is marked `consumed`, the mobile client reads that shape and may break. Update the mobile call site (typically in `Mobile/lib/` or `Mobile/app/**`) in the same change set when the contract shifts.

### Key Domain Concepts

- **Donor Lifecycle**: Computed status — `New` (≤6mo), `Active`, `Lapsed` (>12mo), `Lost` (>24mo). Calculated by `frontend/lib/donor-lifecycle.ts`, not a free-form field.
- **Donor Health Score**: Deterministic 0–100 score computed by `frontend/lib/donor-score.ts` (no LLM). Five weighted factors: recency (30%), frequency (25%), monetary trend (20%), engagement (15%), consistency (10%). Labels: Excellent/Good/Fair/At Risk/Cold. Includes trend analysis (rising/stable/declining/new/inactive) and suggested ask amounts.
- **Pledges**: Recurring or one-time giving commitments. Frequencies: `one_time`, `monthly`, `quarterly`, `annual`. Statuses: `active`, `fulfilled`, `cancelled`, `overdue`. Linked to donations via `pledge_id` FK. Progress tracked by `frontend/lib/pledge-helpers.ts`.
- **Interactions**: Touchpoints (email, call, meeting, note, task) in the `interactions` table with direction (inbound/outbound) and status (pending/completed). Full CRUD via `/api/interactions`.
- **Reports**: Dynamic — store filter criteria as JSON in `saved_reports`, not result snapshots.
- **Opportunities**: Fundraising pipeline with stages: identified → qualified → solicited → committed → closed_won/lost.
- **Donation Options**: Org-scoped categories, campaigns, and funds in `org_donation_options`.
- **Tags**: Org-scoped tags assignable to donors, with bulk tag operations.
- **Smart Actions**: AI-generated dashboard recommendations (thank_donor, at_risk, re_engage, pipeline, task_overdue, follow_up, milestone) with priority levels. Served by `/api/dashboard/smart-actions`.

### AI / Intelligence Layer

- **Donor Insights**: `GET /api/donors/[id]/insights` generates AI briefings via OpenAI. PII is redacted before LLM calls (`frontend/lib/pii-redaction.ts`) and unredacted in the response.
- **Chat Agent**: Claude Haiku 4.5 via Vercel AI SDK + `@ai-sdk/anthropic`. Cmd+J overlay, persisted to `chat_history` table. 10 tools: `search_donors`, `get_donor_summary`, `get_donation_metrics`, `filter_donations`, `create_donor`, `create_donation`, `get_recent_activity`, `get_donor_locations`, `get_donor_health_score`, `get_at_risk_donors`. PII redaction in `frontend/lib/chat/pii-helpers.ts`.
- **Smart Actions**: Dashboard recommendations generated via API, surfaced in `frontend/components/smart-actions.tsx`.
- **Weekly Digest**: AI-summarized weekly digest emails via `frontend/lib/digest-ai.ts` + `/api/cron/digest`.
- **Semantic Search**: pgvector embeddings stored on `donors` table via Supabase `match_donors` RPC. Not yet exposed in UI.
- **Voice Donation Entry**: Mic button on `/dashboard/donations/entry` opens `frontend/components/donations/voice-entry-dialog.tsx`. Audio is sent to `POST /api/donations/voice-parse`, which runs Whisper for transcription, redacts PII via the org's donor index, then asks Claude Haiku 4.5 (`generateObject`) to extract a list of `{ donor, amount, date, payment_method, category, campaign, fund, memo }` rows. Server-side reconciliation matches donor placeholders/names back to real IDs and fuzzy-matches designations against `org_donation_options`. The user reviews and edits each row before saving — never auto-saved. Gated by `TRANSCRIBE_ENABLED=true` plus `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`.
- Always redact PII before sending any donor data to LLMs. Never auto-execute AI suggestions — always require human approval.

### Database

Supabase (PostgreSQL + pgvector). Migrations in `/supabase/migrations/`.

Key tables: `organizations`, `organization_members`, `donors`, `donations`, `donor_notes`, `interactions`, `opportunities`, `pledges`, `saved_reports`, `report_folders`, `saved_lists`, `org_donation_options`, `receipt_templates`, `tags`, `donor_tags`, `chat_history`, `subscriptions`, `subscription_usage`, `audit_logs`, `notification_preferences`, `donor_merge_history`.

RLS is enabled but the admin client bypasses it — **always scope queries manually by `org_id`**.

Generated TypeScript types: `frontend/types/database.ts` — regenerate via the Supabase MCP tool `mcp__supabase__generate_typescript_types` (project: `Vantage`) after any schema change, then re-append the hand-written tail block of aliases and string-literal unions (`Interaction`, `Donation`, `OrgDonationOption`, `PaymentMethod`, `DonorType`, `ReceiptTemplateCategory`, `SubscriptionPlan`, `SubscriptionStatus`, `UsageMetric`, `Subscription`, `SubscriptionUsage`, `AuditLog`, `NotificationPreferences`, `DonorMergeHistory`) — the generator can't reproduce the narrow unions because the underlying DB columns are typed `text`, not Postgres enums.

### Authentication

Supabase Auth with dual auth paths: cookie-based (web) and Bearer token (mobile).

`getCurrentUserOrg()` looks up the user's `organization_members` row and returns `{ userId, orgId }`. If no membership exists, it auto-creates an org and links the user as owner. When a user belongs to multiple orgs, it prefers the shared org over a solo auto-created one.

Roles: `owner`, `admin`, `member` — checked via `getCurrentUserOrgWithRole()`.

### Integrations

- **QuickBooks**: Full OAuth 2.0 flow + sync (customers → donors, sales receipts/invoices → donations). Helpers in `frontend/lib/quickbooks-helpers.ts`. Supports sandbox and production environments. Auto-sync via `/api/cron/sync`.
- **Stripe**: Subscription billing — checkout sessions, billing portal, webhook handling. Client in `frontend/lib/stripe.ts`. Usage tracking via `subscription_usage` table with limits on AI insights, email sends, and donor count.
- **Resend**: Transactional and bulk email. Single send at `POST /api/email/send`, bulk send at `POST /api/email/bulk-send` (rate-limited to 10/hour). Templates in `frontend/lib/email-templates.ts`: password reset, new donation, milestone, team activity, system alert, weekly digest.
- **Mapbox**: Donor geospatial visualization. Geocoding + interactive map with status/giving filters.
- **OpenAI**: Donor insight generation, semantic search embeddings, weekly digest AI summaries.
- **Anthropic**: Claude Haiku 4.5 powers the chat agent via `@ai-sdk/anthropic`.

### Onboarding

Multi-step onboarding wizard (`frontend/components/onboarding-wizard.tsx`) with welcome, import, QuickBooks, and email steps. Onboarding checklist (`frontend/components/onboarding-checklist.tsx`) tracks 4 milestones: donors added, QB connected, emails sent, templates configured. Completion stored on `organizations.onboarding_completed_at`.

## UI Conventions

- **Shadcn UI** exclusively — no other component libraries.
- **Lucide React** icons only, at **1.5px stroke width**.
- **Both light and dark mode** — always implement design changes for both modes. Use theme-aware tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) instead of hardcoded colors. Test that new UI looks correct in both themes.
- Light-mode specifics when hardcoded values are needed: `bg-white` / `bg-zinc-50/50` backgrounds, `text-zinc-950` headings, `text-zinc-500` metadata, `border-zinc-200` borders.
- **Accent color**: Green-to-cyan gradient (`from-[#007A3F] to-[#21E0D6]`) matching the Vantage logo icon. **Reserved for AI features and standout product features only** — do not use on standard CRUD buttons (e.g. Create Report, Save). Apply via `bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white hover:opacity-90 border-0`. For gradient borders, use a `p-[1px]` wrapper with the gradient background and `bg-card` inner div.
- `shadow-sm` only. `hover:bg-accent` for interactive elements.
- User feedback via **Sonner `toast`** — never `alert()`.

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
| `frontend/lib/email-templates.ts` | Email HTML templates (receipts, digest, alerts) |
| `frontend/lib/stripe.ts` | Stripe client |
| `frontend/lib/subscription.ts` | Subscription limits and usage checking |
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
STRIPE_PRICE_ESSENTIALS_MONTHLY  # Recurring monthly price ID for Essentials tier
STRIPE_PRICE_GROWTH_MONTHLY      # Recurring monthly price ID for Growth tier
STRIPE_PRICE_PRO_MONTHLY         # Recurring monthly price ID for Pro tier
NEXT_PUBLIC_EMAIL_ENABLED     # "true" to show donor email UI; default "false"
EMAIL_ENABLED                 # Server-side mirror of email flag (for API gate)
```

## Deployment

Vercel. The root `package.json` proxies all scripts to `/frontend`. Single Vercel project pointing at the repo root.

## MCP Servers (AI Tool Integrations)

The following MCP servers are configured and available to Claude Code and Cursor for direct interaction with external services. Use these instead of manual CLI commands or browser workflows when possible.

### Shadcn UI (`mcp__shadcn__*`)

Browse, search, and install Shadcn UI components directly. Configured in `.mcp.json`.

- `search_items_in_registries` / `list_items_in_registries` — find available components.
- `view_items_in_registries` / `get_item_examples_from_registries` — inspect component source and usage examples.
- `get_add_command_for_items` — get the install command for a component.
- `get_project_registries` — list configured registries for this project.
- `get_audit_checklist` — audit component usage.

### GitHub (`mcp__github__*`)

Full GitHub API access for the repository.

- **Issues**: `create_issue`, `get_issue`, `list_issues`, `search_issues`, `update_issue`, `add_issue_comment`.
- **Pull Requests**: `create_pull_request`, `get_pull_request`, `list_pull_requests`, `merge_pull_request`, `get_pull_request_files`, `get_pull_request_comments`, `get_pull_request_reviews`, `get_pull_request_status`, `create_pull_request_review`, `update_pull_request_branch`.
- **Repository**: `create_branch`, `list_commits`, `get_file_contents`, `create_or_update_file`, `push_files`, `search_code`, `search_repositories`, `create_repository`, `fork_repository`, `search_users`.

### Supabase (`mcp__supabase__*`)

Direct access to Supabase project management and database operations.

- **Database**: `execute_sql`, `apply_migration`, `list_migrations`, `list_tables`, `list_extensions`, `generate_typescript_types`.
- **Projects**: `get_project`, `list_projects`, `create_project`, `pause_project`, `restore_project`, `get_project_url`, `get_publishable_keys`.
- **Branches** (database branching): `create_branch`, `list_branches`, `merge_branch`, `rebase_branch`, `reset_branch`, `delete_branch`.
- **Edge Functions**: `deploy_edge_function`, `get_edge_function`, `list_edge_functions`.
- **Organizations**: `get_organization`, `list_organizations`.
- **Observability**: `get_logs`, `get_advisors`.
- **Docs**: `search_docs`.
- **Billing**: `get_cost`, `confirm_cost`.

Use `generate_typescript_types` after schema changes to update `frontend/types/database.ts`.

### Vercel (`mcp__vercel__*`)

Deployment management and monitoring for the Vercel-hosted app.

- **Deployments**: `deploy_to_vercel`, `get_deployment`, `list_deployments`, `get_deployment_build_logs`, `get_runtime_logs`.
- **Projects**: `get_project`, `list_projects`.
- **Teams**: `list_teams`.
- **Domains**: `check_domain_availability_and_price`.
- **Toolbar** (preview comments): `list_toolbar_threads`, `get_toolbar_thread`, `reply_to_toolbar_thread`, `edit_toolbar_message`, `change_toolbar_thread_resolve_status`, `add_toolbar_reaction`.
- **Docs**: `search_vercel_documentation`.
- **Web**: `web_fetch_vercel_url`, `get_access_to_vercel_url`.

### Gmail (`mcp__claude_ai_Gmail__*`)

Read-only email access plus draft creation.

- `gmail_get_profile` — current user info.
- `gmail_search_messages` / `gmail_read_message` / `gmail_read_thread` — search and read emails.
- `gmail_list_labels` — list Gmail labels.
- `gmail_list_drafts` / `gmail_create_draft` — manage drafts.
