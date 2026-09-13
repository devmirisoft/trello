// Pure request-body builders for the Trello API. No network, no env, no auth
// — just the shapes, so they can be asserted on directly.

export type CardInput = {
  listId: string;
  name: string;
  due?: string;
  memberId?: string;
};

export function cardPayload(input: CardInput): Record<string, string> {
  const body: Record<string, string> = {
    idList: input.listId,
    name: input.name,
  };
  if (input.due) body.due = input.due;
  // Trello takes idMembers as a comma-separated list even for a single member.
  if (input.memberId) body.idMembers = input.memberId;
  return body;
}

/** Marking done is a due-date state change, not an archive: the card stays on
 * the board with its checkmark filled in. */
export const donePayload = (): Record<string, string> => ({
  dueComplete: "true",
});

export type UpdateInput = { name?: string; due?: string };

export function updatePayload(input: UpdateInput): Record<string, string> {
  const body: Record<string, string> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.due !== undefined) body.due = input.due;
  return body;
}

export type MoveInput = {
  boardId: string;
  /** Must belong to `boardId` — Trello rejects (or silently misplaces) a move
   * that names a board without a list inside it. */
  listId: string;
  /** Omit to leave the assignment alone; pass to reassign. */
  memberIds?: string[];
};

export function movePayload(input: MoveInput): Record<string, string> {
  const body: Record<string, string> = {
    idBoard: input.boardId,
    idList: input.listId,
  };
  if (input.memberIds) body.idMembers = input.memberIds.join(",");
  return body;
}
