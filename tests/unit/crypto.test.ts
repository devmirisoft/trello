import { beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

const KEY = process.env.ENCRYPTION_KEY!;

describe("lib/crypto", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
  });

  it("round-trips a Trello token", () => {
    const token = "a".repeat(64);
    expect(decrypt(encrypt(token))).toBe(token);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const a = encrypt("same-token");
    const b = encrypt("same-token");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("throws when the auth tag is tampered with", () => {
    const sealed = encrypt("secret");
    const tag = Buffer.from(sealed.authTag, "base64");
    tag[0] ^= 0xff;
    expect(() =>
      decrypt({ ...sealed, authTag: tag.toString("base64") })
    ).toThrow();
  });

  it("throws when the ciphertext is tampered with", () => {
    const sealed = encrypt("secret");
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(() =>
      decrypt({ ...sealed, ciphertext: bytes.toString("base64") })
    ).toThrow();
  });

  it("throws with the wrong key", () => {
    const sealed = encrypt("secret");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decrypt(sealed)).toThrow();
  });

  it("refuses a key that is not 32 bytes", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });

  it("names the variable when it is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
  });
});
