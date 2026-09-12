import { clearSessionCookie, jsonRoute } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return jsonRoute(async () => {
    await clearSessionCookie();
    return Response.json({ ok: true });
  });
}
