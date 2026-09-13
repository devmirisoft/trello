// Pure crypto for the passcode and the session token: no Next.js or Mongo
// imports, so `node auth.check.mjs` can exercise it directly.

import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

// ponytail: scryptSync blocks the event loop for ~50ms per unlock. Swap for
// the async scrypt callback if this ever serves more than a handful of people.

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passcode, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPasscode(passcode: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(
    passcode,
    Buffer.from(salt, "base64url"),
    expected.length
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// A JWT-shaped HMAC token: base64url(payload).base64url(hmac). Stateless, so
// there is no sessions collection to keep tidy.
// ponytail: node:crypto HMAC instead of a jose JWT — same signed-cookie
// guarantee, one less dependency. Swap in jose if this ever has to hand a
// token to something that only speaks standard JWT.

function mac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signToken(secret: string, ttlMs: number): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + ttlMs })
  ).toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

/** True only for a token this secret signed that has not expired. */
export function verifyToken(raw: string | undefined, secret: string): boolean {
  if (!raw) return false;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;

  const expected = Buffer.from(mac(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
