-- Add notes column to donors for CRM notes
alter table public.donors
  add column if not exists notes text;

comment on column public.donors.notes is 'CRM notes for the donor (editable from donor profile).';
