/**
 * Reads a photographed to-do list. The image goes to /api/scan, which asks
 * Groq's vision model for the tasks — nothing runs in the browser.
 */
export async function recognizeText(image: File | Blob): Promise<string> {
  const body = new FormData();
  body.append("image", image);
  const res = await fetch("/api/scan", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Scan failed (${res.status})`);
  return data.text as string;
}

/**
 * Splits the model's reply into candidate task lines: trims whitespace, drops
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
