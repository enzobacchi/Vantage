-- Touchpoint meter (design-partner feature `touchpoint_meter`).
-- Additive only: new columns on interactions (existing rows keep working,
-- existing writers need no change), three new tables, three functions.
-- All access is through the service-role client; client roles get nothing.

-- ── Touchpoints: organisation, author, kind, points ─────────────────────────
-- `type` keeps its five allowed values (mobile, Scout and the health score
-- depend on them). `touchpoint_type` is the finer-grained kind on top.

ALTER TABLE "public"."interactions"
    ADD COLUMN IF NOT EXISTS "org_id" "uuid" REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS "created_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "touchpoint_type" "text",
    ADD COLUMN IF NOT EXISTS "points" integer DEFAULT 0 NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_points_check') THEN
        ALTER TABLE "public"."interactions"
            ADD CONSTRAINT "interactions_points_check" CHECK ("points" >= 0);
    END IF;
END $$;

-- The donor is the organisation boundary, so org_id is always copied from the
-- donor: writers that don't know about the column still get it right, and a
-- writer can never file a touchpoint under a different organisation.
CREATE OR REPLACE FUNCTION "public"."set_interaction_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    SELECT d."org_id" INTO NEW."org_id" FROM "public"."donors" d WHERE d."id" = NEW."donor_id";
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "public"."set_interaction_org_id"() FROM PUBLIC, "anon", "authenticated";

DROP TRIGGER IF EXISTS "interactions_set_org_id" ON "public"."interactions";
CREATE TRIGGER "interactions_set_org_id"
    BEFORE INSERT OR UPDATE OF "donor_id", "org_id" ON "public"."interactions"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_interaction_org_id"();

UPDATE "public"."interactions" i
SET "org_id" = d."org_id"
FROM "public"."donors" d
WHERE d."id" = i."donor_id" AND i."org_id" IS DISTINCT FROM d."org_id";

CREATE INDEX IF NOT EXISTS "interactions_org_date_idx"
    ON "public"."interactions" USING "btree" ("org_id", "date" DESC);

-- ── Per-organisation touchpoint kinds (overrides and additions) ─────────────
-- Defaults live in code (frontend/lib/meter/rules.ts); a row here replaces the
-- default with the same key or adds a new kind.

CREATE TABLE IF NOT EXISTS "public"."org_touchpoint_kinds" (
    "org_id" "uuid" NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "base_type" "text" NOT NULL,
    "points" integer NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    PRIMARY KEY ("org_id", "key"),
    CONSTRAINT "org_touchpoint_kinds_base_type_check"
        CHECK ("base_type" = ANY (ARRAY['email'::"text", 'call'::"text", 'meeting'::"text", 'note'::"text", 'task'::"text"])),
    CONSTRAINT "org_touchpoint_kinds_points_check" CHECK ("points" >= 0)
);

-- ── One meter per donor ─────────────────────────────────────────────────────
-- The fill is not stored. It is carried_points plus the points of touchpoints
-- logged (created_at) on or after cycle_started_at. Counting by when a
-- touchpoint was logged, not when it happened, means last week's coffee entered
-- today still counts. Both timestamps come from the database clock.

CREATE TABLE IF NOT EXISTS "public"."donor_meters" (
    "donor_id" "uuid" PRIMARY KEY REFERENCES "public"."donors"("id") ON DELETE CASCADE,
    "org_id" "uuid" NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
    "capacity" integer NOT NULL,
    "capacity_source" "text" DEFAULT 'suggested'::"text" NOT NULL,
    "carried_points" integer DEFAULT 0 NOT NULL,
    "cycle_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "donor_meters_capacity_check" CHECK ("capacity" > 0),
    CONSTRAINT "donor_meters_carried_points_check" CHECK ("carried_points" >= 0),
    CONSTRAINT "donor_meters_capacity_source_check"
        CHECK ("capacity_source" = ANY (ARRAY['suggested'::"text", 'manual'::"text"]))
);

CREATE INDEX IF NOT EXISTS "donor_meters_org_idx" ON "public"."donor_meters" USING "btree" ("org_id");

-- ── Asks: what happened each time the meter was used ────────────────────────

CREATE TABLE IF NOT EXISTS "public"."meter_asks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() PRIMARY KEY,
    "org_id" "uuid" NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
    "donor_id" "uuid" NOT NULL REFERENCES "public"."donors"("id") ON DELETE CASCADE,
    "opportunity_id" "uuid" REFERENCES "public"."opportunities"("id") ON DELETE SET NULL,
    "asked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "outcome" "text" NOT NULL,
    "amount_asked" numeric,
    "amount_given" numeric,
    "fill_before" integer NOT NULL,
    "capacity_before" integer NOT NULL,
    "fill_after" integer NOT NULL,
    "capacity_after" integer NOT NULL,
    "note" "text",
    "recorded_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meter_asks_outcome_check"
        CHECK ("outcome" = ANY (ARRAY['gave_full'::"text", 'gave_partial'::"text", 'declined_lower_meter'::"text", 'declined_raise_capacity'::"text"]))
);

