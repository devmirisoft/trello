"use client";

import { useCallback, useRef, useState } from "react";
import Webcam from "react-webcam";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataUrlToFile } from "@/lib/image";

type Props = {
  onCapture: (file: File) => void;
};

// Prefer the rear camera on phones; desktops just get their only one.
const VIDEO_CONSTRAINTS: MediaTrackConstraints = { facingMode: "environment" };

export default function CameraCapture({ onCapture }: Props) {
  const webcamRef = useRef<Webcam>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // onUserMedia fires when the stream is attached, which is earlier than the
  // first decoded frame — enabling Capture there means the first tap can come
  // back empty. Wait for actual frame data instead.
  const handleUserMedia = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video) return;
    if (video.readyState >= video.HAVE_CURRENT_DATA) return setReady(true);
    video.addEventListener("loadeddata", () => setReady(true), { once: true });
  }, []);

  const handleCapture = useCallback(() => {
    const shot = webcamRef.current?.getScreenshot();
    if (!shot) {
      setError("Couldn't grab a frame from the camera. Try again.");
      return;
    }
    onCapture(dataUrlToFile(shot, `snap-${Date.now()}.jpg`));
  }, [onCapture]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
      <div className="relative w-full overflow-hidden rounded-xl border bg-black aspect-[3/4]">
        {!error && (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            // Groq bills the image by resolution, not by file size, so JPEG
            // re-compression buys nothing and smears thin cursive strokes.
            screenshotQuality={1}
            // Without this the snapshot is downscaled to the preview's size,
            // which costs OCR the detail it needs on handwriting.
            forceScreenshotSourceSize
            videoConstraints={VIDEO_CONSTRAINTS}
            onUserMedia={handleUserMedia}
            onUserMediaError={(e) =>
              setError(
                typeof e === "string"
                  ? e
                  : e.name === "NotAllowedError"
                    ? "Camera access was blocked. Allow it in your browser's site settings, then reload."
                    : "No camera available on this device."
              )
            }
            className="h-full w-full object-cover"
          />
        )}
        {error && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
            {error}
          </p>
        )}
        {!ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Starting camera…
          </p>
        )}
      </div>

      <p className="max-w-xs text-center text-sm text-muted-foreground">
        Frame your notes or to-do list. Each task becomes a separate Trello
        card.
      </p>

      <Button
        size="lg"
        className="w-full"
        disabled={!ready || !!error}
        onClick={handleCapture}
      >
        <Camera data-icon="inline-start" />
        Capture
      </Button>
    </div>
  );
}
