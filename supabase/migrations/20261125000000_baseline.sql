


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE OR REPLACE FUNCTION "public"."clear_donor_assignments_on_member_removal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.donors
    set assigned_to = null
    where org_id = old.organization_id
      and assigned_to = old.user_id;
  return old;
end;
$$;


ALTER FUNCTION "public"."clear_donor_assignments_on_member_removal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_usage"("p_org_id" "uuid", "p_metric" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) RETURNS integer
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into public.subscription_usage (org_id, metric, count, period_start, period_end)
  values (p_org_id, p_metric, 1, p_period_start, p_period_end)
  on conflict (org_id, metric, period_start)
  do update set count = public.subscription_usage.count + 1,
                updated_at = now()
  returning count;
$$;


ALTER FUNCTION "public"."increment_usage"("p_org_id" "uuid", "p_metric" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "org_id" "uuid", "qb_customer_id" "text", "display_name" "text", "email" "text", "phone" "text", "billing_address" "text", "location_lat" double precision, "location_lng" double precision, "total_lifetime_value" numeric, "last_donation_date" "date", "embedding" "public"."vector", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_org_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "org_id" "uuid", "qb_customer_id" "text", "display_name" "text", "email" "text", "phone" "text", "billing_address" "text", "location_lat" double precision, "location_lng" double precision, "total_lifetime_value" numeric, "last_donation_date" "date", "embedding" "public"."vector", "similarity" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_org_id" "uuid") IS 'Vector similarity search for donors; p_org_id restricts results to one organization. Pass null to search all (service role only).';



CREATE OR REPLACE FUNCTION "public"."report_acquisition_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  WITH donor_first AS (
    SELECT donor_id, MIN(date) AS first_date
    FROM public.donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
    GROUP BY donor_id
  ),
  current_donors AS (
    SELECT DISTINCT donor_id FROM public.donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN p_period_start AND p_period_end
  ),
  first_time AS (
    SELECT cd.donor_id, df.first_date,
      (SELECT amount FROM public.donations
        WHERE donor_id = cd.donor_id AND org_id = p_org_id AND date = df.first_date
        ORDER BY created_at LIMIT 1) AS first_amount
    FROM current_donors cd
    JOIN donor_first df ON df.donor_id = cd.donor_id
    WHERE df.first_date BETWEEN p_period_start AND p_period_end
  )
  SELECT jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'total_donors_period', (SELECT count(*) FROM current_donors)::int,
    'first_time_count', (SELECT count(*) FROM first_time)::int,
    'rate', CASE WHEN (SELECT count(*) FROM current_donors) = 0 THEN 0
                 ELSE round((SELECT count(*) FROM first_time)::numeric
                            / (SELECT count(*) FROM current_donors)::numeric, 4) END,
    'donors', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'id', d.id,
          'display_name', d.display_name,
          'first_gift_date', ft.first_date,
          'first_gift_amount', ft.first_amount
        ) ORDER BY ft.first_date)
       FROM first_time ft JOIN public.donors d ON d.id = ft.donor_id AND d.org_id = p_org_id),
      '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."report_acquisition_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_new_leads_by_source"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  WITH new_donors AS (
    SELECT id, COALESCE(NULLIF(trim(acquisition_source), ''), 'Unspecified') AS source
    FROM public.donors
    WHERE org_id = p_org_id
      AND created_at::date BETWEEN p_period_start AND p_period_end
  ),
  donor_totals AS (
    SELECT donor_id, COALESCE(SUM(amount), 0)::numeric AS total
    FROM public.donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN p_period_start AND p_period_end
    GROUP BY donor_id
  ),
  joined AS (
    SELECT nd.id, nd.source, COALESCE(dt.total, 0) AS total
    FROM new_donors nd
    LEFT JOIN donor_totals dt ON dt.donor_id = nd.id
  ),
  grouped AS (
    SELECT source, count(*)::int AS donor_count, SUM(total)::numeric AS total_raised
    FROM joined
    GROUP BY source
    ORDER BY donor_count DESC, source ASC
  )
  SELECT jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'total_new_donors', (SELECT count(*) FROM new_donors)::int,
    'total_raised', (SELECT COALESCE(SUM(total), 0)::numeric FROM joined),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(grouped)) FROM grouped), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."report_new_leads_by_source"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_recapture"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_lapsed_window_min_years" integer DEFAULT 3, "p_lapsed_window_max_years" integer DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  WITH params AS (
    SELECT
      (p_period_start - (p_lapsed_window_max_years || ' years')::interval)::date AS window_start,
      (p_period_start - (p_lapsed_window_min_years || ' years')::interval)::date AS window_end,
      (p_period_start - interval '1 year')::date AS lapsed_year_start,
      (p_period_start - interval '1 day')::date AS lapsed_year_end
  ),
  current_period AS (
    SELECT donor_id, SUM(amount) AS amount, MIN(date) AS first_in_period
    FROM public.donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN p_period_start AND p_period_end
    GROUP BY donor_id
  ),
  lapsed_year_donors AS (
    SELECT DISTINCT donor_id FROM public.donations, params
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN params.lapsed_year_start AND params.lapsed_year_end
  ),
  prior_window_max AS (
    SELECT donor_id, MAX(date) AS last_pre_lapsed_gift
    FROM public.donations, params
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN params.window_start AND params.window_end
    GROUP BY donor_id
  ),
  recaptured AS (
    SELECT cp.donor_id, cp.amount AS this_period_amount, cp.first_in_period, p.last_pre_lapsed_gift
    FROM current_period cp
    JOIN prior_window_max p ON p.donor_id = cp.donor_id
    WHERE NOT EXISTS (SELECT 1 FROM lapsed_year_donors l WHERE l.donor_id = cp.donor_id)
  )
  SELECT jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'lapsed_window_min_years', p_lapsed_window_min_years,
    'lapsed_window_max_years', p_lapsed_window_max_years,
    'recaptured_count', (SELECT count(*) FROM recaptured)::int,
    'donors', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'id', d.id,
          'display_name', d.display_name,
          'previous_gift_date', r.last_pre_lapsed_gift,
          'recapture_gift_date', r.first_in_period,
          'recapture_amount', r.this_period_amount
        ) ORDER BY r.this_period_amount DESC NULLS LAST)
       FROM recaptured r JOIN public.donors d ON d.id = r.donor_id AND d.org_id = p_org_id),
      '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."report_recapture"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_lapsed_window_min_years" integer, "p_lapsed_window_max_years" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_retention_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_prior_period_start" "date", "p_prior_period_end" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  WITH prior AS (
    SELECT DISTINCT donor_id FROM public.donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN p_prior_period_start AND p_prior_period_end
  ),
  curr AS (
    SELECT DISTINCT donor_id FROM public.donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN p_period_start AND p_period_end
  ),
  retained AS (
    SELECT donor_id FROM prior INTERSECT SELECT donor_id FROM curr
  ),
  lapsed AS (
    SELECT donor_id FROM prior EXCEPT SELECT donor_id FROM curr
  )
  SELECT jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'prior_period_start', p_prior_period_start,
    'prior_period_end', p_prior_period_end,
    'prior_period_donors', (SELECT count(*) FROM prior)::int,
    'retained_count', (SELECT count(*) FROM retained)::int,
    'lapsed_count', (SELECT count(*) FROM lapsed)::int,
    'rate', CASE WHEN (SELECT count(*) FROM prior) = 0 THEN 0
                 ELSE round((SELECT count(*) FROM retained)::numeric
                            / (SELECT count(*) FROM prior)::numeric, 4) END,
    'retained', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', d.id, 'display_name', d.display_name)
        ORDER BY d.display_name NULLS LAST)
       FROM retained r JOIN public.donors d ON d.id = r.donor_id AND d.org_id = p_org_id),
      '[]'::jsonb),
    'lapsed', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', d.id, 'display_name', d.display_name)
        ORDER BY d.display_name NULLS LAST)
       FROM lapsed l JOIN public.donors d ON d.id = l.donor_id AND d.org_id = p_org_id),
      '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."report_retention_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_prior_period_start" "date", "p_prior_period_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_organizations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_organizations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_consume_email_quota"("p_user_id" "uuid", "p_org_id" "uuid", "p_limit" integer, "p_window" interval) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  used integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(*) into used
  from public.email_send_log
  where user_id = p_user_id
    and sent_at >= now() - p_window;

  if used >= p_limit then
    return false;
  end if;

  insert into public.email_send_log (org_id, user_id, sent_at)
  values (p_org_id, p_user_id, now());

  return true;
