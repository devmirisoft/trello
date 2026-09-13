// Runs before every test in every project.
//
// 1. Deterministic secrets, so no test depends on a developer's .env.local.
// 2. A hard guard: any outbound request to the real Trello throws. Combined
//    with MSW's onUnhandledRequest:"error", a test can neither reach Trello
//    nor quietly skip stubbing it.

process.env.SESSION_SECRET ??= "test-session-secret-value-for-vitest";
// 32 zero bytes, base64.
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.MONGODB_DB ??= "trello-snap-test";

export const REAL_TRELLO_HOST = "api.trello.com";

const realFetch = globalThis.fetch;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const raw = urlOf(input);
  let host = "";
  try {
    host = new URL(raw).host;
  } catch {
    // Relative URL — cannot be Trello.
  }
  if (host === REAL_TRELLO_HOST || host.endsWith(`.${REAL_TRELLO_HOST}`)) {
    throw new Error(
      `Blocked outbound request to real Trello (${raw}). Tests must use TRELLO_API_BASE against a stub.`
    );
  }
  return realFetch(input, init);
} as typeof fetch;
