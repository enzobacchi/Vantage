import crypto from "node:crypto"

import type { ValidatedFilterRow } from "./filter-schema"

export type SaveTokenPayload = {
  orgId: string
  userId: string
  title: string
  summary: string
  filters: ValidatedFilterRow[]
  selectedColumns: string[]
  exp: number
}

const TTL_MS = 120_000

function getSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign save tokens")
  }
  return secret
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64")
}

export function signSaveToken(
  payload: Omit<SaveTokenPayload, "exp">
): string {
  const full: SaveTokenPayload = { ...payload, exp: Date.now() + TTL_MS }
  const body = base64url(Buffer.from(JSON.stringify(full), "utf8"))
  const sig = base64url(
    crypto.createHmac("sha256", getSecret()).update(body).digest()
  )
  return `${body}.${sig}`
}

export function verifySaveToken(token: string): SaveTokenPayload {
  const parts = token.split(".")
  if (parts.length !== 2) throw new Error("malformed_token")
  const [body, sig] = parts

  const expected = base64url(
    crypto.createHmac("sha256", getSecret()).update(body).digest()
  )
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("bad_signature")
  }

  const payload = JSON.parse(fromBase64url(body).toString("utf8")) as SaveTokenPayload
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
    throw new Error("expired_token")
  }
  return payload
}
