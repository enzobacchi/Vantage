import { describe, expect, it } from "vitest";

import {
  canManageQuickBooks,
  mayBindQuickBooks,
  maySignedOutBindRealm,
} from "./connect-permission";

describe("canManageQuickBooks", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
    ["", false],
    ["Owner", false],
    [null, false],
    [undefined, false],
  ])("role %j -> %s", (role, expected) => {
    expect(canManageQuickBooks(role)).toBe(expected);
  });
});

describe("mayBindQuickBooks", () => {
  it("allows owners and admins to bind tokens to their org", () => {
    expect(mayBindQuickBooks({ role: "owner" })).toBe(true);
    expect(mayBindQuickBooks({ role: "admin" })).toBe(true);
  });

  it("refuses plain members", () => {
    expect(mayBindQuickBooks({ role: "member" })).toBe(false);
  });

  it("refuses a membership with an unknown or missing role", () => {
    expect(mayBindQuickBooks({ role: "viewer" })).toBe(false);
    expect(mayBindQuickBooks({ role: null })).toBe(false);
    expect(mayBindQuickBooks({ role: undefined })).toBe(false);
  });

  it("allows callers with no membership (sign-in-with-QuickBooks / fresh org)", () => {
    expect(mayBindQuickBooks(null)).toBe(true);
  });
});

describe("maySignedOutBindRealm", () => {
  it("allows a realm no org holds yet", () => {
    expect(maySignedOutBindRealm(null)).toBe(true);
  });

  it("allows re-binding an org nobody has claimed", () => {
    expect(maySignedOutBindRealm(0)).toBe(true);
  });

  it("refuses to overwrite tokens on a claimed org", () => {
    expect(maySignedOutBindRealm(1)).toBe(false);
    expect(maySignedOutBindRealm(5)).toBe(false);
  });
});
