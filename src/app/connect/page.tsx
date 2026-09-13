import { redirect } from "next/navigation";
import ConnectTrelloForm from "@/components/ConnectTrelloForm";
import { currentUser } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Already connected: there is nothing to type in.
  if (user.trello) redirect("/boards");
  return <ConnectTrelloForm />;
}
