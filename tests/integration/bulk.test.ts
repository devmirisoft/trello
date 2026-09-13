import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { POST as register } from "@/app/api/auth/register/route";
import { PUT as saveTrello } from "@/app/api/trello/credentials/route";
import {
  PATCH as bulkPatch,
  POST as bulkPost,
} from "@/app/api/trello/cards/bulk/route";
import {
  clearUsers,
  cookieFrom,
  json,
  req,
  startMongo,
  stopMongo,
} from "../helpers/api";
import {
  BOARD_B,
  LIST_A1,
  LIST_B1,
  makeCard,
  MEMBER_1,
  MEMBER_2,
  resetCaptured,
  resetCardSeq,
  server,
  startTrelloStub,
  stopTrelloStub,
  TRELLO_BASE,
  trelloCalls,
} from "../helpers/trello-stub";
import { toLocalISODate, todayLocalISODate } from "@/lib/dates";
import { MAX_CONCURRENCY } from "@/lib/trello";

type BulkBody = {
  results: { cardId: string; ok: boolean; error?: string }[];
  warning?: string;
};

let cookie: string;

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
  resetCardSeq();
  await clearUsers();
  cookie = cookieFrom(
    await register(
      req({
        method: "POST",
        body: { username: "asha", password: "hunter2-hunter2" },
      })
    )
  );
  await saveTrello(
    req({
      method: "PUT",
      cookie,
      body: { apiKey: "key-asha", token: "token-asha" },
    })
  );
  resetCaptured();
});

const create = (body: Record<string, unknown>) =>
  bulkPost(req({ method: "POST", cookie, body }));

const patch = (body: Record<string, unknown>) =>
  bulkPatch(req({ method: "PATCH", cookie, body }));

