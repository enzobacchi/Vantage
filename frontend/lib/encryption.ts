import crypto from "crypto";

// AES-256-GCM app-layer encryption for secrets stored in the database
// (e.g. Gmail OAuth refresh tokens). Ciphertext format:
//   base64(iv):base64(authTag):base64(ciphertext)
// IV is 12 bytes (GCM standard). Auth tag is 16 bytes.
//
// Key is supplied via the ENCRYPTION_KEY env var as 32 bytes base64-encoded.
// Generate with: openssl rand -base64 32

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to your environment."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Regenerate with \`openssl rand -base64 32\`.`
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decrypt(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext (expected iv:tag:ciphertext)");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
