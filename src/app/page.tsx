"use client";

import { useState } from "react";
import SettingsPanel from "@/components/SettingsPanel";
import CameraCapture from "@/components/CameraCapture";
import OcrProgress from "@/components/OcrProgress";
import CardPreviewList from "@/components/CardPreviewList";
import LockScreen from "@/components/LockScreen";
import { MemberAvatar } from "@/components/MemberPicker";
import { useAuthConfig } from "@/hooks/useAuthConfig";
import { isConfigured } from "@/lib/types";
import { recognizeText, splitIntoTaskLines, OcrProgress as OcrProgressT } from "@/lib/ocr";

type Step = "capture" | "ocr" | "review";

export default function Home() {
  const {
    state,
    error,
    firstRun,
    config,
    credentialId,
    warning,
    unlock,
    lock,
    saveConfig,
  } = useAuthConfig();
  const [showSettings, setShowSettings] = useState(false);

  const [step, setStep] = useState<Step>("capture");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgressT>({
    status: "starting",
    progress: 0,
  });
  const [extractedLines, setExtractedLines] = useState<string[]>([]);

  async function handleCapture(file: File) {
    const url = URL.createObjectURL(file);
    setImagePreviewUrl(url);
    setStep("ocr");
    setOcrProgress({ status: "starting", progress: 0 });
    try {
      const text = await recognizeText(file, setOcrProgress);
      setExtractedLines(splitIntoTaskLines(text));
    } catch {
      setExtractedLines([]);
    }
    setStep("review");
  }

  function handleStartOver() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setExtractedLines([]);
    setStep("capture");
  }

  // Settings only interrupt the flow when Trello was never connected, or when
  // the button below was clicked on purpose.
  const needsSettings = !isConfigured(config) || showSettings;
  const ready = state === "unlocked" && !needsSettings;

  return (
    <main className="min-h-dvh flex flex-col px-4 py-8">
      <header className="flex items-center justify-between max-w-md w-full mx-auto mb-8">
        <h1 className="font-semibold text-lg">📋 Trello Snap</h1>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          {state === "unlocked" && isConfigured(config) && !showSettings && (
            <button className="underline" onClick={() => setShowSettings(true)}>
              Settings
            </button>
          )}
          {state === "unlocked" && (
            <button className="underline" onClick={lock}>
              Lock
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center">
        {state === "loading" && (
          <p className="text-sm text-neutral-500 text-center">Loading…</p>
        )}

        {state === "locked" && (
          <LockScreen onUnlock={unlock} firstRun={firstRun} error={error} />
        )}

        {state === "unlocked" && needsSettings && warning && (
          <p className="mx-auto mb-4 w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {warning}
          </p>
        )}

        {state === "unlocked" && needsSettings && (
          <SettingsPanel
            initial={config}
            credentialId={credentialId}
            onSave={saveConfig}
            onSaved={() => setShowSettings(false)}
            onCancel={
              isConfigured(config) ? () => setShowSettings(false) : undefined
            }
          />
        )}

        {ready && config && step === "capture" && (
          <div className="flex flex-col gap-4">
            {/* Confirms at a glance that auto-connect worked and where the
                cards are going, so nothing about the setup is invisible. */}
            <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{config.boardName}</span>
                <span className="text-muted-foreground">
                  {" / "}
                  {config.listName}
                </span>
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {config.memberName}
                </span>
                <MemberAvatar
                  name={config.memberName ?? ""}
                  initials={config.memberInitials}
                  src={config.memberAvatarUrl}
                  size={22}
                />
              </span>
            </div>
            <CameraCapture onCapture={handleCapture} />
          </div>
        )}

        {ready && step === "ocr" && (
          <OcrProgress
            progress={ocrProgress.progress}
            status={ocrProgress.status}
          />
        )}

        {ready && config && step === "review" && imagePreviewUrl && (
          <CardPreviewList
            config={config}
            imagePreviewUrl={imagePreviewUrl}
            initialLines={extractedLines}
            onStartOver={handleStartOver}
          />
        )}
      </div>
    </main>
  );
}
