// Passwords and the session JWT. Kept free of Next.js and Mongo imports so
// unit tests can exercise it directly.

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const BCRYPT_COST = 10;
const SESSION_DAYS = 30;
export const SESSION_COOKIE = "trello_snap_session";

export const hashPassword = (password: string) =>
  bcrypt.hash(password, BCRYPT_COST);

export const verifyPassword = (password: string, hash: string) =>
  bcrypt.compare(password, hash);

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error(
      "Missing SESSION_SECRET — set it in .env.local (see .env.local.example)."
    );
  }
  return new TextEncoder().encode(value);
}

/** The payload carries the user's `_id` and nothing else. No username, so
 * renaming an account never invalidates a live session. */
export async function signSession(
  userId: string,
  expires = `${SESSION_DAYS}d`
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret());
}

/** The userId, or null for anything we did not sign, tampered with, or expired. */
export async function verifySession(
  token: string | undefined | null
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// --- Cookie plumbing -------------------------------------------------------
// Read off the raw Request and written as a Set-Cookie header rather than via
// next/headers, so every route handler stays a plain function a test can call.

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

function cookieAttrs(maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; ${cookieAttrs(SESSION_DAYS * 86400)}`;

export const clearedSessionCookie = () =>
  `${SESSION_COOKIE}=; ${cookieAttrs(0)}`;

export const sessionUserId = (req: Request) =>
  verifySession(readCookie(req, SESSION_COOKIE));
