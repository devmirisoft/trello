"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const field =
  "h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function AccountForm({
  username,
  trelloConnected,
}: {
  username: string;
  trelloConnected: boolean;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState(username);
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/credentials", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          ...(newUsername !== username ? { newUsername } : {}),
          ...(newPassword ? { newPassword } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      // No re-login: the session cookie carries only the account id, which
      // has not changed.
      setStatus("Saved. You are still signed in.");
      setCurrentPassword("");
      setNewPassword("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Trello is {trelloConnected ? "connected" : "not connected"}. Changing
        your username or password here keeps it connected.
      </p>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Username
        <input
          name="newUsername"
          autoCapitalize="none"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        New password (leave blank to keep it)
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Current password
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={field}
        />
      </label>

      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="h-11" disabled={busy || !currentPassword}>
        Save changes
      </Button>

      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={signOut}
      >
        Sign out
      </Button>
    </form>
  );
}
