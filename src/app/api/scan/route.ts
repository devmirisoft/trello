import { HttpError, jsonRoute, requireUser } from "@/lib/server";

export const dynamic = "force-dynamic";

const PROMPT =
  "Read this photo of a to-do list. Reply with the tasks only, one per line, " +
  "verbatim, no numbering, no bullets, no commentary. If there are no tasks, reply with nothing.";

/** Sends the photo to Groq's vision model and returns its raw text reply.
 * GROQ_MODEL is the app's text model, so scanning takes its own variable. */
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
        model:
          process.env.GROQ_VISION_MODEL ||
          "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0,
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
      text: data?.choices?.[0]?.message?.content ?? "",
    });
  });
}
