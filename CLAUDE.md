# CLAUDE.md

Context file for Claude Code (claude.ai/code) and Cursor when working in this repository.

## Product

**Vantage** is an AI-powered donor CRM for small-to-midsize nonprofits and ministries. It replaces manual data entry with intelligent automation and integrates directly with accounting software (QuickBooks today, Xero/FreshBooks/Sage planned).

**Target user**: Faith-based organizations and small nonprofits with 1–5 staff managing donors, receipts, and bookkeeping — typically under 5,000 donors.

**Core thesis**: Shift donor management from a passive system of record to an active, intelligent partner — automating data entry, surfacing relationship insights, and connecting fundraising to accounting in one platform.

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

- **Server Actions** (`frontend/app/actions/`) — all mutations (donors, donations, pipeline, reports, teams, tags, settings).
- **API Routes** (`frontend/app/api/`) — streaming, file uploads, complex queries (map, donations, dashboard metrics, QuickBooks OAuth, email).
- **No client state management** — server-driven via Server Components and Actions. Client state uses `useState` only.

### Multi-Tenant Org Scoping

**Every data query must be scoped by `org_id`.** This is the most critical architectural invariant.

- `frontend/lib/auth.ts` exports `getCurrentUserOrg()`, `getCurrentUserOrgWithRole()`, and `requireUserOrg()`.
- Call one of these at the top of **every** server action and API route before touching the database.
- The admin Supabase client **bypasses RLS** — org scoping must be enforced in application code.
- Use scoped query builders in `frontend/lib/supabase/scoped.ts` which pre-filter by `org_id` (donors, reports, tasks, opportunities).

### Key Domain Concepts

- **Donor Lifecycle**: Computed status — `New` (≤6mo), `Active`, `Lapsed` (>12mo), `Lost` (>24mo). Calculated by `frontend/lib/donor-lifecycle.ts`, not a free-form field.
- **Reports**: Dynamic — store filter criteria as JSON in `saved_reports`, not result snapshots.
- **Interactions**: Touchpoints (Calls, Emails, Meetings, Notes, Tasks) in the `interactions` table.
- **Opportunities**: Fundraising pipeline with stages: identified → qualified → solicited → committed → closed_won/lost.
- **Donation Options**: Org-scoped categories, campaigns, and funds in `org_donation_options`.

### AI / Intelligence Layer

- **Donor Insights**: `GET /api/donors/[id]/insights` generates AI briefings via OpenAI. PII is redacted before LLM calls (`frontend/lib/pii-redaction.ts`) and unredacted in the response.
- **Semantic Search**: pgvector embeddings on `donors` table, queried via Supabase `match_donors` RPC.
- **Chat Agent**: Not yet built — planned as a central conversational interface for querying data, creating records, and triggering workflows.
- Always redact PII before sending any donor data to OpenAI. Never auto-execute AI suggestions — always require human approval.

### Database

Supabase (PostgreSQL + pgvector). Migrations in `/supabase/migrations/`.

Key tables: `organizations`, `organization_members`, `donors`, `donations`, `donor_notes`, `interactions`, `opportunities`, `saved_reports`, `report_folders`, `saved_lists`, `org_donation_options`, `receipt_templates`, `tags`, `donor_tags`, `invitations`, `chat_history`, `email_send_log`, `user_feedback`.

RLS is enabled but the admin client bypasses it — **always scope queries manually by `org_id`**.

Generated TypeScript types: `frontend/types/database.ts` — update this when schema changes.

### Authentication

Supabase Auth. `getCurrentUserOrg()` looks up the user's `organization_members` row and returns `{ userId, orgId }`. If no membership exists, it auto-creates an org and links the user as owner.

Roles: `owner`, `admin`, `member` — checked via `getCurrentUserOrgWithRole()`.

### Integrations

- **QuickBooks**: Full OAuth 2.0 flow + sync (customers → donors, sales receipts/invoices → donations). Helpers in `frontend/lib/quickbooks-helpers.ts`. Supports sandbox and production environments.
- **Resend**: Transactional email for donation receipts. Templates: standard, DAF, institutional. API route at `POST /api/email/send`.
- **Mapbox**: Donor geospatial visualization. Geocoding + interactive map with status/giving filters.
- **OpenAI**: Donor insight generation, semantic search embeddings, and future chat agent.

## UI Conventions

- **Shadcn UI** exclusively — no other component libraries.
- **Lucide React** icons at **1.5px stroke width**.
- **Both light and dark mode** — always implement design changes for both modes. Use theme-aware tokens (`bg-card`, `bg-background`, `text-foreground`, etc.) instead of hardcoded colors like `bg-white`. Test that new UI looks correct in both themes.
- Colors: `bg-white` / `bg-zinc-50/50` backgrounds (light). `text-zinc-950` headings. `text-zinc-500` metadata. `border-zinc-200` borders.
- **Accent color**: Teal-to-cyan gradient (`from-[#14b8a6] to-[#06b6d4]`) matching the Vantage logo icon. **Reserved for AI features and standout product features only** — do not use on standard CRUD buttons (e.g. Create Report, Save). Apply via `bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white hover:opacity-90 border-0`. For gradient borders, use a `p-[1px]` wrapper with the gradient background and `bg-card` inner div.
- `shadow-sm` only. `hover:bg-zinc-100` for interactive elements.
- User feedback via **Sonner `toast`** — never `alert()`.

## Key Files

| Path | Purpose |
|------|---------|
| `frontend/lib/auth.ts` | Org-scoping helpers (call before every DB query) |
| `frontend/lib/supabase/scoped.ts` | Pre-filtered query builders by org_id |
| `frontend/lib/supabase/admin.ts` | Admin Supabase client (bypasses RLS) |
| `frontend/lib/pii-redaction.ts` | Redact/unredact PII for LLM calls |
| `frontend/lib/donor-lifecycle.ts` | Donor status computation |
| `frontend/lib/quickbooks-helpers.ts` | QB data parsing and API helpers |
| `frontend/lib/format.ts` | Currency/date formatting |
| `frontend/types/database.ts` | Generated TypeScript types for DB schema |
| `frontend/app/actions/` | All server actions (mutations) |
| `frontend/app/api/` | All API routes (reads, streaming, OAuth) |
| `frontend/components/views/` | Top-level view components (CRM, map, reports, donations, pipeline) |
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
```

## Deployment

Vercel. The root `package.json` proxies all scripts to `/frontend`. Single Vercel project pointing at the repo root.
