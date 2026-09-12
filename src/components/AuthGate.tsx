"use client";

import { useState } from "react";

type Props = {
  onSignIn: (username: string, passcode: string) => Promise<void>;
  error?: string | null;
};

export default function AuthGate({ onSignIn, error }: Props) {
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await onSignIn(username.trim(), passcode);
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
        <h2 className="text-lg font-semibold">Sign in</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Pick any username and passcode. If the username is new, the account
          is created right away — your Trello settings are then saved to it, so
          they follow you to any device.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Username
        <input
          className="border rounded-lg px-3 py-2 text-base"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          required
          minLength={3}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Passcode
        <input
          className="border rounded-lg px-3 py-2 text-base"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoComplete="current-password"
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
        {busy ? "Checking…" : "Sign in or create account"}
      </button>
    </form>
  );
}
