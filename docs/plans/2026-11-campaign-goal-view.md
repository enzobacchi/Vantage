# Plan: Campaign goal view

**Status: proposed — not built. Needs owner approval (includes a schema change).**
Written 2026-11-03 for the Andrews University Advancement pilot.

## Why

Advancement teams measure campaigns against goals: "Spring Phonathon: $48k
of $75k, 64%". Vantage can tag a gift with a campaign, but the schema has no
goal or target anywhere, and nothing shows campaign totals except the chat
tool's `group_by: "campaign"` breakdown.

## What exists today (verified in code)

- Campaigns are labels: `org_donation_options` rows with `type = 'campaign'`
  (`id, org_id, type, name, sort_order`). CRUD is `GET/POST
  /api/donations/options` and `PATCH/DELETE /api/donations/options/[id]`,
  managed in Settings → Donation options.
- Gifts point at a label through `donations.campaign_id` (and `fund_id`,
  `category_id`).
- The Donations view already filters by `campaign_id` and date range.
- There is **no** solicitation, appeal or source code field anywhere. In
  greymatter/Dynamics, the solicitation code is the campaign-style key on a
  gift, so in Vantage it maps to the campaign label.

## What the user sees

- **Campaigns page** (new `?view=campaigns` in the dashboard shell, under
  Donations in the sidebar) shows one row per campaign label:
  - name (and code, if decision 2 is yes)
  - progress bar, raised / goal, and % of goal
  - gift count, donor count, and date window ("ends Mar 31 · 41 days left")
  - Labels without a goal still show totals, just no bar.
  - A final "No campaign" row shows unlabeled gifts.
  - A date-range picker (default: each campaign's own window, else fiscal
    year to date) and a CSV export button.
- Clicking a row opens the existing Donations view filtered to that campaign.
- **Dashboard card** "Campaign progress" lists the top 3 active campaigns
  with goals. It's toggleable via the existing `dashboard_preferences`.
- **Settings → Donation options**: campaign rows gain optional "Goal ($)",
  "Starts" and "Ends" fields.

Both light and dark mode. The bars use the standard accent, not the AI
gradient.

## Schema (additive only, needs approval)

One migration, all nullable, no backfill, so existing rows and the mobile app
are unaffected:

```sql
alter table public.org_donation_options
  add column goal_amount numeric(12,2) check (goal_amount is null or goal_amount > 0),
  add column starts_on date,
  add column ends_on date,
  add constraint org_donation_options_window_chk
    check (starts_on is null or ends_on is null or starts_on <= ends_on);

-- Totals in SQL, not by pulling every gift row (PostgREST caps selects at 1000).
create function public.campaign_progress(p_org_id uuid, p_from date, p_to date)
returns table (campaign_id uuid, raised numeric, gift_count bigint, donor_count bigint)
language sql stable security invoker as $$
  select d.campaign_id, sum(d.amount), count(*), count(distinct d.donor_id)
  from public.donations d
  where d.org_id = p_org_id
    and (p_from is null or d.date >= p_from)
    and (p_to   is null or d.date <= p_to)
  group by d.campaign_id
$$;
```

The RPC is called only from the server with the service-role client, scoped
by `org_id` from `requireUserOrg()`. Revoke execute from
`anon`/`authenticated` to match the lockdown posture. After the migration,
regenerate `frontend/types/database.ts` and re-append the hand-written tail.

**Alternative considered:** a separate `campaign_goals` table (many goals per
label, e.g. "Annual Fund" per fiscal year). It's more flexible but needs a
new table, RLS policies and more UI. For the pilot, make one label per drive
("Annual Fund FY27"). Upgrade later if Andrews needs recurring labels.

## Code

| Piece | Change |
|---|---|
| `GET /api/campaigns/progress` (new) | `requireUserOrg()` → read campaign options + `campaign_progress` RPC → merge to `[{ id, name, goal_amount, starts_on, ends_on, raised, gift_count, donor_count, pct }]` plus an unlabeled bucket. Window rule: explicit `from/to` query wins, else the campaign's own window. |
| New `lib/campaign-progress.ts` (deep module) | Pure merge + percent + days-left logic, unit-tested first (no goal, zero raised, over 100%, window edges, unlabeled bucket). |
| `PATCH /api/donations/options/[id]` | Accept optional `goal_amount`, `starts_on`, `ends_on` for `type = 'campaign'` only, parsed with `readJsonObject()`. Response shape unchanged for existing fields. |
| `components/views/campaigns-view.tsx` (new) + dashboard card | Shadcn table + progress, Sonner toasts. |
| Settings → Donation options | Three optional inputs on campaign rows. |
| Chat (optional, later) | Add `goal_amount` to `get_donation_metrics` when `group_by = "campaign"`. Goals are not PII. Campaign names are already redacted at the model boundary. |

**Mobile parity:** `/api/donations/options` is read by mobile. Adding
nullable fields to the JSON is backward-compatible, so check
`Mobile/docs/API_PARITY.md` and add the fields to its type only. The new
route is web-only.

## Verification

- Unit tests for `lib/campaign-progress.ts` written first.
- Migration applied to a Supabase branch first, then RPC results checked
  against a hand-computed total on the demo org.
- Playwright: set a goal in Settings, record a gift with that campaign, and
  see the bar move. Check both themes.
- `npm run lint`, `npm test` and `npm run build`. Preview deploy, then prod.

## Effort

About 1.5 days: migration + RPC 0.25, API + lib + tests 0.5, UI 0.5, settings
+ dashboard card + QA 0.25.

## Decisions for the owner

1. Approve the additive migration (three nullable columns + one read-only RPC)?
2. Add a separate optional `code` column (e.g. "AF27-PH") so greymatter
   solicitation codes can be matched on CSV import? It costs almost nothing
   in the same migration. Otherwise the code goes in the label name.
3. Should "raised" count only received gifts (proposed), or also show open
   pledges as "committed"? Pledges would add about 0.5 day.
