import { expect, test } from "@playwright/test";

test("serves a web app manifest", async ({ page }) => {
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);

  const manifest = await res.json();
  expect(manifest.name).toMatch(/trello snap/i);
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test("registers a service worker and opens offline afterwards", async ({
  browser,
}) => {
  // A fresh context: no existing registration, no warm cache.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("/login");

    // Wait for the worker to take control, not merely to be registered —
    // an installing worker has not filled the cache yet.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener("controllerchange", resolve, {
            once: true,
          })
        );
      }
      return reg.active?.state;
    });

    await context.setOffline(true);
    await page.reload();

    // The app shell still renders with the network gone.
    await expect(page.getByRole("heading", { name: /trello snap/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await context.close();
  }
});
