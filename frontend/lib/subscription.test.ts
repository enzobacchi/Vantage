import { describe, expect, it } from "vitest"
import { PLANS, TRIAL_DURATION_DAYS, getStripePriceId } from "./subscription"

// Canonical pricing — must match the public pricing page
// (Website/vantage_shadcn/components/pricing-cards.tsx). If one side changes,
// the other must change in the same release.
describe("canonical pricing", () => {
  it("matches the public pricing page", () => {
    expect(PLANS.essentials.name).toBe("Starter")
    expect(PLANS.essentials.monthlyPrice).toBe(49)
    expect(PLANS.essentials.annualMonthlyPrice).toBe(39)
    expect(PLANS.growth.monthlyPrice).toBe(99)
    expect(PLANS.growth.annualMonthlyPrice).toBe(79)
    expect(PLANS.pro.monthlyPrice).toBe(179)
    expect(PLANS.pro.annualMonthlyPrice).toBe(143)
  })

  it("trial length matches the public pricing page", () => {
    expect(TRIAL_DURATION_DAYS).toBe(14)
  })

  it("tier caps match the public pricing page", () => {
    expect(PLANS.essentials.maxDonors).toBe(500)
    expect(PLANS.essentials.maxAiInsightsPerMonth).toBe(30)
    expect(PLANS.growth.maxDonors).toBe(2_500)
    expect(PLANS.growth.maxAiInsightsPerMonth).toBe(100)
    expect(PLANS.pro.maxDonors).toBe(10_000)
    expect(PLANS.pro.maxAiInsightsPerMonth).toBe(0) // unlimited
  })
})

describe("getStripePriceId", () => {
  it("selects the monthly or annual env key per interval", () => {
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = "price_monthly_test"
    process.env.STRIPE_PRICE_GROWTH_ANNUAL = "price_annual_test"
    expect(getStripePriceId("growth")).toBe("price_monthly_test")
    expect(getStripePriceId("growth", "monthly")).toBe("price_monthly_test")
    expect(getStripePriceId("growth", "annual")).toBe("price_annual_test")
  })

  it("throws a named error when the env var is missing", () => {
    delete process.env.STRIPE_PRICE_PRO_ANNUAL
    expect(() => getStripePriceId("pro", "annual")).toThrow("STRIPE_PRICE_PRO_ANNUAL")
  })
})