end;
$$;


ALTER FUNCTION "public"."try_consume_email_quota"("p_user_id" "uuid", "p_org_id" "uuid", "p_limit" integer, "p_window" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_organizations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_organizations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_org_membership"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_org_membership"("org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_org_membership"("org_id" "uuid") IS 'Returns true if auth.uid() is a member of the given organization; used by RLS policies.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."_backup_donation_option_ids_20260705" (
    "id" "uuid",
    "org_id" "uuid",
    "fund_id" "uuid",
    "campaign_id" "uuid",
    "category_id" "uuid"
);


ALTER TABLE "public"."_backup_donation_option_ids_20260705" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "scopes" "text"[] DEFAULT '{read}'::"text"[] NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "summary" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'New conversation'::"text" NOT NULL,
    "donor_registry" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "tool_invocations" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_history_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."chat_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "tool_calls" "jsonb",
    "tool_call_id" "text",
    "tool_name" "text",
    "donor_references" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text", 'tool'::"text"])))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_pending_writes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "request_id" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "ready" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."chat_pending_writes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_field_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "field_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "options" "jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "custom_field_definitions_field_type_check" CHECK (("field_type" = ANY (ARRAY['text'::"text", 'number'::"text", 'date'::"text", 'select'::"text"])))
);


ALTER TABLE "public"."custom_field_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "show_metric_cards" boolean DEFAULT true NOT NULL,
    "show_smart_actions" boolean DEFAULT true NOT NULL,
    "show_donations_chart" boolean DEFAULT true NOT NULL,
    "show_recent_gifts" boolean DEFAULT true NOT NULL,
    "show_top_donors" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dashboard_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid",
    "amount" numeric,
    "date" "date",
    "memo" "text",
    "org_id" "uuid" NOT NULL,
    "gift_type" "text" DEFAULT 'Gift'::"text" NOT NULL,
    "category_id" "uuid",
    "payment_type_id" "uuid",
    "campaign_id" "uuid",
    "fund_id" "uuid",
    "gift_date" "date",
    "deposit_date" "date",
    "check_number" "text",
    "notes" "text",
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "assigned_to" "uuid",
    "source" "text" DEFAULT 'quickbooks'::"text" NOT NULL,
    "acknowledgment_status" "text" DEFAULT 'not_sent'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "payment_method" "text" DEFAULT 'other'::"text" NOT NULL,
    "acknowledgment_sent_at" timestamp with time zone,
    "acknowledgment_sent_by" "text",
    "pledge_id" "uuid",
    "qb_id" "text",
    "qb_txn_type" "text",
    "qb_sync_status" "text",
    "qb_sync_error" "text",
    "qb_sync_attempts" integer DEFAULT 0 NOT NULL,
    "qb_synced_at" timestamp with time zone,
    CONSTRAINT "donations_acknowledgment_status_check" CHECK (("acknowledgment_status" = ANY (ARRAY['not_sent'::"text", 'draft'::"text", 'sent'::"text", 'not_needed'::"text"]))),
    CONSTRAINT "donations_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['check'::"text", 'cash'::"text", 'zelle'::"text", 'wire'::"text", 'venmo'::"text", 'other'::"text", 'quickbooks'::"text", 'daf'::"text", 'credit_card'::"text", 'debit_card'::"text", 'paypal'::"text", 'ach'::"text", 'bank_transfer'::"text", 'online'::"text"]))),
    CONSTRAINT "donations_qb_sync_status_check" CHECK (("qb_sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'failed'::"text"]))),
    CONSTRAINT "donations_qb_txn_type_check" CHECK (("qb_txn_type" = ANY (ARRAY['SalesReceipt'::"text", 'Invoice'::"text"])))
);


ALTER TABLE "public"."donations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donor_merge_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kept_donor_id" "uuid" NOT NULL,
    "merged_donor_id" "uuid" NOT NULL,
    "merged_donor_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "donations_moved" integer DEFAULT 0 NOT NULL,
    "interactions_moved" integer DEFAULT 0 NOT NULL,
    "notes_moved" integer DEFAULT 0 NOT NULL,
    "tags_moved" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."donor_merge_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donor_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."donor_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."donor_notes" IS 'Activity log entries (e.g. call notes) for donors.';



CREATE TABLE IF NOT EXISTS "public"."donor_tags" (
    "donor_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."donor_tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."donor_tags" IS 'Junction: donors can have many tags.';



CREATE TABLE IF NOT EXISTS "public"."donors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "qb_customer_id" "text",
    "display_name" "text",
    "email" "text",
    "phone" "text",
    "billing_address" "text",
    "location_lat" double precision,
    "location_lng" double precision,
    "total_lifetime_value" numeric,
    "last_donation_date" "date",
    "embedding" "public"."vector"(1536),
    "notes" "text",
    "last_donation_amount" numeric,
    "city" "text",
    "state" "text",
    "zip" "text",
    "household_greeting" "text",
    "first_name" "text",
    "last_name" "text",
    "donor_type" "text" DEFAULT 'individual'::"text" NOT NULL,
    "mailing_address" "text",
    "mailing_city" "text",
    "mailing_state" "text",
    "mailing_zip" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acquisition_source" "text",
    "assigned_to" "uuid",
    "external_id" "text",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "donors_donor_type_check" CHECK (("donor_type" = ANY (ARRAY['individual'::"text", 'corporate'::"text", 'school'::"text", 'church'::"text"])))
);


ALTER TABLE "public"."donors" OWNER TO "postgres";


COMMENT ON COLUMN "public"."donors"."notes" IS 'CRM notes for the donor (editable from donor profile).';



COMMENT ON COLUMN "public"."donors"."city" IS 'Parsed from billing_address (2nd part).';



COMMENT ON COLUMN "public"."donors"."state" IS 'Parsed from billing_address (3rd part, e.g. MI).';



COMMENT ON COLUMN "public"."donors"."zip" IS 'Parsed from billing_address (4th part).';



COMMENT ON COLUMN "public"."donors"."household_greeting" IS 'Household/joint greeting when name contains "and" or "&" (e.g. "Timothy and Erin").';



COMMENT ON COLUMN "public"."donors"."first_name" IS 'First name or joint first names (e.g. "Timothy and Erin") from QuickBooks or parsed from display_name.';



COMMENT ON COLUMN "public"."donors"."last_name" IS 'Last name from QuickBooks FamilyName or last word of display_name.';



CREATE TABLE IF NOT EXISTS "public"."email_send_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."email_send_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gift_campaigns" OWNER TO "postgres";


COMMENT ON TABLE "public"."gift_campaigns" IS 'DEPRECATED 2026-07: replaced by org_donation_options. Kept for rollback; drop after verified syncs.';



CREATE TABLE IF NOT EXISTS "public"."gift_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gift_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."gift_categories" IS 'DEPRECATED 2026-07: replaced by org_donation_options. Kept for rollback; drop after verified syncs.';



CREATE TABLE IF NOT EXISTS "public"."gift_funds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gift_funds" OWNER TO "postgres";


COMMENT ON TABLE "public"."gift_funds" IS 'DEPRECATED 2026-07: replaced by org_donation_options. Kept for rollback; drop after verified syncs.';



CREATE TABLE IF NOT EXISTS "public"."gmail_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "google_email" "text" NOT NULL,
    "access_token_encrypted" "text" NOT NULL,
    "refresh_token_encrypted" "text" NOT NULL,
    "access_token_expires_at" timestamp with time zone,
    "scope" "text" DEFAULT 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email'::"text" NOT NULL,
    "needs_reauth" boolean DEFAULT false NOT NULL,
    "last_send_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gmail_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "direction" "text",
    "subject" "text",
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interactions_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "interactions_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['pending'::"text", 'completed'::"text"])))),
    CONSTRAINT "interactions_type_check" CHECK (("type" = ANY (ARRAY['email'::"text", 'call'::"text", 'meeting'::"text", 'note'::"text", 'task'::"text"])))
);


