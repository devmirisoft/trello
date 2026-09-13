// Route handlers are plain (Request) => Response functions — they read the
// session off the raw cookie header and write it back as Set-Cookie — so
// integration tests call them directly, with no Next server to boot.

import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

export type Call = {
  url?: string;
  method?: string;
  body?: unknown;
  cookie?: string;
};

export function req({ url = "http://app.test/", method = "GET", body, cookie }: Call) {
  return new Request(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Next passes dynamic segments as a promise. */
export const ctx = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});

/** The Set-Cookie value a response wrote, in the `name=value` form a later
 * request's Cookie header needs. */
export function cookieFrom(res: Response): string {
  const header = res.headers.get("set-cookie");
  if (!header) throw new Error("Response set no cookie");
  return header.split(";")[0];
}

export const json = <T = Record<string, unknown>>(res: Response) =>
  res.json() as Promise<T>;

// --- In-memory Mongo -------------------------------------------------------

let mongod: MongoMemoryServer | undefined;

/** Boots a throwaway MongoDB and points MONGODB_URI at it. */
export async function startMongo(): Promise<string> {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  return uri;
}

export async function stopMongo() {
  await mongod?.stop();
  mongod = undefined;
}

/** Reads the raw stored documents, to check what actually landed on disk. */
export async function rawUsers() {
  const client = await new MongoClient(process.env.MONGODB_URI!).connect();
  try {
    return await client
      .db(process.env.MONGODB_DB || "trello-snap")
      .collection("users")
      .find({})
      .toArray();
  } finally {
    await client.close();
  }
}

export async function clearUsers() {
  const client = await new MongoClient(process.env.MONGODB_URI!).connect();
  try {
    await client
      .db(process.env.MONGODB_DB || "trello-snap")
      .collection("users")
      .deleteMany({});
  } finally {
    await client.close();
  }
}
