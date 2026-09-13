import { describe, expect, it } from "vitest";
import {
  cardPayload,
  donePayload,
  movePayload,
  updatePayload,
} from "@/lib/trello-payload";

describe("lib/trello-payload", () => {
  it("builds a card payload from a line, a date and a member", () => {
    expect(
      cardPayload({
        listId: "list1",
        name: "call the plumber",
        due: "2026-03-15T12:30:00.000Z",
        memberId: "member1",
      })
    ).toEqual({
      idList: "list1",
      name: "call the plumber",
      due: "2026-03-15T12:30:00.000Z",
      idMembers: "member1",
    });
  });

  it("omits due and idMembers when not given", () => {
    expect(cardPayload({ listId: "list1", name: "task" })).toEqual({
      idList: "list1",
      name: "task",
    });
  });

  it("marks done by due state, never by archiving", () => {
    const payload = donePayload();
    expect(payload).toEqual({ dueComplete: "true" });
    expect(payload).not.toHaveProperty("closed");
  });

  it("updates title and due independently", () => {
    expect(updatePayload({ name: "new title" })).toEqual({ name: "new title" });
    expect(updatePayload({ due: "2026-03-15T12:30:00.000Z" })).toEqual({
      due: "2026-03-15T12:30:00.000Z",
    });
    expect(updatePayload({})).toEqual({});
  });

  it("always sends both idBoard and idList for a cross-board move", () => {
    // Trello needs the target list as well as the target board; a board alone
    // is rejected or lands the card somewhere unpredictable.
    expect(movePayload({ boardId: "boardB", listId: "listB1" })).toEqual({
      idBoard: "boardB",
      idList: "listB1",
    });
  });

  it("only sends idMembers when reassigning", () => {
    expect(movePayload({ boardId: "b", listId: "l" })).not.toHaveProperty(
      "idMembers"
    );
    expect(
      movePayload({ boardId: "b", listId: "l", memberIds: ["m1", "m2"] })
    ).toMatchObject({ idMembers: "m1,m2" });
  });
});
