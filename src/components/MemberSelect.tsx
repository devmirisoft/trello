"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type MemberOption = { id: string; name: string };

/** Pinned to the top of the board. Doing two jobs on purpose: it filters the
 * board to one person's cards, and it names the assignee for the next capture.
 * The choice lives in the URL so the server can do the filtering and a reload
 * (or a shared link) lands on the same person. */
export default function MemberSelect({
  members,
  value,
}: {
  members: MemberOption[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // The select is controlled by a value that only changes once the server has
  // re-rendered, so without this the choice visibly snaps back mid-request.
  // It also puts itself right on its own if the navigation fails.
  const [shown, showOptimistically] = useOptimistic(value);

  if (members.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-border bg-background/95 px-4 pb-2 backdrop-blur">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Showing
        <select
          aria-label="Member"
          aria-busy={pending}
          value={shown}
          onChange={(e) => {
            const memberId = e.target.value;
            startTransition(() => {
              showOptimistically(memberId);
              router.replace(
                `${pathname}?${new URLSearchParams({ member: memberId })}`
              );
            });
          }}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base font-medium text-foreground",
            pending && "opacity-60"
          )}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
