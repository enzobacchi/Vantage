-- Per-organisation feature switches (design-partner rollout).
-- Additive only. Read and written through the service-role client in
-- frontend/lib/org-features; no direct access for signed-in users.

CREATE TABLE IF NOT EXISTS "public"."org_features" (
    "org_id" "uuid" NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
    "feature_key" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "updated_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    PRIMARY KEY ("org_id", "feature_key")
);

ALTER TABLE "public"."org_features" ENABLE ROW LEVEL SECURITY;

-- Deny by default: no policies, and no table privileges for client roles.
REVOKE ALL ON TABLE "public"."org_features" FROM "anon";
REVOKE ALL ON TABLE "public"."org_features" FROM "authenticated";
GRANT ALL ON TABLE "public"."org_features" TO "service_role";
