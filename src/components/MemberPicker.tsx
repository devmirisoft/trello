"use client";

import { avatarSrc, type TrelloMember } from "@/lib/trello";
import { cn } from "@/lib/utils";

/** Avatar image when the member has one, initials on a tinted circle when not.
 * Shared by the picker and the card previews so one person looks the same in
 * both places. `src` is already resolved by avatarSrc(), so this never has to
 * know whether Trello gave us a base URL or a hash. */
export function MemberAvatar({
  name,
  initials,
  src,
  size = 32,
}: {
  name: string;
  initials?: string;
  src?: string | null;
  size?: number;
}) {
  const fallback = (initials || name.slice(0, 2) || "?").toUpperCase();

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {fallback}
    </span>
  );
}

type Props = {
  members: TrelloMember[];
  selectedId?: string;
  onSelect: (member: TrelloMember) => void;
};

export default function MemberPicker({ members, selectedId, onSelect }: Props) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This board has no members to assign cards to.
      </p>
    );
  }

  return (
    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m)}
          aria-pressed={selectedId === m.id}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted",
            selectedId === m.id && "border-foreground bg-muted"
          )}
        >
          <MemberAvatar
            name={m.fullName || m.username}
            initials={m.initials}
            src={avatarSrc(m, 50)}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {m.fullName || m.username}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              @{m.username}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
