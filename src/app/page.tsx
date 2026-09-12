"use client";

import { useState } from "react";
import SettingsPanel from "@/components/SettingsPanel";
import CameraCapture from "@/components/CameraCapture";
import OcrProgress from "@/components/OcrProgress";
import TaskReview from "@/components/TaskReview";
import AuthGate from "@/components/AuthGate";
import { useAuthConfig } from "@/hooks/useAuthConfig";
import { isConfigured } from "@/lib/types";
import { recognizeText, splitIntoTaskLines, OcrProgress as OcrProgressT } from "@/lib/ocr";

type Step = "capture" | "ocr" | "review";

export default function Home() {
  const { state, error, username, config, signIn, signOut, saveConfig } =
    useAuthConfig();
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

  const needsSettings = !isConfigured(config) || showSettings;

  return (
    <main className="min-h-dvh flex flex-col px-4 py-8">
      <header className="flex items-center justify-between max-w-md w-full mx-auto mb-8">
        <h1 className="font-semibold text-lg">📋 Trello Snap</h1>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          {state === "signed-in" && isConfigured(config) && !showSettings && (
            <button className="underline" onClick={() => setShowSettings(true)}>
              Settings
            </button>
          )}
          {state === "signed-in" && (
            <button className="underline" onClick={signOut} title={username ?? ""}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center">
        {state === "loading" && (
          <p className="text-sm text-neutral-500 text-center">Loading…</p>
        )}

        {state === "signed-out" && <AuthGate onSignIn={signIn} error={error} />}

        {state === "signed-in" && needsSettings && (
          <SettingsPanel
            initial={config}
            onSave={saveConfig}
            onSaved={() => setShowSettings(false)}
            onCancel={
              isConfigured(config) ? () => setShowSettings(false) : undefined
            }
          />
        )}

        {state === "signed-in" && !needsSettings && config && step === "capture" && (
          <CameraCapture onCapture={handleCapture} />
        )}

        {state === "signed-in" && !needsSettings && step === "ocr" && (
          <OcrProgress
            progress={ocrProgress.progress}
            status={ocrProgress.status}
          />
        )}

        {state === "signed-in" && !needsSettings && config && step === "review" && imagePreviewUrl && (
          <TaskReview
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
