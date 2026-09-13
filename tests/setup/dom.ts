import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom implements neither, and the long-press handler calls both.
if (!("vibrate" in navigator)) {
  Object.defineProperty(navigator, "vibrate", { value: () => true, writable: true });
}
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(cleanup);