ALTER TABLE "public"."interactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."interactions" IS 'CRM interactions and tasks per donor (calls, emails, meetings, notes, tasks).';



CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."invitations" IS 'Pending team invites; token used in /join?token=...';



CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email_new_donation" boolean DEFAULT true NOT NULL,
    "email_donor_milestone" boolean DEFAULT true NOT NULL,
    "email_weekly_digest" boolean DEFAULT true NOT NULL,
    "email_team_activity" boolean DEFAULT false NOT NULL,
    "email_system_alerts" boolean DEFAULT true NOT NULL,
    "inapp_new_donation" boolean DEFAULT true NOT NULL,
    "inapp_task_reminders" boolean DEFAULT true NOT NULL,
    "inapp_donor_lapsed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Opportunity'::"text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'identified'::"text" NOT NULL,
    "expected_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "opportunities_status_check" CHECK (("status" = ANY (ARRAY['identified'::"text", 'qualified'::"text", 'solicited'::"text", 'committed'::"text", 'closed_won'::"text", 'closed_lost'::"text"])))
);


ALTER TABLE "public"."opportunities" OWNER TO "postgres";


COMMENT ON TABLE "public"."opportunities" IS 'Pipeline: future asks/pledges; drag through stages (identified -> closed_won/closed_lost).';



CREATE TABLE IF NOT EXISTS "public"."org_donation_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "org_donation_options_type_check" CHECK (("type" = ANY (ARRAY['category'::"text", 'campaign'::"text", 'fund'::"text"])))
);


ALTER TABLE "public"."org_donation_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tos_accepted_at" timestamp with time zone,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."organization_members" IS 'Links authenticated users to organizations; used to scope data by current user.';



COMMENT ON COLUMN "public"."organization_members"."role" IS 'e.g. admin, member.';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "qb_realm_id" "text",
    "qb_access_token" "text",
    "qb_refresh_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_synced_at" timestamp with time zone,
    "website_url" "text",
    "logo_url" "text",
    "tax_id" "text",
    "legal_501c3_wording" "text",
    "onboarding_completed_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "fiscal_year_start_month" smallint DEFAULT 1 NOT NULL,
    "qb_writeback_enabled" boolean DEFAULT false NOT NULL,
    "qb_donation_item_id" "text",
    "qb_needs_reconnect" boolean DEFAULT false NOT NULL,
    "qb_last_sync_error" "text",
    CONSTRAINT "organizations_fiscal_year_start_month_check" CHECK ((("fiscal_year_start_month" >= 1) AND ("fiscal_year_start_month" <= 12)))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."created_at" IS 'Set on insert; used for fallback org lookup (ORDER BY created_at DESC).';



