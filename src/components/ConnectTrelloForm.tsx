"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const KEY_URL = "https://trello.com/app-key";

/** The key and token are posted once and never come back: from here on they
 * live encrypted on the server and every Trello call is made there. */
export default function ConnectTrelloForm() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trello/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      router.replace("/boards");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="safe-top mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-10">
      <header>
        <h1 className="text-2xl font-semibold">Connect Trello</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Get both from{" "}
          <a href={KEY_URL} target="_blank" rel="noreferrer" className="underline">
            trello.com/app-key
          </a>
          . They are stored encrypted and never sent to your browser again.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          API key
          <input
            name="apiKey"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 font-mono text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Token
          <input
            name="token"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 font-mono text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="h-11" disabled={busy}>
          {busy ? "Checking with Trello…" : "Connect"}
        </Button>
      </form>
    </main>
  );
}
