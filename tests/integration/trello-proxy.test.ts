import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as me } from "@/app/api/auth/me/route";
import { PUT as saveTrello } from "@/app/api/trello/credentials/route";
import { GET as getBoards } from "@/app/api/trello/boards/route";
import { GET as getLists } from "@/app/api/trello/boards/[boardId]/lists/route";
import { GET as getMembers } from "@/app/api/trello/boards/[boardId]/members/route";
import { GET as getCards } from "@/app/api/trello/boards/[boardId]/members/[memberId]/cards/route";
import {
  clearUsers,
  cookieFrom,
  ctx,
  json,
  rawUsers,
  req,
  startMongo,
  stopMongo,
} from "../helpers/api";
import {
  BOARD_A,
  LIST_A1,
  MEMBER_1,
  resetCaptured,
  server,
  startTrelloStub,
  stopTrelloStub,
  TRELLO_BASE,
  trelloCalls,
} from "../helpers/trello-stub";

const PASSWORD = "hunter2-hunter2";

async function signIn(username: string) {
  const res = await register(
    req({ method: "POST", body: { username, password: PASSWORD } })
  );
  return cookieFrom(res);
}

async function connect(cookie: string, apiKey: string, token: string) {
  const res = await saveTrello(
    req({ method: "PUT", cookie, body: { apiKey, token } })
  );
  expect(res.status).toBe(200);
  return res;
}

beforeAll(async () => {
  await startMongo();
  startTrelloStub();
}, 180_000);

afterAll(async () => {
  stopTrelloStub();
  await stopMongo();
});

beforeEach(async () => {
  server.resetHandlers();
  resetCaptured();
  await clearUsers();
});

describe("PUT /api/trello/credentials", () => {
  it("validates against Trello before saving", async () => {
    const cookie = await signIn("asha");
    await connect(cookie, "key-abc", "token-xyz");

    const validation = trelloCalls("GET")[0];
    expect(validation.path).toBe("/1/members/me");
    expect(validation.key).toBe("key-abc");
    expect(validation.token).toBe("token-xyz");
  });

  it("rejects credentials Trello refuses, and saves nothing", async () => {
    server.use(
      http.get(`${TRELLO_BASE}/members/me`, () =>
        HttpResponse.text("invalid token", { status: 401 })
      )
    );
    const cookie = await signIn("asha");
    const res = await saveTrello(
      req({ method: "PUT", cookie, body: { apiKey: "bad", token: "bad" } })
    );
    expect(res.status).toBe(400);
    expect((await rawUsers())[0].trello).toBeNull();
  });

  it("401s without a session", async () => {
    const res = await saveTrello(
      req({ method: "PUT", body: { apiKey: "k", token: "t" } })
    );
    expect(res.status).toBe(401);
  });

  it("400s when either field is blank", async () => {
    const cookie = await signIn("asha");
    const res = await saveTrello(
      req({ method: "PUT", cookie, body: { apiKey: "k", token: " " } })
    );
    expect(res.status).toBe(400);
  });

  it("stores the key and token encrypted, with no plaintext on disk", async () => {
    const cookie = await signIn("asha");
    await connect(cookie, "key-abc-plaintext", "token-xyz-plaintext");

    const [doc] = await rawUsers();
    const stored = JSON.stringify(doc);
    expect(stored).not.toContain("key-abc-plaintext");
    expect(stored).not.toContain("token-xyz-plaintext");
    // AES-GCM: ciphertext plus the IV and tag needed to open it again.
    expect(doc.trello.apiKey).toEqual({
      ciphertext: expect.any(String),
      iv: expect.any(String),
      authTag: expect.any(String),
    });
  });

  it("never echoes the credentials back", async () => {
    const cookie = await signIn("asha");
    const res = await connect(cookie, "key-abc-plaintext", "token-xyz-plaintext");
    const body = JSON.stringify(await json(res));
    expect(body).not.toContain("key-abc-plaintext");
    expect(body).not.toContain("token-xyz-plaintext");
    expect(await json(await me(req({ cookie })))).toMatchObject({
      trelloConnected: true,
    });
  });
});

