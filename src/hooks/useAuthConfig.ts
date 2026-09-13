"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrelloConfig } from "@/lib/types";

export type AuthState = "loading" | "locked" | "unlocked";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as {
    id?: string;
    config?: TrelloConfig | null;
    warning?: string;
  };
}

/** The Trello config now lives in Mongo behind a session cookie, so it is
 * fetched once on mount instead of read synchronously from localStorage. */
export function useAuthConfig() {
  const [state, setState] = useState<AuthState>("loading");
  const [config, setConfig] = useState<TrelloConfig | null>(null);
  // Unique id of the stored credential record, for support/debugging.
  const [credentialId, setCredentialId] = useState<string | null>(null);
  // Why server-side auto-connect did not finish, if it did not.
  const [warning, setWarning] = useState<string | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/config");
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.status === 401) {
          setFirstRun(!!data.firstRun);
          return setState("locked");
        }
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        setConfig(data.config ?? null);
        setCredentialId(data.id ?? null);
        setWarning(data.warning ?? null);
        setState("unlocked");
      } catch (err) {
        if (!live) return;
        // Surfaced because the usual cause is a missing env var on the server.
        setError((err as Error).message);
        setState("locked");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Throws on failure so the lock screen can show the message inline.
  const unlock = useCallback(async (passcode: string) => {
    const data = await send("/api/unlock", "POST", { passcode });
    setError(null);
    setConfig(data.config ?? null);
    setCredentialId(data.id ?? null);
    setWarning(data.warning ?? null);
    setState("unlocked");
  }, []);

  const lock = useCallback(async () => {
    await send("/api/logout", "POST");
    setConfig(null);
    setCredentialId(null);
    setFirstRun(false);
    setState("locked");
  }, []);

  const saveConfig = useCallback(async (next: TrelloConfig) => {
    const data = await send("/api/config", "PUT", next);
    setConfig(data.config ?? next);
    if (data.id) setCredentialId(data.id);
    setWarning(null);
  }, []);

  return {
    state,
    error,
    firstRun,
    config,
    credentialId,
    warning,
    unlock,
    lock,
    saveConfig,
  };
}
