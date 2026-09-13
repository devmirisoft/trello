import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as scan } from "@/app/api/scan/route";
import { clearUsers, cookieFrom, json, req, startMongo, stopMongo } from "../helpers/api";
import { startTrelloStub, stopTrelloStub } from "../helpers/trello-stub";

const GROQ_BASE = "http://groq.test/v1";
let sent: Record<string, unknown> | undefined;

const groqStub = http.post(`${GROQ_BASE}/chat/completions`, async ({ request }) => {
  sent = (await request.json()) as Record<string, unknown>;
  return HttpResponse.json({
    choices: [{ message: { content: "- call the plumber\n- email Sam" } }],
  });
});

function scanReq(cookie?: string) {
  const body = new FormData();
  body.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "photo.png");
  return new Request("http://app.test/api/scan", {
    method: "POST",
    body,
    headers: cookie ? { cookie } : {},
  });
}

beforeAll(async () => {
  await startMongo();
  startTrelloStub([groqStub]);
  process.env.GROQ_API_BASE = GROQ_BASE;
  process.env.GROQ_API_KEY = "test-groq-key";
}, 180_000);

afterAll(async () => {
  stopTrelloStub();
  await stopMongo();
});

beforeEach(async () => {
  await clearUsers();
  sent = undefined;
});

const signIn = async () =>
  cookieFrom(
    await register(req({ method: "POST", body: { username: "asha", password: "hunter2-hunter2" } }))
  );

describe("POST /api/scan", () => {
  it("rejects a signed-out caller before touching Groq", async () => {
    const res = await scan(scanReq());
    expect(res.status).toBe(401);
    expect(sent).toBeUndefined();
  });

  it("sends the photo as a data URL and returns the model's text", async () => {
    const res = await scan(scanReq(await signIn()));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ text: "- call the plumber\n- email Sam" });

    const content = (sent as { messages: { content: { type: string; image_url?: { url: string } }[] }[] })
      .messages[0].content;
    expect(content.find((c) => c.type === "image_url")?.image_url?.url).toMatch(
      /^data:image\/png;base64,AQID$/
    );
  });

  it("rejects a request with no image", async () => {
    const res = await scan(
      new Request("http://app.test/api/scan", {
        method: "POST",
        body: new FormData(),
        headers: { cookie: await signIn() },
      })
    );
    expect(res.status).toBe(400);
  });
});
