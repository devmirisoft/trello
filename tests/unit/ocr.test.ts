import { describe, expect, it } from "vitest";
import { parseScanReply, splitIntoTaskLines } from "@/lib/ocr";

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

describe("lib/ocr parseScanReply", () => {
  const reply = (lines: unknown) => JSON.stringify({ lines });

  it("merges a task wrapped across four lines into one", () => {
    expect(
      parseScanReply(
        reply([
          { text: "ask the landlord about the", continuesPrevious: false },
          { text: "leak under the kitchen sink and", continuesPrevious: true },
          { text: "whether he wants to send a", continuesPrevious: true },
          { text: "plumber before Friday", continuesPrevious: true },
          { text: "renew passport", continuesPrevious: false },
        ])
      )
    ).toEqual([
      "ask the landlord about the leak under the kitchen sink and whether he wants to send a plumber before Friday",
      "renew passport",
    ]);
  });

  it("starts a new task when the line has its own marker, tag notwithstanding", () => {
    expect(
      parseScanReply(
        reply([
          { text: "buy milk and", continuesPrevious: false },
          { text: "- email Sam", continuesPrevious: true },
        ])
      )
    ).toEqual(["buy milk and", "- email Sam"]);
  });

  it("keeps a leading continuation from swallowing itself", () => {
    expect(
      parseScanReply(reply([{ text: "first line", continuesPrevious: true }]))
    ).toEqual(["first line"]);
  });

  it("survives a fenced reply and an empty scan", () => {
    expect(
      parseScanReply('```json\n' + reply([{ text: "pay rent" }]) + '\n```')
    ).toEqual(["pay rent"]);
    expect(parseScanReply(reply([]))).toEqual([]);
  });

  it("falls back to line splitting when the model ignores the format", () => {
    expect(parseScanReply("- pay rent\n- water plants")).toEqual([
      "pay rent",
      "water plants",
    ]);
  });
});
