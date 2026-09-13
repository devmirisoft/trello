import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskList from "@/components/TaskList";
import { LONG_PRESS_MS, MOVE_TOLERANCE_PX } from "@/hooks/useLongPress";
import type { TrelloCard } from "@/lib/trello";

const LISTS = [
  { id: "listA1", name: "Inbox" },
  { id: "listA2", name: "Doing" },
];

const card = (
  id: string,
  name: string,
  dueComplete = false,
  idList = "listA1"
): TrelloCard => ({
  id,
  name,
  due: null,
  dueComplete,
  idList,
  idBoard: "boardA",
  idMembers: ["member1"],
});

const CARDS = [
  card("c1", "Call the plumber"),
  card("c2", "Email Sam"),
  card("c3", "Book flights"),
];

function setup(cards = CARDS, lists = LISTS) {
  const onAction = vi.fn();
  const onCapture = vi.fn();
  render(
    <TaskList
      cards={cards}
      lists={lists}
      onAction={onAction}
      onCapture={onCapture}
    />
  );
  return { onAction, onCapture };
}

const row = (id: string) => screen.getByTestId(`task-${id}`);
const actionBar = () => screen.queryByTestId("action-bar");

/** A press held for `ms` and then released, with fake timers driving the clock
 * so a 500ms hold does not cost the suite 500ms. */
async function press(
  el: HTMLElement,
  ms: number,
  move?: { dx: number; dy: number }
) {
  const at = { clientX: 100, clientY: 100 };
  await act(async () => {
    el.dispatchEvent(pointerEvent("pointerdown", at));
  });
  if (move) {
    await act(async () => {
      el.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: at.clientX + move.dx,
          clientY: at.clientY + move.dy,
        })
      );
    });
  }
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    el.dispatchEvent(pointerEvent("pointerup", at));
  });
}

function pointerEvent(
  type: string,
  { clientX, clientY }: { clientX: number; clientY: number }
) {
  // jsdom has no PointerEvent, but React's synthetic pointer handlers listen
  // for these types on a plain MouseEvent just fine.
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "button", { value: 0 });
  return event;
}

describe("TaskList long-press selection", () => {
  it("enters selection mode after a 500ms hold", async () => {
    vi.useFakeTimers();
    try {
      setup();
      expect(actionBar()).toBeNull();

      await press(row("c1"), LONG_PRESS_MS);

      expect(actionBar()).not.toBeNull();
      expect(row("c1")).toHaveProperty("dataset.selected", "true");
      expect(screen.getByText("1 selected")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not select on a normal tap released at 300ms", async () => {
    vi.useFakeTimers();
    try {
      setup();
      await press(row("c1"), 300);
      expect(actionBar()).toBeNull();
      expect(row("c1").dataset.selected).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("buzzes once the hold completes", async () => {
    vi.useFakeTimers();
    const vibrate = vi.spyOn(navigator, "vibrate").mockReturnValue(true);
    try {
      setup();
      await press(row("c1"), LONG_PRESS_MS);
      expect(vibrate).toHaveBeenCalledWith(10);
    } finally {
      vibrate.mockRestore();
      vi.useRealTimers();
    }
  });

  it("cancels the hold when the finger moves more than 10px (scrolling)", async () => {
    vi.useFakeTimers();
    try {
      setup();
      await press(row("c1"), LONG_PRESS_MS, {
        dx: 0,
        dy: MOVE_TOLERANCE_PX + 5,
      });
      expect(actionBar()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("tolerates a small wobble within 10px", async () => {
    vi.useFakeTimers();
    try {
      setup();
      await press(row("c1"), LONG_PRESS_MS, { dx: 3, dy: 4 });
      expect(actionBar()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("toggles other rows with a plain tap once in selection mode", async () => {
    vi.useFakeTimers();
    try {
      setup();
      await press(row("c1"), LONG_PRESS_MS);
      await press(row("c2"), 100);
      expect(screen.getByText("2 selected")).toBeTruthy();

      await press(row("c3"), 100);
      expect(screen.getByText("3 selected")).toBeTruthy();

      // Tapping a selected row takes it back out.
      await press(row("c2"), 100);
      expect(screen.getByText("2 selected")).toBeTruthy();
      expect(row("c2").dataset.selected).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the action bar once everything is deselected", async () => {
    vi.useFakeTimers();
    try {
      setup();
      await press(row("c1"), LONG_PRESS_MS);
      await press(row("c2"), 100);
      expect(actionBar()).not.toBeNull();

      await press(row("c1"), 100);
      await press(row("c2"), 100);

      expect(actionBar()).toBeNull();
      // And the camera button comes back.
      expect(screen.getByTestId("camera-fab")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the camera button while selecting", async () => {
    vi.useFakeTimers();
    try {
      setup();
      expect(screen.getByTestId("camera-fab")).toBeTruthy();
      await press(row("c1"), LONG_PRESS_MS);
      expect(screen.queryByTestId("camera-fab")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends the selection to the action handler and clears it", async () => {
    vi.useFakeTimers();
    let onAction: ReturnType<typeof vi.fn>;
    try {
      ({ onAction } = setup());
      await press(row("c1"), LONG_PRESS_MS);
      await press(row("c3"), 100);
      await act(async () => {
        screen.getByRole("button", { name: /done/i }).click();
      });
      expect(onAction).toHaveBeenCalledWith("done", ["c1", "c3"]);
      expect(actionBar()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TaskList columns", () => {
  it("renders every list as a column, in the board's order, even empty ones", () => {
    // All three cards are in Inbox, so Doing has to come from the board's
    // lists rather than from the cards.
    setup();
    const columns = Array.from(
      screen.getByTestId("board-lists").querySelectorAll("section")
    );
    expect(columns.map((c) => c.querySelector("h2")!.textContent)).toEqual([
      "Inbox3",
      "Doing0",
    ]);
  });

  it("puts each card in its own list's column", () => {
    setup([
      card("c1", "In the inbox"),
      card("c2", "Being done", false, "listA2"),
    ]);
    expect(
      screen.getByTestId("list-listA1").textContent
    ).toContain("In the inbox");
    expect(screen.getByTestId("list-listA2").textContent).toContain(
      "Being done"
    );
  });

  it("keeps a card whose list is no longer open rather than hiding it", () => {
    setup([card("c1", "Stranded", false, "listGone")]);
    // Archiving a list in Trello leaves its cards open, so they would
    // otherwise vanish from the board entirely.
    expect(screen.getByTestId("list-elsewhere").textContent).toContain(
      "Stranded"
    );
  });
});

describe("TaskList rendering", () => {
  it("marks finished cards as done", () => {
    setup([card("c1", "Already done", true)]);
    expect(screen.getByTestId("done-c1")).toBeTruthy();
  });

  it("offers the camera when the list is empty", async () => {
    const { onCapture } = setup([]);
    expect(screen.getByText(/no open cards/i)).toBeTruthy();
    await userEvent.click(screen.getByTestId("camera-fab"));
    expect(onCapture).toHaveBeenCalled();
  });
});
