import { expect, test } from "@playwright/test";
import {
  longPress,
  openTasks,
  resetTrello,
  signUpAndConnect,
  trelloState,
} from "./helpers";

// Everything here is about the phone gestures, so it only runs on the 390x844
// project.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await resetTrello(request);
});

test("long-press selects, and marking done sticks", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone gesture");

  await signUpAndConnect(page);
  await openTasks(page, "Home");

  await expect(page.getByTestId("action-bar")).toHaveCount(0);

  await longPress(page, '[data-testid="task-card-seed-1"]');
  await expect(page.getByTestId("action-bar")).toBeVisible();
  await expect(page.getByText("1 selected")).toBeVisible();

  // A plain tap adds the second one now that selection mode is on.
  await page.locator('[data-testid="task-card-seed-2"]').click();
  await expect(page.getByText("2 selected")).toBeVisible();

  await page.getByRole("button", { name: /^done$/i }).click();

  await expect(page.getByTestId("done-card-seed-1")).toBeVisible();
  await expect(page.getByTestId("done-card-seed-2")).toBeVisible();

  const { cards } = await trelloState(request);
  expect(cards.filter((c) => c.dueComplete).map((c) => c.id).sort()).toEqual([
    "card-seed-1",
    "card-seed-2",
  ]);
});

test("the camera button clears the bottom of the screen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout");

  await signUpAndConnect(page);
  await openTasks(page, "Home");

  const box = (await page.getByTestId("camera-fab").boundingBox())!;
  const viewport = page.viewportSize()!;
  // Bottom-centre, fully on screen, and at least a thumb's width.
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(8);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.y).toBeGreaterThan(viewport.height / 2);
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test("moving to another board keeps the same person", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone gesture");

  await signUpAndConnect(page);
  await openTasks(page, "Home");

  await longPress(page, '[data-testid="task-card-seed-1"]');
  await page.locator('[data-testid="task-card-seed-2"]').click();
  await page.getByRole("button", { name: /^move$/i }).click();

  const dialog = page.getByRole("dialog", { name: /move cards/i });
  await expect(dialog).toBeVisible();
  // Work has Asha on it, so the assignment survives untouched.
  await dialog.getByLabel("Board").selectOption({ label: "Work" });
  await expect(
    dialog.getByText(/keeping whoever they are assigned to now/i)
  ).toBeVisible();
  await dialog.getByRole("button", { name: /^move$/i }).click();

  // Gone from this board's list, and on the other board still assigned.
  await expect(page.getByText("Water the plants")).toHaveCount(0);
  const { cards } = await trelloState(request);
  for (const id of ["card-seed-1", "card-seed-2"]) {
    const card = cards.find((c) => c.id === id)!;
    expect(card.idBoard).toBe("boardB");
    expect(card.idList).toBe("listB1");
    expect(card.idMembers).toEqual(["member1"]);
  }
});

test("moving to a board the assignee is not on says so first", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone gesture");

  await signUpAndConnect(page);
  await openTasks(page, "Home");

  await longPress(page, '[data-testid="task-card-seed-1"]');
  await page.getByRole("button", { name: /^move$/i }).click();

  const dialog = page.getByRole("dialog", { name: /move cards/i });
  // The card belongs to Asha, who can see Shared Board but is not a member of
  // it, so Trello would silently drop the assignment on arrival.
  await dialog.getByLabel("Board").selectOption({ label: "Shared Board" });
  await expect(
    dialog.getByText(/someone these cards belong to is[\s\S]*not on this board/i)
  ).toBeVisible();

  // Nothing has moved while the sheet is still open.
  let state = await trelloState(request);
  expect(state.cards.find((c) => c.id === "card-seed-1")!.idBoard).toBe("boardA");

  await dialog.getByRole("button", { name: /^move$/i }).click();
  await expect(page.getByText("Water the plants")).toHaveCount(0);

  state = await trelloState(request);
  const moved = state.cards.find((c) => c.id === "card-seed-1")!;
  expect(moved.idBoard).toBe("boardD");
  // Exactly what the warning said would happen.
  expect(moved.idMembers).toEqual([]);
});

test("reassigning sends the cards to someone else", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone gesture");

  await signUpAndConnect(page);
  await openTasks(page, "Home");

  await longPress(page, '[data-testid="task-card-seed-1"]');
  await page.getByRole("button", { name: /^move$/i }).click();

  const dialog = page.getByRole("dialog", { name: /move cards/i });
  await dialog.getByLabel("Board").selectOption({ label: "Home" });
  await dialog.getByLabel(/assign to someone else/i).check();
  await dialog.getByLabel("New assignee").selectOption({ label: "Dev Kumar" });
  await dialog.getByRole("button", { name: /^move$/i }).click();
  await expect(dialog).toHaveCount(0);

  // It stays on the board — the board shows everyone's cards — but it is
  // Dev's now.
  const { cards } = await trelloState(request);
  expect(cards.find((c) => c.id === "card-seed-1")!.idMembers).toEqual(["member3"]);
});

test("prefers-reduced-motion turns the list animations off", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout");

  const context = await browser.newContext({
    ...testInfo.project.use,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await signUpAndConnect(page);
    await openTasks(page, "Home");

    const row = page.locator('[data-testid="task-card-seed-1"]').locator("xpath=..");
    const { duration, delay } = await row.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        duration: style.animationDuration,
        delay: style.animationDelay,
      };
    });
    // Collapsed to instant rather than merely shortened.
    expect(parseFloat(duration)).toBeLessThan(0.05);
    expect(parseFloat(delay)).toBe(0);
  } finally {
    await context.close();
  }
});
