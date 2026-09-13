// Self-check for the capture->card pure logic. Run: node capture.check.mjs
// Guards the two silent-corruption paths: a mis-decoded snapshot would feed
// OCR garbage, and a UTC-parsed date would put every card on the wrong day.
import assert from "node:assert/strict";
import { dataUrlToFile } from "./src/lib/image.ts";
import {
  toLocalISODate,
  fromLocalISODate,
  dueDateForTrello,
} from "./src/lib/dates.ts";
import { avatarSrc } from "./src/lib/trello.ts";

// --- Snapshot decoding -----------------------------------------------------
const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
const b64 = Buffer.from(bytes).toString("base64");
const file = dataUrlToFile(`data:image/jpeg;base64,${b64}`, "shot.jpg");

assert.equal(file.type, "image/jpeg", "type must come from the data URL header");
assert.equal(file.name, "shot.jpg", "name must be passed through");
assert.equal(file.size, bytes.length, "every byte must survive the decode");
assert.deepEqual(
  new Uint8Array(await file.arrayBuffer()),
  bytes,
  "bytes must round-trip unchanged, including the 0xFF JPEG marker"
);
assert.equal(dataUrlToFile(`data:image/png;base64,${b64}`).type, "image/png");
assert.throws(() => dataUrlToFile("https://example.com/x.jpg"), "non-data URL must throw");

// --- Dates -----------------------------------------------------------------
// The bug this guards: new Date("2026-01-01") parses as UTC and can land on
// Dec 31 in negative-offset timezones.
for (const iso of ["2026-01-01", "2026-09-12", "2026-12-31"]) {
  assert.equal(toLocalISODate(fromLocalISODate(iso)), iso, `${iso} must round-trip`);
}
const d = fromLocalISODate("2026-09-12");
assert.equal(d.getFullYear(), 2026);
assert.equal(d.getMonth(), 8, "September is month index 8");
assert.equal(d.getDate(), 12, "must be the 12th in LOCAL time");

// The due instant must still read back as 6pm local on the chosen day.
const due = new Date(dueDateForTrello("2026-09-12"));
assert.equal(toLocalISODate(due), "2026-09-12", "due must stay on the chosen local day");
assert.equal(due.getHours(), 18, "due defaults to 6pm local");

// --- Avatars ---------------------------------------------------------------
// Trello returns a base URL for some members and only a hash for others;
// neither shape may produce a broken <img src>.
assert.equal(
  avatarSrc({ avatarUrl: "https://x/y" }, 50),
  "https://x/y/50.png",
  "base URL gets the size suffix"
);
assert.equal(
  avatarSrc({ id: "m1", avatarHash: "abc" }, 170),
  "https://trello-members.s3.amazonaws.com/m1/abc/170.png",
  "hash builds the full URL"
);
assert.equal(avatarSrc({}), null, "no avatar means initials, not a broken src");
assert.equal(
  avatarSrc({ avatarHash: "abc" }),
  null,
  "a hash without an id cannot form a URL"
);

console.log("capture + dates + avatars: 19 checks passed");
