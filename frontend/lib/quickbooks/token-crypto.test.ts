import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";

import { decryptQbToken, encryptQbToken } from "./token-crypto";

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

describe("QB token encryption at rest", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("round-trips a token", () => {
    const token = "AB11700000000XYZrefreshtokenvalue";
    const stored = encryptQbToken(token);
    expect(stored).not.toBe(token);
    expect(stored.split(":")).toHaveLength(3);
    expect(decryptQbToken(stored)).toBe(token);
  });

  it("produces fresh ciphertext per write (no equality between blobs)", () => {
    const token = "same-token";
    expect(encryptQbToken(token)).not.toBe(encryptQbToken(token));
  });

  it("falls back to plaintext for legacy unencrypted rows", () => {
    expect(decryptQbToken("legacy-plaintext-refresh-token")).toBe(
      "legacy-plaintext-refresh-token"
    );
  });

  it("returns null for empty/missing stored values", () => {
    expect(decryptQbToken(null)).toBeNull();
    expect(decryptQbToken(undefined)).toBeNull();
    expect(decryptQbToken("")).toBeNull();
  });

  it("stores plaintext (not a crash) when ENCRYPTION_KEY is absent", () => {
    delete process.env.ENCRYPTION_KEY;
    const token = "token-without-key";
    expect(encryptQbToken(token)).toBe(token);
    expect(decryptQbToken(token)).toBe(token);
  });

  it("returns stored value unchanged when the key was rotated (decrypt fails)", () => {
    const stored = encryptQbToken("secret");
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    // Wrong key: GCM auth fails — treated as legacy plaintext rather than throwing.
    expect(decryptQbToken(stored)).toBe(stored);
  });
});
