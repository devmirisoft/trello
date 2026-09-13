import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import TaskScreen from "@/components/TaskScreen";
import { currentUser } from "@/lib/session-server";
import { requireCreds } from "@/lib/server";
import { fetchBoardCards, fetchBoards, fetchLists } from "@/lib/trello";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: PageProps<"/boards/[boardId]">) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.trello) redirect("/connect");

  const { boardId } = await params;
  const creds = requireCreds(user);

  // Checked before anything board-scoped is fetched: a board this account
  // cannot see is a 404, not a Trello error bubbling up as a 500.
  const boards = await fetchBoards(creds);
  const board = boards.find((b) => b.id === boardId);
  if (!board) notFound();

  // The whole board, whoever the cards belong to — the list is for picking
  // existing work out of, so filtering it to one person only hides some.
  const [lists, cards] = await Promise.all([
    fetchLists(creds, boardId),
    fetchBoardCards(creds, boardId),
  ]);

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
        // Anything photographed is yours: the token that created it says who
        // that is, so there is nothing to pick.
        memberId={user.trelloMemberId ?? ""}
        cards={cards}
        lists={lists}
        boards={boards}
      />
    </main>
  );
}
