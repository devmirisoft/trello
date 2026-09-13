"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CameraCapture from "./CameraCapture";
import OcrProgress from "./OcrProgress";
import CardPreviewList from "./CardPreviewList";
import TaskList, { type BulkAction } from "./TaskList";
import BulkSheet, { type SheetMode } from "./BulkSheet";
import { Button } from "@/components/ui/button";
import {
  recognizeText,
  splitIntoTaskLines,
  type OcrProgress as OcrProgressT,
} from "@/lib/ocr";
import type { TrelloBoard, TrelloCard, TrelloList } from "@/lib/trello";

type Props = {
  boardId: string;
  /** Who a photographed card gets assigned to: the connected account. */
  memberId: string;
  cards: TrelloCard[];
  lists: TrelloList[];
  boards: TrelloBoard[];
};

type Capture = "off" | "camera" | "ocr" | "preview";

export default function TaskScreen({
  boardId,
  memberId,
  cards,
  lists,
  boards,
}: Props) {
  const router = useRouter();
  const [capture, setCapture] = useState<Capture>("off");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<OcrProgressT>({
    status: "starting",
    progress: 0,
  });

  const [sheet, setSheet] = useState<{ mode: SheetMode; ids: string[] } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function sendBulk(
    action: BulkAction,
    cardIds: string[],
    payload: Record<string, unknown> = {}
  ) {
    const res = await fetch("/api/trello/cards/bulk", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardIds, action, payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
    return data as {
      warning?: string;
      results: { cardId: string; ok: boolean; error?: string }[];
    };
  }

  async function handleAction(action: BulkAction, cardIds: string[]) {
    if (!cardIds.length) return;
    // Editing and moving need more input; marking done does not.
    if (action !== "done") return setSheet({ mode: action, ids: cardIds });

    setBusy(true);
    setNotice(null);
    try {
      const data = await sendBulk("done", cardIds);
      const failed = data.results.filter((r) => !r.ok).length;
      if (failed) setNotice(`${failed} card${failed === 1 ? "" : "s"} failed.`);
      router.refresh();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runPhoto(file: File) {
    setPhotoUrl(URL.createObjectURL(file));
    setCapture("ocr");
    setProgress({ status: "starting", progress: 0 });
    try {
      setLines(splitIntoTaskLines(await recognizeText(file, setProgress)));
    } catch {
      setLines([]);
    }
    setCapture("preview");
  }

  function closeCapture() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setLines([]);
    setCapture("off");
  }

  if (capture !== "off") {
    return (
      <div className="safe-top mx-auto w-full max-w-md px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {capture === "preview" ? "Check the tasks" : "Photograph a list"}
          </h2>
          <Button variant="ghost" className="h-11" onClick={closeCapture}>
            Cancel
          </Button>
        </div>

        {capture === "camera" && <CameraCapture onCapture={runPhoto} />}
        {capture === "ocr" && (
          <OcrProgress progress={progress.progress} status={progress.status} />
        )}
        {capture === "preview" && (
          <CardPreviewList
            boardId={boardId}
            memberId={memberId}
            lists={lists}
            initialTasks={lines}
            imagePreviewUrl={photoUrl}
            onStartOver={() => setCapture("camera")}
            onDone={() => {
              closeCapture();
              router.refresh();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {notice && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {notice}
        </p>
      )}

      <TaskList
        cards={cards}
        lists={lists}
        busy={busy}
        onAction={handleAction}
        onCapture={() => setCapture("camera")}
      />

      {sheet && (
        <BulkSheet
          mode={sheet.mode}
          count={sheet.ids.length}
          boards={boards}
          assignedTo={[
            ...new Set(
              cards
                .filter((c) => sheet.ids.includes(c.id))
                .flatMap((c) => c.idMembers)
            ),
          ]}
          onCancel={() => setSheet(null)}
          onSubmit={async (payload) => {
            const data = await sendBulk(sheet.mode, sheet.ids, payload);
            const applied = data.results.length > 0;
            if (applied) {
              // Advice that arrives with a completed action belongs on the
              // list, not in a sheet that is about to close.
              setNotice(data.warning ?? null);
              router.refresh();
            }
            return { warning: data.warning, applied };
          }}
        />
      )}
    </>
  );
}
