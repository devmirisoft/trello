// Server-only: Mongo connection, passcode hashing, and the session cookie.
// Kept in one file because it is all the backend this app has.

import { cookies } from "next/headers";
import { MongoClient, Collection } from "mongodb";
import { randomUUID } from "node:crypto";
import { signToken, verifyToken } from "./passcode";
import type { TrelloConfig } from "./types";

export { hashPasscode, verifyPasscode } from "./passcode";

// Single-tenant: one collection, one row, at a fixed _id. The constant _id is
// what makes a second row impossible — a concurrent first-run insert collides
// on it rather than quietly creating a rival set of credentials.
export const CONFIG_ID = "config";

export type ConfigDoc = {
  _id: string;
  /** Stable unique id for this credential record. Distinct from `_id`, which
   * is the same constant on every install and so identifies nothing. */
  id: string;
  passcodeHash: string;
  /** Deliberately nested in the same document as passcodeHash: the passcode is
   * the only thing that unlocks these, so they are stored and rotated as one
   * record and can never drift apart from the login they belong to. */
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
};

export async function configCollection(): Promise<Collection<ConfigDoc>> {
  const uri = requireEnv("MONGODB_URI");
  // A rejected promise is not nullish, so ??= would cache the failure: one
  // transient DNS/network blip would poison every later request until restart.
  // ignoreUndefined so an unset optional (no board picked yet) is simply
  // absent from the document instead of being stored as an explicit null.
  cache._mongo ??= new MongoClient(uri, { ignoreUndefined: true })
    .connect()
    .catch((err) => {
      cache._mongo = undefined;
      throw err;
    });
  const client = await cache._mongo;
  return client
    .db(process.env.MONGODB_DB || "trello-snap")
    .collection<ConfigDoc>("config");
}

/** The saved document, or null on a fresh install (first run).
 *
 * Backfills `id` on records written before credentials carried one, so every
 * caller can rely on it being present. */
export async function loadConfigDoc(): Promise<ConfigDoc | null> {
  const col = await configCollection();
  const doc = await col.findOne({ _id: CONFIG_ID });
  if (!doc) return null;
  if (doc.id) return doc;

  const id = randomUUID();
  // The filter re-checks absence so a concurrent backfill wins once, not twice.
  const { matchedCount } = await col.updateOne(
    { _id: CONFIG_ID, id: { $exists: false } },
    { $set: { id } }
  );
  if (matchedCount) return { ...doc, id };
  // Someone else backfilled first — re-read so we return their id, not ours.
  return col.findOne({ _id: CONFIG_ID });
}

/** ponytail: randomUUID is unique on its own and the collection holds exactly
 * one row, so no unique index is created for `id`. Add one if this ever grows
 * past a single tenant. */
export function newCredentialId(): string {
  return randomUUID();
}

// --- Session cookie --------------------------------------------------------

export async function setSessionCookie() {
  const secret = requireEnv("SESSION_SECRET");
  (await cookies()).set(COOKIE, signToken(secret, SESSION_DAYS * 86400_000), {
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

/** True when the request carries a cookie this server signed and that has not
 * expired. */
export async function hasSession(): Promise<boolean> {
  const secret = requireEnv("SESSION_SECRET");
  return verifyToken((await cookies()).get(COOKIE)?.value, secret);
}
