-- Add queryable address columns: city, state, zip (parsed from billing_address).
-- Format: "Street, City, State, Zip" (comma-separated, 4 parts).

alter table public.donors
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text;

comment on column public.donors.city is 'Parsed from billing_address (2nd part).';
comment on column public.donors.state is 'Parsed from billing_address (3rd part, e.g. MI).';
comment on column public.donors.zip is 'Parsed from billing_address (4th part).';

-- Backfill: parse existing billing_address. Leave city/state/zip NULL if NULL or not 4 parts.
update public.donors
set
  city = case when trim(split_part(billing_address, ',', 4)) <> '' then trim(split_part(billing_address, ',', 2)) else null end,
  state = case when trim(split_part(billing_address, ',', 4)) <> '' then trim(split_part(billing_address, ',', 3)) else null end,
  zip = case when trim(split_part(billing_address, ',', 4)) <> '' then trim(split_part(billing_address, ',', 4)) else null end
where billing_address is not null;

create index if not exists idx_donors_state on public.donors (state);
create index if not exists idx_donors_zip on public.donors (zip);
