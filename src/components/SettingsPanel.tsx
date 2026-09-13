"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import MemberPicker from "./MemberPicker";
import {
  avatarSrc,
  fetchBoards,
  fetchLists,
  fetchMembers,
  verifyCredentials,
  TrelloBoard,
  TrelloList,
  TrelloMember,
} from "@/lib/trello";
import { TrelloConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  initial: TrelloConfig | null;
  /** Unique id of the stored credential record, shown for support. */
  credentialId?: string | null;
  onSave: (config: TrelloConfig) => Promise<void>;
  onSaved: () => void;
  onCancel?: () => void;
};

type Stage = "credentials" | "board" | "list" | "member";

/** What gets stored for the assignee. The avatar URL is resolved once here so
 * it is never re-suffixed on a later save. */
type PickedMember = {
  id: string;
  name: string;
  initials: string;
  avatar: string | null;
};

const pick = (m: TrelloMember): PickedMember => ({
  id: m.id,
  name: m.fullName || m.username,
  initials: m.initials,
  avatar: avatarSrc(m, 50),
});

export default function SettingsPanel({
  initial,
  credentialId,
  onSave,
  onSaved,
  onCancel,
}: Props) {
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [token, setToken] = useState(initial?.token ?? "");
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [members, setMembers] = useState<TrelloMember[]>([]);
  const [boardId, setBoardId] = useState(initial?.boardId ?? "");
  const [boardName, setBoardName] = useState(initial?.boardName ?? "");
  const [listId, setListId] = useState(initial?.listId ?? "");
  const [listName, setListName] = useState(initial?.listName ?? "");
  const [member, setMember] = useState<PickedMember | null>(
    initial?.memberId
      ? {
          id: initial.memberId,
          name: initial.memberName ?? "",
          initials: initial.memberInitials ?? "",
          avatar: initial.memberAvatarUrl ?? null,
        }
      : null
  );
  // Jump straight to the furthest step already chosen; the effect below
  // fetches whatever that step needs. Saved credentials skip the key/token
  // form altogether and reconnect to Trello on their own.
  const [stage, setStage] = useState<Stage>(
    initial?.listId
      ? "member"
      : initial?.boardId
        ? "list"
        : initial?.apiKey && initial?.token
          ? "board"
          : "credentials"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to force a refetch after a failed load, so a Trello hiccup is a
  // retry rather than a picker that can never be satisfied.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const key = apiKey.trim();
    const tok = token.trim();
    if (!key || !tok) return;

    const needs =
      stage === "board" && boards.length === 0
        ? "boards"
        : stage === "list" && lists.length === 0 && boardId
          ? "lists"
          : stage === "member" && members.length === 0 && boardId
            ? "people"
            : null;
    if (!needs) return;

    let live = true;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        if (needs === "boards") {
          const b = await fetchBoards(key, tok);
          if (live) setBoards(b);
        } else if (needs === "lists") {
          const l = await fetchLists(key, tok, boardId);
          if (live) setLists(l);
        } else {
          const m = await fetchMembers(key, tok, boardId);
          if (live) setMembers(m);
        }
      } catch {
        if (live) setError(`Could not load ${needs} from Trello.`);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [
    stage,
    boardId,
    apiKey,
    token,
    reload,
    boards.length,
    lists.length,
    members.length,
  ]);

  async function handleVerify() {
    setError(null);
    if (!apiKey.trim() || !token.trim()) {
      setError("Enter both the API key and the token.");
      return;
    }
    setBusy(true);
    try {
      await verifyCredentials(apiKey.trim(), token.trim());
      // Save them now, not at the end of the wizard: if the board, list or
      // person step is abandoned or errors out, the key and token are already
      // stored and never have to be typed again.
      try {
        await onSave({ apiKey: apiKey.trim(), token: token.trim() });
      } catch (err) {
        setError(
          `Credentials are valid but could not be saved: ${(err as Error).message}`
        );
      }
      setStage("board");
    } catch {
      setError(
        "Could not verify those credentials. Double-check the API key and token and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseBoard(id: string, name: string) {
    // A different board invalidates the list and person picked under the old one.
    if (id !== boardId) {
      setLists([]);
      setMembers([]);
      setListId("");
      setListName("");
      setMember(null);
    }
    setBoardId(id);
    setBoardName(name);
    setError(null);
    setStage("list");
  }

  function chooseList(id: string, name: string) {
    setListId(id);
    setListName(name);
    setError(null);
    setStage("member");
  }

  async function handleSave() {
    if (!listId || !member) {
      setError("Pick a list and a person first.");
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
        memberId: member.id,
        memberName: member.name,
        memberInitials: member.initials,
        memberAvatarUrl: member.avatar,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Connect Trello</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your key and token are saved to the database so they follow you
          between devices. Cards are still created by calling Trello&apos;s API
          straight from this browser.
        </p>
      </div>

      {stage === "credentials" && (
        <div className="flex flex-col gap-3">
          <a
            className="text-sm text-blue-600 underline"
            href="https://trello.com/power-ups/admin/new"
            target="_blank"
            rel="noreferrer"
          >
            1. Get an API key (trello.com/power-ups/admin) →
          </a>
          <label className="flex flex-col gap-1 text-sm">
            API Key
            <input
              className="rounded-lg border px-3 py-2 text-base"
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
              className="text-sm text-blue-600 underline"
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
              className="rounded-lg border px-3 py-2 text-base"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste the token you generated"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            size="lg"
            className="mt-2"
            disabled={busy}
            onClick={handleVerify}
          >
            {busy ? "Checking…" : "Verify & continue"}
          </Button>
        </div>
      )}

      {stage === "board" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Pick a board</p>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => chooseBoard(b.id, b.name)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted",
                  boardId === b.id && "border-foreground bg-muted"
                )}
              >
                {b.name}
              </button>
            ))}
            {busy && boards.length === 0 && (
              <p className="text-sm text-muted-foreground">Loading boards…</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setStage("credentials")}
          >
            ← back
          </Button>
        </div>
      )}

      {stage === "list" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Board: <span className="font-medium">{boardName}</span>
          </p>
          <p className="text-sm font-medium">Pick the list new cards go into</p>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => chooseList(l.id, l.name)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted",
                  listId === l.id && "border-foreground bg-muted"
                )}
              >
                {l.name}
              </button>
            ))}
            {busy && lists.length === 0 && (
              <p className="text-sm text-muted-foreground">Loading lists…</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setStage("board")}
          >
            ← back
          </Button>
        </div>
      )}

      {stage === "member" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Board: <span className="font-medium">{boardName}</span> / List:{" "}
            <span className="font-medium">{listName}</span>
          </p>
          <p className="text-sm font-medium">Who are these cards for?</p>
          {busy && members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading people…</p>
          ) : (
            <MemberPicker
              members={members}
              selectedId={member?.id}
              onSelect={(m) => {
                setMember(pick(m));
                setError(null);
              }}
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {/* Never leave this step with no way forward: Save stays disabled
              until someone is picked, so a failed load needs its own retry. */}
          {!busy && members.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setReload((n) => n + 1)}
            >
              Retry loading people
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStage("list")}>
              ← back
            </Button>
            <Button
              size="lg"
              className="ml-auto"
              disabled={!member || busy}
              onClick={handleSave}
            >
              {busy ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      )}

      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={onCancel}
        >
          Cancel
        </Button>
      )}

      {credentialId && (
        <p className="text-xs text-muted-foreground">
          Credential ID:{" "}
          <span className="font-mono select-all">{credentialId}</span>
        </p>
      )}
    </div>
  );
}
