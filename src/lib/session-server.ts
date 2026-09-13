// The session as a server *component* sees it. Split from lib/server.ts so
// route handlers — and the tests that call them as plain functions — never
// pull in next/headers.

import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";
import { findUserById, requireCreds, type UserDoc } from "./server";

export async function currentUser(): Promise<UserDoc | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = await verifySession(token);
  return userId ? findUserById(userId) : null;
}

/** The signed-in user and their decrypted Trello credentials, for a page that
 * has already checked both are present. */
export async function currentCreds(user: UserDoc) {
  return requireCreds(user);
}