describe("Trello proxy routes", () => {
  it("401 without a session, on every route", async () => {
    expect((await getBoards(req({}))).status).toBe(401);
    expect(
      (await getLists(req({}), ctx({ boardId: BOARD_A.id }))).status
    ).toBe(401);
    expect(
      (await getMembers(req({}), ctx({ boardId: BOARD_A.id }))).status
    ).toBe(401);
    expect(
      (
        await getCards(
          req({}),
          ctx({ boardId: BOARD_A.id, memberId: MEMBER_1.id })
        )
      ).status
    ).toBe(401);
    // Nothing left our process.
    expect(trelloCalls()).toHaveLength(0);
  });

  it("says so plainly when Trello is not connected yet", async () => {
    const cookie = await signIn("asha");
    const res = await getBoards(req({ cookie }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/Trello not connected/i);
    expect(trelloCalls()).toHaveLength(0);
  });

  it("builds the right upstream URL for each route", async () => {
    const cookie = await signIn("asha");
    await connect(cookie, "key-abc", "token-xyz");
    resetCaptured();

    await getBoards(req({ cookie }));
    await getLists(req({ cookie }), ctx({ boardId: BOARD_A.id }));
    await getMembers(req({ cookie }), ctx({ boardId: BOARD_A.id }));
    await getCards(
      req({ cookie }),
      ctx({ boardId: BOARD_A.id, memberId: MEMBER_1.id })
    );

    expect(trelloCalls().map((c) => c.path)).toEqual([
      "/1/members/me/boards",
      `/1/boards/${BOARD_A.id}/lists`,
      `/1/boards/${BOARD_A.id}/members`,
      `/1/boards/${BOARD_A.id}/members/${MEMBER_1.id}/cards`,
    ]);
    // Everything went through TRELLO_API_BASE, not a hard-coded host.
    for (const call of trelloCalls()) {
      expect(call.url.origin).toBe(new URL(TRELLO_BASE).origin);
    }
  });

  it("returns boards, lists, members and cards to the client", async () => {
    const cookie = await signIn("asha");
    await connect(cookie, "key-abc", "token-xyz");

    expect(await json(await getBoards(req({ cookie })))).toMatchObject({
      boards: [BOARD_A, expect.anything()],
    });
    expect(
      await json(await getLists(req({ cookie }), ctx({ boardId: BOARD_A.id })))
    ).toMatchObject({ lists: [LIST_A1, expect.anything()] });
    expect(
      await json(await getMembers(req({ cookie }), ctx({ boardId: BOARD_A.id })))
    ).toMatchObject({
      members: [expect.objectContaining({ id: MEMBER_1.id }), expect.anything()],
    });
    expect(
      await json(
        await getCards(
          req({ cookie }),
          ctx({ boardId: BOARD_A.id, memberId: MEMBER_1.id })
        )
      )
    ).toMatchObject({ cards: [expect.objectContaining({ id: "existing1" })] });
  });

  it("surfaces a Trello failure instead of pretending it worked", async () => {
    server.use(
      http.get(`${TRELLO_BASE}/members/me/boards`, () =>
        HttpResponse.text("boom", { status: 500 })
      )
    );
    const cookie = await signIn("asha");
    await connect(cookie, "key-abc", "token-xyz");
    const res = await getBoards(req({ cookie }));
    expect(res.status).toBe(500);
  });
});

describe("per-user credential isolation", () => {
  it("uses the calling user's token and never the other's", async () => {
    const asha = await signIn("asha");
    await connect(asha, "key-asha", "token-asha");
    const sam = await signIn("sam");
    await connect(sam, "key-sam", "token-sam");
    resetCaptured();

    await getBoards(req({ cookie: asha }));
    expect(trelloCalls()).toHaveLength(1);
    expect(trelloCalls()[0].key).toBe("key-asha");
    expect(trelloCalls()[0].token).toBe("token-asha");

    resetCaptured();
    await getBoards(req({ cookie: sam }));
    expect(trelloCalls()[0].key).toBe("key-sam");
    expect(trelloCalls()[0].token).toBe("token-sam");
  });

  it("leaks no token or key in any response body", async () => {
    const asha = await signIn("asha");
    await connect(asha, "key-asha", "token-asha");

    const bodies = await Promise.all(
      [
        await me(req({ cookie: asha })),
        await getBoards(req({ cookie: asha })),
        await getLists(req({ cookie: asha }), ctx({ boardId: BOARD_A.id })),
        await getMembers(req({ cookie: asha }), ctx({ boardId: BOARD_A.id })),
        await getCards(
          req({ cookie: asha }),
          ctx({ boardId: BOARD_A.id, memberId: MEMBER_1.id })
        ),
      ].map(async (res) => JSON.stringify(await json(res)))
    );

    for (const body of bodies) {
      expect(body).not.toContain("key-asha");
      expect(body).not.toContain("token-asha");
    }
  });
});
