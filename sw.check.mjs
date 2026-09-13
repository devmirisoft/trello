// Self-check for the service worker's fetch routing. Run: node sw.check.mjs
// Guards the one rule that matters: /api/* must never be cached, because
// GET /api/config answers with the signed-in account's Trello credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handlers = {};
const swSelf = {
  addEventListener: (type, fn) => (handlers[type] = fn),
  location: { origin: "https://snap.example" },
  skipWaiting() {},
  clients: { claim() {} },
};
const cacheStub = { addAll: async () => {}, put: async () => {} };
const cachesStub = {
  open: async () => cacheStub,
  keys: async () => [],
  delete: async () => true,
  match: async () => undefined,
};
const fetchStub = async () => ({ ok: true, clone: () => ({}) });

new Function("self", "caches", "fetch", readFileSync("public/sw.js", "utf8"))(
  swSelf,
  cachesStub,
  fetchStub
);

const intercepts = (url, method = "GET") => {
  let handled = false;
  handlers.fetch({ request: { url, method }, respondWith: () => (handled = true) });
  return handled;
};

const ORIGIN = "https://snap.example";
// Cached: the app shell and hashed assets carry no user data.
assert.equal(intercepts(`${ORIGIN}/`), true, "shell should be cached");
assert.equal(intercepts(`${ORIGIN}/_next/static/chunks/main.js`), true, "assets should be cached");
assert.equal(intercepts(`${ORIGIN}/manifest.webmanifest`), true, "manifest should be cached");
// Never cached.
assert.equal(intercepts(`${ORIGIN}/api/config`), false, "/api/config holds Trello credentials");
assert.equal(intercepts(`${ORIGIN}/api/unlock`, "POST"), false, "writes must reach the server");
assert.equal(intercepts(`${ORIGIN}/`, "POST"), false, "non-GET must reach the server");
assert.equal(intercepts("https://api.trello.com/1/cards"), false, "cross-origin must pass through");

console.log("sw.js fetch routing: 7 checks passed");
