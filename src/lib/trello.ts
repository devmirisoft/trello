// Server-only client for the Trello REST API. Tokens now belong to many
// users, so nothing here may ever run in the browser — every call is made
// from our API routes on behalf of the signed-in user.

/** Overridable so tests can point the whole app at a local stub. Read per
 * call, not captured at import time, so a test can set it after the module
 * has already been loaded. */
export const trelloApiBase = () =>
  process.env.TRELLO_API_BASE ?? "https://api.trello.com/1";

export type TrelloCreds = { apiKey: string; token: string };

export type TrelloBoard = { id: string; name: string };
export type TrelloList = { id: string; name: string };
export type TrelloCard = {
  id: string;
  name: string;
  due: string | null;
  dueComplete: boolean;
  idList: string;
  idBoard: string;
  idMembers: string[];
};
export type TrelloMember = {
  id: string;
  fullName: string;
  username: string;
  initials: string;
  avatarUrl?: string | null;
  avatarHash?: string | null;
};

export class TrelloError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

// Trello allows 300 requests/10s per key and 100/10s per token. Four in
// flight keeps a large batch comfortably under the tighter of the two.
export const MAX_CONCURRENCY = 4;
const MAX_RETRIES = 3;
const BACKOFF_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(
  creds: TrelloCreds,
  path: string,
  init: { method?: string; body?: Record<string, string> } = {}
): Promise<T> {
  const url = new URL(`${trelloApiBase()}${path}`);
  url.searchParams.set("key", creds.apiKey);
  url.searchParams.set("token", creds.token);
  // Trello takes writes as query parameters, which keeps every call body-less.
  for (const [k, v] of Object.entries(init.body ?? {})) {
    url.searchParams.set(k, v);
  }

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: init.method ?? "GET" });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await sleep(BACKOFF_MS * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new TrelloError(
        `Trello ${res.status}: ${text || res.statusText}`,
        res.status
      );
    }
    // 204s and empty bodies are valid successes for some write endpoints.
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }
}

/** Runs `fn` over every item with at most MAX_CONCURRENCY in flight, in order,
 * never rejecting: a failed item is reported, the rest still run. */
export async function mapLimited<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit = MAX_CONCURRENCY
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

export const verifyCredentials = (creds: TrelloCreds) =>
  request<{ id: string; fullName: string; username: string }>(
    creds,
    "/members/me"
  );

export const fetchBoards = (creds: TrelloCreds) =>
  request<TrelloBoard[]>(creds, "/members/me/boards?fields=name&filter=open");

export const fetchLists = (creds: TrelloCreds, boardId: string) =>
  request<TrelloList[]>(
    creds,
    `/boards/${boardId}/lists?fields=name&filter=open`
  );

// fields=all because the nested board-members resource rejects field names
// the top-level member resource accepts, and a 400 here strands the picker.
export const fetchMembers = (creds: TrelloCreds, boardId: string) =>
  request<TrelloMember[]>(creds, `/boards/${boardId}/members?fields=all`);

/** Every open card on the board, whoever it belongs to. */
export const fetchBoardCards = (creds: TrelloCreds, boardId: string) =>
  request<TrelloCard[]>(creds, `/boards/${boardId}/cards?filter=open`);

export const fetchMemberCards = (
  creds: TrelloCreds,
  boardId: string,
  memberId: string
) =>
  request<TrelloCard[]>(
    creds,
    `/boards/${boardId}/members/${memberId}/cards?filter=open`
  );

export const createCard = (creds: TrelloCreds, body: Record<string, string>) =>
  request<TrelloCard>(creds, "/cards", { method: "POST", body });

export const updateCard = (
  creds: TrelloCreds,
  cardId: string,
  body: Record<string, string>
) => request<TrelloCard>(creds, `/cards/${cardId}`, { method: "PUT", body });

/** Fully-resolved avatar URL, or null for members who never set one (render
 * initials instead). Trello gives a sizeless base URL, a hash, or neither. */
export function avatarSrc(
  member: Pick<TrelloMember, "avatarUrl" | "avatarHash"> & { id?: string },
  size: 30 | 50 | 170 = 50
): string | null {
  if (member.avatarUrl) return `${member.avatarUrl}/${size}.png`;
  if (member.avatarHash && member.id) {
    return `https://trello-members.s3.amazonaws.com/${member.id}/${member.avatarHash}/${size}.png`;
  }
  return null;
}
