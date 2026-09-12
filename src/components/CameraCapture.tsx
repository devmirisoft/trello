"use client";

import { useRef } from "react";

type Props = {
  onCapture: (file: File) => void;
};

export default function CameraCapture({ onCapture }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="w-24 h-24 rounded-full bg-neutral-100 flex items-center justify-center text-4xl">
        📸
      </div>
      <p className="text-sm text-neutral-500 max-w-xs">
        Photograph your notes, whiteboard, or to-do list. Each line becomes a
        separate Trello card.
      </p>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />

      <button
        className="w-full max-w-xs rounded-lg bg-black text-white py-3 font-medium"
        onClick={() => cameraInputRef.current?.click()}
      >
        Take a photo
      </button>
      <button
        className="w-full max-w-xs rounded-lg border py-3 font-medium"
        onClick={() => galleryInputRef.current?.click()}
      >
        Choose from photos
      </button>
    </div>
  );
}
