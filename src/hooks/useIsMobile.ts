"use client";

import { useState, useEffect } from "react";

/** Breakpoint matching Tailwind's `md` (768px). */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Reactive hook that returns `true` when the viewport is below the `md`
 * breakpoint (< 768px). Uses `matchMedia` so it updates on resize/rotate.
 */
export default function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);

    function onChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
