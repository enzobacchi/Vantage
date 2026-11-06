import { describe, expect, it, vi } from "vitest"
import type Stripe from "stripe"

import {
  confirmCheckoutSession,
  mapStripeStatus,
  sanitizePlanId,
  subscriptionRowFromStripe,
  type ConfirmCheckoutDeps,
} from "./stripe-subscription-sync"

const ORG = "org-1"

function fakeSub(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    start_date: 1_700_000_000,
    metadata: {},
    items: {
      data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

function fakeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    status: "complete",
    metadata: { org_id: ORG, plan_id: "growth" },
    subscription: fakeSub(),
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

function deps(opts: {
  session?: Stripe.Checkout.Session
  retrieveError?: Error
  linkedSubId?: string | null
}): ConfirmCheckoutDeps & { upsert: ReturnType<typeof vi.fn> } {
  const upsert = vi.fn(async () => {})
  return {
    retrieveSession: async () => {
      if (opts.retrieveError) throw opts.retrieveError
      return opts.session ?? fakeSession()
    },
    readLinkedSubscriptionId: async () => opts.linkedSubId ?? null,
    upsertSubscription: upsert,
    upsert,
  }
}

describe("mapStripeStatus", () => {
  it("passes through known statuses and treats anything else as canceled", () => {
    expect(mapStripeStatus("active")).toBe("active")
    expect(mapStripeStatus("trialing")).toBe("trialing")
    expect(mapStripeStatus("past_due")).toBe("past_due")
    expect(mapStripeStatus("unpaid")).toBe("unpaid")
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled")
  })
})

describe("sanitizePlanId", () => {
  it("only accepts self-serve plans", () => {
    expect(sanitizePlanId("growth")).toBe("growth")
    expect(sanitizePlanId("enterprise")).toBeUndefined()
    expect(sanitizePlanId("trial")).toBeUndefined()
    expect(sanitizePlanId(undefined)).toBeUndefined()
  })
})

describe("subscriptionRowFromStripe", () => {
  it("reads period dates from the first subscription item", () => {
    const row = subscriptionRowFromStripe(ORG, "pro", fakeSub())
    expect(row).toMatchObject({
      org_id: ORG,
      stripe_subscription_id: "sub_1",
      plan_id: "pro",
      status: "active",
      current_period_start: new Date(1_700_000_000 * 1000).toISOString(),
      current_period_end: new Date(1_702_592_000 * 1000).toISOString(),
      cancel_at_period_end: false,
      trial_ends_at: null,
    })
  })

  it("falls back to start_date when items are missing", () => {
    const row = subscriptionRowFromStripe(ORG, "pro", fakeSub({ items: undefined }))
    expect(row.current_period_start).toBe(new Date(1_700_000_000 * 1000).toISOString())
    expect(row.current_period_end).toBeNull()
  })
})

describe("confirmCheckoutSession", () => {
  it("writes the paid plan when the webhook has not landed yet", async () => {
    const d = deps({})
    const result = await confirmCheckoutSession("cs_test_1", ORG, d)
    expect(result).toEqual({ status: "confirmed", planId: "growth" })
    expect(d.upsert).toHaveBeenCalledTimes(1)
    expect(d.upsert.mock.calls[0][0]).toMatchObject({
      org_id: ORG,
      plan_id: "growth",
      status: "active",
      stripe_subscription_id: "sub_1",
    })
  })

  it("does nothing when the webhook already linked this subscription", async () => {
    const d = deps({ linkedSubId: "sub_1" })
    const result = await confirmCheckoutSession("cs_test_1", ORG, d)
    expect(result).toEqual({ status: "already_synced", planId: "growth" })
    expect(d.upsert).not.toHaveBeenCalled()
  })

  it("refuses a checkout session that belongs to another org", async () => {
    const d = deps({ session: fakeSession({ metadata: { org_id: "org-2", plan_id: "growth" } }) })
    const result = await confirmCheckoutSession("cs_test_1", ORG, d)
    expect(result.status).toBe("forbidden")
    expect(d.upsert).not.toHaveBeenCalled()
  })

  it("reports pending when Stripe has not completed the session", async () => {
    const d = deps({ session: fakeSession({ status: "open" }) })
    const result = await confirmCheckoutSession("cs_test_1", ORG, d)
    expect(result.status).toBe("pending")
    expect(d.upsert).not.toHaveBeenCalled()
  })

  it("never resurrects a subscription that is no longer live (old success link)", async () => {
    const d = deps({
      session: fakeSession({ subscription: fakeSub({ status: "canceled" }) }),
      linkedSubId: "sub_newer",
    })
    const result = await confirmCheckoutSession("cs_test_1", ORG, d)
    expect(result.status).toBe("not_live")
    expect(d.upsert).not.toHaveBeenCalled()
  })

  it("rejects malformed ids without calling Stripe", async () => {
    const d = deps({})
    const retrieve = vi.spyOn(d, "retrieveSession")
    const result = await confirmCheckoutSession("not-a-session", ORG, d)
    expect(result.status).toBe("invalid")
    expect(retrieve).not.toHaveBeenCalled()
  })

  it("treats an unknown session id as invalid", async () => {
    const d = deps({ retrieveError: new Error("No such checkout.session") })
    const result = await confirmCheckoutSession("cs_test_missing", ORG, d)
    expect(result.status).toBe("invalid")
  })

  it("rejects a session without a recognised plan", async () => {
    const d = deps({ session: fakeSession({ metadata: { org_id: ORG, plan_id: "enterprise" } }) })
    const result = await confirmCheckoutSession("cs_test_1", ORG, d)
    expect(result.status).toBe("invalid")
    expect(d.upsert).not.toHaveBeenCalled()
  })
})
