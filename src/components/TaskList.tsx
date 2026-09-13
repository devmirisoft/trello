"use client";

import { useMemo, useState } from "react";
import { Camera, Check, CheckCircle2, MoveRight, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLongPress } from "@/hooks/useLongPress";
import { formatFriendly, toLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TrelloCard, TrelloList } from "@/lib/trello";

export type BulkAction = "done" | "update" | "move";

type Props = {
  cards: TrelloCard[];
  /** The board's open lists, rendered as columns in this order. */
  lists: TrelloList[];
  /** Runs the action against the server; resolves when the list is stale. */
  onAction: (action: BulkAction, cardIds: string[]) => void | Promise<void>;
  onCapture: () => void;
  busy?: boolean;
};

function TaskRow({
  card,
  selected,
  selectionMode,
  index,
  onLongPress,
  onTap,
}: {
  card: TrelloCard;
  selected: boolean;
  selectionMode: boolean;
  index: number;
  onLongPress: () => void;
  onTap: () => void;
}) {
  const press = useLongPress(onLongPress, { onTap });

  return (
    <li style={{ "--i": index } as React.CSSProperties} className="row-in">
      <div
        {...press}
        data-longpress=""
        data-testid={`task-${card.id}`}
        data-selected={selected || undefined}
        role="option"
        aria-selected={selected}
        tabIndex={0}
        className={cn(
          "flex min-h-[56px] [touch-action:pan-x_pan-y] items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
          selected
            ? "border-primary bg-primary/5"
            : "border-border bg-card active:bg-muted"
        )}
      >
        {selectionMode && (
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input"
            )}
          >
            {selected && <Check className="size-3.5" />}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-medium",
              card.dueComplete && "text-muted-foreground line-through"
            )}
          >
            {card.name}
          </span>
          {card.due && (
            <span className="block text-xs text-muted-foreground">
              {formatFriendly(toLocalISODate(new Date(card.due)))}
            </span>
          )}
        </span>

        {card.dueComplete && (
          <CheckCircle2
            aria-label="Done"
            data-testid={`done-${card.id}`}
            className="size-5 shrink-0 text-muted-foreground"
          />
        )}
      </div>
    </li>
  );
}

export default function TaskList({
  cards,
  lists,
  onAction,
  onCapture,
  busy,
}: Props) {
  const [picked, setSelected] = useState<string[]>([]);
  const visible = useMemo(() => new Set(cards.map((c) => c.id)), [cards]);

  // Derived, not synchronised: a card that disappeared (moved to another
  // board, say) drops out of the selection on the very render that loses it,
  // so the action bar never hangs around over nothing.
  const selected = useMemo(
    () => picked.filter((id) => visible.has(id)),
    [picked, visible]
  );
  const selectionMode = selected.length > 0;

  // One column per open list, in the board's own order. A card can sit in a
  // list the board no longer reports as open (archiving a list keeps its
  // cards), so anything unplaced gets a trailing column rather than vanishing.
  const columns = useMemo(() => {
    const byList = new Map(lists.map((l) => [l.id, [] as TrelloCard[]]));
    const elsewhere: TrelloCard[] = [];
    for (const card of cards) (byList.get(card.idList) ?? elsewhere).push(card);

    const cols = lists.map((l) => ({
      id: l.id,
      name: l.name,
      cards: byList.get(l.id)!,
    }));
    if (elsewhere.length) {
      cols.push({ id: "elsewhere", name: "Elsewhere", cards: elsewhere });
    }
    return cols;
  }, [cards, lists]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const run = async (action: BulkAction) => {
    const ids = selected;
    setSelected([]);
    await onAction(action, ids);
  };

  return (
    <>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open cards here yet. Photograph a list to add some.
        </p>
      ) : (
        <div
          data-testid="board-lists"
          className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2"
        >
          {columns.map((column) => (
            <section
              key={column.id}
              data-testid={`list-${column.id}`}
              className="w-64 shrink-0 snap-start"
            >
              <h2 className="mb-2 flex items-baseline gap-2 px-1">
                <span className="truncate text-sm font-semibold">
                  {column.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {column.cards.length}
                </span>
              </h2>

              {column.cards.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Nothing here.</p>
              ) : (
                <ul
                  role="listbox"
                  aria-multiselectable
                  aria-label={column.name}
                  className="space-y-2"
                >
                  {column.cards.map((card, i) => (
                    <TaskRow
                      key={card.id}
                      card={card}
                      index={i}
                      selected={selected.includes(card.id)}
                      selectionMode={selectionMode}
                      onLongPress={() => {
                        if (!selected.includes(card.id)) toggle(card.id);
                      }}
                      onTap={() => {
                        // Outside selection mode a tap is just a tap — the
                        // long press is the only way in, so scrolling never
                        // selects anything.
                        if (selectionMode) toggle(card.id);
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {selectionMode ? (
        <div
          data-testid="action-bar"
          className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-3 pt-2 backdrop-blur"
        >
          <div className="mx-auto flex w-full max-w-md items-center gap-1">
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Clear selection"
              className="size-11"
              onClick={() => setSelected([])}
            >
              <X />
            </Button>
            <span className="mr-auto text-sm font-medium">
              {selected.length} selected
            </span>
            <Button
              variant="ghost"
              className="h-11"
              disabled={busy}
              onClick={() => run("done")}
            >
              <Check data-icon="inline-start" />
              Done
            </Button>
            <Button
              variant="ghost"
              className="h-11"
              disabled={busy}
              onClick={() => run("update")}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
            <Button
              variant="ghost"
              className="h-11"
              disabled={busy}
              onClick={() => run("move")}
            >
              <MoveRight data-icon="inline-start" />
              Move
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="icon-lg"
          aria-label="Photograph a list"
          data-testid="camera-fab"
          onClick={onCapture}
          // Cleared of the home indicator by the inset, not by padding — a
          // round button cannot absorb the safe area as padding.
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
          className="fixed left-1/2 z-20 size-14 -translate-x-1/2 rounded-full shadow-lg"
        >
          <Camera className="size-6" />
        </Button>
      )}
    </>
  );
}