describe("POST /api/trello/cards/bulk — create", () => {
  it("sends one POST per line with the list, name, due and member", async () => {
    const res = await create({
      listId: LIST_A1.id,
      memberId: MEMBER_1.id,
      dueDate: "2026-03-15",
      tasks: ["call the plumber", "email Sam", "book flights"],
    });
    expect(res.status).toBe(200);

    const posts = trelloCalls("POST");
    expect(posts).toHaveLength(3);
    expect(posts.map((c) => c.params.get("name"))).toEqual([
      "call the plumber",
      "email Sam",
      "book flights",
    ]);
    for (const post of posts) {
      expect(post.path).toBe("/1/cards");
      expect(post.params.get("idList")).toBe(LIST_A1.id);
      expect(post.params.get("idMembers")).toBe(MEMBER_1.id);
      expect(toLocalISODate(new Date(post.params.get("due")!))).toBe("2026-03-15");
      expect(post.key).toBe("key-asha");
    }

    const body = await json<BulkBody>(res);
    expect(body.results.every((r) => r.ok)).toBe(true);
  });

  it("sends today when the date picker was never opened", async () => {
    await create({
      listId: LIST_A1.id,
      memberId: MEMBER_1.id,
      tasks: ["untouched picker"],
    });
    const due = trelloCalls("POST")[0].params.get("due")!;
    expect(due).toBeTruthy();
    expect(toLocalISODate(new Date(due))).toBe(todayLocalISODate());
  });

  it("sends today for an explicit null date too", async () => {
    await create({
      listId: LIST_A1.id,
      dueDate: null,
      tasks: ["explicit null"],
    });
    expect(
      toLocalISODate(new Date(trelloCalls("POST")[0].params.get("due")!))
    ).toBe(todayLocalISODate());
  });

  it("gives each task the date that came off its own line", async () => {
    await create({
      listId: LIST_A1.id,
      dueDate: "2026-03-15",
      tasks: [
        { name: "submit by April", dueDate: "2026-04-01" },
        { name: "no date on this line" },
      ],
    });

    const posts = trelloCalls("POST");
    expect(posts.map((c) => c.params.get("name"))).toEqual([
      "submit by April",
      "no date on this line",
    ]);
    expect(toLocalISODate(new Date(posts[0].params.get("due")!))).toBe(
      "2026-04-01"
    );
    // Only the line that named no date of its own falls back to the batch.
    expect(toLocalISODate(new Date(posts[1].params.get("due")!))).toBe(
      "2026-03-15"
    );
  });

  it("still takes a plain string per task", async () => {
    await create({ listId: LIST_A1.id, tasks: ["just a title"] });
    expect(trelloCalls("POST")[0].params.get("name")).toBe("just a title");
  });

  it("400s on a date it cannot make sense of, and creates nothing", async () => {
    for (const body of [
      { listId: LIST_A1.id, tasks: [{ name: "x", dueDate: "next tuesday" }] },
      { listId: LIST_A1.id, tasks: [{ name: "x", dueDate: "2026-13-01" }] },
      // Parses, but silently rolls into 3 March — not what anyone typed.
      { listId: LIST_A1.id, tasks: [{ name: "x", dueDate: "2026-02-31" }] },
      { listId: LIST_A1.id, dueDate: "whenever", tasks: ["x"] },
    ]) {
      expect((await create(body)).status).toBe(400);
    }
    expect(trelloCalls("POST")).toHaveLength(0);
  });

  it("400s without a list or without tasks, and calls Trello not at all", async () => {
    expect((await create({ tasks: ["x"] })).status).toBe(400);
    expect((await create({ listId: LIST_A1.id, tasks: [] })).status).toBe(400);
    expect((await create({ listId: LIST_A1.id, tasks: ["  "] })).status).toBe(400);
    expect(
      (await create({ listId: LIST_A1.id, tasks: [{ name: "  " }] })).status
    ).toBe(400);
    expect(trelloCalls("POST")).toHaveLength(0);
  });

  it("401s without a session", async () => {
    const res = await bulkPost(
      req({ method: "POST", body: { listId: LIST_A1.id, tasks: ["x"] } })
    );
    expect(res.status).toBe(401);
    expect(trelloCalls("POST")).toHaveLength(0);
  });

  it("reports per-card results and finishes the batch when some fail", async () => {
    // 3 of 5 fail; the other 2 must still be created.
    const failing = new Set(["two", "three", "five"]);
    server.use(
      http.post(`${TRELLO_BASE}/cards`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (failing.has(params.get("name")!)) {
          return HttpResponse.text("card limit reached", { status: 400 });
        }
        return HttpResponse.json(makeCard(params));
      })
    );

    const res = await create({
      listId: LIST_A1.id,
      tasks: ["one", "two", "three", "four", "five"],
    });
    expect(res.status).toBe(200);

    const { results } = await json<BulkBody>(res);
    expect(results.map((r) => r.ok)).toEqual([true, false, false, true, false]);
    expect(results[1].error).toMatch(/400/);
    expect(results[0].error).toBeUndefined();
    // All five were attempted: a failure never aborts the rest.
    expect(trelloCalls("POST")).toHaveLength(5);
  });

  it("retries a 429 with backoff instead of giving up", async () => {
    let attempts = 0;
    server.use(
      http.post(`${TRELLO_BASE}/cards`, ({ request }) => {
        attempts++;
        if (attempts < 3) {
          return HttpResponse.text("rate limited", { status: 429 });
        }
        return HttpResponse.json(makeCard(new URL(request.url).searchParams));
      })
    );

    const started = Date.now();
    const res = await create({ listId: LIST_A1.id, tasks: ["rate limited"] });
    const elapsed = Date.now() - started;

    const { results } = await json<BulkBody>(res);
    expect(results[0].ok).toBe(true);
    expect(attempts).toBe(3);
    // Backoff doubles: 250ms then 500ms. Anything instant would mean the
    // retry loop is hammering Trello rather than backing off.
    expect(elapsed).toBeGreaterThanOrEqual(700);
  });

  it("gives up after the retry budget and reports the card as failed", async () => {
    server.use(
      http.post(`${TRELLO_BASE}/cards`, () =>
        HttpResponse.text("rate limited", { status: 429 })
      )
    );
    const { results } = await json<BulkBody>(
      await create({ listId: LIST_A1.id, tasks: ["always limited"] })
    );
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/429/);
  });

  it("keeps at most four requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    server.use(
      http.post(`${TRELLO_BASE}/cards`, async ({ request }) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return HttpResponse.json(makeCard(new URL(request.url).searchParams));
      })
    );

    await create({
      listId: LIST_A1.id,
      tasks: Array.from({ length: 20 }, (_, i) => `task ${i}`),
    });

    expect(trelloCalls("POST")).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENCY);
    // And it is actually running in parallel, not one at a time.
    expect(peak).toBeGreaterThan(1);
  });
});

describe("PATCH /api/trello/cards/bulk — done", () => {
  it("sends dueComplete=true per card and never archives", async () => {
    const res = await patch({ cardIds: ["c1", "c2", "c3"], action: "done" });
    expect(res.status).toBe(200);

    const puts = trelloCalls("PUT");
    expect(puts.map((c) => c.path)).toEqual([
      "/1/cards/c1",
      "/1/cards/c2",
      "/1/cards/c3",
    ]);
    for (const put of puts) {
      expect(put.params.get("dueComplete")).toBe("true");
      expect(put.params.get("closed")).toBeNull();
    }
    expect((await json<BulkBody>(res)).results.every((r) => r.ok)).toBe(true);
  });

  it("reports the failures and still does the rest", async () => {
    server.use(
      http.put(`${TRELLO_BASE}/cards/:cardId`, ({ request, params }) =>
        params.cardId === "c2"
          ? HttpResponse.text("gone", { status: 404 })
          : HttpResponse.json({
              ...makeCard(new URL(request.url).searchParams),
              id: String(params.cardId),
            })
      )
    );
    const { results } = await json<BulkBody>(
      await patch({ cardIds: ["c1", "c2", "c3"], action: "done" })
    );
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(trelloCalls("PUT")).toHaveLength(3);
  });

  it("400s on an unknown action or an empty selection", async () => {
    expect((await patch({ cardIds: ["c1"], action: "explode" })).status).toBe(400);
    expect((await patch({ cardIds: [], action: "done" })).status).toBe(400);
    expect(trelloCalls("PUT")).toHaveLength(0);
  });
});

