// Self-check for the passcode hash and the session token. Run: node auth.check.mjs
// Guards the two rules the whole gate rests on: a wrong passcode never
// verifies, and a cookie this server did not sign is never accepted.
import assert from "node:assert/strict";
import {
  hashPasscode,
  verifyPasscode,
  signToken,
  verifyToken,
} from "./src/lib/passcode.ts";

const SECRET = "test-secret";

// --- Passcode --------------------------------------------------------------
const stored = hashPasscode("snap1234");
assert.equal(verifyPasscode("snap1234", stored), true, "correct passcode must verify");
assert.equal(verifyPasscode("snap1235", stored), false, "wrong passcode must fail");
assert.equal(verifyPasscode("", stored), false, "empty passcode must fail");
assert.notEqual(hashPasscode("snap1234"), stored, "salt must make each hash unique");
assert.equal(stored.includes("snap1234"), false, "passcode must never be stored in the clear");
assert.equal(verifyPasscode("snap1234", "garbage"), false, "malformed hash must fail, not throw");

// --- Session token ---------------------------------------------------------
const token = signToken(SECRET, 60_000);
assert.equal(verifyToken(token, SECRET), true, "freshly signed token must verify");
assert.equal(verifyToken(token, "other-secret"), false, "token must not verify under another secret");
assert.equal(verifyToken(undefined, SECRET), false, "absent cookie must fail");
assert.equal(verifyToken(signToken(SECRET, -1000), SECRET), false, "expired token must fail");

// Forged: a valid-looking payload with a bogus signature must be rejected.
const forged = `${token.split(".")[0]}.${"a".repeat(43)}`;
assert.equal(verifyToken(forged, SECRET), false, "forged signature must fail");
// Tampered: an attacker-extended expiry invalidates the signature.
const far = Buffer.from(JSON.stringify({ exp: Date.now() + 9e12 })).toString("base64url");
assert.equal(verifyToken(`${far}.${token.split(".")[1]}`, SECRET), false, "tampered expiry must fail");

console.log("passcode + session token: 12 checks passed");
