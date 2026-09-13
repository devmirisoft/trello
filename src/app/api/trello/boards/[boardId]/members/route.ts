import { jsonRoute, requireCreds, requireUser } from "@/lib/server";
import { avatarSrc, fetchMembers } from "@/lib/trello";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/trello/boards/[boardId]/members">
) {
  return jsonRoute(async () => {
    const creds = requireCreds(await requireUser(request));
    const { boardId } = await ctx.params;
    const members = await fetchMembers(creds, boardId);
    // Avatar URLs resolved here so the list screen has nothing to work out.
    return Response.json({
      members: members.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        username: m.username,
        initials: m.initials,
        avatarUrl: avatarSrc(m, 50),
      })),
    });
  });
}
