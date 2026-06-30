-- Security lockdown (pre-launch audit 2026-06-12).
--
-- Context: the app's server code uses the service-role client exclusively
-- (RLS-bypassing) and enforces org scoping in application code. Direct
-- PostgREST access with the public anon key is NOT a supported data path,
-- so every table must at minimum deny anon/authenticated by default.
-- Verified before this migration: no client-side (browser/mobile) code
-- queries these tables directly.

-- 1. Tables exposed via PostgREST with RLS disabled entirely.
--    api_keys is the worst: with default grants, anyone holding the public
--    anon key could read key hashes or INSERT a key for an arbitrary org.
alter table public.email_send_log enable row level security;
alter table public.report_folders enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.api_keys enable row level security;
alter table public.receipt_templates enable row level security;
alter table public.org_donation_options enable row level security;

-- 2. saved_reports had an ALL policy with USING(true)/WITH CHECK(true) for
--    authenticated — any signed-in user could read/write every org's saved
--    reports via PostgREST. Service role bypasses RLS, so the app keeps
--    working; direct PostgREST access becomes deny-by-default like the rest.
drop policy if exists "Enable access for authenticated users" on public.saved_reports;

-- 3. SECURITY DEFINER functions callable by anon/authenticated via
--    /rest/v1/rpc. match_donors takes an arbitrary p_org_id — callable
--    cross-org with the public anon key, leaking donor embeddings. Only the
--    service role needs these. (user_org_membership is intentionally LEFT
--    executable: it backs the RLS policies on donors/donations/etc., and it
--    only reveals whether the *caller* belongs to a given org, not data.)
revoke execute on function public.match_donors(vector, double precision, integer) from anon, authenticated;
revoke execute on function public.match_donors(vector, double precision, integer, uuid) from anon, authenticated;
revoke execute on function public.clear_donor_assignments_on_member_removal() from anon, authenticated;

-- 4. Pin search_path on flagged functions (mutable-search-path lint).
alter function public.update_organizations_updated_at() set search_path = '';
alter function public.set_organizations_updated_at() set search_path = '';
alter function public.match_donors(vector, double precision, integer) set search_path = '';
alter function public.match_donors(vector, double precision, integer, uuid) set search_path = '';
alter function public.report_retention_rate(uuid, date, date, date, date) set search_path = '';
alter function public.report_acquisition_rate(uuid, date, date) set search_path = '';
alter function public.report_recapture(uuid, date, date, integer, integer) set search_path = '';
alter function public.report_new_leads_by_source(uuid, date, date) set search_path = '';
alter function public.clear_donor_assignments_on_member_removal() set search_path = '';

-- 5. org-logos is a public bucket; object URLs work without a listing
--    policy. Drop the broad SELECT policy that allowed enumerating files.
drop policy if exists "Public read access on org-logos" on storage.objects;

-- 6. The anon/authenticated revoke above is ineffective on its own because
--    EXECUTE is granted to PUBLIC (which those roles inherit). Revoke PUBLIC;
--    service_role keeps its explicit grant so the app's admin client still
--    works, and clear_donor_assignments is a trigger fn (grants don't gate it).
revoke execute on function public.match_donors(vector, double precision, integer) from public;
revoke execute on function public.match_donors(vector, double precision, integer, uuid) from public;
revoke execute on function public.clear_donor_assignments_on_member_removal() from public;
