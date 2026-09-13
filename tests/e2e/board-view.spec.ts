import { expect, test } from "@playwright/test";
import { TRELLO_STUB } from "../../playwright.config";
import {
  ASHA_TOKEN,
  openLists,
  openTasks,
  resetTrello,
  signUpAndConnect,
  trelloState,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetTrello(request);
});

test("the board shows every list, and everyone's cards inside them", async ({
  page,
}) => {
  await signUpAndConnect(page);
  await page.getByRole("link", { name: "Home" }).click();

  // Every open list on the board is a row, including the empty one — the
  // rows come from the board, not from whichever cards happen to exist.
  const rows = page.getByTestId("board-lists").locator("section");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Inbox");
  await expect(rows.nth(1)).toContainText("Doing");

  // Collapsed until asked: the cards only appear once a list is opened.
  await expect(page.getByText("Water the plants")).toBeHidden();
  await openLists(page);

  // Nothing to pick first: the whole board is there, and there is no member
  // control to get past.
  await expect(page.getByText("Water the plants")).toBeVisible();
  await expect(page.getByLabel("Member")).toHaveCount(0);
});

test("the board shows cards that belong to other people too", async ({
  page,
  request,
}) => {
  await signUpAndConnect(page);

  // Seeded onto Home as Dev's, so it can only appear if the board is not
  // being filtered to the connected account.
  await request.post(`${TRELLO_STUB}/1/cards?key=key-any&token=${ASHA_TOKEN}`, {
    params: { idList: "listA1", name: "Dev's own card", idMembers: "member3" },
  });

  await openTasks(page, "Home");
  await expect(page.getByText("Dev's own card")).toBeVisible();
  await expect(page.getByText("Water the plants")).toBeVisible();
});

test("a captured card is assigned to the connected account", async ({
  page,
  request,
}) => {
  await signUpAndConnect(page);
  await openTasks(page, "Home");

  await page.getByTestId("camera-fab").click();
  await page.getByRole("button", { name: /^capture$/i }).click();
  await expect(page.getByRole("heading", { name: /check the tasks/i })).toBeVisible({
    timeout: 90_000,
  });

  // Push into the board's other list, so the list dropdown is load-bearing.
  await page.getByLabel(/add to list/i).selectOption({ label: "Doing" });

  const lines = page.getByTestId("preview-lines").getByRole("textbox");
  await lines.first().fill("A brand new task");
  await page.getByRole("button", { name: /create \d+ card/i }).click();

  await openLists(page);
  await expect(page.getByText("A brand new task")).toBeVisible();

  const { cards } = await trelloState(request);
  const created = cards.find((c) => c.name === "A brand new task")!;
  expect(created.idList).toBe("listA2");
  // The token belongs to Asha, so the card does too — no dropdown involved.
  expect(created.idMembers).toEqual(["member1"]);
});

test("each preview card carries its own date, and the batch one fills the rest", async ({
  page,
  request,
}) => {
  await signUpAndConnect(page);
  await openTasks(page, "Home");

  await page.getByTestId("camera-fab").click();
  await page.getByRole("button", { name: /^capture$/i }).click();
  await expect(page.getByRole("heading", { name: /check the tasks/i })).toBeVisible({
    timeout: 90_000,
  });

  const lines = page.getByTestId("preview-lines").getByRole("textbox");
  // Two known titles so the assertions do not depend on what the OCR read.
  await lines.nth(0).fill("Has its own date");
  await lines.nth(1).fill("Follows the batch");
  // Anything past the first two would also follow the batch date; trimming to
  // two keeps the assertion about exactly these.
  const boxes = page.getByTestId("preview-lines").getByRole("checkbox");
  for (let i = 2, total = await boxes.count(); i < total; i++) {
    await boxes.nth(i).uncheck();
  }

  // Give card 1 a day of its own, then move the batch date somewhere else.
  const own = await pickADay(page, "Due date for task 1");
  const batch = await pickADay(page, "Due date for all", own);

  await page.getByRole("button", { name: /create \d+ card/i }).click();
  await openLists(page);
  await expect(page.getByText("Has its own date")).toBeVisible();

  const { cards } = await trelloState(request);
  const localDay = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // The batch date filled the blank card and left the other one alone.
  expect(localDay(cards.find((c) => c.name === "Has its own date")!.due!)).toBe(own);
  expect(localDay(cards.find((c) => c.name === "Follows the batch")!.due!)).toBe(
    batch
  );
});

/** Opens a date picker and clicks a day in the month it is already showing,
 * avoiding `not`. Returns the yyyy-mm-dd that was picked. */
async function pickADay(
  page: import("@playwright/test").Page,
  label: string,
  not?: string
) {
  await page.getByRole("button", { name: label }).click();

  const today = new Date();
  const taken = not ? Number(not.slice(-2)) : 0;
  const day = [1, 2, 3].find((d) => d !== today.getDate() && d !== taken)!;

  // The calendar stamps data-day with the *browser's* locale formatting, so
  // the browser is asked to produce the same string rather than Node.
  const target = new Date(today.getFullYear(), today.getMonth(), day);
  const stamp = await page.evaluate(
    (ms) => new Date(ms).toLocaleDateString(),
    target.getTime()
  );
  await page.locator(`[data-day="${stamp}"]`).click();

  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
