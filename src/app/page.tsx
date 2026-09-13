import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session-server";

export const dynamic = "force-dynamic";

/** The entry point only decides where you belong: signed out, connected, or
 * ready to work. Every screen below can then assume its precondition holds. */
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.trello) redirect("/connect");
  redirect("/boards");
}