COMMENT ON COLUMN "public"."organizations"."updated_at" IS 'Set on insert/update; used to pick latest org (ORDER BY updated_at DESC).';



COMMENT ON COLUMN "public"."organizations"."last_synced_at" IS 'When the last QuickBooks sync completed; used for incremental sync (MetaData.LastUpdatedTime > last_synced_at).';



COMMENT ON COLUMN "public"."organizations"."qb_needs_reconnect" IS 'True when the last QuickBooks sync failed with an auth/authorization error and the org must re-run the OAuth consent flow. Cleared on a successful sync.';



COMMENT ON COLUMN "public"."organizations"."qb_last_sync_error" IS 'Last QuickBooks sync error message, for display/debugging. Cleared on successful sync.';



CREATE TABLE IF NOT EXISTS "public"."payment_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_types" IS 'DEPRECATED 2026-07: payment method lives on donations.payment_method. Drop with donations.payment_type_id.';



CREATE TABLE IF NOT EXISTS "public"."pledges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "frequency" "text" DEFAULT 'one_time'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pledges_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "pledges_frequency_check" CHECK (("frequency" = ANY (ARRAY['one_time'::"text", 'monthly'::"text", 'quarterly'::"text", 'annual'::"text"]))),
    CONSTRAINT "pledges_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'fulfilled'::"text", 'cancelled'::"text", 'overdue'::"text"])))
);


ALTER TABLE "public"."pledges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "receipt_templates_category_check" CHECK (("category" = ANY (ARRAY['standard'::"text", 'daf'::"text", 'institutional'::"text"])))
);


ALTER TABLE "public"."receipt_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."report_folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT 'list'::"text" NOT NULL,
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_lists" OWNER TO "postgres";


COMMENT ON TABLE "public"."saved_lists" IS 'User-defined donor list views; filters (e.g. status, state) applied in CRM.';



COMMENT ON COLUMN "public"."saved_lists"."filters" IS 'Filter state to apply: e.g. { "status": "lapsed", "state": "FL" }.';



CREATE TABLE IF NOT EXISTS "public"."saved_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "title" "text" NOT NULL,
    "query" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "type" "text" DEFAULT 'CSV'::"text",
    "content" "text",
    "summary" "text",
    "records_count" integer DEFAULT 0,
    "organization_id" "uuid",
    "filter_criteria" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "folder_id" "uuid",
    "created_by_user_id" "uuid",
    "visibility" "text" DEFAULT 'shared'::"text" NOT NULL
);


ALTER TABLE "public"."saved_reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."saved_reports"."query" IS 'SQL or filter description; null for text-to-query reports.';



COMMENT ON COLUMN "public"."saved_reports"."type" IS 'Report type: CSV, QUERY, or static.';



COMMENT ON COLUMN "public"."saved_reports"."content" IS 'Report body (e.g. CSV text).';



COMMENT ON COLUMN "public"."saved_reports"."summary" IS 'Human-readable report criteria (e.g. Donors in Michigan).';



COMMENT ON COLUMN "public"."saved_reports"."records_count" IS 'Number of rows in the report.';



COMMENT ON COLUMN "public"."saved_reports"."organization_id" IS 'Organization that owns this report; required for insert from generate route.';



COMMENT ON COLUMN "public"."saved_reports"."filter_criteria" IS 'JSON criteria for report (e.g. CRM filters: search, tagIds, lifecycleConfig).';



CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "stripe_subscription_id" "text",
    "event_created" timestamp with time zone NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "metric" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscription_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text",
    "plan_id" "text" DEFAULT 'trial'::"text" NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_reminder_sent_at" timestamp with time zone,
    "trial_tier" "text",
    CONSTRAINT "subscriptions_trial_tier_check" CHECK ((("trial_tier" IS NULL) OR ("trial_tier" = ANY (ARRAY['essentials'::"text", 'growth'::"text", 'pro'::"text"]))))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT 'gray'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."tags" IS 'Custom tags per organization (e.g. Board Member, Volunteer).';



CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."tasks" IS 'Per-organization to-do list; scoped by organization_id in API.';



CREATE TABLE IF NOT EXISTS "public"."user_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feedback_type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_feedback_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['bug'::"text", 'feature_request'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."user_feedback" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_feedback" IS 'In-app user feedback (bugs, feature requests, general). Scoped by org; users see only their own submissions.';



COMMENT ON COLUMN "public"."user_feedback"."status" IS 'Internal tracking: new, reviewed, resolved, etc.';



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_history"
    ADD CONSTRAINT "chat_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_pending_writes"
    ADD CONSTRAINT "chat_pending_writes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_field_definitions"
    ADD CONSTRAINT "custom_field_definitions_org_id_key_key" UNIQUE ("org_id", "key");



ALTER TABLE ONLY "public"."custom_field_definitions"
    ADD CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_preferences"
    ADD CONSTRAINT "dashboard_preferences_org_id_user_id_key" UNIQUE ("org_id", "user_id");



ALTER TABLE ONLY "public"."dashboard_preferences"
    ADD CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_donor_id_memo_unique" UNIQUE ("donor_id", "memo");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donor_merge_history"
    ADD CONSTRAINT "donor_merge_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donor_notes"
    ADD CONSTRAINT "donor_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donor_tags"
    ADD CONSTRAINT "donor_tags_pkey" PRIMARY KEY ("donor_id", "tag_id");



ALTER TABLE ONLY "public"."donors"
    ADD CONSTRAINT "donors_org_id_qb_customer_id_key" UNIQUE ("org_id", "qb_customer_id");



