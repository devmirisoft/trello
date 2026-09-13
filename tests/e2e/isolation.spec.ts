import { expect, test } from "@playwright/test";
import {
  memberSelect,
  openTasks,
  resetTrello,
  SAM_TOKEN,
  signUpAndConnect,
  uniqueUsername,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetTrello(request);
});

test("two users see only their own boards, members and tasks", async ({
  browser,
}) => {
  // Separate contexts: separate cookie jars, as if two phones.
  const ashaContext = await browser.newContext();
  const samContext = await browser.newContext();
  const asha = await ashaContext.newPage();
  const sam = await samContext.newPage();

  try {
    await signUpAndConnect(asha, uniqueUsername("asha"), "token-asha");
    await signUpAndConnect(sam, uniqueUsername("sam"), SAM_TOKEN);

    // Boards: each token sees a different set on the fake Trello.
    await expect(asha.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(asha.getByRole("link", { name: "Work" })).toBeVisible();
    await expect(asha.getByRole("link", { name: "Sam Only" })).toHaveCount(0);

    await expect(sam.getByRole("link", { name: "Sam Only" })).toBeVisible();
    await expect(sam.getByRole("link", { name: "Home" })).toHaveCount(0);
    await expect(sam.getByRole("link", { name: "Work" })).toHaveCount(0);

    // Members and tasks follow the same boundary.
    await openTasks(asha, "Home", "Asha Rao");
    await expect(asha.getByText("Water the plants")).toBeVisible();

    await sam.getByRole("link", { name: "Sam Only" }).click();
    await expect(memberSelect(sam)).toBeVisible();
    // The dropdown offers only the people on the board his token can see.
    expect(await memberSelect(sam).locator("option").allTextContents()).toEqual([
      "Sam Patel",
    ]);

    // Sam cannot reach Asha's board by typing the URL either: it is not a
    // board his token can see, so he gets the not-found page and none of her
    // data. (Asserted on content, not status: a streamed response has already
    // flushed its 200 by the time notFound() is reached.)
    await sam.goto("/boards/boardA");
    await expect(sam.getByText(/could not be found/i)).toBeVisible();
    await expect(sam.getByText("Asha Rao")).toHaveCount(0);
    await expect(sam.getByText("Dev Kumar")).toHaveCount(0);
  } finally {
    await ashaContext.close();
    await samContext.close();
  }
});

test("a signed-out browser cannot reach anyone's data", async ({ page }) => {
  for (const path of ["/boards", "/boards/boardA", "/settings"]) {
    await page.goto(path);
    await page.waitForURL(/\/login$/);
  }

  // And neither can the API.
  const api = await page.request.get("/api/trello/boards");
  expect(api.status()).toBe(401);
  expect(await api.text()).not.toContain("token-asha");
});
