// Server-only: turn TRELLO_* environment variables into a ready-to-use config
// so signing in lands straight on the capture screen with no setup form.
//
// This is the one place the server talks to Trello. It runs only while the
// stored config is incomplete; once everything is resolved and saved it makes
// no network calls at all, and card creation still happens in the browser.

import {
  avatarSrc,
  fetchBoards,
  fetchLists,
  fetchMembers,
  verifyCredentials,
} from "./trello";
import { isConfigured, type TrelloConfig } from "./types";
import { CONFIG_ID, configCollection } from "./server";

const env = (name: string) => process.env[name]?.trim() || undefined;

export type Provisioned = {
  config: TrelloConfig | null;
  /** Why auto-connect could not finish, for the UI to show. */
  warning?: string;
};

/** Fill in whatever the stored config is missing from the environment, saving
 * the result. Returns the stored config untouched when there is nothing to
 * seed from, or when it is already complete. */
export async function ensureTrelloConfig(
  stored: TrelloConfig | null
): Promise<Provisioned> {
  // Environment first, then whatever was saved: credentials already in the
  // database auto-connect on their own, so a half-finished setup completes
  // itself at the next login instead of showing the form again.
  const apiKey = env("TRELLO_API_KEY") || stored?.apiKey;
  const token = env("TRELLO_TOKEN") || stored?.token;
  const envBoard = env("TRELLO_BOARD_ID");
  const envList = env("TRELLO_LIST_ID");
  const envMember = env("TRELLO_MEMBER_ID");

  // Nothing to connect with: the setup form is the only way in.
  if (!apiKey || !token) return { config: stored };

  const cfg: TrelloConfig = { ...stored, apiKey, token };

  // An explicitly pinned id wins over anything stored. Changing the board
  // invalidates the list and person that were chosen inside the old one.
  if (envBoard && envBoard !== cfg.boardId) {
    cfg.boardId = envBoard;
    cfg.boardName = undefined;
    cfg.listId = undefined;
    cfg.listName = undefined;
    cfg.memberId = undefined;
    cfg.memberName = undefined;
  }
  if (envList && envList !== cfg.listId) {
    cfg.listId = envList;
    cfg.listName = undefined;
  }
  if (envMember && envMember !== cfg.memberId) {
    cfg.memberId = envMember;
    cfg.memberName = undefined;
  }

  // Already complete and nothing was re-pinned: no Trello calls, no write.
  const unchanged =
    isConfigured(cfg) &&
    cfg.apiKey === stored?.apiKey &&
    cfg.token === stored?.token &&
    cfg.boardId === stored?.boardId &&
    cfg.listId === stored?.listId &&
    cfg.memberId === stored?.memberId &&
    !!cfg.boardName &&
    !!cfg.listName &&
    !!cfg.memberName;
  if (unchanged) return { config: stored };

  try {
    // --- Board: the pinned one, else the first open board on the account.
    if (!cfg.boardId || !cfg.boardName) {
      const boards = await fetchBoards(apiKey, token);
      const board = cfg.boardId
        ? boards.find((b) => b.id === cfg.boardId)
        : boards[0];
      if (!board) {
        return {
          config: stored,
          warning: cfg.boardId
            ? `TRELLO_BOARD_ID ${cfg.boardId} is not a board this token can see.`
            : "This Trello account has no open boards.",
        };
      }
      cfg.boardId = board.id;
      cfg.boardName = board.name;
    }

    // --- List: the pinned one, else the board's first open list.
    if (!cfg.listId || !cfg.listName) {
      const lists = await fetchLists(apiKey, token, cfg.boardId!);
      const list = cfg.listId
        ? lists.find((l) => l.id === cfg.listId)
        : lists[0];
      if (!list) {
        return {
          config: stored,
          warning: cfg.listId
            ? `TRELLO_LIST_ID ${cfg.listId} is not a list on ${cfg.boardName}.`
            : `Board ${cfg.boardName} has no open lists.`,
        };
      }
      cfg.listId = list.id;
      cfg.listName = list.name;
    }

    // --- Person: the pinned one, else whoever the token belongs to.
    if (!cfg.memberId || !cfg.memberName) {
      const targetId = cfg.memberId ?? (await verifyCredentials(apiKey, token)).id;
      const members = await fetchMembers(apiKey, token, cfg.boardId!);
      const m = members.find((x) => x.id === targetId);
      if (!m) {
        return {
          config: stored,
          warning: `Member ${targetId} is not on board ${cfg.boardName}.`,
        };
      }
      cfg.memberId = m.id;
      cfg.memberName = m.fullName || m.username;
      cfg.memberInitials = m.initials;
      cfg.memberAvatarUrl = avatarSrc(m, 50);
    }
  } catch (err) {
    // A Trello outage or a bad token must not block signing in — the setup
    // screen stays available as the manual fallback.
    console.error("Trello auto-connect failed:", err);
    return {
      config: stored,
      warning: `Could not connect to Trello automatically: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }

  const col = await configCollection();
  await col.updateOne({ _id: CONFIG_ID }, { $set: { trello: cfg } });
  return { config: cfg };
}
