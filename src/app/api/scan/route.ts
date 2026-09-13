import { parseScanReply } from "@/lib/ocr";
import { HttpError, jsonRoute, requireUser } from "@/lib/server";

export const dynamic = "force-dynamic";

// The model transcribes physical lines and tags the wrapped ones; we stitch
// them back together in parseScanReply. Asking it for tasks directly made it
// treat every line break as a task boundary.
const PROMPT = `Read this photo of a to-do list, handwritten or printed.

STEP 1 — Transcribe every physical line on the page, top to bottom, verbatim.
STEP 2 — Tag each line with continuesPrevious: true when the line is the rest of the line above it rather than a new task.

A LINE BREAK IS NOT A TASK BOUNDARY. Writers run out of room and wrap a single task across 2-4 lines. A line only starts a NEW task (continuesPrevious: false) when one of these is true:
- it begins with its own bullet, dash, number or checkbox ("-", "*", "•", "1.", "2)", "[ ]")
- there is a blank line or an obvious vertical gap above it
- the line above already reads as a grammatically complete instruction
Otherwise it is a continuation — set continuesPrevious: true. The giveaway is that the line above trails off mid-clause, ending on a word like "and", "to", "the", "a", "for", "with", "about", "before", "from", or on a comma. Keep tagging true for every line of the run, however many that takes.

READING HANDWRITING:
- In cursive, spell ambiguous words out letter by letter. Do not guess a word from its overall shape.
- Watch the usual cursive confusions: n/u/w, r/v, a/o/e, i/e, cl/d, m/nn, t/f.
- If one word is truly unreadable, transcribe just that word as [?] and keep the rest of the line. Never invent a word and never drop a line.

Reply with JSON and nothing else, no markdown fence, no commentary:
{"lines":[{"text":"buy milk, eggs and","continuesPrevious":false},{"text":"bread on the way home","continuesPrevious":true}]}
If the photo has no tasks, reply {"lines":[]}.`;

/** Sends the photo to Groq and returns its tasks, one per line. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    await requireUser(request);

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new HttpError(500, "GROQ_API_KEY is not set.");

    const image = (await request.formData()).get("image");
    if (!(image instanceof Blob)) throw new HttpError(400, "No image uploaded.");

    const dataUrl = `data:${image.type || "image/jpeg"};base64,${Buffer.from(
      await image.arrayBuffer()
    ).toString("base64")}`;

    const base = process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
        temperature: 0,
        // A task list is short, but per-line JSON costs roughly 3x the plain
        // lines it replaced, so the old 500 truncated longer lists.
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new HttpError(502, data?.error?.message ?? `Groq failed (${res.status}).`);
    }
    return Response.json({
      text: parseScanReply(data?.choices?.[0]?.message?.content ?? "").join("\n"),
    });
  });
}
