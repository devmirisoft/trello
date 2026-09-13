// Server-only: the Mongo connection, the users collection, and the plumbing
// every API route shares. Kept in one file because it is all the backend
// this app has.

import { MongoClient, Collection, ObjectId } from "mongodb";
import { decrypt, encrypt, type Sealed } from "./crypto";
import { sessionUserId } from "./auth";
import type { TrelloCreds } from "./trello";

/** Encrypted at rest; only ever decrypted immediately before a Trello call. */
export type SealedCreds = { apiKey: Sealed; token: Sealed };

export type UserDoc = {
  _id: ObjectId;
  /** Stored lowercased; the unique index is what makes registration racy-safe. */
  username: string;
  passwordHash: string;
  trello: SealedCreds | null;
  /** The Trello member this account's token belongs to — the default
   * selection on a board, so you see your own cards first. */
  trelloMemberId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Thrown by route code; jsonRoute turns it into the matching JSON response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

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

/** Maps the driver's connection failures to something actionable. Deliberately
 * says nothing that could carry a secret: no URI, no credentials, no hostnames
 * — only what to go and check. */
function describeMongoError(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const code = (err as { code?: number }).code;
  switch (err.name) {
    case "MongoParseError":
      return "MONGODB_URI is not a valid MongoDB connection string.";
    case "MongoInvalidArgumentError":
      // Names the offending option only — never a host or a credential.
      return `MONGODB_URI was rejected by the driver: ${err.message}`;
    case "MongoServerSelectionError":
    case "MongoNetworkError":
    case "MongoNetworkTimeoutError":
      return (
        "Could not reach MongoDB. If this is Atlas, the usual cause is Network " +
        "Access: a serverless deployment connects from changing IPs, so the " +
        "cluster must allow 0.0.0.0/0 (or the platform's ranges). Also confirm " +
        "MONGODB_URI is set in the deployment's environment."
      );
    case "MongoServerError":
      if (code === 18 || code === 8000) {
        return "MongoDB rejected the username or password in MONGODB_URI.";
      }
      return null;
    default:
      return null;
  }
}

/** Wraps a route handler so an expected failure becomes its JSON status and
 * anything else becomes a generic 500 with no driver internals leaked. */
export async function jsonRoute(
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof EnvError) {
      return Response.json({ error: err.message }, { status: 500 });
    }
    console.error(err);
    return Response.json(
      {
        error: describeMongoError(err) ?? "Server error.",
        type: err instanceof Error ? err.name : undefined,
      },
      { status: 500 }
    );
  }
}

// --- Mongo -----------------------------------------------------------------

// Cached on globalThis so dev hot-reloads and warm serverless invocations
// reuse one pool instead of opening a connection per request.
const cache = globalThis as typeof globalThis & {
  _mongo?: Promise<MongoClient>;
  _mongoUri?: string;
  _usersIndexed?: Promise<unknown>;
};

export async function usersCollection(): Promise<Collection<UserDoc>> {
  const uri = requireEnv("MONGODB_URI");
  // Re-connect when the URI changes (tests spin up a fresh in-memory server
  // per file). A rejected promise is not nullish, so ??= alone would cache a
  // transient failure and poison every later request until restart.
  if (cache._mongoUri !== uri) {
    cache._mongo = undefined;
    cache._usersIndexed = undefined;
    cache._mongoUri = uri;
  }
  cache._mongo ??= new MongoClient(uri, { ignoreUndefined: true })
    .connect()
    .catch((err) => {
      cache._mongo = undefined;
      cache._mongoUri = undefined;
      throw err;
    });
  const client = await cache._mongo;
  const col = client
    .db(process.env.MONGODB_DB || "trello-snap")
    .collection<UserDoc>("users");
  cache._usersIndexed ??= col.createIndex({ username: 1 }, { unique: true });
  await cache._usersIndexed;
  return col;
}

export const normalizeUsername = (raw: unknown) =>
  String(raw ?? "")
    .trim()
    .toLowerCase();

export async function findUserById(id: string): Promise<UserDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  return (await usersCollection()).findOne({ _id: new ObjectId(id) });
}

export const findUserByUsername = async (username: string) =>
  (await usersCollection()).findOne({ username: normalizeUsername(username) });

// --- Session ---------------------------------------------------------------

/** The signed-in user, or a 401. Everything keys off `_id`, so a username or
 * password change mid-session changes nothing here. */
export async function requireUser(req: Request): Promise<UserDoc> {
  const userId = await sessionUserId(req);
  const user = userId ? await findUserById(userId) : null;
  if (!user) throw new HttpError(401, "Not signed in.");
  return user;
}

// --- Trello credentials ----------------------------------------------------

export const sealCreds = (creds: TrelloCreds): SealedCreds => ({
  apiKey: encrypt(creds.apiKey),
  token: encrypt(creds.token),
});

/** The calling user's decrypted Trello credentials, or a 400 telling them to
 * connect. The only place plaintext credentials exist, and never in a response. */
export function requireCreds(user: UserDoc): TrelloCreds {
  if (!user.trello) {
    throw new HttpError(400, "Trello not connected.");
  }
  return {
    apiKey: decrypt(user.trello.apiKey),
    token: decrypt(user.trello.token),
  };
}
