import { encrypt, decrypt } from "@/lib/encryption";

/**
 * QuickBooks OAuth tokens are encrypted at rest with the same AES-256-GCM
 * helper used for Gmail tokens (lib/encryption.ts).
 *
 * Rollout constraints this module absorbs:
 * - Rows written before this shipped hold plaintext tokens, so decryption
 *   falls back to returning the stored value unchanged; each org converges
 *   to encrypted storage on its next token write (OAuth connect or refresh).
 * - Environments without ENCRYPTION_KEY keep writing plaintext (with a
 *   server-side warning) instead of breaking the QB connect/refresh flow.
 */

export function encryptQbToken(token: string): string {
  if (!process.env.ENCRYPTION_KEY) {
    console.warn(
      "[QB] ENCRYPTION_KEY not set — storing QuickBooks tokens unencrypted. " +
        "Generate one with `openssl rand -base64 32` and set it in the environment."
    );
    return token;
  }
  return encrypt(token);
}

// Ciphertext produced by encrypt() has the shape iv:tag:ciphertext (three
// base64 segments). Legacy plaintext tokens never contain ':' segments in that
// shape, so we use it to tell "genuine legacy plaintext" apart from "this looks
// encrypted but failed to decrypt" (missing/rotated ENCRYPTION_KEY, corruption).
// The latter must not fail silently — it means every QB sync for the org breaks
// while returning ciphertext as if it were a token.
function looksEncrypted(value: string): boolean {
  return value.split(":").length === 3;
}

export function decryptQbToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    if (looksEncrypted(stored)) {
      console.error(
        "[QB] Failed to decrypt a stored token that looks encrypted. " +
          "ENCRYPTION_KEY is likely missing, rotated, or corrupted — QuickBooks " +
          "sync will fail for this org until it reconnects."
      );
    }
    // Legacy plaintext row, or an unrecoverable ciphertext (logged above).
    return stored;
  }
}
