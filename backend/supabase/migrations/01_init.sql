-- MissionMind MVP schema (Phase 2)
-- Tables: organizations, donors, donations

create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text,
  qb_realm_id text unique,
  qb_access_token text,
  qb_refresh_token text
);

create table if not exists public.donors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
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
  unique (org_id, qb_customer_id)
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.donors(id),
  amount numeric,
  date date,
  memo text
);

