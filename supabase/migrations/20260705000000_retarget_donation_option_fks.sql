-- Retarget donations option FKs from legacy gift_* tables to org_donation_options.
--
-- Production still carried donations_{fund,campaign,category}_id_fkey -> gift_*,
-- while all writer code validates against org_donation_options, so every QB sync
-- or manual donation carrying a fund designation died with an FK violation.
-- The 20250312 repo migration was a no-op on prod (columns pre-existed with old FKs).
-- Safe to re-run; conditional on gift_* existing (fresh DBs never had them).

alter table donations drop constraint if exists donations_fund_id_fkey;
alter table donations drop constraint if exists donations_campaign_id_fkey;
alter table donations drop constraint if exists donations_category_id_fkey;
-- donations_payment_type_id_fkey intentionally kept; removed with payment_types later.

do $$
declare v_count int;
begin
  if to_regclass('public.gift_funds') is not null then

    -- Rollback snapshot (dropped by the future gift_* cleanup migration).
    create table if not exists _backup_donation_option_ids_20260705 as
      select id, org_id, fund_id, campaign_id, category_id from donations
      where fund_id is not null or campaign_id is not null or category_id is not null;

    -- Ensure every legacy option name exists in org_donation_options (org-preserving).
    insert into org_donation_options (org_id, type, name)
      select organization_id, 'fund', btrim(name) from gift_funds
      where name is not null and btrim(name) <> ''
    on conflict (org_id, type, lower(name)) do nothing;
    insert into org_donation_options (org_id, type, name)
      select organization_id, 'campaign', btrim(name) from gift_campaigns
      where name is not null and btrim(name) <> ''
    on conflict (org_id, type, lower(name)) do nothing;
    insert into org_donation_options (org_id, type, name)
      select organization_id, 'category', btrim(name) from gift_categories
      where name is not null and btrim(name) <> ''
    on conflict (org_id, type, lower(name)) do nothing;

    -- Remap legacy ids -> org_donation_options ids via case-insensitive name join.
    update donations d set fund_id = o.id
    from gift_funds g
    join org_donation_options o on o.org_id = g.organization_id and o.type = 'fund'
      and lower(o.name) = lower(btrim(g.name))
    where d.fund_id = g.id;
    update donations d set campaign_id = o.id
    from gift_campaigns g
    join org_donation_options o on o.org_id = g.organization_id and o.type = 'campaign'
      and lower(o.name) = lower(btrim(g.name))
    where d.campaign_id = g.id;
    update donations d set category_id = o.id
    from gift_categories g
    join org_donation_options o on o.org_id = g.organization_id and o.type = 'category'
      and lower(o.name) = lower(btrim(g.name))
    where d.category_id = g.id;

    comment on table gift_funds      is 'DEPRECATED 2026-07: replaced by org_donation_options. Kept for rollback; drop after verified syncs.';
    comment on table gift_campaigns  is 'DEPRECATED 2026-07: replaced by org_donation_options. Kept for rollback; drop after verified syncs.';
    comment on table gift_categories is 'DEPRECATED 2026-07: replaced by org_donation_options. Kept for rollback; drop after verified syncs.';
    comment on table payment_types   is 'DEPRECATED 2026-07: payment method lives on donations.payment_method. Drop with donations.payment_type_id.';
  end if;

  -- Guard: null anything that still cannot satisfy the new FK (originals kept in backup table).
  update donations d set fund_id = null
  where fund_id is not null and not exists (select 1 from org_donation_options o where o.id = d.fund_id);
  get diagnostics v_count = row_count;
  if v_count > 0 then raise notice 'Nulled % unmappable fund_id values', v_count; end if;
  update donations d set campaign_id = null
  where campaign_id is not null and not exists (select 1 from org_donation_options o where o.id = d.campaign_id);
  get diagnostics v_count = row_count;
  if v_count > 0 then raise notice 'Nulled % unmappable campaign_id values', v_count; end if;
  update donations d set category_id = null
  where category_id is not null and not exists (select 1 from org_donation_options o where o.id = d.category_id);
  get diagnostics v_count = row_count;
  if v_count > 0 then raise notice 'Nulled % unmappable category_id values', v_count; end if;
end $$;

-- Add the correct FKs (validates all rows immediately -- trivial at this size).
alter table donations add constraint donations_fund_id_fkey
  foreign key (fund_id) references org_donation_options(id) on delete set null;
alter table donations add constraint donations_campaign_id_fkey
  foreign key (campaign_id) references org_donation_options(id) on delete set null;
alter table donations add constraint donations_category_id_fkey
  foreign key (category_id) references org_donation_options(id) on delete set null;
