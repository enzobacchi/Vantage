/**
 * Features that can be switched on per organisation (design-partner rollout).
 *
 * Rollout path for a feature:
 *   1. add it here with `onForEveryone: false`  → off for everyone
 *   2. switch it on for named partner orgs      → rows in `org_features`
 *   3. set `onForEveryone: true`                → on for everyone
 *   4. delete the entry and its checks          → it is just part of the product
 *
 * Global, environment-level switches (email, transcription) stay in
 * `lib/features.ts`; this file is only for per-organisation rollout.
 */
export const ORG_FEATURES = {
  touchpoint_meter: {
    label: "Touchpoint meter",
    description: "Per-donor meter that fills with touchpoints and shows who is ready for an ask.",
    onForEveryone: false,
  },
  quick_log: {
    label: "Quick log",
    description: "Log a touchpoint in a couple of taps, or by typing or speaking a sentence.",
    onForEveryone: false,
  },
  giving_pacing: {
    label: "Giving pacing",
    description: "Year-over-year pacing and key giving metrics on Home.",
    onForEveryone: false,
  },
} as const satisfies Record<string, { label: string; description: string; onForEveryone: boolean }>

export type OrgFeatureKey = keyof typeof ORG_FEATURES

export const ORG_FEATURE_KEYS = Object.keys(ORG_FEATURES) as OrgFeatureKey[]

export function isOrgFeatureKey(key: string): key is OrgFeatureKey {
  return Object.prototype.hasOwnProperty.call(ORG_FEATURES, key)
}
