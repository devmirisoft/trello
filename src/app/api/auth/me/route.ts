import { jsonRoute, requireUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser(request);
    // trelloConnected, never the credentials themselves — nothing about the
    // key or token may cross to the browser.
    return Response.json({
      userId: user._id.toHexString(),
      username: user.username,
      trelloConnected: !!user.trello,
    });
  });
}
