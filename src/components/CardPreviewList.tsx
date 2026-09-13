"use client";

import { useState } from "react";
import { Clock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import DatePicker from "./DatePicker";
import { MemberAvatar } from "./MemberPicker";
import { createCard, TrelloError } from "@/lib/trello";
import { dueDateForTrello, formatFriendly, todayLocalISODate } from "@/lib/dates";
import { TrelloConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

type Line = { id: string; text: string; include: boolean };
type Result = { text: string; status: "ok" | "error"; detail?: string };

type Props = {
  config: TrelloConfig;
  imagePreviewUrl: string;
  initialLines: string[];
  onStartOver: () => void;
};

let idCounter = 0;
const nextId = () => `line-${(idCounter += 1)}-${Date.now()}`;

export default function CardPreviewList({
  config,
  imagePreviewUrl,
  initialLines,
  onStartOver,
}: Props) {
  const [lines, setLines] = useState<Line[]>(
    initialLines.map((text) => ({ id: nextId(), text, include: true }))
  );
  const [date, setDate] = useState(todayLocalISODate());
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const included = lines.filter((l) => l.include && l.text.trim());

  const update = (id: string, text: string) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text } : l)));
  const toggle = (id: string) =>
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, include: !l.include } : l))
    );
  const remove = (id: string) =>
    setLines((prev) => prev.filter((l) => l.id !== id));
  const add = () =>
    setLines((prev) => [...prev, { id: nextId(), text: "", include: true }]);

  async function handleSubmit() {
    if (included.length === 0) return;
    setSubmitting(true);
    const due = dueDateForTrello(date);
    const outcomes: Result[] = [];
    for (const line of included) {
      const name = line.text.trim();
      try {
        await createCard(config.apiKey, config.token, {
          listId: config.listId!,
          name,
          due,
          idMembers: config.memberId ? [config.memberId] : undefined,
        });
        outcomes.push({ text: name, status: "ok" });
      } catch (err) {
        outcomes.push({
          text: name,
          status: "error",
          detail: err instanceof TrelloError ? err.message : "Unknown error",
        });
      }
    }
    setResults(outcomes);
    setSubmitting(false);
  }

  if (results) {
    const okCount = results.filter((r) => r.status === "ok").length;
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <h2 className="text-lg font-semibold">
          Created {okCount} of {results.length} card
          {results.length === 1 ? "" : "s"}
        </h2>
        <ul className="flex flex-col gap-2">
          {results.map((r, i) => (
            <li
              key={i}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                r.status === "ok"
                  ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                  : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
              )}
            >
              <span className="font-medium">
                {r.status === "ok" ? "✓" : "✕"} {r.text}
              </span>
              {r.detail && (
                <p className="mt-1 text-xs text-red-600">{r.detail}</p>
              )}
            </li>
          ))}
        </ul>
        <Button size="lg" onClick={onStartOver}>
          Snap another photo
        </Button>
      </div>
    );
  }

  const memberName = config.memberName ?? "";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagePreviewUrl}
          alt="Captured note"
          className="h-16 w-16 rounded-lg border object-cover"
        />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            {included.length} card{included.length === 1 ? "" : "s"} to create
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {config.boardName} / {config.listName}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Due date</p>
        <DatePicker value={date} onChange={setDate} />
      </div>

      {/* Each line rendered the way it will land on the board: title, the
          assignee from setup, and the shared due-date badge. */}
      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <div
            key={line.id}
            className={cn(
              "rounded-xl border bg-card p-3 shadow-sm transition-opacity",
              !line.include && "opacity-50"
            )}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={line.include}
                onChange={() => toggle(line.id)}
                aria-label={`Include "${line.text || "empty task"}"`}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/60 focus:underline"
                value={line.text}
                onChange={(e) => update(line.id, e.target.value)}
                placeholder="Task title"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => remove(line.id)}
                aria-label="Remove card"
              >
                <X />
              </Button>
            </div>

            <div className="mt-2.5 flex items-center gap-2 pl-6">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                <Clock className="size-3" />
                {formatFriendly(date)}
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {memberName}
                </span>
                <MemberAvatar
                  name={memberName}
                  initials={config.memberInitials}
                  src={config.memberAvatarUrl}
                  size={24}
                />
              </span>
            </div>
          </div>
        ))}

        {lines.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No text found in that photo. Add a card manually, or retake it.
          </p>
        )}

        <Button variant="ghost" size="sm" className="self-start" onClick={add}>
          <Plus data-icon="inline-start" />
          Add a card
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onStartOver}>
          ← Retake
        </Button>
        <Button
          size="lg"
          className="ml-auto"
          disabled={submitting || included.length === 0}
          onClick={handleSubmit}
        >
          {submitting
            ? "Creating…"
            : `Create ${included.length} card${included.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
