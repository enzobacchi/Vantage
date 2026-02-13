-- Add household_greeting for joint names (e.g. "Timothy and Erin").
alter table public.donors
  add column if not exists household_greeting text;

comment on column public.donors.household_greeting is 'Household/joint greeting when name contains "and" or "&" (e.g. "Timothy and Erin").';

-- Fix city/state mixups: where state was incorrectly populated with a city name
-- (e.g. state = 'Eau Claire'), move it to city and clear state.
-- US state abbreviations are 2 characters; city names are typically longer or different pattern.
update public.donors
set
  city = coalesce(nullif(trim(city), ''), trim(state)),
  state = null
where state is not null
  and trim(state) <> ''
  and length(trim(state)) <> 2
  and trim(upper(state)) not similar to '^[A-Z]{2}$';
