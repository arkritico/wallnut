"use client";

import { useEffect, useRef, useCallback } from "react";

export interface TouchGestureHandlers {
  /** Double-tap: fit camera to model */
  onDoubleTap?: () => void;
  /** Three-finger tap: reset view / show all */
  onThreeFingerTap?: () => void;
}

/**
 * Adds enhanced touch gesture support to a container element.
 * - Double-tap → fit model to view
 * - Three-finger tap → show all / reset
 *
 * Basic pinch-to-zoom and two-finger rotate are handled by camera-controls
 * (inside @thatopen/components SimpleCamera). This hook adds higher-level gestures.
 */
export default function useTouchGestures(
  containerRef: React.RefObject<HTMLElement | null>,
  handlers: TouchGestureHandlers,
) {
  const lastTapRef = useRef(0);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  const onTouchEnd = useCallback((e: TouchEvent) => {
    // Three-finger tap detection (all fingers lifted at once)
    if (e.touches.length === 0 && e.changedTouches.length === 3) {
      handlersRef.current.onThreeFingerTap?.();
      return;
    }

    // Double-tap detection (single finger)
    if (e.changedTouches.length !== 1) return;
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta > 0 && delta < 300) {
      e.preventDefault();
      handlersRef.current.onDoubleTap?.();
      lastTapRef.current = 0; // reset to prevent triple-tap triggering again
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [containerRef, onTouchEnd]);
}
