import { jsonRoute, requireCreds, requireUser } from "@/lib/server";
import { fetchBoards } from "@/lib/trello";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return jsonRoute(async () => {
    const creds = requireCreds(await requireUser(request));
    return Response.json({ boards: await fetchBoards(creds) });
  });
}