ALTER TABLE ONLY "public"."donors"
    ADD CONSTRAINT "donors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_campaigns"
    ADD CONSTRAINT "gift_campaigns_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."gift_campaigns"
    ADD CONSTRAINT "gift_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_categories"
    ADD CONSTRAINT "gift_categories_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."gift_categories"
    ADD CONSTRAINT "gift_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_funds"
    ADD CONSTRAINT "gift_funds_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."gift_funds"
    ADD CONSTRAINT "gift_funds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gmail_credentials"
    ADD CONSTRAINT "gmail_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gmail_credentials"
    ADD CONSTRAINT "gmail_credentials_user_id_org_id_key" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_org_id_user_id_key" UNIQUE ("org_id", "user_id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_donation_options"
    ADD CONSTRAINT "org_donation_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_organization_id_key" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_qb_realm_id_key" UNIQUE ("qb_realm_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."payment_types"
    ADD CONSTRAINT "payment_types_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."payment_types"
    ADD CONSTRAINT "payment_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pledges"
    ADD CONSTRAINT "pledges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."receipt_templates"
    ADD CONSTRAINT "receipt_templates_org_id_category_key" UNIQUE ("org_id", "category");



ALTER TABLE ONLY "public"."receipt_templates"
    ADD CONSTRAINT "receipt_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_folders"
    ADD CONSTRAINT "report_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_shares"
    ADD CONSTRAINT "report_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_shares"
    ADD CONSTRAINT "report_shares_report_id_user_id_key" UNIQUE ("report_id", "user_id");



ALTER TABLE ONLY "public"."saved_lists"
    ADD CONSTRAINT "saved_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."subscription_usage"
    ADD CONSTRAINT "subscription_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id");



CREATE INDEX "api_keys_org_idx" ON "public"."api_keys" USING "btree" ("org_id");



CREATE INDEX "chat_pending_writes_org_user_idx" ON "public"."chat_pending_writes" USING "btree" ("org_id", "user_id");



CREATE INDEX "custom_field_definitions_org_idx" ON "public"."custom_field_definitions" USING "btree" ("org_id", "sort_order");



CREATE INDEX "donations_org_donor_date_idx" ON "public"."donations" USING "btree" ("org_id", "donor_id", "date");



CREATE UNIQUE INDEX "donations_org_qb_txn_uniq" ON "public"."donations" USING "btree" ("org_id", "qb_txn_type", "qb_id") WHERE ("qb_id" IS NOT NULL);



