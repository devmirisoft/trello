import { jsonRoute, sessionUsername, usersCollection } from "@/lib/server";
import { isConfigured, type TrelloConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

const unauthorized = () =>
  Response.json({ error: "Not signed in." }, { status: 401 });

export async function GET() {
  return jsonRoute(async () => {
    const username = await sessionUsername();
    if (!username) return unauthorized();

    const user = await usersCollection().then((c) =>
      c.findOne({ username }, { projection: { trello: 1 } })
    );
    if (!user) return unauthorized(); // account deleted under a live cookie

    return Response.json({ username, config: user.trello ?? null });
  });
}

export async function PUT(request: Request) {
  return jsonRoute(async () => {
    const username = await sessionUsername();
    if (!username) return unauthorized();

    const body = await request.json().catch(() => null);
    const config: TrelloConfig = {
      apiKey: String(body?.apiKey ?? "").trim(),
      token: String(body?.token ?? "").trim(),
      boardId: body?.boardId ? String(body.boardId) : undefined,
      boardName: body?.boardName ? String(body.boardName) : undefined,
      listId: body?.listId ? String(body.listId) : undefined,
      listName: body?.listName ? String(body.listName) : undefined,
    };

    if (!isConfigured(config)) {
      return Response.json(
        { error: "apiKey, token and listId are all required." },
        { status: 400 }
      );
    }

    const users = await usersCollection();
    const { matchedCount } = await users.updateOne(
      { username },
      { $set: { trello: config } }
    );
    if (!matchedCount) return unauthorized();

    return Response.json({ username, config });
  });
}
