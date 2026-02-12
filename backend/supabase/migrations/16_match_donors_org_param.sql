-- Restrict match_donors to a single organization (p_org_id).
-- Callers must pass the current user's org so the DB never returns other orgs' donors.

create or replace function public.match_donors(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_org_id uuid default null
)
returns table (
  id uuid,
  org_id uuid,
  qb_customer_id text,
  display_name text,
  email text,
  phone text,
  billing_address text,
  location_lat double precision,
  location_lng double precision,
  total_lifetime_value numeric,
  last_donation_date date,
  embedding vector(1536),
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.org_id,
    d.qb_customer_id,
    d.display_name,
    d.email,
    d.phone,
    d.billing_address,
    d.location_lat,
    d.location_lng,
    d.total_lifetime_value,
    d.last_donation_date,
    d.embedding,
    (1 - (d.embedding <=> query_embedding))::float as similarity
  from public.donors d
  where d.embedding is not null
    and (1 - (d.embedding <=> query_embedding)) > match_threshold
    and (p_org_id is null or d.org_id = p_org_id)
  order by d.embedding <=> query_embedding asc
  limit match_count;
$$;

comment on function public.match_donors(vector, float, int, uuid) is 'Vector similarity search for donors; p_org_id restricts results to one organization. Pass null to search all (service role only).';
