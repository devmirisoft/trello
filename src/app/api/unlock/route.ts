import {
  CONFIG_ID,
  configCollection,
  hashPasscode,
  jsonRoute,
  loadConfigDoc,
  newCredentialId,
  setSessionCookie,
  verifyPasscode,
} from "@/lib/server";
import { ensureTrelloConfig } from "@/lib/provision";

export const dynamic = "force-dynamic";

// One shared passcode. The first unlock on a fresh install sets it; every
// later one has to match. Trello credentials are attached afterwards through
// PUT /api/config, because the board/list picker needs a verified key first.
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const body = await request.json().catch(() => null);
    const passcode = String(body?.passcode ?? "");

    if (passcode.length < 4) {
      return Response.json(
        { error: "The passcode needs at least 4 characters." },
        { status: 400 }
      );
    }

    // loadConfigDoc so a record written before ids existed gets backfilled
    // on the very first unlock rather than staying id-less.
    const existing = await loadConfigDoc();

    if (existing) {
      if (!verifyPasscode(passcode, existing.passcodeHash)) {
        return Response.json({ error: "Wrong passcode." }, { status: 401 });
      }
      await setSessionCookie();
      const { config, warning } = await ensureTrelloConfig(existing.trello);
      return Response.json({ id: existing.id, config, warning });
    }

    const id = newCredentialId();
    const col = await configCollection();
    try {
      await col.insertOne({
        _id: CONFIG_ID,
        id,
        passcodeHash: hashPasscode(passcode),
        trello: null,
        createdAt: new Date(),
      });
    } catch (err) {
      // Two first-run submissions raced; the loser must use the winner's code.
      if ((err as { code?: number }).code === 11000) {
        return Response.json(
          { error: "A passcode was just set — enter it to continue." },
          { status: 409 }
        );
      }
      throw err;
    }

    await setSessionCookie();
    // A fresh install still auto-connects when TRELLO_* env vars are set.
    const { config, warning } = await ensureTrelloConfig(null);
    return Response.json({ id, config, warning, created: true });
  });
}
