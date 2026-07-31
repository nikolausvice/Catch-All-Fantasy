import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Derives a stable 32-byte key from AUTH_SECRET so credentials (e.g. ESPN's
 * espn_s2 cookie) can be encrypted at rest without a second secret to manage.
 */
function getKey(): Buffer {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("AUTH_SECRET must be set to store encrypted credentials.");
  }
  return createHash("sha256").update(authSecret).digest();
}

/** Encrypts a plaintext secret for storage. Returns `iv:authTag:ciphertext`, all base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/** Reverses {@link encryptSecret}. */
export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Same as {@link decryptSecret}, but returns null instead of throwing when
 * the value can't be decrypted (e.g. AUTH_SECRET was rotated, or differs
 * between environments sharing one database). Callers should treat null the
 * same as "no stored credential" rather than letting the page crash.
 */
export function tryDecryptSecret(stored: string): string | null {
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}