CREATE INDEX "donations_qb_push_pending_idx" ON "public"."donations" USING "btree" ("org_id") WHERE ("qb_sync_status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "donor_notes_created_at_idx" ON "public"."donor_notes" USING "btree" ("created_at" DESC);



CREATE INDEX "donor_notes_donor_id_idx" ON "public"."donor_notes" USING "btree" ("donor_id");



CREATE INDEX "donor_tags_donor_id_idx" ON "public"."donor_tags" USING "btree" ("donor_id");



CREATE INDEX "donor_tags_tag_id_idx" ON "public"."donor_tags" USING "btree" ("tag_id");



CREATE INDEX "donors_org_acquisition_source_idx" ON "public"."donors" USING "btree" ("org_id", "acquisition_source");



CREATE INDEX "donors_org_assigned_idx" ON "public"."donors" USING "btree" ("org_id", "assigned_to");



CREATE INDEX "donors_org_created_at_idx" ON "public"."donors" USING "btree" ("org_id", "created_at");



CREATE UNIQUE INDEX "donors_org_external_id_uniq" ON "public"."donors" USING "btree" ("org_id", "external_id") WHERE ("external_id" IS NOT NULL);



CREATE INDEX "email_send_log_org_hour_idx" ON "public"."email_send_log" USING "btree" ("org_id", "sent_at" DESC);



CREATE INDEX "email_send_log_user_hour_idx" ON "public"."email_send_log" USING "btree" ("user_id", "sent_at" DESC);



CREATE INDEX "gmail_credentials_org_idx" ON "public"."gmail_credentials" USING "btree" ("org_id");



CREATE INDEX "gmail_credentials_user_idx" ON "public"."gmail_credentials" USING "btree" ("user_id");



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_logs_org_created" ON "public"."audit_logs" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_user" ON "public"."audit_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_chat_conversations_org_user" ON "public"."chat_conversations" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_chat_history_org_user" ON "public"."chat_history" USING "btree" ("org_id", "user_id", "created_at" DESC);



CREATE INDEX "idx_chat_messages_conversation" ON "public"."chat_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_dashboard_prefs_user" ON "public"."dashboard_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_donations_ack_status" ON "public"."donations" USING "btree" ("org_id", "acknowledgment_status") WHERE ("acknowledgment_status" <> 'not_needed'::"text");



CREATE INDEX "idx_donations_campaign" ON "public"."donations" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "idx_donations_category" ON "public"."donations" USING "btree" ("category_id") WHERE ("category_id" IS NOT NULL);



CREATE INDEX "idx_donations_donor_id" ON "public"."donations" USING "btree" ("donor_id");



CREATE INDEX "idx_donations_donor_id_date" ON "public"."donations" USING "btree" ("donor_id", "date" DESC);



CREATE INDEX "idx_donations_fund" ON "public"."donations" USING "btree" ("fund_id") WHERE ("fund_id" IS NOT NULL);



CREATE INDEX "idx_donations_org_date" ON "public"."donations" USING "btree" ("org_id", "date" DESC);



CREATE INDEX "idx_donations_org_id" ON "public"."donations" USING "btree" ("org_id");



CREATE INDEX "idx_donations_org_source" ON "public"."donations" USING "btree" ("org_id", "source");



CREATE INDEX "idx_donations_payment_type" ON "public"."donations" USING "btree" ("payment_type_id") WHERE ("payment_type_id" IS NOT NULL);



CREATE INDEX "idx_donations_pledge_id" ON "public"."donations" USING "btree" ("pledge_id");



CREATE INDEX "idx_donor_merge_org" ON "public"."donor_merge_history" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_donors_assigned_to" ON "public"."donors" USING "btree" ("assigned_to");



CREATE INDEX "idx_donors_email" ON "public"."donors" USING "btree" ("email");



CREATE INDEX "idx_donors_location" ON "public"."donors" USING "btree" ("location_lat", "location_lng") WHERE (("location_lat" IS NOT NULL) AND ("location_lng" IS NOT NULL));



CREATE INDEX "idx_donors_org_display_name" ON "public"."donors" USING "btree" ("org_id", "display_name");



CREATE INDEX "idx_donors_org_id" ON "public"."donors" USING "btree" ("org_id");



CREATE INDEX "idx_donors_org_last_donation" ON "public"."donors" USING "btree" ("org_id", "last_donation_date" DESC NULLS LAST);



CREATE INDEX "idx_donors_org_lifetime_value" ON "public"."donors" USING "btree" ("org_id", "total_lifetime_value" DESC NULLS LAST);



CREATE INDEX "idx_donors_org_qb_customer" ON "public"."donors" USING "btree" ("org_id", "qb_customer_id");



CREATE INDEX "idx_donors_state" ON "public"."donors" USING "btree" ("state");



CREATE INDEX "idx_donors_zip" ON "public"."donors" USING "btree" ("zip");



CREATE INDEX "idx_gift_campaigns_org" ON "public"."gift_campaigns" USING "btree" ("organization_id", "sort_order");



CREATE INDEX "idx_gift_categories_org" ON "public"."gift_categories" USING "btree" ("organization_id", "sort_order");



CREATE INDEX "idx_gift_funds_org" ON "public"."gift_funds" USING "btree" ("organization_id", "sort_order");



CREATE INDEX "idx_interactions_donor_date" ON "public"."interactions" USING "btree" ("donor_id", "date" DESC);



CREATE INDEX "idx_notification_prefs_user" ON "public"."notification_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_opportunities_org_status" ON "public"."opportunities" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_org_donation_options_org_type" ON "public"."org_donation_options" USING "btree" ("org_id", "type");



CREATE UNIQUE INDEX "idx_org_donation_options_org_type_lower_name" ON "public"."org_donation_options" USING "btree" ("org_id", "type", "lower"("name"));



CREATE UNIQUE INDEX "idx_organizations_qb_realm_id" ON "public"."organizations" USING "btree" ("qb_realm_id") WHERE ("qb_realm_id" IS NOT NULL);



CREATE INDEX "idx_payment_types_org" ON "public"."payment_types" USING "btree" ("organization_id", "sort_order");



CREATE INDEX "idx_pledges_donor_id" ON "public"."pledges" USING "btree" ("donor_id");



CREATE INDEX "idx_pledges_org_id" ON "public"."pledges" USING "btree" ("org_id");



CREATE INDEX "idx_pledges_status" ON "public"."pledges" USING "btree" ("status");



CREATE INDEX "idx_receipt_templates_org_id" ON "public"."receipt_templates" USING "btree" ("org_id");



CREATE INDEX "idx_report_shares_report" ON "public"."report_shares" USING "btree" ("report_id");



CREATE INDEX "idx_report_shares_user" ON "public"."report_shares" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_subscription_usage_unique" ON "public"."subscription_usage" USING "btree" ("org_id", "metric", "period_start");



CREATE UNIQUE INDEX "idx_subscriptions_org_id" ON "public"."subscriptions" USING "btree" ("org_id");



CREATE INDEX "idx_subscriptions_stripe_id" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_subscriptions_trial_reminder_pending" ON "public"."subscriptions" USING "btree" ("trial_ends_at") WHERE (("status" = 'trialing'::"text") AND ("trial_reminder_sent_at" IS NULL));



CREATE INDEX "interactions_created_at_idx" ON "public"."interactions" USING "btree" ("created_at" DESC);



CREATE INDEX "interactions_date_idx" ON "public"."interactions" USING "btree" ("date" DESC);



CREATE INDEX "interactions_donor_id_idx" ON "public"."interactions" USING "btree" ("donor_id");



CREATE INDEX "invitations_expires_at_idx" ON "public"."invitations" USING "btree" ("expires_at");



CREATE INDEX "invitations_organization_id_idx" ON "public"."invitations" USING "btree" ("organization_id");



CREATE INDEX "invitations_token_idx" ON "public"."invitations" USING "btree" ("token");



CREATE INDEX "opportunities_donor_id_idx" ON "public"."opportunities" USING "btree" ("donor_id");



CREATE INDEX "opportunities_organization_id_idx" ON "public"."opportunities" USING "btree" ("organization_id");



CREATE INDEX "opportunities_status_idx" ON "public"."opportunities" USING "btree" ("status");



CREATE INDEX "organization_members_organization_id_idx" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "organization_members_user_id_idx" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "push_tokens_org_idx" ON "public"."push_tokens" USING "btree" ("org_id");



CREATE INDEX "push_tokens_user_idx" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "report_folders_organization_id_idx" ON "public"."report_folders" USING "btree" ("organization_id");



CREATE INDEX "saved_lists_created_at_idx" ON "public"."saved_lists" USING "btree" ("created_at" DESC);



CREATE INDEX "saved_lists_organization_id_idx" ON "public"."saved_lists" USING "btree" ("organization_id");



CREATE INDEX "saved_reports_folder_id_idx" ON "public"."saved_reports" USING "btree" ("folder_id");



CREATE INDEX "saved_reports_organization_id_idx" ON "public"."saved_reports" USING "btree" ("organization_id");



CREATE INDEX "stripe_webhook_events_sub_created_idx" ON "public"."stripe_webhook_events" USING "btree" ("stripe_subscription_id", "event_created" DESC);



CREATE INDEX "tags_organization_id_idx" ON "public"."tags" USING "btree" ("organization_id");



CREATE INDEX "tasks_created_at_idx" ON "public"."tasks" USING "btree" ("created_at" DESC);



CREATE INDEX "tasks_organization_id_idx" ON "public"."tasks" USING "btree" ("organization_id");



CREATE INDEX "user_feedback_created_at_idx" ON "public"."user_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "user_feedback_organization_id_idx" ON "public"."user_feedback" USING "btree" ("organization_id");



CREATE INDEX "user_feedback_user_id_idx" ON "public"."user_feedback" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "on_org_member_delete_clear_assignments" AFTER DELETE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."clear_donor_assignments_on_member_removal"();



CREATE OR REPLACE TRIGGER "organizations_updated_at_trigger" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_organizations_updated_at"();



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_history"
    ADD CONSTRAINT "chat_history_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_pending_writes"
    ADD CONSTRAINT "chat_pending_writes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_pending_writes"
    ADD CONSTRAINT "chat_pending_writes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_field_definitions"
    ADD CONSTRAINT "custom_field_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_preferences"
    ADD CONSTRAINT "dashboard_preferences_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."org_donation_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."org_donation_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "public"."org_donation_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_payment_type_id_fkey" FOREIGN KEY ("payment_type_id") REFERENCES "public"."payment_types"("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_pledge_id_fkey" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donor_merge_history"
    ADD CONSTRAINT "donor_merge_history_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donor_notes"
    ADD CONSTRAINT "donor_notes_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donor_tags"
    ADD CONSTRAINT "donor_tags_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donor_tags"
    ADD CONSTRAINT "donor_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donors"
    ADD CONSTRAINT "donors_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donors"
    ADD CONSTRAINT "donors_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gift_campaigns"
    ADD CONSTRAINT "gift_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gift_categories"
    ADD CONSTRAINT "gift_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gift_funds"
    ADD CONSTRAINT "gift_funds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gmail_credentials"
    ADD CONSTRAINT "gmail_credentials_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gmail_credentials"
    ADD CONSTRAINT "gmail_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_donation_options"
    ADD CONSTRAINT "org_donation_options_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_types"
    ADD CONSTRAINT "payment_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pledges"
    ADD CONSTRAINT "pledges_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pledges"
    ADD CONSTRAINT "pledges_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipt_templates"
    ADD CONSTRAINT "receipt_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_folders"
    ADD CONSTRAINT "report_folders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_shares"
    ADD CONSTRAINT "report_shares_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."saved_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_lists"
    ADD CONSTRAINT "saved_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."report_folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_usage"
    ADD CONSTRAINT "subscription_usage_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Service role full access to tasks" ON "public"."tasks" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can delete donations for donors in their org" ON "public"."donations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donations"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can delete donor_notes for donors in their org" ON "public"."donor_notes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donor_notes"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can delete donor_tags for donors in their org" ON "public"."donor_tags" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donor_tags"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can delete donors in their org" ON "public"."donors" FOR DELETE USING ("public"."user_org_membership"("org_id"));



CREATE POLICY "Users can delete interactions for donors in their org" ON "public"."interactions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "interactions"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can delete opportunities in their org" ON "public"."opportunities" FOR DELETE USING ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can delete pledges in their org" ON "public"."pledges" FOR DELETE USING ("public"."user_org_membership"("org_id"));



CREATE POLICY "Users can delete saved_lists in their org" ON "public"."saved_lists" FOR DELETE USING ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can delete tags in their org" ON "public"."tags" FOR DELETE USING ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can insert donations for donors in their org" ON "public"."donations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donations"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can insert donor_notes for donors in their org" ON "public"."donor_notes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donor_notes"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can insert donor_tags for donors in their org" ON "public"."donor_tags" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donor_tags"."donor_id") AND "public"."user_org_membership"("d"."org_id")))) AND (EXISTS ( SELECT 1
   FROM "public"."tags" "t"
  WHERE (("t"."id" = "donor_tags"."tag_id") AND "public"."user_org_membership"("t"."organization_id"))))));



