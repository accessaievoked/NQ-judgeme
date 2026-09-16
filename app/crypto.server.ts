import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION_PREFIX = "v1";

let cachedKey: Buffer | undefined;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be a base64-encoded 32-byte key (AES-256)",
    );
  }

  cachedKey = key;
  return key;
}

/** Encrypts a plaintext string with AES-256-GCM. Never call with secrets that shouldn't be persisted. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a value produced by `encrypt`. Values that don't carry our version
 * prefix are returned unchanged, so pre-existing plaintext rows keep working
 * until they're rewritten (and re-encrypted) by the app.
 */
export function decrypt(value: string): string {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    return value;
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
