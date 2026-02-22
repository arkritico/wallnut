"use client";

import { useEffect, useState } from "react";

export interface BatteryStatus {
  /** Whether to throttle rendering (low battery + not charging) */
  shouldThrottle: boolean;
  /** Current battery level 0-1 (null if API unavailable) */
  level: number | null;
  /** Whether the device is charging */
  charging: boolean;
}

/**
 * Monitors battery status and signals when rendering should be throttled.
 * Throttling activates when battery < 15% and not charging.
 *
 * Uses the Battery Status API (navigator.getBattery).
 * Returns safe defaults when the API is unavailable.
 */
export default function useBatteryAware(): BatteryStatus {
  const [status, setStatus] = useState<BatteryStatus>({
    shouldThrottle: false,
    level: null,
    charging: true,
  });

  useEffect(() => {
    let battery: BatteryManager | null = null;

    function update() {
      if (!battery) return;
      const level = battery.level;
      const charging = battery.charging;
      const shouldThrottle = !charging && level < 0.15;
      setStatus({ shouldThrottle, level, charging });
    }

    async function init() {
      if (!("getBattery" in navigator)) return;
      try {
        battery = await (navigator as NavigatorWithBattery).getBattery();
        update();
        battery.addEventListener("chargingchange", update);
        battery.addEventListener("levelchange", update);
      } catch {
        // API unavailable or denied
      }
    }

    init();

    return () => {
      if (battery) {
        battery.removeEventListener("chargingchange", update);
        battery.removeEventListener("levelchange", update);
      }
    };
  }, []);

  return status;
}

// Type declarations for Battery Status API
interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
}

interface NavigatorWithBattery extends Navigator {
  getBattery(): Promise<BatteryManager>;
}