CREATE POLICY "Users can insert donors in their org" ON "public"."donors" FOR INSERT WITH CHECK ("public"."user_org_membership"("org_id"));



CREATE POLICY "Users can insert feedback for their org" ON "public"."user_feedback" FOR INSERT WITH CHECK (("public"."user_org_membership"("organization_id") AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "Users can insert interactions for donors in their org" ON "public"."interactions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "interactions"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can insert opportunities in their org" ON "public"."opportunities" FOR INSERT WITH CHECK ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can insert pledges in their org" ON "public"."pledges" FOR INSERT WITH CHECK ("public"."user_org_membership"("org_id"));



CREATE POLICY "Users can insert saved_lists in their org" ON "public"."saved_lists" FOR INSERT WITH CHECK ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can insert tags in their org" ON "public"."tags" FOR INSERT WITH CHECK ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can read own memberships" ON "public"."organization_members" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can select donations for donors in their org" ON "public"."donations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donations"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can select donor_notes for donors in their org" ON "public"."donor_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donor_notes"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can select donor_tags for donors in their org" ON "public"."donor_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donor_tags"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can select donors in their org" ON "public"."donors" FOR SELECT USING ("public"."user_org_membership"("org_id"));



CREATE POLICY "Users can select interactions for donors in their org" ON "public"."interactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "interactions"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can select opportunities in their org" ON "public"."opportunities" FOR SELECT USING ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can select organizations they belong to" ON "public"."organizations" FOR SELECT USING ("public"."user_org_membership"("id"));



CREATE POLICY "Users can select own feedback" ON "public"."user_feedback" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can select pledges in their org" ON "public"."pledges" FOR SELECT USING ("public"."user_org_membership"("org_id"));



CREATE POLICY "Users can select saved_lists in their org" ON "public"."saved_lists" FOR SELECT USING ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can select tags in their org" ON "public"."tags" FOR SELECT USING ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can update donations for donors in their org" ON "public"."donations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donations"."donor_id") AND "public"."user_org_membership"("d"."org_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donations"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can update donor_notes for donors in their org" ON "public"."donor_notes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donor_notes"."donor_id") AND "public"."user_org_membership"("d"."org_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "donor_notes"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can update donors in their org" ON "public"."donors" FOR UPDATE USING ("public"."user_org_membership"("org_id")) WITH CHECK ("public"."user_org_membership"("org_id"));



CREATE POLICY "Users can update interactions for donors in their org" ON "public"."interactions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "interactions"."donor_id") AND "public"."user_org_membership"("d"."org_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."donors" "d"
  WHERE (("d"."id" = "interactions"."donor_id") AND "public"."user_org_membership"("d"."org_id")))));



CREATE POLICY "Users can update opportunities in their org" ON "public"."opportunities" FOR UPDATE USING ("public"."user_org_membership"("organization_id")) WITH CHECK ("public"."user_org_membership"("organization_id"));



CREATE POLICY "Users can update pledges in their org" ON "public"."pledges" FOR UPDATE USING ("public"."user_org_membership"("org_id")) WITH CHECK ("public"."user_org_membership"("org_id"));



CREATE POLICY "Users can update tags in their org" ON "public"."tags" FOR UPDATE USING ("public"."user_org_membership"("organization_id")) WITH CHECK ("public"."user_org_membership"("organization_id"));



