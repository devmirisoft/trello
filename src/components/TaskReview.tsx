"use client";

import { useState } from "react";
import DateSelector from "./DateSelector";
import { createCard, TrelloError } from "@/lib/trello";
import { dueDateForTrello, todayLocalISODate } from "@/lib/dates";
import { TrelloConfig } from "@/lib/types";

type Line = {
  id: string;
  text: string;
  include: boolean;
};

type Result = {
  text: string;
  status: "ok" | "error";
  detail?: string;
};

type Props = {
  config: TrelloConfig;
  imagePreviewUrl: string;
  initialLines: string[];
  onStartOver: () => void;
};

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `line-${idCounter}-${Date.now()}`;
}

export default function TaskReview({
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

  const includedCount = lines.filter((l) => l.include && l.text.trim()).length;

  function updateLine(id: string, text: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text } : l)));
  }

  function toggleLine(id: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, include: !l.include } : l))
    );
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function addLine() {
    setLines((prev) => [...prev, { id: nextId(), text: "", include: true }]);
  }

  async function handleSubmit() {
    const toCreate = lines.filter((l) => l.include && l.text.trim());
    if (toCreate.length === 0) return;
    setSubmitting(true);
    const due = dueDateForTrello(date);
    const outcomes: Result[] = [];
    for (const line of toCreate) {
      try {
        await createCard(config.apiKey, config.token, {
          listId: config.listId!,
          name: line.text.trim(),
          due,
        });
        outcomes.push({ text: line.text.trim(), status: "ok" });
      } catch (err) {
        outcomes.push({
          text: line.text.trim(),
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
      <div className="w-full max-w-md mx-auto flex flex-col gap-4">
        <h2 className="text-lg font-semibold">
          Created {okCount} of {results.length} card
          {results.length === 1 ? "" : "s"}
        </h2>
        <ul className="flex flex-col gap-2">
          {results.map((r, i) => (
            <li
              key={i}
              className={`text-sm rounded-lg border px-3 py-2 ${
                r.status === "ok"
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <span className="font-medium">
                {r.status === "ok" ? "✓" : "✕"} {r.text}
              </span>
              {r.detail && (
                <p className="text-xs text-red-600 mt-1">{r.detail}</p>
              )}
            </li>
          ))}
        </ul>
        <button
          className="rounded-lg bg-black text-white py-3 font-medium"
          onClick={onStartOver}
        >
          Snap another photo
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagePreviewUrl}
          alt="Captured note"
          className="w-16 h-16 object-cover rounded-lg border"
        />
        <div>
          <h2 className="text-lg font-semibold">Review tasks</h2>
          <p className="text-sm text-neutral-500">
            Into: {config.boardName} / {config.listName}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={line.include}
              onChange={() => toggleLine(line.id)}
              className="w-5 h-5 shrink-0"
            />
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-base"
              value={line.text}
              onChange={(e) => updateLine(line.id, e.target.value)}
              placeholder="Task text"
            />
            <button
              className="text-neutral-400 px-1"
              onClick={() => removeLine(line.id)}
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
        {lines.length === 0 && (
          <p className="text-sm text-neutral-500">
            No text found in that photo. Add a task manually below, or go
            back and try a clearer photo.
          </p>
        )}
        <button
          className="text-sm underline text-blue-600 self-start"
          onClick={addLine}
        >
          + add a line
        </button>
      </div>

      <DateSelector value={date} onChange={setDate} />

      <div className="flex gap-2">
        <button
          className="text-sm underline text-neutral-500"
          onClick={onStartOver}
        >
          ← retake photo
        </button>
        <button
          className="ml-auto rounded-lg bg-black text-white px-5 py-3 font-medium disabled:opacity-50"
          disabled={submitting || includedCount === 0}
          onClick={handleSubmit}
        >
          {submitting
            ? "Creating…"
            : `Create ${includedCount} card${includedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
