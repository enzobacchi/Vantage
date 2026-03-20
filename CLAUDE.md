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

- **Server Actions** (`frontend/app/actions/`) — all mutations (donors, donations, pipeline, reports, teams, tags, settings).
- **API Routes** (`frontend/app/api/`) — streaming, file uploads, complex queries (map, donations, dashboard metrics, QuickBooks OAuth, email, chat).
- **No client state management** — server-driven via Server Components and Actions. Client state uses `useState` only.

### Multi-Tenant Org Scoping

**Every data query must be scoped by `org_id`.** This is the most critical architectural invariant.

- `frontend/lib/auth.ts` exports `getCurrentUserOrg()`, `getCurrentUserOrgWithRole()`, and `requireUserOrg()`.
- Call one of these at the top of **every** server action and API route before touching the database.
- The admin Supabase client **bypasses RLS** — org scoping must be enforced in application code.
- Use scoped query builders in `frontend/lib/supabase/scoped.ts` which pre-filter by `org_id`.

### Key Domain Concepts

- **Donor Lifecycle**: Computed status — `New` (≤6mo), `Active`, `Lapsed` (>12mo), `Lost` (>24mo). Calculated by `frontend/lib/donor-lifecycle.ts`, not a free-form field.
- **Reports**: Dynamic — store filter criteria as JSON in `saved_reports`, not result snapshots.
- **Interactions**: Touchpoints (Calls, Emails, Meetings, Notes, Tasks) in the `interactions` table.
- **Opportunities**: Fundraising pipeline with stages: identified → qualified → solicited → committed → closed_won/lost.
- **Donation Options**: Org-scoped categories, campaigns, and funds in `org_donation_options`.

### AI / Intelligence Layer

- **Donor Insights**: `GET /api/donors/[id]/insights` generates AI briefings via OpenAI. PII is redacted before LLM calls (`frontend/lib/pii-redaction.ts`) and unredacted in the response. Uses single-donor redaction pattern.
- **Chat Agent**: Claude Haiku 4.5 via Vercel AI SDK + `@ai-sdk/anthropic`. Cmd+J overlay, persisted to `chat_history` table. 8 tools: `search_donors`, `get_donor_summary`, `get_donation_metrics`, `filter_donations`, `create_donor`, `create_donation`, `get_recent_activity`, `get_donor_locations`. Uses multi-donor PII redaction (numbered placeholders) in `frontend/lib/chat/pii-helpers.ts`.
- **Semantic Search**: pgvector embeddings stored on `donors` table via Supabase `match_donors` RPC. Not yet exposed in UI.
- Always redact PII before sending any donor data to LLMs. Never auto-execute AI suggestions — always require human approval.

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
- **OpenAI**: Donor insight generation and semantic search embeddings.
- **Anthropic**: Claude Haiku 4.5 powers the chat agent via `@ai-sdk/anthropic`.

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
| `frontend/lib/pii-redaction.ts` | Redact/unredact PII for LLM calls |
| `frontend/lib/donor-lifecycle.ts` | Donor status computation |
| `frontend/lib/quickbooks-helpers.ts` | QB data parsing and API helpers |
| `frontend/lib/format.ts` | Currency/date formatting |
| `frontend/lib/chat/` | Chat agent tools, system prompt, PII helpers |
| `frontend/components/chat/` | Chat overlay, provider, messages, input |
| `frontend/app/api/chat/` | Chat streaming endpoint + history |
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
ANTHROPIC_API_KEY             # Anthropic API key (chat agent)
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
