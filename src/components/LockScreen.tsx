"use client";

import { useState } from "react";

type Props = {
  onUnlock: (passcode: string) => Promise<void>;
  firstRun: boolean;
  error?: string | null;
};

export default function LockScreen({ onUnlock, firstRun, error }: Props) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await onUnlock(passcode);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md mx-auto flex flex-col gap-4"
    >
      <div>
        <h2 className="text-lg font-semibold">
          {firstRun ? "Choose a passcode" : "Enter passcode"}
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {firstRun
            ? "This passcode unlocks the app on any device. Next you'll connect Trello once — after that it's straight to the camera."
            : "Unlock to go straight to the camera. Your Trello settings are already saved."}
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Passcode
        <input
          className="border rounded-lg px-3 py-2 text-base"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoComplete={firstRun ? "new-password" : "current-password"}
          autoFocus
          required
          minLength={4}
        />
      </label>

      {(formError ?? error) && (
        <p className="text-sm text-red-600">{formError ?? error}</p>
      )}

      <button
        type="submit"
        className="rounded-lg bg-black text-white py-2.5 font-medium disabled:opacity-50"
        disabled={busy}
      >
        {busy ? "Checking…" : firstRun ? "Set passcode" : "Unlock"}
      </button>
    </form>
  );
}
