// Feature flags. Env-var driven so we can toggle per-environment without a deploy.
//
// Client gates use the NEXT_PUBLIC_* variant (exposed to the browser). Server
// gates should prefer the non-public variant so clients can't spoof them via a
// crafted request. Where a user has no business hitting a route at all when the
// feature is off, both sides are checked.

export const emailEnabled =
  process.env.NEXT_PUBLIC_EMAIL_ENABLED === "true"

export const emailEnabledServer =
  process.env.EMAIL_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_EMAIL_ENABLED === "true"
