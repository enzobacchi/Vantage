# Vercel environment variables

Set these in **Vercel → your project → Settings → Environment Variables**.

## Required for all deployments

| Variable | Where to use | Notes |
|----------|--------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development | **Server-only.** Never add to `NEXT_PUBLIC_*`, never log, never commit. Used only in API routes and server code; `createAdminClient()` throws if used in the browser. |

## QuickBooks (Connect / Sign in with QuickBooks)

| Variable | Where to use | Notes |
|----------|--------------|--------|
| `QB_CLIENT_ID` | Production **and** Preview | Intuit app client ID |
| `QB_CLIENT_SECRET` | Production **and** Preview | Intuit app secret |
| `QB_ENVIRONMENT` | Production **and** Preview | `sandbox` or `production` |

- **Important:** If you open a **Preview** deployment URL (e.g. `vantage-xxxx-efbacchiocchi-xxxx-projects.vercel.app`), env vars must be enabled for **Preview** as well as Production, or QuickBooks and other server features will 500 or fail.
- Do **not** set `QB_REDIRECT_URI` in Vercel unless you need a fixed URL; the app builds the redirect URI from the request host.

## Mapbox (donor map)

| Variable | Where to use | Notes |
|----------|--------------|--------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Production **and** Preview | Mapbox public access token (starts with `pk.`) |

## Auth emails (avoid rate limit)

Supabase’s **built-in** auth email is limited to about **2 emails per hour** and is not for production. Signups will fail with “rate limit exceeded” if you rely on it.

**Fix: use custom SMTP (Resend)** so signup confirmation and password-reset emails use Resend’s quota instead:

1. **Supabase Dashboard** → **Project** → **Authentication** → **SMTP Settings** (or **Email Templates** → enable custom SMTP).
2. Enable **Custom SMTP** and set:
   - **Sender email**: a verified address (e.g. `noreply@yourdomain.com` in Resend) or Resend’s default `onboarding@resend.dev` for testing.
   - **Sender name**: e.g. `Vantage`
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: your **Resend API key** (same as `RESEND_API_KEY` in Vercel).

3. Save. All auth emails (confirm signup, reset password, etc.) will go through Resend, so you avoid Supabase’s 2/hour limit and use Resend’s (e.g. 100/day free, higher on paid).

## Auth (email confirmation redirect)

So confirmation emails send users back to your app (not localhost):

1. **Supabase Dashboard** → Authentication → URL Configuration:
   - **Site URL**: set to your production URL (e.g. `https://your-app.vercel.app`)
   - **Redirect URLs**: add `https://your-app.vercel.app/**` (and your custom domain if you use one)

2. **Vercel**: The app uses the current request origin for the confirmation link when users sign up. If you use a custom domain, set `NEXT_PUBLIC_APP_URL` to that URL (e.g. `https://app.yourdomain.com`) so the link in the email uses it.

## Optional

| Variable | Where to use | Notes |
|----------|--------------|--------|
| `OPENAI_API_KEY` | Production, Preview | For AI/chat features |
| `RESEND_API_KEY` | Production, Preview | Resend.com API key. Used for **Log Email**, **feedback notifications**, and (when configured in Supabase SMTP) for **auth emails** (signup confirm, password reset) so you avoid Supabase’s 2/hour limit. |
| `FEEDBACK_EMAIL_TO` | Production, Preview | Email address to receive in-app feedback (bugs, feature requests, general). When set with RESEND_API_KEY, feedback submissions trigger an email notification with User ID, Organization ID, type, and message. |
| `NEXT_PUBLIC_APP_URL` | **Recommended** | Your production app URL (e.g. `https://your-app.vercel.app`). Used for **team invite links** in emails and for auth redirects so they point to the live app, not localhost or a preview URL. |

## Checklist

1. Add every variable above that you use.
2. For each variable, enable **Production** and **Preview** (and Development if you use Vercel dev).
3. Redeploy after changing env vars.
