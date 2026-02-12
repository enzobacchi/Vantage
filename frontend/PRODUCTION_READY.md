# Production readiness: multi-ministry logins

This app is now set up so **each ministry can sign in and see only their own data**. Here’s what was implemented and what you need to do.

---

## What’s in place

1. **Auth**
   - **Middleware** protects `/dashboard`, `/donors`, and `/settings`. Unauthenticated users are redirected to `/login`.
   - **Login** (`/login`) and **Sign up** (`/signup`) use Supabase Auth (email/password).
   - **Log out** in the sidebar signs out and redirects to `/login`.

2. **Organization linking**
   - When a user completes **Connect QuickBooks** in Settings, the app:
     - Upserts the organization (by `qb_realm_id`) and stores tokens.
     - Links the **current user** to that org in `organization_members`.
   - So each ministry’s QuickBooks connection is tied to the user who connected it.

3. **Data scoping**
   - All relevant API routes and server actions use the **current user’s organization** (from `organization_members`):
     - Sync, QuickBooks status, donors (list/map/states), dashboard metrics, donations (recent/trend), reports (list/get/create/generate/save), tasks, and the Ask AI chat (RAG + stats).

Result: each ministry only sees and syncs their own donors, reports, and data.

---

## What you need to do

### 1. Run migrations

Ensure your Supabase database has the tables and RLS used by auth and org scoping. From the **backend** (where migrations live), run:

- All migrations in `backend/supabase/migrations/`, especially:
  - `13_organization_members.sql` (links users to organizations)
  - `10_saved_reports_organization_id.sql` (saved reports scoped by org)

If you use the Supabase CLI:

```bash
cd backend
supabase db push
```

Or run the SQL from those files in the Supabase SQL Editor.

### 2. Enable Supabase Auth (email/password)

1. In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Providers**.
2. Enable **Email**.
3. In **Authentication** → **URL Configuration**, add your app URL and the callback path to **Redirect URLs**, e.g.:
   - `http://localhost:3000/auth/callback` (local)
   - `https://yourdomain.com/auth/callback` (production)
   Set **Site URL** to your app origin (e.g. `http://localhost:3000` or `https://yourdomain.com`) so email confirmation redirects somewhere valid.
4. Optionally configure **Confirm email** (recommended for production) and **Secure email change**.

### 3. Environment variables

In **frontend** `.env.local` (and in production env for your host):

- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL  
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon/public key  

Do **not** put the Supabase **service role** key in the frontend; it’s only used in API routes via server-side env (e.g. backend or server-only env).

### 4. First-time flow for a new ministry

1. User signs up (or you create their account) and signs in.
2. They go to **Settings** and click **Connect QuickBooks**.
3. They complete the Intuit OAuth flow for **their** QuickBooks company.
4. On callback, the app creates/updates the org and adds a row in `organization_members` for that user and org.
5. They can use **Sync Donors** and the rest of the app; all data is scoped to that org.

For another ministry, a different user signs in and connects **their** QuickBooks; they get a different org and only see their data.

### 5. Optional: multiple orgs per user

Right now `getCurrentUserOrg()` returns the **first** membership. If you later want “switch organization” or multiple orgs per user, you can:

- Add a way to choose the active org (e.g. cookie or session).
- Extend `getCurrentUserOrg()` (or add a helper) to use that selection.

### 6. Optional: RLS

The app currently uses the **service role** in API routes and enforces org scoping in application code. For an extra layer of security you can add Row Level Security (RLS) on `donors`, `saved_reports`, etc., so that even with the service role, rows are restricted by `organization_id` / `org_id` using a stable way to resolve “current org” (e.g. a JWT custom claim set after login).

---

## Quick checklist

- [ ] Migrations applied (including `organization_members` and `saved_reports.organization_id`).
- [ ] Supabase Auth **Email** provider enabled.
- [ ] Frontend env has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Test: sign up → sign in → Connect QuickBooks → Sync Donors → confirm data is only for that org.
- [ ] (Optional) Turn on email confirmation and secure email change in Supabase for production.

After that, each ministry can have its own logins and see only their own information.
