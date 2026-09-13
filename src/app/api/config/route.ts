import {
  CONFIG_ID,
  configCollection,
  hasSession,
  jsonRoute,
  loadConfigDoc,
} from "@/lib/server";
import type { TrelloConfig } from "@/lib/types";
import { ensureTrelloConfig } from "@/lib/provision";

export const dynamic = "force-dynamic";

const unauthorized = (firstRun = false) =>
  Response.json({ error: "Locked.", firstRun }, { status: 401 });

export async function GET() {
  return jsonRoute(async () => {
    const doc = await loadConfigDoc();
    // firstRun lets the lock screen ask to *set* a passcode rather than
    // demand one nobody has chosen yet.
    if (!doc) return unauthorized(true);
    if (!(await hasSession())) return unauthorized();
    const { config, warning } = await ensureTrelloConfig(doc.trello);
    return Response.json({ id: doc.id, config, warning });
  });
}

export async function PUT(request: Request) {
  return jsonRoute(async () => {
    if (!(await hasSession())) return unauthorized();

    const body = await request.json().catch(() => null);
    const apiKey = String(body?.apiKey ?? "").trim();
    const token = String(body?.token ?? "").trim();

    // Only the credentials are mandatory. The board/list/person are saved as
    // they are chosen, so verified credentials persist even if setup is
    // abandoned partway — that is what stops the key and token being retyped
    // on the next login. isConfigured() still gates the camera client-side.
    if (!apiKey || !token) {
      return Response.json(
        { error: "apiKey and token are required." },
        { status: 400 }
      );
    }

    const str = (v: unknown) => (v ? String(v) : undefined);

    // Read first so the response carries the credential id, and so a legacy
    // record is backfilled before we write to it.
    const doc = await loadConfigDoc();
    if (!doc) return unauthorized(true);

    // Merge over what is already stored: a partial save must not wipe a board
    // or person chosen earlier.
    const config: TrelloConfig = {
      ...doc.trello,
      apiKey,
      token,
      boardId: str(body?.boardId) ?? doc.trello?.boardId,
      boardName: str(body?.boardName) ?? doc.trello?.boardName,
      listId: str(body?.listId) ?? doc.trello?.listId,
      listName: str(body?.listName) ?? doc.trello?.listName,
      memberId: str(body?.memberId) ?? doc.trello?.memberId,
      memberName: str(body?.memberName) ?? doc.trello?.memberName,
      memberInitials: str(body?.memberInitials) ?? doc.trello?.memberInitials,
      memberAvatarUrl:
        str(body?.memberAvatarUrl) ?? doc.trello?.memberAvatarUrl ?? null,
    };

    const col = await configCollection();
    const { matchedCount } = await col.updateOne(
      { _id: CONFIG_ID },
      { $set: { trello: config } }
    );
    // No document means the install was reset out from under a live cookie.
    if (!matchedCount) return unauthorized(true);

    return Response.json({ id: doc.id, config });
  });
}
