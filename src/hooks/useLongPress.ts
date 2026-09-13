"use client";

import { useCallback, useEffect, useRef } from "react";

export const LONG_PRESS_MS = 500;
/** Past this much movement the finger is scrolling, not holding. */
export const MOVE_TOLERANCE_PX = 10;

type Options = {
  delay?: number;
  moveTolerance?: number;
  /** Fires on a plain tap — a press that ended before the hold completed. */
  onTap?: () => void;
};

/**
 * Touch long-press with the two things that make it feel native on a phone:
 * a scroll gesture cancels it, and a completed hold buzzes rather than
 * waiting for the finger to lift.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = LONG_PRESS_MS, moveTolerance = MOVE_TOLERANCE_PX, onTap }: Options = {}
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  // A row unmounting mid-hold must not fire afterwards.
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Right-click and secondary buttons are not a long press.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        clear();
        navigator.vibrate?.(10);
        onLongPress();
      }, delay);
    },
    [clear, delay, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!origin.current) return;
      const dx = e.clientX - origin.current.x;
      const dy = e.clientY - origin.current.y;
      if (Math.hypot(dx, dy) > moveTolerance) clear();
    },
    [clear, moveTolerance]
  );

  const onPointerUp = useCallback(() => {
    const wasHold = fired.current;
    clear();
    // The pointerup that ends a completed hold is not also a tap.
    if (!wasHold) onTap?.();
  }, [clear, onTap]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: clear,
    onPointerLeave: clear,
    // Holding on mobile otherwise raises the OS text-selection menu.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
