"use client";

type Props = {
  progress: number; // 0..1
  status: string;
};

export default function OcrProgress({ progress, status }: Props) {
  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4 text-center py-12">
      <div className="w-16 h-16 rounded-full border-4 border-neutral-200 border-t-black animate-spin" />
      <p className="font-medium">Reading your photo…</p>
      <p className="text-sm text-neutral-500 capitalize">
        {status.replace(/_/g, " ")}
      </p>
      <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-black transition-all"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
