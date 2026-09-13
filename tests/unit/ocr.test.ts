import { describe, expect, it } from "vitest";
import { splitIntoTaskLines } from "@/lib/ocr";

describe("lib/ocr splitIntoTaskLines", () => {
  it("strips every common list marker", () => {
    expect(
      splitIntoTaskLines(
        [
          "- call the plumber",
          "* email Sam",
          "• book flights",
          "1. pay rent",
          "2) renew passport",
          "[ ] water plants",
          "[x] already done",
        ].join("\n")
      )
    ).toEqual([
      "call the plumber",
      "email Sam",
      "book flights",
      "pay rent",
      "renew passport",
      "water plants",
      "already done",
    ]);
  });

  it("drops empty and one-character lines", () => {
    expect(splitIntoTaskLines("real task\n\n   \nx\n-\nanother task")).toEqual([
      "real task",
      "another task",
    ]);
  });

  it("trims surrounding whitespace", () => {
    expect(splitIntoTaskLines("   padded task   ")).toEqual(["padded task"]);
  });

  it("preserves punctuation inside the line", () => {
    expect(
      splitIntoTaskLines("- Call Dr. Rao re: the 2pm slot (bring ID)")
    ).toEqual(["Call Dr. Rao re: the 2pm slot (bring ID)"]);
  });

  it("handles CRLF from a different OCR build", () => {
    expect(splitIntoTaskLines("one task\r\ntwo task")).toEqual([
      "one task",
      "two task",
    ]);
  });

  it("returns nothing for a blank scan", () => {
    expect(splitIntoTaskLines("\n\n   \n")).toEqual([]);
  });
});
