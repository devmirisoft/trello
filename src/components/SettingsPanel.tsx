"use client";

import { useState } from "react";
import {
  fetchBoards,
  fetchLists,
  verifyCredentials,
  TrelloBoard,
  TrelloList,
} from "@/lib/trello";
import { TrelloConfig } from "@/lib/types";

type Props = {
  initial: TrelloConfig | null;
  onSave: (config: TrelloConfig) => Promise<void>;
  onSaved: () => void;
  onCancel?: () => void;
};

type Stage = "credentials" | "board" | "list";

export default function SettingsPanel({
  initial,
  onSave,
  onSaved,
  onCancel,
}: Props) {
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [token, setToken] = useState(initial?.token ?? "");
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [boardId, setBoardId] = useState(initial?.boardId ?? "");
  const [boardName, setBoardName] = useState(initial?.boardName ?? "");
  const [listId, setListId] = useState(initial?.listId ?? "");
  const [listName, setListName] = useState(initial?.listName ?? "");
  const [stage, setStage] = useState<Stage>(
    initial?.boardId ? "list" : "credentials"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setError(null);
    if (!apiKey.trim() || !token.trim()) {
      setError("Enter both the API key and the token.");
      return;
    }
    setBusy(true);
    try {
      await verifyCredentials(apiKey.trim(), token.trim());
      const b = await fetchBoards(apiKey.trim(), token.trim());
      setBoards(b);
      setStage("board");
    } catch {
      setError(
        "Couldn't verify those credentials. Double-check the API key and token and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseBoard(id: string, name: string) {
    setBoardId(id);
    setBoardName(name);
    setError(null);
    setBusy(true);
    try {
      const l = await fetchLists(apiKey.trim(), token.trim(), id);
      setLists(l);
      setStage("list");
    } catch {
      setError("Couldn't load lists for that board.");
    } finally {
      setBusy(false);
    }
  }

  function handleChooseList(id: string, name: string) {
    setListId(id);
    setListName(name);
  }

  async function handleSave() {
    if (!listId) {
      setError("Pick a list to save new tasks into.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSave({
        apiKey: apiKey.trim(),
        token: token.trim(),
        boardId,
        boardName,
        listId,
        listName,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Connect Trello</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Your key and token are saved to your account so they follow you
          between devices. Cards are still created by calling Trello&apos;s
          API straight from this browser.
        </p>
      </div>

      {stage === "credentials" && (
        <div className="flex flex-col gap-3">
          <a
            className="text-sm underline text-blue-600"
            href="https://trello.com/power-ups/admin/new"
            target="_blank"
            rel="noreferrer"
          >
            1. Get an API key (trello.com/power-ups/admin) →
          </a>
          <label className="flex flex-col gap-1 text-sm">
            API Key
            <input
              className="border rounded-lg px-3 py-2 text-base"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your Trello API key"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          {apiKey.trim() && (
            <a
              className="text-sm underline text-blue-600"
              href={`https://trello.com/1/authorize?expiration=never&name=TrelloSnap&scope=read,write&response_type=token&key=${encodeURIComponent(
                apiKey.trim()
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              2. Generate a token using this key →
            </a>
          )}
          <label className="flex flex-col gap-1 text-sm">
            Token
            <input
              className="border rounded-lg px-3 py-2 text-base"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste the token you generated"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            className="mt-2 rounded-lg bg-black text-white py-2.5 font-medium disabled:opacity-50"
            disabled={busy}
            onClick={handleVerify}
          >
            {busy ? "Checking…" : "Verify & continue"}
          </button>
        </div>
      )}

      {stage === "board" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Pick a board</p>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => handleChooseBoard(b.id, b.name)}
                className="text-left border rounded-lg px-3 py-2 hover:bg-neutral-50"
              >
                {b.name}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            className="text-sm underline text-neutral-500 self-start"
            onClick={() => setStage("credentials")}
          >
            ← back
          </button>
        </div>
      )}

      {stage === "list" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-500">
            Board: <span className="font-medium">{boardName}</span>
          </p>
          <p className="text-sm font-medium">
            Pick the list new tasks go into
          </p>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => handleChooseList(l.id, l.name)}
                className={`text-left border rounded-lg px-3 py-2 hover:bg-neutral-50 ${
                  listId === l.id ? "border-black bg-neutral-50" : ""
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              className="text-sm underline text-neutral-500"
              onClick={() => setStage("board")}
            >
              ← back
            </button>
            <button
              className="ml-auto rounded-lg bg-black text-white px-4 py-2 font-medium disabled:opacity-50"
              disabled={!listId || busy}
              onClick={handleSave}
            >
              {busy ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      )}

      {onCancel && stage === "credentials" && initial && (
        <button
          className="text-sm underline text-neutral-500 self-start"
          onClick={onCancel}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
