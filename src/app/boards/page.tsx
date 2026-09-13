import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import InstallButton from "@/components/InstallButton";
import { currentUser } from "@/lib/session-server";
import { requireCreds } from "@/lib/server";
import { fetchBoards } from "@/lib/trello";

export const dynamic = "force-dynamic";

export default async function BoardsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.trello) redirect("/connect");

  // Fetched here rather than through our own API: this is already the server,
  // and a round trip through fetch would only add a hop.
  const boards = await fetchBoards(requireCreds(user));

  return (
    <main className="safe-top mx-auto w-full max-w-md px-4 pb-24">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Boards</h1>
        <InstallButton />
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings className="size-5" />
        </Link>
      </header>

      {boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This Trello account has no open boards.
        </p>
      ) : (
        <ul className="space-y-2">
          {boards.map((board, i) => (
            <li key={board.id} style={{ "--i": i } as React.CSSProperties} className="row-in">
              <Link
                href={`/boards/${board.id}`}
                className="flex min-h-[56px] items-center rounded-xl border border-border bg-card px-4 py-3 font-medium active:bg-muted"
              >
                {board.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
