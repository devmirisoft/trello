// A stateful stand-in for the Trello REST API, on plain node:http.
//
// Stateful is the point: a card created with POST /1/cards comes back from the
// next GET, so the whole loop — photograph, confirm, see the new cards — can be
// exercised end to end without anything real. It implements only the endpoints
// this app actually calls.

import { createServer } from "node:http";

const seed = () => ({
  members: {
    member1: { id: "member1", fullName: "Asha Rao", username: "asha", initials: "AR" },
    member2: { id: "member2", fullName: "Sam Patel", username: "sam", initials: "SP" },
    member3: { id: "member3", fullName: "Dev Kumar", username: "dev", initials: "DK" },
  },
  // Which Trello account a token belongs to, and what it can see. Two tokens
  // with different boards is what makes multi-user isolation testable.
  tokens: {
    "token-asha": { memberId: "member1", boardIds: ["boardA", "boardB", "boardD"] },
    "token-sam": { memberId: "member2", boardIds: ["boardC"] },
  },
  boards: [
    { id: "boardA", name: "Home", idMembers: ["member1", "member3"] },
    { id: "boardB", name: "Work", idMembers: ["member1", "member3"] },
    { id: "boardC", name: "Sam Only", idMembers: ["member2"] },
    // Asha can see this board but is not a member of it — moving her cards
    // here must warn rather than silently drop the assignment.
    { id: "boardD", name: "Shared Board", idMembers: ["member2"] },
  ],
  lists: [
    { id: "listA1", name: "Inbox", idBoard: "boardA" },
    { id: "listA2", name: "Doing", idBoard: "boardA" },
    { id: "listB1", name: "Backlog", idBoard: "boardB" },
    { id: "listC1", name: "Sam's list", idBoard: "boardC" },
    { id: "listD1", name: "Shared inbox", idBoard: "boardD" },
  ],
  cards: [
    {
      id: "card-seed-1",
      name: "Water the plants",
      due: null,
      dueComplete: false,
      closed: false,
      idList: "listA1",
      idBoard: "boardA",
      idMembers: ["member1"],
    },
    {
      id: "card-seed-2",
      name: "Renew the parking permit",
      due: null,
      dueComplete: false,
      closed: false,
      idList: "listA1",
      idBoard: "boardA",
      idMembers: ["member1"],
    },
  ],
  nextCard: 1,
});

let state = seed();

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const listsOf = (boardId) => state.lists.filter((l) => l.idBoard === boardId);

const boardsFor = (token) =>
  state.boards.filter((b) => state.tokens[token].boardIds.includes(b.id));

function applyCardParams(card, params) {
  if (params.has("name")) card.name = params.get("name");
  if (params.has("due")) card.due = params.get("due") || null;
  if (params.has("dueComplete")) {
    card.dueComplete = params.get("dueComplete") === "true";
  }
  if (params.has("idList")) card.idList = params.get("idList");
  if (params.has("idBoard")) card.idBoard = params.get("idBoard");
  if (params.has("idMembers")) {
    card.idMembers = params.get("idMembers").split(",").filter(Boolean);
  }
  return card;
}

export function startFakeTrello(port = 0) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const params = url.searchParams;

    // Test-only control plane: reset between specs so one never leaks into
    // the next.
    if (path === "/__reset") {
      state = seed();
      return json(res, 200, { ok: true });
    }
    if (path === "/__state") return json(res, 200, state);

    const token = params.get("token");
    const key = params.get("key");
    if (!key || !token || !state.tokens[token]) {
      return json(res, 401, { message: "invalid key" });
    }
    const me = state.members[state.tokens[token].memberId];

    // Real Trello refuses a board the token cannot see; without this the fake
    // would be more permissive than the thing it stands in for.
    const boardInPath = path.match(/^\/1\/boards\/([^/]+)/)?.[1];
    if (boardInPath && !state.tokens[token].boardIds.includes(boardInPath)) {
      return json(res, 401, { message: "unauthorized board" });
    }

    if (path === "/1/members/me") return json(res, 200, me);
    if (path === "/1/members/me/boards") {
      return json(res, 200, boardsFor(token).map(({ id, name }) => ({ id, name })));
    }

    let m = path.match(/^\/1\/boards\/([^/]+)\/lists$/);
    if (m) return json(res, 200, listsOf(m[1]).map(({ id, name }) => ({ id, name })));

    m = path.match(/^\/1\/boards\/([^/]+)\/members$/);
    if (m) {
      const board = state.boards.find((b) => b.id === m[1]);
      if (!board) return json(res, 404, { message: "board not found" });
      return json(
        res,
        200,
        board.idMembers.map((id) => state.members[id])
      );
    }

    m = path.match(/^\/1\/boards\/([^/]+)\/members\/([^/]+)\/cards$/);
    if (m) {
      const [, boardId, memberId] = m;
      return json(
        res,
        200,
        state.cards.filter(
          (c) =>
            c.idBoard === boardId && !c.closed && c.idMembers.includes(memberId)
        )
      );
    }

    if (path === "/1/cards" && req.method === "POST") {
      const card = applyCardParams(
        {
          id: `card-new-${state.nextCard++}`,
          name: "",
          due: null,
          dueComplete: false,
          closed: false,
          idList: "",
          idBoard: "",
          idMembers: [],
        },
        params
      );
      // Trello infers the board from the list, and so must this.
      const list = state.lists.find((l) => l.id === card.idList);
      card.idBoard = list ? list.idBoard : card.idBoard;
      state.cards.push(card);
      return json(res, 200, card);
    }

    m = path.match(/^\/1\/cards\/([^/]+)$/);
    if (m && req.method === "PUT") {
      const card = state.cards.find((c) => c.id === m[1]);
      if (!card) return json(res, 404, { message: "card not found" });
      applyCardParams(card, params);
      // Real Trello drops members who are not on the destination board. The
      // app is supposed to have warned before this point; reproducing it here
      // is what proves the warning is load-bearing.
      const board = state.boards.find((b) => b.id === card.idBoard);
      if (board) {
        card.idMembers = card.idMembers.filter((id) =>
          board.idMembers.includes(id)
        );
      }
      return json(res, 200, card);
    }

    json(res, 404, { message: `no fake handler for ${req.method} ${path}` });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, port: server.address().port })
    );
  });
}

// Run standalone: node tests/e2e/fake-trello.mjs 4100
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const port = Number(process.argv[2] ?? 4100);
  startFakeTrello(port).then(({ port: p }) =>
    console.log(`fake trello on http://127.0.0.1:${p}/1`)
  );
}
