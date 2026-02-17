# Vercel environment variables

Set these in **Vercel → your project → Settings → Environment Variables**.

## Required for all deployments

| Variable | Where to use | Notes |
|----------|--------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development | Server-only; never exposed to browser |

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

## Optional

| Variable | Where to use | Notes |
|----------|--------------|--------|
| `OPENAI_API_KEY` | Production, Preview | For AI/chat features |
| `RESEND_API_KEY` | Production, Preview | For sending emails from **Log Email** (Resend.com API key) |
| `NEXT_PUBLIC_APP_URL` | Optional | Only if you need a fixed app URL; usually not needed on Vercel |

## Checklist

1. Add every variable above that you use.
2. For each variable, enable **Production** and **Preview** (and Development if you use Vercel dev).
3. Redeploy after changing env vars.
