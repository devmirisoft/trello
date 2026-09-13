import { describe, expect, it } from "vitest";
import { trelloApiBase } from "@/lib/trello";

// Meta-test: proves the isolation guard in tests/setup/common.ts actually
// fires. If this ever passes silently, the rest of the suite could be talking
// to real Trello without anyone noticing.
describe("real-Trello guard", () => {
  it("throws on any request to api.trello.com", () => {
    expect(() => fetch("https://api.trello.com/1/members/me")).toThrow(
      /Blocked outbound request to real Trello/
    );
  });

  it("throws for a Request object too", () => {
    expect(() =>
      fetch(new Request("https://api.trello.com/1/cards", { method: "POST" }))
    ).toThrow(/Blocked outbound request/);
  });

  it("lets non-Trello hosts through to the real fetch", () => {
    // Not awaited: we only care that the guard did not throw synchronously.
    expect(() => fetch("http://127.0.0.1:1/nothing").catch(() => {})).not.toThrow();
  });

  it("defaults to real Trello but is overridable for tests", () => {
    const previous = process.env.TRELLO_API_BASE;
    delete process.env.TRELLO_API_BASE;
    expect(trelloApiBase()).toBe("https://api.trello.com/1");
    process.env.TRELLO_API_BASE = "http://localhost:9999/1";
    expect(trelloApiBase()).toBe("http://localhost:9999/1");
    if (previous === undefined) delete process.env.TRELLO_API_BASE;
    else process.env.TRELLO_API_BASE = previous;
  });
});