describe("PATCH /api/trello/cards/bulk — update", () => {
  it("edits the title across the selection", async () => {
    await patch({
      cardIds: ["c1", "c2"],
      action: "update",
      payload: { name: "renamed" },
    });
    for (const put of trelloCalls("PUT")) {
      expect(put.params.get("name")).toBe("renamed");
      expect(put.params.get("due")).toBeNull();
    }
  });

  it("edits the due date across the selection", async () => {
    await patch({
      cardIds: ["c1", "c2"],
      action: "update",
      payload: { dueDate: "2026-03-15" },
    });
    for (const put of trelloCalls("PUT")) {
      expect(toLocalISODate(new Date(put.params.get("due")!))).toBe("2026-03-15");
      expect(put.params.get("name")).toBeNull();
    }
  });

  it("clears the date when it is explicitly null", async () => {
    await patch({
      cardIds: ["c1"],
      action: "update",
      payload: { dueDate: null },
    });
    expect(trelloCalls("PUT")[0].params.get("due")).toBe("");
  });
});

describe("PATCH /api/trello/cards/bulk — move", () => {
  it("sends both idBoard and a list that belongs to the target board", async () => {
    const res = await patch({
      cardIds: ["c1", "c2"],
      action: "move",
      payload: { boardId: BOARD_B.id, memberId: MEMBER_2.id },
    });
    expect(res.status).toBe(200);

    const puts = trelloCalls("PUT");
    expect(puts).toHaveLength(2);
    for (const put of puts) {
      expect(put.params.get("idBoard")).toBe(BOARD_B.id);
      // Board B's only list — naming the board alone is not enough for Trello.
      expect(put.params.get("idList")).toBe(LIST_B1.id);
    }
  });

  it("keeps the same person when they are on the target board", async () => {
    await patch({
      cardIds: ["c1"],
      action: "move",
      payload: { boardId: BOARD_B.id, memberId: MEMBER_2.id },
    });
    expect(trelloCalls("PUT")[0].params.get("idMembers")).toBe(MEMBER_2.id);
  });

  it("honours an explicitly chosen target list", async () => {
    await patch({
      cardIds: ["c1"],
      action: "move",
      payload: { boardId: BOARD_B.id, listId: LIST_B1.id },
    });
    expect(trelloCalls("PUT")[0].params.get("idList")).toBe(LIST_B1.id);
  });

  it("warns instead of silently dropping an assignment", async () => {
    // member1 is not on board B.
    const res = await patch({
      cardIds: ["c1", "c2"],
      action: "move",
      payload: { boardId: BOARD_B.id, memberId: MEMBER_1.id },
    });
    expect(res.status).toBe(200);

    const body = await json<BulkBody>(res);
    expect(body.warning).toMatch(/not a member of the target board/i);
    expect(body.results).toEqual([]);
    // Nothing was moved: the user gets to decide before the assignment is lost.
    expect(trelloCalls("PUT")).toHaveLength(0);
  });

  it("moves unassigned once the warning is confirmed", async () => {
    const res = await patch({
      cardIds: ["c1"],
      action: "move",
      payload: {
        boardId: BOARD_B.id,
        memberId: MEMBER_1.id,
        confirmUnassigned: true,
      },
    });
    const body = await json<BulkBody>(res);
    expect(body.results.map((r) => r.ok)).toEqual([true]);
    expect(body.warning).toMatch(/without an assignee/i);
    expect(trelloCalls("PUT")[0].params.get("idMembers")).toBeNull();
  });

  it("fails every card with a clear reason when no board is given", async () => {
    const { results } = await json<BulkBody>(
      await patch({ cardIds: ["c1", "c2"], action: "move", payload: {} })
    );
    expect(results.map((r) => r.ok)).toEqual([false, false]);
    expect(results[0].error).toMatch(/target board is required/i);
    expect(trelloCalls("PUT")).toHaveLength(0);
  });

  it("fails clearly when the target board has no lists", async () => {
    server.use(
      http.get(`${TRELLO_BASE}/boards/:boardId/lists`, () =>
        HttpResponse.json([])
      )
    );
    const { results } = await json<BulkBody>(
      await patch({
        cardIds: ["c1"],
        action: "move",
        payload: { boardId: BOARD_B.id },
      })
    );
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/no open lists/i);
  });
});
