"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import DatePicker from "./DatePicker";
import { todayLocalISODate } from "@/lib/dates";
import type { TrelloBoard, TrelloList, TrelloMember } from "@/lib/trello";

export type SheetMode = "update" | "move";

type Props = {
  mode: SheetMode;
  count: number;
  boards: TrelloBoard[];
  /** Everyone the chosen cards are assigned to, so a move can say up front
   * that it would strand one of them. */
  assignedTo: string[];
  onCancel: () => void;
  /** `applied` says whether anything actually changed: a warning that comes
   * back with nothing applied is a question, not a notice. */
  onSubmit: (
    payload: Record<string, unknown>
  ) => Promise<{ warning?: string; applied: boolean }>;
};

export default function BulkSheet({
  mode,
  count,
  boards,
  assignedTo,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayLocalISODate());
  const [setDue, setSetDue] = useState(false);

  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [reassign, setReassign] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [listId, setListId] = useState("");
  const [members, setMembers] = useState<TrelloMember[]>([]);

  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The destination's lists and people are only knowable once a board is
  // picked, and they are what the assignment warning is decided from.
  useEffect(() => {
    if (mode !== "move" || !boardId) return;
    let live = true;
    (async () => {
      const [listRes, memberRes] = await Promise.all([
        fetch(`/api/trello/boards/${boardId}/lists`),
        fetch(`/api/trello/boards/${boardId}/members`),
      ]);
      if (!live) return;
      const listData = await listRes.json().catch(() => ({}));
      const memberData = await memberRes.json().catch(() => ({}));
      setLists(listData.lists ?? []);
      setListId(listData.lists?.[0]?.id ?? "");
      setMembers(memberData.members ?? []);
      // Nobody is "current" any more, so the reassign picker starts on the
      // target board's first member rather than on an empty value.
      setMemberId(memberData.members?.[0]?.id ?? "");
    })();
    return () => {
      live = false;
    };
  }, [boardId, mode]);

  // Left alone unless the user asks to reassign: the board shows everyone's
  // cards now, so there is no single "current" person to re-apply. Trello
  // keeps whichever assignees are also on the target board and drops the rest,
  // so the people who have to be there are whoever holds the cards today.
  const keepingMemberId = reassign ? memberId : undefined;
  const needOnBoard = reassign ? (memberId ? [memberId] : []) : assignedTo;
  const assigneeMissing =
    mode === "move" &&
    members.length > 0 &&
    needOnBoard.some((id) => !members.some((m) => m.id === id));

  async function submit(confirmUnassigned = false) {
    setBusy(true);
    setError(null);
    try {
      const payload =
        mode === "update"
          ? {
              ...(name.trim() ? { name: name.trim() } : {}),
              ...(setDue ? { dueDate: date } : {}),
            }
          : {
              boardId,
              listId,
              memberId: keepingMemberId,
              confirmUnassigned,
            };
      const result = await onSubmit(payload);
      // A warning with nothing applied means the move was refused pending a
      // decision. A warning alongside a completed move is only advice.
      if (result.warning && !result.applied) {
        setWarning(result.warning);
        setBusy(false);
        return;
      }
      onCancel();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const nothingToDo =
    mode === "update" ? !name.trim() && !setDue : !boardId || !listId;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "update" ? "Edit cards" : "Move cards"}
      className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="safe-bottom max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background px-4 pt-4">
        <h2 className="text-lg font-semibold">
          {mode === "update" ? "Edit" : "Move"} {count} card
          {count === 1 ? "" : "s"}
        </h2>

        {mode === "update" ? (
          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              New title (leave blank to keep each one)
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal"
              />
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={setDue}
                onChange={(e) => setSetDue(e.target.checked)}
                className="size-5 accent-primary"
              />
              Set a new due date
            </label>
            {setDue && <DatePicker value={date} onChange={setDate} />}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Board
              <select
                value={boardId}
                onChange={(e) => {
                  // A different destination invalidates the warning that was
                  // about the old one.
                  setWarning(null);
                  setBoardId(e.target.value);
                }}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              List
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={reassign}
                onChange={(e) => setReassign(e.target.checked)}
                className="size-5 accent-primary"
              />
              Assign to someone else
            </label>

            {reassign ? (
              <select
                aria-label="New assignee"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName || m.username}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">
                Keeping whoever they are assigned to now.
              </p>
            )}

            {assigneeMissing && (
              <p className="text-sm text-destructive">
                {reassign ? "That person is" : "Someone these cards belong to is"}{" "}
                not on this board — Trello would drop the assignment.
              </p>
            )}
          </div>
        )}

        {warning && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {warning}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-2 pb-2">
          <Button
            variant="outline"
            className="h-11 flex-1"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="h-11 flex-[2]"
            disabled={busy || nothingToDo}
            onClick={() => submit(!!warning)}
          >
            {warning ? "Move anyway" : mode === "update" ? "Apply" : "Move"}
          </Button>
        </div>
      </div>
    </div>
  );
}
