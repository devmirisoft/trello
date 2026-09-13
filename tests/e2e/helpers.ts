import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { TRELLO_STUB } from "../../playwright.config";

export const ASHA_TOKEN = "token-asha";
export const SAM_TOKEN = "token-sam";

/** Puts the fake Trello back to its seeded state. */
export const resetTrello = (request: APIRequestContext) =>
  request.post(`${TRELLO_STUB}/__reset`);

/** What the fake Trello currently holds — the assertion target for anything
 * the UI cannot show. */
export async function trelloState(request: APIRequestContext) {
  const res = await request.get(`${TRELLO_STUB}/__state`);
  return res.json() as Promise<{
    cards: {
      id: string;
      name: string;
      due: string | null;
      dueComplete: boolean;
      idList: string;
      idBoard: string;
      idMembers: string[];
    }[];
  }>;
}

let seq = 0;
export const uniqueUsername = (prefix = "user") =>
  `${prefix}${Date.now().toString(36)}${seq++}`;

export async function register(page: Page, username: string, password = "hunter2-hunter2") {
  await page.goto("/login");
  await page.getByRole("button", { name: /create one/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/connect$/);
}

export async function connectTrello(page: Page, token = ASHA_TOKEN) {
  await page.getByLabel("API key").fill("key-any");
  await page.getByLabel("Token").fill(token);
  await page.getByRole("button", { name: /^connect$/i }).click();
  await page.waitForURL(/\/boards$/);
}

export async function signUpAndConnect(
  page: Page,
  username = uniqueUsername(),
  token = ASHA_TOKEN
) {
  await register(page, username);
  await connectTrello(page, token);
  return username;
}

/** The dropdown pinned to the top of a board. */
export const memberSelect = (page: Page) => page.getByLabel("Member");

/** Whose cards the board is currently showing. */
export const shownMember = (page: Page) =>
  memberSelect(page).locator("option:checked").textContent();

/** Point the board at someone and wait for their cards — the choice lives in
 * the URL, so this is a navigation, not just a form change. */
export async function selectMember(page: Page, member: string) {
  await memberSelect(page).selectOption({ label: member });
  await page.waitForURL(/[?&]member=/);
  await expect(memberSelect(page).locator("option:checked")).toHaveText(
    new RegExp(member, "i")
  );
}

/** Board → that person's tasks on it. */
export async function openTasks(page: Page, board: string, member: string) {
  await page.getByRole("link", { name: board }).click();
  await expect(page.getByRole("heading", { name: board })).toBeVisible();
  await expect(memberSelect(page)).toBeVisible();
  // The board may already have opened on them — asking again would be a
  // no-op navigation this would then wait forever for.
  const current = await shownMember(page);
  if (!new RegExp(member, "i").test(current ?? "")) {
    await selectMember(page, member);
  }
}

/** A press held long enough to enter selection mode. Mouse input raises the
 * same pointer events the component listens for. */
export async function longPress(page: Page, selector: string, ms = 700) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no box to press`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};
