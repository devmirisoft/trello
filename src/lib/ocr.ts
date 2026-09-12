import { createWorker } from "tesseract.js";

export type OcrProgress = {
  status: string;
  progress: number; // 0..1
};

/**
 * Runs OCR on an image (File/Blob/data URL) entirely in the browser via
 * Tesseract.js (WASM) — no server, no API key, nothing leaves the device.
 * Note: the first run downloads the English language data (a few MB) from
 * the network; after that the browser caches it for offline reuse.
 */
export async function recognizeText(
  image: File | Blob | string,
  onProgress?: (p: OcrProgress) => void
): Promise<string> {
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (onProgress && typeof m.progress === "number") {
        onProgress({ status: m.status, progress: m.progress });
      }
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(image);
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Splits raw OCR text into candidate task lines: trims whitespace, drops
 * empty lines, strips common list markers ("-", "*", "1.", "•", "[ ]")
 * so the leftover reads like a clean task title.
 */
export function splitIntoTaskLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) =>
      line.replace(/^([-*•‣▪]|\[\s?[xX ]?\s?\]|\d+[.)])\s*/, "").trim()
    )
    .filter((line) => line.length > 1);
}
