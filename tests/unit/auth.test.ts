import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import {
  clearedSessionCookie,
  hashPassword,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
  signSession,
  verifyPassword,
  verifySession,
} from "@/lib/auth";

const USER_ID = "68c3f0a1b2c3d4e5f6a7b8c9";

describe("lib/auth passwords", () => {
  it("verifies the correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("uses bcrypt at cost 10", async () => {
    expect(await hashPassword("x")).toMatch(/^\$2[aby]\$10\$/);
  });
});

describe("lib/auth JWT", () => {
  it("round-trips the userId in sub", async () => {
    expect(await verifySession(await signSession(USER_ID))).toBe(USER_ID);
  });

  it("carries no username in the payload", async () => {
    // This is what makes a username change safe: nothing in the token names
    // the account except its immutable _id.
    const payload = decodeJwt(await signSession(USER_ID));
    expect(payload.sub).toBe(USER_ID);
    expect(payload).not.toHaveProperty("username");
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(USER_ID);
    const [header, body, signature] = token.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString());
    forged.sub = "68c3f0a1b2c3d4e5f6a7b8ff";
    const swapped = `${header}.${Buffer.from(JSON.stringify(forged)).toString(
      "base64url"
    )}.${signature}`;
    expect(await verifySession(swapped)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(USER_ID);
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "some-other-secret-entirely";
    expect(await verifySession(token)).toBeNull();
    process.env.SESSION_SECRET = original;
  });

  it("rejects an expired token", async () => {
    expect(await verifySession(await signSession(USER_ID, "-1s"))).toBeNull();
  });

  it("rejects junk and absent tokens", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
    expect(await verifySession("not-a-jwt")).toBeNull();
  });
});

describe("lib/auth cookies", () => {
  const req = (cookie: string) =>
    new Request("http://x/", { headers: { cookie } });

  it("reads one cookie out of many", () => {
    expect(
      readCookie(req(`a=1; ${SESSION_COOKIE}=abc.def; z=9`), SESSION_COOKIE)
    ).toBe("abc.def");
  });

  it("returns undefined when absent", () => {
    expect(readCookie(new Request("http://x/"), SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(req("other=1"), SESSION_COOKIE)).toBeUndefined();
  });

  it("sets an httpOnly, lax, 30-day cookie", () => {
    const header = sessionCookie("tok");
    expect(header).toContain(`${SESSION_COOKIE}=tok`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain(`Max-Age=${30 * 86400}`);
  });

  it("clears with a zero max-age", () => {
    expect(clearedSessionCookie()).toContain("Max-Age=0");
  });
});
