-- Organization profile fields for settings

alter table public.organizations
  add column if not exists website_url text,
  add column if not exists logo_url text;
