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

/** One physical line as the model transcribed it off the page. */
export type ScannedLine = { text?: string; continuesPrevious?: boolean };

// A line carrying its own marker starts a task no matter what the model tagged.
const MARKER = /^([-*•‣▪]|\[\s?[xX ]?\s?\]|\d+[.)])\s*/;

/**
 * Rebuilds whole tasks from the transcribed lines. A writer who runs out of
 * room wraps mid-sentence across 2-4 lines, so a line break is not a task
 * boundary — only a marker, a gap, or a finished sentence is, and the model
 * reports that per line as `continuesPrevious`.
 */
export function mergeTaskLines(lines: ScannedLine[]): string[] {
  const tasks: string[] = [];
  for (const { text, continuesPrevious } of lines) {
    const line = (text ?? "").trim();
    if (!line) continue;
    if (continuesPrevious && tasks.length && !MARKER.test(line)) {
      tasks[tasks.length - 1] += ` ${line}`;
    } else {
      tasks.push(line);
    }
  }
  return tasks;
}

/**
 * Pulls `{ lines: [...] }` out of the model's reply and merges it into tasks.
 * If the model answered in prose instead, salvage it a line at a time.
 */
export function parseScanReply(raw: string): string[] {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed?.lines)) return mergeTaskLines(parsed.lines);
  } catch {
    // Not JSON — fall through.
  }
  return splitIntoTaskLines(raw);
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
    .map((line) => line.replace(MARKER, "").trim())
    .filter((line) => line.length > 1);
}
