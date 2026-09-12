import {
  jsonRoute,
  usersCollection,
  hashPasscode,
  verifyPasscode,
  setSessionCookie,
} from "@/lib/server";

export const dynamic = "force-dynamic";

// Combined sign-in / sign-up: the first use of a username claims it, later
// ones have to match the passcode.
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const body = await request.json().catch(() => null);
    const username = String(body?.username ?? "").trim().toLowerCase();
    const passcode = String(body?.passcode ?? "");

    if (username.length < 3 || passcode.length < 4) {
      return Response.json(
        {
          error:
            "Username needs at least 3 characters and the passcode at least 4.",
        },
        { status: 400 }
      );
    }

    const users = await usersCollection();
    const existing = await users.findOne({ username });

    if (existing) {
      if (!verifyPasscode(passcode, existing.passcodeHash)) {
        return Response.json(
          { error: "Wrong passcode for that username." },
          { status: 401 }
        );
      }
      await setSessionCookie(username);
      return Response.json({ username, config: existing.trello ?? null });
    }

    try {
      await users.insertOne({
        username,
        passcodeHash: hashPasscode(passcode),
        trello: null,
        createdAt: new Date(),
      });
    } catch (err) {
      // Unique index lost a race with another sign-up of the same username.
      if ((err as { code?: number }).code === 11000) {
        return Response.json(
          { error: "That username was just taken — try signing in." },
          { status: 409 }
        );
      }
      throw err;
    }

    await setSessionCookie(username);
    return Response.json({ username, config: null, created: true });
  });
}
