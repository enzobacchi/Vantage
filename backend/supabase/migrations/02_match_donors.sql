-- Vector similarity search for donors
-- Uses cosine distance operator: <=> (pgvector)

create or replace function public.match_donors(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
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
  order by d.embedding <=> query_embedding asc
  limit match_count;
$$;

