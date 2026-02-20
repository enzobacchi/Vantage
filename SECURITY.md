# Security

## Service role key

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. It must never be in client bundles, in `NEXT_PUBLIC_*` env vars, in logs, or in version control.
- The frontend uses `createAdminClient()` only in API routes and server code; that function throws if called in the browser.
- See `frontend/ENV_VERCEL.md` for env var setup.

## Org-scoped data (multi-tenant)

- Donor and donation data is scoped by organization. When using the **admin client** (service role), RLS is bypassed, so the app enforces org boundaries in code:
  1. API routes and server actions that touch org-scoped data must call `requireUserOrg()` (or `getCurrentUserOrg()`) first.
  2. Every query on `donors`, `donations`, `saved_reports`, `tasks`, `opportunities`, etc. must filter by `org_id` or `organization_id` using the authenticated user’s org.
- Prefer the helpers in `frontend/lib/supabase/scoped.ts` (`donorsQuery`, `savedReportsQuery`, `tasksQuery`, `opportunitiesQuery`) so new code cannot forget org scoping.

## Backups and confidential data

- Donor/donation data may be confidential. Ensure Supabase (or your DB) backups and retention are configured per your policy and any DPA/compliance requirements.
- Limit Supabase dashboard and production DB access to trusted operators; use strong auth and avoid sharing the service role key.
