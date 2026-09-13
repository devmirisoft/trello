import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CardPreviewList, {
  type ExtractedTask,
} from "@/components/CardPreviewList";
import { formatFriendly, todayLocalISODate } from "@/lib/dates";

const LISTS = [
  { id: "listA1", name: "Inbox" },
  { id: "listA2", name: "Doing" },
];

const LINES = ["Call the plumber", "Email Sam", "Book flights"];

let fetchMock: ReturnType<typeof vi.fn>;

function setup(tasks: (string | ExtractedTask)[] = LINES) {
  const onDone = vi.fn();
  render(
    <CardPreviewList
      boardId="boardA"
      memberId="member1"
      lists={LISTS}
      initialTasks={tasks}
      onDone={onDone}
      onStartOver={vi.fn()}
    />
  );
  return { onDone };
}

/** The body our code would have POSTed to the bulk endpoint. */
const submitted = () => JSON.parse(fetchMock.mock.calls[0][1].body);

const confirmButton = () => screen.getByRole("button", { name: /create \d+ card/i });

/** Opens the named date picker and clicks a day in the month already shown.
 * Returns the yyyy-mm-dd that was picked. */
async function pickDay(pickerLabel: string, dayOfMonth: number) {
  await userEvent.click(screen.getByRole("button", { name: pickerLabel }));

  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
  // react-day-picker stamps each day button with data-day, which is stabler
  // than its label text.
  const cell = await waitFor(() => {
    const el = document.querySelector<HTMLButtonElement>(
      `[data-day="${target.toLocaleDateString()}"]`
    );
    if (!el) throw new Error("calendar day not rendered yet");
    return el;
  });
  await userEvent.click(cell);

  return todayLocalISODate().replace(
    /\d{2}$/,
    String(dayOfMonth).padStart(2, "0")
  );
}

/** Two days that are both in the current month and neither of them today. */
const otherDays = () => {
  const today = new Date().getDate();
  return [1, 2, 3].filter((d) => d !== today).slice(0, 2) as [number, number];
};

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{ cardId: "card1", ok: true }] }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("CardPreviewList", () => {
  it("renders one editable card per OCR line", () => {
    setup();
    const inputs = screen.getAllByLabelText(/^Task \d+$/);
    expect(inputs).toHaveLength(3);
    expect(inputs.map((i) => (i as HTMLInputElement).value)).toEqual(LINES);
  });

  it("gives every card its own date control", () => {
    setup();
    expect(screen.getAllByRole("button", { name: /^Due date for task \d+$/ }))
      .toHaveLength(3);
  });

  it("counts every line on the confirm button to start with", () => {
    setup();
    expect(confirmButton().textContent).toContain("Create 3 cards");
  });

  it("updates the confirm count when a line is unchecked", async () => {
    setup();
    await userEvent.click(screen.getByLabelText(`Include "Email Sam"`));
    expect(confirmButton().textContent).toContain("Create 2 cards");

    await userEvent.click(screen.getByLabelText(`Include "Book flights"`));
    expect(confirmButton().textContent).toContain("Create 1 card");
  });

  it("leaves an unchecked line out of the payload", async () => {
    setup();
    await userEvent.click(screen.getByLabelText(`Include "Email Sam"`));
    await userEvent.click(confirmButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submitted().tasks.map((t: { name: string }) => t.name)).toEqual([
      "Call the plumber",
      "Book flights",
    ]);
  });

  it("removes a line entirely", async () => {
    setup();
    await userEvent.click(screen.getByLabelText(`Remove "Email Sam"`));
    expect(screen.getAllByLabelText(/^Task \d+$/)).toHaveLength(2);
    expect(confirmButton().textContent).toContain("Create 2 cards");
  });

  it("sends edited text rather than what the OCR read", async () => {
    setup();
    const first = screen.getAllByLabelText(/^Task \d+$/)[0];
    await userEvent.clear(first);
    await userEvent.type(first, "Call the electrician");
    await userEvent.click(confirmButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submitted().tasks[0].name).toBe("Call the electrician");
  });

  it("disables confirm when nothing is selected", async () => {
    setup(["Only line"]);
    await userEvent.click(screen.getByLabelText(`Include "Only line"`));
    expect(confirmButton()).toHaveProperty("disabled", true);
  });

  it("adds a blank line on request", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /add a line/i }));
    expect(screen.getAllByLabelText(/^Task \d+$/)).toHaveLength(4);
  });
});

describe("CardPreviewList dates", () => {
  it("shows today before any picker is opened", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Due date for all" }).textContent
    ).toContain(formatFriendly(todayLocalISODate()));
  });

  it("sends today on every card when no picker is ever touched", async () => {
    setup();
    await userEvent.click(confirmButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    for (const task of submitted().tasks) {
      expect(task.dueDate).toBe(todayLocalISODate());
    }
  });

  it("starts a card on the date its own line named", () => {
    setup([{ text: "Submit the form", dueDate: "2026-03-15" }]);
    expect(
      screen.getByRole("button", { name: "Due date for task 1" }).textContent
    ).toContain(formatFriendly("2026-03-15"));
  });

  it("sends a per-card date instead of the batch one", async () => {
    setup();
    const [day] = otherDays();
    const picked = await pickDay("Due date for task 2", day);

    await userEvent.click(confirmButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const tasks = submitted().tasks;
    expect(tasks[1].dueDate).toBe(picked);
    // The other two still follow the batch date.
    expect(tasks[0].dueDate).toBe(todayLocalISODate());
    expect(tasks[2].dueDate).toBe(todayLocalISODate());
  });

  it("fills the blank cards when the batch date moves, and only those", async () => {
    setup();
    const [ownDay, batchDay] = otherDays();

    // Card 2 is given a date of its own first.
    const own = await pickDay("Due date for task 2", ownDay);
    // Then the batch date is moved somewhere else entirely.
    const batch = await pickDay("Due date for all", batchDay);

    await userEvent.click(confirmButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const tasks = submitted().tasks;
    expect(tasks[0].dueDate).toBe(batch);
    expect(tasks[2].dueDate).toBe(batch);
    // Not overwritten: a date the card already carried survives the batch.
    expect(tasks[1].dueDate).toBe(own);
  });

  it("does not overwrite a date that came off the photo", async () => {
    setup([
      { text: "Submit by Friday", dueDate: "2026-03-15" },
      { text: "No date on this one" },
    ]);
    const [, batchDay] = otherDays();
    const batch = await pickDay("Due date for all", batchDay);

    await userEvent.click(confirmButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const tasks = submitted().tasks;
    expect(tasks[0].dueDate).toBe("2026-03-15");
    expect(tasks[1].dueDate).toBe(batch);
  });
});

describe("CardPreviewList target list", () => {
  it("defaults to the board's first list", async () => {
    setup();
    await userEvent.click(confirmButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submitted().listId).toBe("listA1");
    expect(submitted().memberId).toBe("member1");
  });

  it("remembers the last list chosen for this board", async () => {
    const { unmount } = render(
      <CardPreviewList
        boardId="boardA"
        memberId="member1"
        lists={LISTS}
        initialTasks={["one task"]}
        onDone={vi.fn()}
        onStartOver={vi.fn()}
      />
    );
    await userEvent.selectOptions(screen.getByLabelText(/add to list/i), "listA2");
    await userEvent.click(confirmButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submitted().listId).toBe("listA2");
    unmount();

    fetchMock.mockClear();
    setup(["another task"]);
    await waitFor(() =>
      expect((screen.getByLabelText(/add to list/i) as HTMLSelectElement).value).toBe(
        "listA2"
      )
    );
  });
});
