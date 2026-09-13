"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import DatePicker from "./DatePicker";
import { todayLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TrelloList } from "@/lib/trello";

/** `date: null` means "whatever the batch date is". Kept as an absence rather
 * than a copy so moving the batch date moves every card that never got one of
 * its own, and leaves alone the ones that did. */
type Line = { id: string; text: string; include: boolean; date: string | null };

/** A task read off the photo. `dueDate` is set when the text named one. */
export type ExtractedTask = { text: string; dueDate?: string | null };

type Props = {
  boardId: string;
  memberId: string;
  lists: TrelloList[];
  initialTasks: (string | ExtractedTask)[];
  imagePreviewUrl?: string | null;
  onDone: () => void;
  onStartOver: () => void;
};

let idCounter = 0;
const nextId = () => `line-${(idCounter += 1)}`;

/** The board's first list is the default, but whatever was chosen last for
 * this board wins — people photograph into the same list over and over. */
const rememberedListKey = (boardId: string) => `trello-snap:list:${boardId}`;

export default function CardPreviewList({
  boardId,
  memberId,
  lists,
  initialTasks,
  imagePreviewUrl,
  onDone,
  onStartOver,
}: Props) {
  const [lines, setLines] = useState<Line[]>(() =>
    initialTasks.map((task) => {
      const { text, dueDate } =
        typeof task === "string" ? { text: task, dueDate: null } : task;
      return { id: nextId(), text, include: true, date: dueDate ?? null };
    })
  );
  const [date, setDate] = useState(todayLocalISODate());
  // The board's first list, unless this board has a remembered choice. Read
  // once on mount rather than in an effect — this screen only ever exists in
  // the browser, so there is no server render to disagree with. A remembered
  // list that has since been deleted falls back to the first one.
  const [listId, setListId] = useState(() => {
    try {
      const saved = localStorage.getItem(rememberedListKey(boardId));
      if (saved && lists.some((l) => l.id === saved)) return saved;
    } catch {
      // Private mode or blocked storage: the first list is a fine default.
    }
    return lists[0]?.id ?? "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const included = lines.filter((l) => l.include && l.text.trim());

  const editLine = (id: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem(rememberedListKey(boardId), listId);
      } catch {
        // Not being able to remember the choice is not worth failing over.
      }
      const res = await fetch("/api/trello/cards/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listId,
          memberId,
          // Resolved per card here, so the server never has to know what the
          // batch date was standing in for.
          tasks: included.map((l) => ({
            name: l.text.trim(),
            dueDate: l.date ?? date,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);

      const failed = (data.results ?? []).filter(
        (r: { ok: boolean }) => !r.ok
      ).length;
      if (failed) {
        throw new Error(
          `${failed} of ${data.results.length} cards could not be created.`
        );
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      {imagePreviewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagePreviewUrl}
          alt="The photo these tasks were read from"
          className="max-h-40 w-full rounded-xl object-cover"
        />
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="target-list">
          Add to list
        </label>
        <select
          id="target-list"
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          className="h-11 rounded-lg border border-input bg-background px-3 text-base"
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Due</span>
        <DatePicker value={date} onChange={setDate} label="Due date for all" />
        <p className="text-xs text-muted-foreground">
          Used for every card that has not been given its own date below.
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing readable in that photo. Try again with more light.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="preview-lines">
          {lines.map((line, i) => (
            <li
              key={line.id}
              style={{ "--i": i } as React.CSSProperties}
              data-testid={`preview-card-${i + 1}`}
              className={cn(
                "row-in flex flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2",
                !line.include && "opacity-50"
              )}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={line.include}
                  aria-label={`Include "${line.text}"`}
                  onChange={() => editLine(line.id, { include: !line.include })}
                  className="size-5 shrink-0 accent-primary"
                />
                <input
                  value={line.text}
                  aria-label={`Task ${i + 1}`}
                  onChange={(e) => editLine(line.id, { text: e.target.value })}
                  className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-base outline-none focus-visible:bg-muted"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove "${line.text}"`}
                  className="size-11 shrink-0"
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.id !== line.id))
                  }
                >
                  <X />
                </Button>
              </div>

              <DatePicker
                value={line.date ?? date}
                onChange={(d) => editLine(line.id, { date: d })}
                label={`Due date for task ${i + 1}`}
                // Muted while it is only following the batch date, so which
                // cards carry a date of their own is obvious at a glance.
                className={cn(
                  "ml-7 h-9 w-auto self-start border-0 px-2 text-sm",
                  !line.date && "text-muted-foreground"
                )}
              />
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        className="h-11"
        onClick={() =>
          setLines((prev) => [
            ...prev,
            { id: nextId(), text: "", include: true, date: null },
          ])
        }
      >
        <Plus data-icon="inline-start" />
        Add a line
      </Button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-2 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md gap-2">
          <Button
            variant="outline"
            className="h-11 flex-1"
            disabled={busy}
            onClick={onStartOver}
          >
            Retake
          </Button>
          <Button
            className="h-11 flex-[2]"
            disabled={busy || included.length === 0 || !listId}
            onClick={confirm}
          >
            {busy
              ? "Creating…"
              : `Create ${included.length} card${included.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
