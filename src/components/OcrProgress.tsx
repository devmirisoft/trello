"use client";

export default function OcrProgress() {
  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4 text-center py-12">
      <div className="w-16 h-16 rounded-full border-4 border-neutral-200 border-t-black animate-spin" />
      <p className="font-medium">Reading your photo…</p>
      <p className="text-sm text-neutral-500">This takes a few seconds.</p>
    </div>
  );
}
