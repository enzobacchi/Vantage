-- Activity log for donor touchpoints (e.g. logged calls from Magic Actions)
create table if not exists public.donor_notes (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.donors(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists donor_notes_donor_id_idx on public.donor_notes(donor_id);
create index if not exists donor_notes_created_at_idx on public.donor_notes(created_at desc);

comment on table public.donor_notes is 'Activity log entries (e.g. call notes) for donors.';
