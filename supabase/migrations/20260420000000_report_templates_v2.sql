-- Built-in report templates (v2): retention, acquisition, recapture, new leads by source.
-- Adds donors.acquisition_source, donors.created_at, organizations.fiscal_year_start_month.
-- Replaces v1 RPCs with period-based signatures (start/end dates) for fiscal-year flexibility.

ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS acquisition_source text;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month smallint NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12);

UPDATE donors d
SET created_at = COALESCE(
  (SELECT MIN(gi.date)::timestamptz FROM donations gi WHERE gi.donor_id = d.id),
  now()
)
WHERE d.created_at >= now() - interval '5 minutes';

CREATE INDEX IF NOT EXISTS donors_org_created_at_idx ON donors (org_id, created_at);
CREATE INDEX IF NOT EXISTS donors_org_acquisition_source_idx ON donors (org_id, acquisition_source);
CREATE INDEX IF NOT EXISTS donations_org_donor_date_idx ON donations (org_id, donor_id, date);

DROP FUNCTION IF EXISTS report_retention_rate(uuid, int);
DROP FUNCTION IF EXISTS report_acquisition_rate(uuid, int);
DROP FUNCTION IF EXISTS report_recapture(uuid, int);
DROP FUNCTION IF EXISTS report_new_leads_by_source(uuid, int);
DROP FUNCTION IF EXISTS report_lead_conversion(uuid, int);

CREATE OR REPLACE FUNCTION report_retention_rate(
  p_org_id uuid,
  p_period_start date,
  p_period_end date,
  p_prior_period_start date,
  p_prior_period_end date
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH prior AS (
    SELECT DISTINCT donor_id FROM donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN p_prior_period_start AND p_prior_period_end
  ),
  curr AS (
    SELECT DISTINCT donor_id FROM donations
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
       FROM retained r JOIN donors d ON d.id = r.donor_id AND d.org_id = p_org_id),
      '[]'::jsonb),
    'lapsed', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', d.id, 'display_name', d.display_name)
        ORDER BY d.display_name NULLS LAST)
       FROM lapsed l JOIN donors d ON d.id = l.donor_id AND d.org_id = p_org_id),
      '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION report_acquisition_rate(
  p_org_id uuid,
  p_period_start date,
  p_period_end date
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH donor_first AS (
    SELECT donor_id, MIN(date) AS first_date
    FROM donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
    GROUP BY donor_id
  ),
  current_donors AS (
    SELECT DISTINCT donor_id FROM donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN p_period_start AND p_period_end
  ),
  first_time AS (
    SELECT cd.donor_id, df.first_date,
      (SELECT amount FROM donations
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
       FROM first_time ft JOIN donors d ON d.id = ft.donor_id AND d.org_id = p_org_id),
      '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION report_recapture(
  p_org_id uuid,
  p_period_start date,
  p_period_end date,
  p_lapsed_window_min_years int DEFAULT 3,
  p_lapsed_window_max_years int DEFAULT 5
) RETURNS jsonb
LANGUAGE sql
STABLE
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
    FROM donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN p_period_start AND p_period_end
    GROUP BY donor_id
  ),
  lapsed_year_donors AS (
    SELECT DISTINCT donor_id FROM donations, params
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
      AND date BETWEEN params.lapsed_year_start AND params.lapsed_year_end
  ),
  prior_window_max AS (
    SELECT donor_id, MAX(date) AS last_pre_lapsed_gift
    FROM donations, params
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
       FROM recaptured r JOIN donors d ON d.id = r.donor_id AND d.org_id = p_org_id),
      '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION report_new_leads_by_source(
  p_org_id uuid,
  p_period_start date,
  p_period_end date
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH new_donors AS (
    SELECT id, COALESCE(NULLIF(trim(acquisition_source), ''), 'Unspecified') AS source
    FROM donors
    WHERE org_id = p_org_id
      AND created_at::date BETWEEN p_period_start AND p_period_end
  ),
  donor_totals AS (
    SELECT donor_id, COALESCE(SUM(amount), 0)::numeric AS total
    FROM donations
    WHERE org_id = p_org_id AND donor_id IS NOT NULL
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
