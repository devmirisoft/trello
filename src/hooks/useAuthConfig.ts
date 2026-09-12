"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrelloConfig } from "@/lib/types";

export type AuthState = "loading" | "signed-out" | "signed-in";

type Session = { username: string; config: TrelloConfig | null };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as Session;
}

/** The Trello config now lives in Mongo behind a session cookie, so it is
 * fetched once on mount instead of read synchronously from localStorage. */
export function useAuthConfig() {
  const [state, setState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/config");
        if (!live) return;
        if (res.status === 401) return setState("signed-out");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        setSession({ username: data.username, config: data.config ?? null });
        setState("signed-in");
      } catch (err) {
        if (!live) return;
        // Surfaced because the usual cause is a missing env var on the server.
        setError((err as Error).message);
        setState("signed-out");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Throws on failure so the sign-in form can show the message inline.
  const signIn = useCallback(async (username: string, passcode: string) => {
    const data = await send("/api/auth", "POST", { username, passcode });
    setError(null);
    setSession({ username: data.username, config: data.config ?? null });
    setState("signed-in");
  }, []);

  const signOut = useCallback(async () => {
    await send("/api/auth/logout", "POST");
    setSession(null);
    setState("signed-out");
  }, []);

  const saveConfig = useCallback(async (config: TrelloConfig) => {
    const data = await send("/api/config", "PUT", config);
    setSession((s) => (s ? { ...s, config: data.config } : s));
  }, []);

  return {
    state,
    error,
    username: session?.username ?? null,
    config: session?.config ?? null,
    signIn,
    signOut,
    saveConfig,
  };
}
