import { expect, test } from "@playwright/test";
import {
  connectTrello,
  openLists,
  openTasks,
  register,
  resetTrello,
  signUpAndConnect,
  todayISO,
  trelloState,
  uniqueUsername,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetTrello(request);
});

test("register, connect Trello, photograph a list, and see the new cards", async ({
  page,
  request,
}) => {
  await register(page, uniqueUsername("happy"));

  // 2. Connect Trello — only asked for because this account has none yet.
  await expect(page.getByRole("heading", { name: /connect trello/i })).toBeVisible();
  await connectTrello(page);

  // 3. Boards, 4. the board itself, showing one person's cards.
  await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
  await openTasks(page, "Home");
  await expect(page.getByText("Water the plants")).toBeVisible();

  // 6. Capture — the camera button sits at the bottom of the screen.
  const fab = page.getByTestId("camera-fab");
  await expect(fab).toBeVisible();
  await fab.click();
  await page.getByRole("button", { name: /^capture$/i }).click();

  // 7. Preview: one editable card per line the OCR read off the fake camera.
  await expect(page.getByRole("heading", { name: /check the tasks/i })).toBeVisible({
    timeout: 90_000,
  });
  const lines = page.getByTestId("preview-lines").getByRole("textbox");
  await expect(lines.first()).toBeVisible();
  expect(await lines.count()).toBeGreaterThan(0);

  // Make one line unambiguous so the assertion does not depend on OCR
  // reading every word of the fixture perfectly.
  await lines.first().fill("Call the plumber");

  // 8. Confirm, and land back on the task list with the new card on it.
  await page.getByRole("button", { name: /create \d+ card/i }).click();
  await openLists(page);
  await expect(page.getByText("Call the plumber")).toBeVisible();
  await expect(page.getByText("Water the plants")).toBeVisible();

  // And the fake Trello really received it, in the right list and assigned.
  const { cards } = await trelloState(request);
  const created = cards.find((c) => c.name === "Call the plumber");
  expect(created).toBeTruthy();
  expect(created!.idList).toBe("listA1");
  expect(created!.idMembers).toEqual(["member1"]);
});

test("a card confirmed without opening the date picker is due today", async ({
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
  await lines.first().fill("Due today by default");
  // Deliberately never touching the date picker.
  await page.getByRole("button", { name: /create \d+ card/i }).click();
  await openLists(page);
  await expect(page.getByText("Due today by default")).toBeVisible();

  const { cards } = await trelloState(request);
  const created = cards.find((c) => c.name === "Due today by default")!;
  expect(created.due).toBeTruthy();
  expect(new Date(created.due!).toISOString()).toBeTruthy();
  // Converted back to the local calendar day, it is today.
  const local = new Date(created.due!);
  const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
  expect(day).toBe(todayISO());
});

test("a reload keeps you signed in, and signing out locks the app again", async ({
  page,
}) => {
  await signUpAndConnect(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(/\/login$/);

  // Protected routes bounce back to the sign-in screen.
  await page.goto("/boards");
  await page.waitForURL(/\/login$/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("changing your username mid-session keeps the session and Trello", async ({
  page,
}) => {
  const username = await signUpAndConnect(page);
  await page.goto("/settings");

  await expect(page.getByText(/trello is connected/i)).toBeVisible();
  await page.getByLabel("Username").fill(`${username}-renamed`);
  await page.getByLabel("Current password").fill("hunter2-hunter2");
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByText(/still signed in/i)).toBeVisible();

  // No re-login: straight back to work, Trello still connected.
  await page.goto("/boards");
  await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
  await openTasks(page, "Home");
  await expect(page.getByText("Water the plants")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByLabel("Username")).toHaveValue(`${username}-renamed`);
  await expect(page.getByText(/trello is connected/i)).toBeVisible();
});
