import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import TaskScreen from "@/components/TaskScreen";
import { currentUser } from "@/lib/session-server";
import { requireCreds } from "@/lib/server";
import {
  fetchBoards,
  fetchLists,
  fetchMemberCards,
  fetchMembers,
  type TrelloMember,
} from "@/lib/trello";

export const dynamic = "force-dynamic";

/** Who the board is being viewed as. `?member=` wins, then the Trello account
 * this session connected with, then whoever is first — a board always has
 * somebody selected, so the view is never in a half state. */
function pickMember(
  members: TrelloMember[],
  requested: string | string[] | undefined,
  self: string | null | undefined
): string {
  const wanted = Array.isArray(requested) ? requested[0] : requested;
  const has = (id?: string | null) =>
    id && members.some((m) => m.id === id) ? id : undefined;
  return has(wanted) ?? has(self) ?? members[0]?.id ?? "";
}

export default async function BoardPage({
  params,
  searchParams,
}: PageProps<"/boards/[boardId]">) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.trello) redirect("/connect");

  const [{ boardId }, query] = await Promise.all([params, searchParams]);
  const creds = requireCreds(user);

  // Checked before anything board-scoped is fetched: a board this account
  // cannot see is a 404, not a Trello error bubbling up as a 500.
  const boards = await fetchBoards(creds);
  const board = boards.find((b) => b.id === boardId);
  if (!board) notFound();

  const [lists, members] = await Promise.all([
    fetchLists(creds, boardId),
    fetchMembers(creds, boardId),
  ]);

  const memberId = pickMember(members, query.member, user.trelloMemberId);
  // The dropdown is both a filter and the assignee for the next capture, so
  // the cards it shows are fetched for whoever it currently names.
  const cards = memberId
    ? await fetchMemberCards(creds, boardId, memberId)
    : [];
  const member = members.find((m) => m.id === memberId);

  return (
    <main className="safe-top mx-auto w-full max-w-md px-4 pb-28">
      <header className="mb-3 flex items-center gap-1">
        <Link
          href="/boards"
          aria-label="Back to boards"
          className="-ml-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="truncate text-2xl font-semibold">{board.name}</h1>
      </header>

      <TaskScreen
        boardId={boardId}
        memberId={memberId}
        memberName={member?.fullName || member?.username || "this person"}
        members={members.map((m) => ({
          id: m.id,
          name: m.fullName || m.username,
        }))}
        cards={cards}
        lists={lists}
        boards={boards}
      />
    </main>
  );
}