ALTER TABLE "public"."_backup_donation_option_ids_20260705" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_pending_writes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_field_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donor_merge_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donor_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donor_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_send_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gift_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gift_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gift_funds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gmail_credentials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gmail_credentials_admin_read" ON "public"."gmail_credentials" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."organization_id" = "gmail_credentials"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "gmail_credentials_self_read" ON "public"."gmail_credentials" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_donation_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pledges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipt_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_feedback" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_donor_assignments_on_member_removal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_donor_assignments_on_member_removal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_usage"("p_org_id" "uuid", "p_metric" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."report_acquisition_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."report_acquisition_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_acquisition_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."report_new_leads_by_source"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."report_new_leads_by_source"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_new_leads_by_source"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."report_recapture"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_lapsed_window_min_years" integer, "p_lapsed_window_max_years" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."report_recapture"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_lapsed_window_min_years" integer, "p_lapsed_window_max_years" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_recapture"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_lapsed_window_min_years" integer, "p_lapsed_window_max_years" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."report_retention_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_prior_period_start" "date", "p_prior_period_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."report_retention_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_prior_period_start" "date", "p_prior_period_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_retention_rate"("p_org_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_prior_period_start" "date", "p_prior_period_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_organizations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_organizations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_organizations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."try_consume_email_quota"("p_user_id" "uuid", "p_org_id" "uuid", "p_limit" integer, "p_window" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_organizations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_organizations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_organizations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_org_membership"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_org_membership"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_org_membership"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";









GRANT ALL ON TABLE "public"."_backup_donation_option_ids_20260705" TO "anon";
GRANT ALL ON TABLE "public"."_backup_donation_option_ids_20260705" TO "authenticated";
GRANT ALL ON TABLE "public"."_backup_donation_option_ids_20260705" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."chat_conversations" TO "anon";
GRANT ALL ON TABLE "public"."chat_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."chat_history" TO "anon";
GRANT ALL ON TABLE "public"."chat_history" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_history" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_pending_writes" TO "anon";
GRANT ALL ON TABLE "public"."chat_pending_writes" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_pending_writes" TO "service_role";



GRANT ALL ON TABLE "public"."custom_field_definitions" TO "anon";
GRANT ALL ON TABLE "public"."custom_field_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_field_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_preferences" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."donations" TO "anon";
GRANT ALL ON TABLE "public"."donations" TO "authenticated";
GRANT ALL ON TABLE "public"."donations" TO "service_role";



GRANT ALL ON TABLE "public"."donor_merge_history" TO "anon";
GRANT ALL ON TABLE "public"."donor_merge_history" TO "authenticated";
GRANT ALL ON TABLE "public"."donor_merge_history" TO "service_role";



GRANT ALL ON TABLE "public"."donor_notes" TO "anon";
GRANT ALL ON TABLE "public"."donor_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."donor_notes" TO "service_role";



GRANT ALL ON TABLE "public"."donor_tags" TO "anon";
GRANT ALL ON TABLE "public"."donor_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."donor_tags" TO "service_role";



GRANT ALL ON TABLE "public"."donors" TO "anon";
GRANT ALL ON TABLE "public"."donors" TO "authenticated";
GRANT ALL ON TABLE "public"."donors" TO "service_role";



GRANT ALL ON TABLE "public"."email_send_log" TO "anon";
GRANT ALL ON TABLE "public"."email_send_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_send_log" TO "service_role";



GRANT ALL ON TABLE "public"."gift_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."gift_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."gift_categories" TO "anon";
GRANT ALL ON TABLE "public"."gift_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_categories" TO "service_role";



GRANT ALL ON TABLE "public"."gift_funds" TO "anon";
GRANT ALL ON TABLE "public"."gift_funds" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_funds" TO "service_role";



GRANT ALL ON TABLE "public"."gmail_credentials" TO "anon";
GRANT ALL ON TABLE "public"."gmail_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."gmail_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."interactions" TO "anon";
GRANT ALL ON TABLE "public"."interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."interactions" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."opportunities" TO "anon";
GRANT ALL ON TABLE "public"."opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."org_donation_options" TO "anon";
GRANT ALL ON TABLE "public"."org_donation_options" TO "authenticated";
GRANT ALL ON TABLE "public"."org_donation_options" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_types" TO "anon";
GRANT ALL ON TABLE "public"."payment_types" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_types" TO "service_role";



GRANT ALL ON TABLE "public"."pledges" TO "anon";
GRANT ALL ON TABLE "public"."pledges" TO "authenticated";
GRANT ALL ON TABLE "public"."pledges" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_templates" TO "anon";
GRANT ALL ON TABLE "public"."receipt_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_templates" TO "service_role";



GRANT ALL ON TABLE "public"."report_folders" TO "anon";
GRANT ALL ON TABLE "public"."report_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."report_folders" TO "service_role";



GRANT ALL ON TABLE "public"."report_shares" TO "anon";
GRANT ALL ON TABLE "public"."report_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."report_shares" TO "service_role";



GRANT ALL ON TABLE "public"."saved_lists" TO "anon";
GRANT ALL ON TABLE "public"."saved_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_lists" TO "service_role";



GRANT ALL ON TABLE "public"."saved_reports" TO "anon";
GRANT ALL ON TABLE "public"."saved_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_reports" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_usage" TO "anon";
GRANT ALL ON TABLE "public"."subscription_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_usage" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_feedback" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

































-- Production has revoked these default function grants; pg_dump does not emit REVOKEs,
-- so they are restated here to keep a fresh database as locked down as production.
REVOKE ALL ON FUNCTION "public"."clear_donor_assignments_on_member_removal"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."clear_donor_assignments_on_member_removal"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."increment_usage"("p_org_id" "uuid", "p_metric" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) FROM "anon";
REVOKE ALL ON FUNCTION "public"."increment_usage"("p_org_id" "uuid", "p_metric" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_org_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."match_donors"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_org_id" "uuid") FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."try_consume_email_quota"("p_user_id" "uuid", "p_org_id" "uuid", "p_limit" integer, "p_window" interval) FROM "anon";
REVOKE ALL ON FUNCTION "public"."try_consume_email_quota"("p_user_id" "uuid", "p_org_id" "uuid", "p_limit" integer, "p_window" interval) FROM "authenticated";