CREATE INDEX IF NOT EXISTS "meter_asks_donor_idx" ON "public"."meter_asks" USING "btree" ("donor_id", "asked_at" DESC);
CREATE INDEX IF NOT EXISTS "meter_asks_org_idx" ON "public"."meter_asks" USING "btree" ("org_id", "asked_at" DESC);

-- ── Current fill for every metered donor of an organisation ────────────────

CREATE OR REPLACE FUNCTION "public"."donor_meter_fills"("p_org_id" "uuid")
    RETURNS TABLE("donor_id" "uuid", "capacity" integer, "fill" integer, "cycle_started_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
    SELECT m."donor_id",
           m."capacity",
           (m."carried_points" + COALESCE(SUM(i."points"), 0))::integer AS "fill",
           m."cycle_started_at"
    FROM "public"."donor_meters" m
    LEFT JOIN "public"."interactions" i
           ON i."donor_id" = m."donor_id" AND i."created_at" >= m."cycle_started_at" AND i."points" > 0
    WHERE m."org_id" = "p_org_id"
    GROUP BY m."donor_id", m."capacity", m."carried_points", m."cycle_started_at"
$$;

-- ── Record an ask and move the meter, as one step ───────────────────────────
-- The new state is worked out by the app (frontend/lib/meter/rules.ts) and
-- applied here together with the ask row; the new cycle starts at the database's
-- current time. `p_expected_cycle_started_at` makes
-- a double submit a no-op: the second call no longer matches and raises.

CREATE OR REPLACE FUNCTION "public"."record_meter_ask"(
    "p_org_id" "uuid",
    "p_donor_id" "uuid",
    "p_expected_cycle_started_at" timestamp with time zone,
    "p_outcome" "text",
    "p_amount_asked" numeric,
    "p_amount_given" numeric,
    "p_fill_before" integer,
    "p_new_capacity" integer,
    "p_new_carried_points" integer,
    "p_opportunity_id" "uuid",
    "p_note" "text",
    "p_recorded_by" "uuid"
) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_meter "public"."donor_meters"%ROWTYPE;
    v_ask_id "uuid";
BEGIN
    SELECT * INTO v_meter
    FROM "public"."donor_meters"
    WHERE "donor_id" = "p_donor_id" AND "org_id" = "p_org_id"
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'meter_not_found';
    END IF;
    IF v_meter."cycle_started_at" IS DISTINCT FROM "p_expected_cycle_started_at" THEN
        RAISE EXCEPTION 'meter_changed';
    END IF;

    INSERT INTO "public"."meter_asks" (
        "org_id", "donor_id", "opportunity_id", "asked_at", "outcome", "amount_asked", "amount_given",
        "fill_before", "capacity_before", "fill_after", "capacity_after", "note", "recorded_by"
    ) VALUES (
        "p_org_id", "p_donor_id", "p_opportunity_id", "now"(), "p_outcome", "p_amount_asked", "p_amount_given",
        "p_fill_before", v_meter."capacity", "p_new_carried_points", "p_new_capacity", "p_note", "p_recorded_by"
    ) RETURNING "id" INTO v_ask_id;

    UPDATE "public"."donor_meters"
    SET "capacity" = "p_new_capacity",
        "capacity_source" = CASE WHEN "p_new_capacity" <> v_meter."capacity" THEN 'manual' ELSE "capacity_source" END,
        "carried_points" = "p_new_carried_points",
        "cycle_started_at" = "now"(),
        "updated_by" = "p_recorded_by",
        "updated_at" = "now"()
    WHERE "donor_id" = "p_donor_id";

    RETURN v_ask_id;
END;
$$;

-- ── Access: server only ────────────────────────────────────────────────────

ALTER TABLE "public"."org_touchpoint_kinds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."donor_meters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meter_asks" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."org_touchpoint_kinds" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."donor_meters" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."meter_asks" FROM "anon", "authenticated";
GRANT ALL ON TABLE "public"."org_touchpoint_kinds" TO "service_role";
GRANT ALL ON TABLE "public"."donor_meters" TO "service_role";
GRANT ALL ON TABLE "public"."meter_asks" TO "service_role";

REVOKE ALL ON FUNCTION "public"."donor_meter_fills"("uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."record_meter_ask"("uuid", "uuid", timestamp with time zone, "text", numeric, numeric, integer, integer, integer, "uuid", "text", "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."donor_meter_fills"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_meter_ask"("uuid", "uuid", timestamp with time zone, "text", numeric, numeric, integer, integer, integer, "uuid", "text", "uuid") TO "service_role";
