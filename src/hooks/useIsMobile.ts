"use client";

import { useState, useEffect } from "react";

/** Breakpoint matching Tailwind's `md` (768px). */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Reactive hook that returns `true` when the viewport is below the `md`
 * breakpoint (< 768px). Uses `matchMedia` so it updates on resize/rotate.
 */
export default function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mql.matches);

    function onChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
