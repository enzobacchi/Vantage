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

export function decryptQbToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    // Legacy plaintext row, or ENCRYPTION_KEY missing/rotated.
    return stored;
  }
}
