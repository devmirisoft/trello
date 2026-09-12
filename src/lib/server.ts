// Server-only: Mongo connection, passcode hashing, and the session cookie.
// Kept in one file because it is all the backend this app has.

import { cookies } from "next/headers";
import { MongoClient, Collection, ObjectId } from "mongodb";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { TrelloConfig } from "./types";

export type UserDoc = {
  _id?: ObjectId;
  username: string;
  passcodeHash: string;
  trello: TrelloConfig | null;
  createdAt: Date;
};

const COOKIE = "trello-snap-session";
const SESSION_DAYS = 180;

/** Thrown when required config is absent, so routes can name the variable
 * instead of failing with an opaque driver/crypto error. */
export class EnvError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new EnvError(
      `Missing required environment variable ${name} — set it in .env.local (see .env.local.example).`
    );
  }
  return value;
}

/** Wraps a route handler so a missing env var becomes a readable JSON 500
 * and anything else becomes a generic one (no driver internals leaked). */
export async function jsonRoute(
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof EnvError) {
      return Response.json({ error: err.message }, { status: 500 });
    }
    console.error(err);
    return Response.json({ error: "Server error." }, { status: 500 });
  }
}

// --- Mongo -----------------------------------------------------------------

// The connect() promise is cached on globalThis so dev hot-reloads and warm
// serverless invocations reuse one pool instead of opening a connection per
// request.
const cache = globalThis as typeof globalThis & {
  _mongo?: Promise<MongoClient>;
  _usersIndex?: Promise<string>;
};

export async function usersCollection(): Promise<Collection<UserDoc>> {
  const uri = requireEnv("MONGODB_URI");
  // A rejected promise is not nullish, so ??= would cache the failure: one
  // transient DNS/network blip would poison every later request until restart.
  cache._mongo ??= new MongoClient(uri).connect().catch((err) => {
    cache._mongo = undefined;
    throw err;
  });
  const client = await cache._mongo;
  const users = client
    .db(process.env.MONGODB_DB || "trello-snap")
    .collection<UserDoc>("users");
  cache._usersIndex ??= users
    .createIndex({ username: 1 }, { unique: true })
    .catch((err) => {
      cache._usersIndex = undefined;
      throw err;
    });
  await cache._usersIndex;
  return users;
}

// --- Passcodes -------------------------------------------------------------

// ponytail: scryptSync blocks the event loop for ~50ms per sign-in. Swap for
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
  const actual = scryptSync(passcode, Buffer.from(salt, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- Session cookie --------------------------------------------------------

// A JWT-shaped HMAC token: base64url(payload).base64url(hmac). Stateless, so
// there is no sessions collection to keep tidy.

function mac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function setSessionCookie(username: string) {
  const secret = requireEnv("SESSION_SECRET");
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_DAYS * 86400_000 })
  ).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${mac(payload, secret)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in username, or null if the cookie is absent, tampered with,
 * or expired. */
export async function sessionUsername(): Promise<string | null> {
  const secret = requireEnv("SESSION_SECRET");
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(mac(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const { u, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );
    if (typeof u !== "string" || typeof exp !== "number") return null;
    return exp > Date.now() ? u : null;
  } catch {
    return null;
  }
}
