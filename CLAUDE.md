# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All root-level scripts proxy to the frontend. Run from the repo root:

```bash
npm run dev      # Start frontend dev server (port 3000)
npm run build    # Production build
npm run lint     # ESLint check
```

To run the backend Next.js API server separately:

```bash
cd backend && npm run dev   # Backend dev server (port 3001 by default when frontend is running)
```

There is no test framework configured — linting and TypeScript type-checking are the primary quality gates.

## Architecture Overview

This is a **monorepo with two Next.js applications**:

- **`/frontend`** — User-facing SPA (Next.js 16, App Router, React 19). Contains UI, server actions, and some API routes.
- **`/backend`** — API-only Next.js app. Contains heavier server-side logic: AI chat, QuickBooks sync, report execution, donor semantic search, and OAuth flows.

Both apps share the same Supabase project and use the same multi-tenant data model.

### Multi-Tenant Org Scoping

**Every data query must be scoped by `org_id`.** This is the most critical architectural invariant.

- `frontend/lib/auth.ts` exports `getCurrentUserOrg()` and `requireUserOrg()` — call these at the top of every server action and API route handler before touching the database.
- `backend/src/lib/auth.ts` has the same helpers for backend routes.
- The admin Supabase client **bypasses RLS**, so org scoping must be enforced in application code.
- Use query builders in `frontend/lib/supabase/scoped.ts` which pre-filter by `org_id`.

### Frontend Data Flow

- **Server Actions** (`/frontend/app/actions/`) for all mutations (CRM updates, pipeline, reports, teams, tags).
- **API Routes** (`/frontend/app/api/`) for streaming responses and complex fetches (chat, map, donors, donations).
- **Backend API Routes** (`/backend/src/app/api/`) for: AI intelligence chat, QuickBooks sync, saved report execution.
- No Redux/Zustand — state is server-driven via Server Components and Actions. Client state uses `useState`.

### Key Domain Concepts

- **Donor Lifecycle**: Status field with values `New`, `Active`, `Lapsed`, `Lost` — not a free-form field.
- **Reports**: Dynamic — store filter criteria as JSON in `saved_reports`, not result snapshots.
- **Interactions**: Touchpoints (Calls, Emails, Tasks) tracked in the `interactions` table.

### AI / Intelligence Layer

The backend `/api/chat` route acts as an AI router:
- Classifies intent (search, chat, route, report) using OpenAI
- Runs semantic donor search via Supabase `match_donors` RPC (pgvector)
- PII is redacted before sending donor data to the LLM (`frontend/lib/pii-redaction.ts`)
- Embeddings stored as vectors on the `donors` table

### Database

Supabase (PostgreSQL + pgvector). 34 migrations in `/backend/supabase/migrations/`.

Key tables: `organizations`, `organization_members`, `donors`, `donations`, `donor_notes`, `interactions`, `opportunities`, `saved_reports`, `saved_lists`, `tags`, `team_invites`, `chat_history`, `email_send_log`, `user_feedback`.

RLS is enabled (migration `15_rls_multi_tenant.sql`) but the admin client bypasses it — always scope queries manually.

Generated TypeScript types live in `frontend/types/database.ts`.

### Authentication

Supabase Auth. On sign-in, `getCurrentUserOrg()` looks up the user's `organization_members` row and returns `{ userId, orgId }`. If no membership exists, it auto-creates an org and links the user as owner.

## UI Conventions

- **Shadcn UI** for all components (no other component libraries).
- **Lucide React** icons at **1.5px stroke width**.
- **Light mode default** — do not add dark mode variants unless explicitly requested.
- Backgrounds: `bg-white` or `bg-zinc-50/50` for sidebars/settings. Text: `text-zinc-950` headings, `text-zinc-500` metadata. Borders: `border-zinc-200`.
- Shadows: `shadow-sm` only. Hover: `hover:bg-zinc-100`.
- User feedback via Sonner `toast` — never `alert()`.

## Environment Variables

Frontend (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI`, `RESEND_API_KEY`, `OPENAI_API_KEY`.

Backend (`.env.local`, see `.env.example`): same Supabase + QB + OpenAI + Resend vars, plus `QB_ENVIRONMENT` (`sandbox`/`production`).

`SUPABASE_SERVICE_ROLE_KEY` must **never** be in `NEXT_PUBLIC_*` or exposed to the browser.
