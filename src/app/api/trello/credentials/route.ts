import {
  HttpError,
  jsonRoute,
  requireUser,
  sealCreds,
  usersCollection,
} from "@/lib/server";
import { TrelloError, verifyCredentials } from "@/lib/trello";

export const dynamic = "force-dynamic";

/** Save this user's Trello key and token, encrypted. Validated against Trello
 * before storing, so a typo fails here rather than on the first card. */
export async function PUT(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser(request);
    const body = await request.json().catch(() => null);
    const apiKey = String(body?.apiKey ?? "").trim();
    const token = String(body?.token ?? "").trim();

    if (!apiKey || !token) {
      throw new HttpError(400, "Both an API key and a token are required.");
    }

    let me: { id: string; username: string };
    try {
      me = await verifyCredentials({ apiKey, token });
    } catch (err) {
      if (err instanceof TrelloError) {
        throw new HttpError(400, "Trello rejected that key and token.");
      }
      throw err;
    }

    await (
      await usersCollection()
    ).updateOne(
      { _id: user._id },
      {
        $set: {
          trello: sealCreds({ apiKey, token }),
          // Stored so a board page knows which member is "me" without
          // asking Trello again on every render.
          trelloMemberId: me.id,
          updatedAt: new Date(),
        },
      }
    );

    // The Trello account it belongs to, never the credentials themselves.
    return Response.json({
      trelloConnected: true,
      trelloUsername: me.username,
    });
  });
}
