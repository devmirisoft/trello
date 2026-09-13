import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AccountForm from "@/components/AccountForm";
import { currentUser } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <main className="safe-top mx-auto w-full max-w-md px-4 pb-12">
      <header className="mb-4 flex items-center gap-1">
        <Link
          href="/boards"
          aria-label="Back to boards"
          className="-ml-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold">Account</h1>
      </header>

      <AccountForm
        username={user.username}
        trelloConnected={!!user.trello}
      />
    </main>
  );
}
