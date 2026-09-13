// Thin client for the Trello REST API. Trello's API allows direct
// browser-to-api.trello.com calls (this is how Trello's own Power-Ups work),
// so this app needs no server component at all.

const BASE = "https://api.trello.com/1";

export type TrelloBoard = {
  id: string;
  name: string;
};

export type TrelloList = {
  id: string;
  name: string;
};

export type TrelloMember = {
  id: string;
  fullName: string;
  username: string;
  initials: string;
  /** Base URL with no size suffix. Absent on some accounts — fall back to
   * avatarHash, which every avatared member has. */
  avatarUrl?: string | null;
  avatarHash?: string | null;
};

export class TrelloError extends Error {}

function authParams(apiKey: string, token: string) {
  return new URLSearchParams({ key: apiKey, token });
}

async function trelloFetch<T>(
  path: string,
  apiKey: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const params = authParams(apiKey, token);
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}${params.toString()}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TrelloError(
      `Trello API error ${res.status}: ${text || res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

export async function verifyCredentials(
  apiKey: string,
  token: string
): Promise<{ id: string; fullName: string; username: string }> {
  return trelloFetch("/members/me", apiKey, token);
}

export async function fetchBoards(
  apiKey: string,
  token: string
): Promise<TrelloBoard[]> {
  return trelloFetch(
    "/members/me/boards?fields=name&filter=open",
    apiKey,
    token
  );
}

export async function fetchLists(
  apiKey: string,
  token: string,
  boardId: string
): Promise<TrelloList[]> {
  return trelloFetch(
    `/boards/${boardId}/lists?fields=name&filter=open`,
    apiKey,
    token
  );
}

export async function fetchMembers(
  apiKey: string,
  token: string,
  boardId: string
): Promise<TrelloMember[]> {
  // `fields=all` rather than a hand-written list: the nested board-members
  // resource rejects field names the top-level member resource accepts, and a
  // 400 here used to strand setup on a picker that could never be satisfied.
  return trelloFetch(`/boards/${boardId}/members?fields=all`, apiKey, token);
}

/** Fully-resolved avatar image URL, or null for members who never set one
 * (render initials instead). Trello gives a sizeless base URL, an avatarHash,
 * or neither, so both shapes are handled here rather than at each call site. */
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

export async function createCard(
  apiKey: string,
  token: string,
  opts: {
    listId: string;
    name: string;
    desc?: string;
    due?: string;
    idMembers?: string[];
  }
): Promise<{ id: string; shortUrl: string; name: string }> {
  const params = authParams(apiKey, token);
  params.set("idList", opts.listId);
  params.set("name", opts.name);
  if (opts.desc) params.set("desc", opts.desc);
  if (opts.due) params.set("due", opts.due);
  // Trello takes idMembers as a comma-separated list of member ids.
  if (opts.idMembers?.length) params.set("idMembers", opts.idMembers.join(","));

  const res = await fetch(`${BASE}/cards?${params.toString()}`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TrelloError(
      `Failed to create card "${opts.name}": ${res.status} ${text || res.statusText}`
    );
  }
  return res.json();
}
