import { jsonRoute, requireCreds, requireUser } from "@/lib/server";
import { fetchMemberCards } from "@/lib/trello";

export const dynamic = "force-dynamic";

/** A member's open cards on one board. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/trello/boards/[boardId]/members/[memberId]/cards">
) {
  return jsonRoute(async () => {
    const creds = requireCreds(await requireUser(request));
    const { boardId, memberId } = await ctx.params;
    return Response.json({
      cards: await fetchMemberCards(creds, boardId, memberId),
    });
  });
}
