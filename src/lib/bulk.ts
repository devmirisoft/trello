// Bulk card operations. Every one is partial-failure tolerant: a card that
// fails is reported and the rest still run, because abandoning a half-finished
// batch is worse than finishing it and saying what broke.

import { resolveDueForTrello } from "./dates";
import {
  cardPayload,
  donePayload,
  movePayload,
  updatePayload,
} from "./trello-payload";
import {
  createCard,
  fetchLists,
  fetchMembers,
  mapLimited,
  updateCard,
  type TrelloCard,
  type TrelloCreds,
} from "./trello";

export type BulkResult = {
  cardId: string;
  ok: boolean;
  error?: string;
  card?: TrelloCard;
};

const settle = (
  ids: string[],
  settled: PromiseSettledResult<TrelloCard>[]
): BulkResult[] =>
  settled.map((r, i) =>
    r.status === "fulfilled"
      ? { cardId: ids[i], ok: true, card: r.value }
      : {
          cardId: ids[i],
          ok: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        }
  );

/** One card to create. `dueDate` is per card because a photographed list can
 * name a different day on each line. */
export type BulkCreateTask = { name: string; dueDate?: string | null };

export type BulkCreateInput = {
  listId: string;
  memberId?: string;
  /** yyyy-mm-dd, for tasks that name no date of their own. Absent means a
   * picker the user never opened — which is today, not "no due date". */
  dueDate?: string | null;
  tasks: BulkCreateTask[];
};

export async function bulkCreate(
  creds: TrelloCreds,
  input: BulkCreateInput
): Promise<{ results: BulkResult[] }> {
  const settled = await mapLimited(input.tasks, (task) =>
    createCard(
      creds,
      cardPayload({
        listId: input.listId,
        name: task.name,
        due: resolveDueForTrello(task.dueDate ?? input.dueDate),
        memberId: input.memberId,
      })
    )
  );
  // Nothing to key results by yet, so the line itself identifies the row.
  return { results: settle(input.tasks.map((t) => t.name), settled) };
}

export type BulkAction = "done" | "update" | "move";

export type BulkPayload = {
  /** update */
  name?: string;
  dueDate?: string | null;
  /** move */
  boardId?: string;
  listId?: string;
  /** Who the cards should belong to on the target board. Defaults to whoever
   * they belong to now, which the caller passes through unchanged. */
  memberId?: string;
  /** Proceed with a move even though the assignee is not on the target board
   * (they lose the assignment). Without it the move is refused with a warning. */
  confirmUnassigned?: boolean;
};

export async function bulkUpdate(
  creds: TrelloCreds,
  cardIds: string[],
  action: BulkAction,
  payload: BulkPayload = {}
): Promise<{ results: BulkResult[]; warning?: string }> {
  if (action === "done") {
    const settled = await mapLimited(cardIds, (id) =>
      updateCard(creds, id, donePayload())
    );
    return { results: settle(cardIds, settled) };
  }

  if (action === "update") {
    const body = updatePayload({
      name: payload.name,
      // An explicit null clears the date; absent leaves it untouched.
      due:
        payload.dueDate === undefined
          ? undefined
          : payload.dueDate === null
            ? ""
            : resolveDueForTrello(payload.dueDate),
    });
    const settled = await mapLimited(cardIds, (id) =>
      updateCard(creds, id, body)
    );
    return { results: settle(cardIds, settled) };
  }

  return moveCards(creds, cardIds, payload);
}

async function moveCards(
  creds: TrelloCreds,
  cardIds: string[],
  payload: BulkPayload
): Promise<{ results: BulkResult[]; warning?: string }> {
  const boardId = payload.boardId;
  if (!boardId) {
    return {
      results: cardIds.map((cardId) => ({
        cardId,
        ok: false,
        error: "A target board is required to move cards.",
      })),
    };
  }

  // A move needs a list that lives on the target board — naming only the
  // board leaves the card somewhere unpredictable.
  const lists = await fetchLists(creds, boardId);
  const listId =
    (payload.listId && lists.find((l) => l.id === payload.listId)?.id) ??
    lists[0]?.id;
  if (!listId) {
    return {
      results: cardIds.map((cardId) => ({
        cardId,
        ok: false,
        error: "The target board has no open lists to move these cards into.",
      })),
    };
  }

  // Trello silently drops an assignment when the member is not on the target
  // board, so check first and make the user choose rather than lose it.
  let memberIds: string[] | undefined;
  let warning: string | undefined;
  if (payload.memberId) {
    const members = await fetchMembers(creds, boardId);
    const member = members.find((m) => m.id === payload.memberId);
    if (member) {
      memberIds = [member.id];
    } else if (!payload.confirmUnassigned) {
      return {
        results: [],
        warning:
          "That person is not a member of the target board, so Trello would drop the assignment. Add them to the board, pick someone else, or confirm to move the cards unassigned.",
      };
    } else {
      warning =
        "Moved without an assignee: that person is not a member of the target board.";
    }
  }

  const body = movePayload({ boardId, listId, memberIds });
  const settled = await mapLimited(cardIds, (id) => updateCard(creds, id, body));
  return { results: settle(cardIds, settled), warning };
}
