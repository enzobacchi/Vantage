import { describe, expect, it } from "vitest"

import { parseAskInput, parseDonorId } from "./ask-input"

describe("parseAskInput", () => {
  it("accepts each outcome", () => {
    expect(parseAskInput({ outcome: { kind: "gave_full" } })?.outcome).toEqual({ kind: "gave_full" })
    expect(
      parseAskInput({ outcome: { kind: "gave_partial", amountAsked: 100, amountGiven: 25 }, note: "ok" })
    ).toEqual({
      outcome: { kind: "gave_partial", amountAsked: 100, amountGiven: 25 },
      amountAsked: null,
      amountGiven: null,
      note: "ok",
    })
    expect(parseAskInput({ outcome: { kind: "declined", adjust: "lower_meter", newFill: 10 } })?.outcome).toEqual({
      kind: "declined",
      adjust: "lower_meter",
      newFill: 10,
    })
    expect(
      parseAskInput({ outcome: { kind: "declined", adjust: "raise_capacity", newCapacity: 190 } })?.outcome
    ).toEqual({ kind: "declined", adjust: "raise_capacity", newCapacity: 190 })
  })

  it("drops smuggled organisation, user and donor fields", () => {
    const parsed = parseAskInput({
      outcome: { kind: "gave_full", orgId: "other-org" },
      orgId: "other-org",
      userId: "someone-else",
      donorId: "another-donor",
      opportunityId: "x",
    })
    expect(parsed).toEqual({ outcome: { kind: "gave_full" }, amountAsked: null, amountGiven: null, note: null })
  })

  it("rejects malformed input", () => {
    for (const bad of [
      null,
      "gave_full",
      {},
      { outcome: { kind: "won_lottery" } },
      { outcome: { kind: "gave_partial", amountAsked: 0, amountGiven: 5 } },
      { outcome: { kind: "gave_partial", amountAsked: "100", amountGiven: 5 } },
      { outcome: { kind: "declined", adjust: "raise_capacity", newCapacity: 12.5 } },
      { outcome: { kind: "declined", adjust: "explode" } },
      { outcome: { kind: "gave_full" }, amountAsked: -1 },
      { outcome: { kind: "gave_full" }, note: 42 },
    ]) {
      expect(parseAskInput(bad)).toBeNull()
    }
  })
})

describe("parseDonorId", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(parseDonorId("118844fa-c09a-4217-bb71-cbebdb2332ae")).toBe("118844fa-c09a-4217-bb71-cbebdb2332ae")
    expect(parseDonorId("1 or 1=1")).toBeNull()
    expect(parseDonorId({ orgId: "x" })).toBeNull()
  })
})
