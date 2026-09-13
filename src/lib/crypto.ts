// AES-256-GCM for the Trello key/token at rest. Only ever decrypted on the
// server, immediately before a Trello call.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type Sealed = { ciphertext: string; iv: string; authTag: string };

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Missing ENCRYPTION_KEY — set a 32-byte base64 value in .env.local (see .env.local.example)."
    );
  }
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return k;
}

export function encrypt(plaintext: string): Sealed {
  // 12-byte IV is the GCM standard, and a fresh random one per call is what
  // makes two encryptions of the same token differ.
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/** Throws if the ciphertext, IV, tag or key is wrong — GCM authenticates, so
 * tampering fails loudly instead of returning garbage. */
export function decrypt(sealed: Sealed): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(sealed.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return (
    decipher.update(Buffer.from(sealed.ciphertext, "base64")).toString("utf8") +
    decipher.final("utf8")
  );
}
