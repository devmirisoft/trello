// MSW stub for Trello, plus a recorder for what our code actually sent.
//
// Every assertion in the integration suite is made on the captured OUTBOUND
// request — the URL, method and parameters our code would have sent — never
// on Trello's state. onUnhandledRequest: "error" means a call we forgot to
// stub fails the test loudly rather than escaping.

import { setupServer } from "msw/node";
import { http, HttpResponse, type RequestHandler } from "msw";

export const TRELLO_BASE = "http://trello.test/1";

export type Captured = {
  method: string;
  url: URL;
  path: string;
  params: URLSearchParams;
  key: string | null;
  token: string | null;
};

export const captured: Captured[] = [];

/** Requests our code made to Trello, oldest first. */
export const trelloCalls = (method?: string) =>
  method ? captured.filter((c) => c.method === method) : captured;

export const lastCall = (method?: string) => {
  const calls = trelloCalls(method);
  return calls[calls.length - 1];
};

export const resetCaptured = () => {
  captured.length = 0;
};

/** Wires TRELLO_API_BASE at the stub and starts recording. Call in beforeAll,
 * after any real network work (such as booting mongodb-memory-server). */
export function startTrelloStub(handlers: RequestHandler[] = []) {
  process.env.TRELLO_API_BASE = TRELLO_BASE;
  server.listen({ onUnhandledRequest: "error" });
  if (handlers.length) server.use(...handlers);
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.host !== "trello.test") return;
    captured.push({
      method: request.method,
      url,
      path: url.pathname,
      params: url.searchParams,
      key: url.searchParams.get("key"),
      token: url.searchParams.get("token"),
    });
  });
}

export function stopTrelloStub() {
  server.close();
  delete process.env.TRELLO_API_BASE;
}

// --- Default happy-path fixtures -------------------------------------------

export const BOARD_A = { id: "boardA", name: "Home" };
export const BOARD_B = { id: "boardB", name: "Work" };
export const LIST_A1 = { id: "listA1", name: "Inbox" };
export const LIST_A2 = { id: "listA2", name: "Doing" };
export const LIST_B1 = { id: "listB1", name: "Backlog" };
export const MEMBER_1 = {
  id: "member1",
  fullName: "Asha Rao",
  username: "asha",
  initials: "AR",
  avatarUrl: null,
  avatarHash: null,
};
export const MEMBER_2 = {
  id: "member2",
  fullName: "Sam Patel",
  username: "sam",
  initials: "SP",
  avatarUrl: null,
  avatarHash: null,
};

let cardSeq = 0;
export const resetCardSeq = () => {
  cardSeq = 0;
};

export function makeCard(params: URLSearchParams) {
  return {
    id: `card${++cardSeq}`,
    name: params.get("name") ?? "",
    due: params.get("due"),
    dueComplete: params.get("dueComplete") === "true",
    idList: params.get("idList") ?? LIST_A1.id,
    idBoard: params.get("idBoard") ?? BOARD_A.id,
    idMembers: params.get("idMembers")?.split(",").filter(Boolean) ?? [],
  };
}

export function defaultHandlers(): RequestHandler[] {
  return [
    http.get(`${TRELLO_BASE}/members/me`, () =>
      HttpResponse.json({ id: "me1", fullName: "Asha Rao", username: "asha" })
    ),
    http.get(`${TRELLO_BASE}/members/me/boards`, () =>
      HttpResponse.json([BOARD_A, BOARD_B])
    ),
    http.get(`${TRELLO_BASE}/boards/:boardId/lists`, ({ params }) =>
      HttpResponse.json(
        params.boardId === BOARD_B.id ? [LIST_B1] : [LIST_A1, LIST_A2]
      )
    ),
    // Board B deliberately does NOT include member1 — that is the
    // "person isn't on that board" case.
    http.get(`${TRELLO_BASE}/boards/:boardId/members`, ({ params }) =>
      HttpResponse.json(
        params.boardId === BOARD_B.id ? [MEMBER_2] : [MEMBER_1, MEMBER_2]
      )
    ),
    http.get(`${TRELLO_BASE}/boards/:boardId/members/:memberId/cards`, () =>
      HttpResponse.json([
        {
          id: "existing1",
          name: "Water the plants",
          due: null,
          dueComplete: false,
          idList: LIST_A1.id,
          idBoard: BOARD_A.id,
          idMembers: [MEMBER_1.id],
        },
      ])
    ),
    http.post(`${TRELLO_BASE}/cards`, ({ request }) =>
      HttpResponse.json(makeCard(new URL(request.url).searchParams))
    ),
    http.put(`${TRELLO_BASE}/cards/:cardId`, ({ request, params }) => {
      const search = new URL(request.url).searchParams;
      return HttpResponse.json({
        ...makeCard(search),
        id: String(params.cardId),
      });
    }),
  ];
}

// Created with the defaults baked in, so resetHandlers() between tests puts
// the happy path back rather than leaving the stub with nothing to answer.
export const server = setupServer(...defaultHandlers());
