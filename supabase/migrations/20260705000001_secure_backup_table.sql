-- Secure a stray backup table (audit follow-up, 2026-07-05).
--
-- _backup_donation_option_ids_20260705 was left behind by a donation-options
-- operation with RLS disabled, so its org-scoped rows (org_id, fund_id,
-- campaign_id, category_id) were reachable via PostgREST with the public anon
-- key (Supabase advisor: rls_disabled_in_public, ERROR). Enable RLS with no
-- policies → deny-all to anon/authenticated; the service-role client (used for
-- any restore) still bypasses RLS. Drop the table once you're confident the
-- donation-options migration it backs up is stable.
alter table public._backup_donation_option_ids_20260705 enable row level security;
