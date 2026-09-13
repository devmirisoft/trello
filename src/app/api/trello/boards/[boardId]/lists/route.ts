import { jsonRoute, requireCreds, requireUser } from "@/lib/server";
import { fetchLists } from "@/lib/trello";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/trello/boards/[boardId]/lists">
) {
  return jsonRoute(async () => {
    const creds = requireCreds(await requireUser(request));
    const { boardId } = await ctx.params;
    return Response.json({ lists: await fetchLists(creds, boardId) });
  });
}
