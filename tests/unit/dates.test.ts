import { afterAll, describe, expect, it } from "vitest";
import {
  dueDateForTrello,
  resolveDueForTrello,
  toLocalISODate,
  todayLocalISODate,
} from "@/lib/dates";

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

// Two zones on opposite sides of UTC: +05:30 keeps a local evening inside the
// same UTC day, -07:00 pushes it into the next one. Anything doing manual
// timezone arithmetic breaks in exactly one of them.
for (const tz of ["Asia/Kolkata", "America/Los_Angeles"]) {
  describe(`lib/dates in ${tz}`, () => {
    // Node re-reads process.env.TZ on the next Date construction.
    const useTz = () => {
      process.env.TZ = tz;
    };

    it("resolves an untouched picker to today", () => {
      useTz();
      const due = resolveDueForTrello(undefined);
      expect(toLocalISODate(new Date(due))).toBe(todayLocalISODate());
    });

    it("treats null and empty string as today too", () => {
      useTz();
      expect(toLocalISODate(new Date(resolveDueForTrello(null)))).toBe(
        todayLocalISODate()
      );
      expect(toLocalISODate(new Date(resolveDueForTrello("")))).toBe(
        todayLocalISODate()
      );
    });

    it("keeps a chosen calendar day through ISO conversion", () => {
      useTz();
      for (const day of ["2026-01-01", "2026-03-15", "2026-12-31"]) {
        expect(toLocalISODate(new Date(resolveDueForTrello(day)))).toBe(day);
      }
    });

    it("emits a UTC instant, not a local-looking string", () => {
      useTz();
      expect(dueDateForTrello("2026-03-15")).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });
}
