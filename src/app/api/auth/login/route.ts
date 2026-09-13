import {
  hashPassword,
  sessionCookie,
  signSession,
  verifyPassword,
} from "@/lib/auth";
import {
  findUserByUsername,
  HttpError,
  jsonRoute,
  normalizeUsername,
} from "@/lib/server";

export const dynamic = "force-dynamic";

/** One message for both failure modes, so the response cannot be used to
 * discover which usernames exist. */
const WRONG = "Wrong username or password.";

/** A throwaway hash to compare against when the username is unknown, so the
 * reply takes the same time either way and timing cannot enumerate users. */
const DUMMY_HASH_PROMISE = hashPassword("no-such-user-placeholder");

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const body = await request.json().catch(() => null);
    const username = normalizeUsername(body?.username);
    const password = String(body?.password ?? "");

    const user = await findUserByUsername(username);
    const ok = await verifyPassword(
      password,
      user?.passwordHash ?? (await DUMMY_HASH_PROMISE)
    );
    if (!user || !ok) throw new HttpError(401, WRONG);

    const userId = user._id.toHexString();
    return Response.json(
      {
        userId,
        username: user.username,
        trelloConnected: !!user.trello,
      },
      { headers: { "set-cookie": sessionCookie(await signSession(userId)) } }
    );
  });
}
