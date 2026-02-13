-- Add first_name and last_name for reports and display (e.g. "Timothy and Erin" / "Smith").
alter table public.donors
  add column if not exists first_name text,
  add column if not exists last_name text;

comment on column public.donors.first_name is 'First name or joint first names (e.g. "Timothy and Erin") from QuickBooks or parsed from display_name.';
comment on column public.donors.last_name is 'Last name from QuickBooks FamilyName or last word of display_name.';

-- Backfill from display_name: last word = last_name, rest = first_name.
update public.donors
set
  first_name = case
    when trim(display_name) = '' or display_name is null then null
    when array_length(string_to_array(trim(display_name), ' '), 1) = 1 then trim(display_name)
    else trim(regexp_replace(display_name, '\s+(\S+)$', ''))
  end,
  last_name = case
    when trim(display_name) = '' or display_name is null then null
    when array_length(string_to_array(trim(display_name), ' '), 1) = 1 then null
    else (string_to_array(trim(display_name), ' '))[array_length(string_to_array(trim(display_name), ' '), 1)]
  end
where display_name is not null and trim(display_name) <> '';
