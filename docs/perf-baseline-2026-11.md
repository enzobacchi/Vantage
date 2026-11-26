# Speed baseline — 26 Nov 2026

The "before" numbers for the Phase 3 speed work. Measured on the local stack against the seeded 3,000-donor sample organisation (`scripts/seed-sample-org.ts`), signed in as its owner, in Chrome via Playwright.

| Screen | Time to content (median of 3, warm) | Data requests per load | Slowest request |
|---|---|---|---|
| Dashboard | 508 ms | 13 | 154 ms (`/api/donations/recent`) |
| Donor list | 655 ms | **102** | 185 ms (`/api/donations/recent`) |
| Donations | 660 ms | 17 | 160 ms (`/api/donations/recent`) |
| Tasks | 1,152 ms | 15 | 143 ms (`/api/donations/recent`) |
| Reports | 460 ms | 22 | 168 ms (`/api/stripe/status`) |
| Pipeline | 1,137 ms | 6 | 137 ms (`/api/stripe/status`) |
| Settings → Billing | 201 ms | 6 | 95 ms (`/api/stripe/status`) |

"Data requests" counts calls to `/api/*` plus server actions made by the page after it loads.

## How to read these

- **The times flatter production.** The database is on the same machine, so each database trip costs about a millisecond instead of the tens of milliseconds it costs between Vercel and Supabase. The request counts carry over to production unchanged; the times do not. Compare future runs against these numbers on the same local setup, not against production.
- **Development mode.** The app ran under `next dev`, so JavaScript bundle size is not measured here. The production build's bundle sizes are the reference for that.
- **Request count is the number to drive down.** Every one of these requests repeats the sign-in and organisation lookup on the server.

## What stands out

- The donor list makes 102 requests to show one page of 50 donors — roughly two per row.
- The Tasks view reports "No pending tasks" for this organisation even though it has pending tasks. That is a correctness bug at this size, not a speed result (tracked as a skipped browser test in `frontend/e2e/smoke.e2e.ts`).
- The dashboard's revenue totals are wrong at this size (shows $1,661,098 of $3,200,296) because of the 1,000-row cap.

## Reproducing

From the repo root: `supabase start`. From `frontend/`: `npx tsx scripts/seed-sample-org.ts`, then `npm run dev`. The measurement was a one-off Playwright script that opened each screen four times, discarded the first load, and waited for the screen's main content; rerun the same way when Phase 3 lands.
