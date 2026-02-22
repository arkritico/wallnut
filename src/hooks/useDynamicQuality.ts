"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";

export interface DynamicQualityOptions {
  /** WebGL renderer instance */
  renderer: THREE.WebGLRenderer | null;
  /** Whether dynamic quality is enabled (disable on desktop) */
  enabled: boolean;
  /** Minimum pixel ratio (floor) */
  minPixelRatio?: number;
  /** Maximum pixel ratio (ceiling) */
  maxPixelRatio?: number;
  /** FPS threshold below which quality decreases */
  fpsLow?: number;
  /** FPS threshold above which quality recovers */
  fpsHigh?: number;
  /** Callback for debug display: (fps, currentPixelRatio) */
  onFpsUpdate?: (fps: number, pixelRatio: number) => void;
}

/**
 * Monitors FPS and dynamically adjusts pixel ratio to maintain smooth rendering.
 *
 * When FPS drops below `fpsLow` for a sustained period, pixel ratio is reduced.
 * When FPS exceeds `fpsHigh`, it gradually recovers toward the max.
 * This prevents GPU overload on mobile while maintaining quality when possible.
 */
export default function useDynamicQuality({
  renderer,
  enabled,
  minPixelRatio = 0.75,
  maxPixelRatio = 1.5,
  fpsLow = 20,
  fpsHigh = 30,
  onFpsUpdate,
}: DynamicQualityOptions) {
  const onFpsUpdateRef = useRef(onFpsUpdate);
  onFpsUpdateRef.current = onFpsUpdate;

  useEffect(() => {
    if (!enabled || !renderer) return;

    let rafId = 0;
    let lastTime = performance.now();
    let frameCount = 0;
    let currentFps = 60;
    let lowFpsFrames = 0;
    let highFpsFrames = 0;
    const SAMPLE_INTERVAL_MS = 1000;
    const LOW_THRESHOLD_FRAMES = 3; // sustained low before downgrade
    const HIGH_THRESHOLD_FRAMES = 5; // sustained high before upgrade

    function tick() {
      frameCount++;
      const now = performance.now();
      const elapsed = now - lastTime;

      if (elapsed >= SAMPLE_INTERVAL_MS) {
        currentFps = Math.round((frameCount * 1000) / elapsed);
        frameCount = 0;
        lastTime = now;

        const currentRatio = renderer!.getPixelRatio();
        onFpsUpdateRef.current?.(currentFps, currentRatio);

        if (currentFps < fpsLow) {
          lowFpsFrames++;
          highFpsFrames = 0;
          if (lowFpsFrames >= LOW_THRESHOLD_FRAMES && currentRatio > minPixelRatio) {
            const newRatio = Math.max(minPixelRatio, currentRatio - 0.25);
            renderer!.setPixelRatio(newRatio);
            lowFpsFrames = 0;
          }
        } else if (currentFps > fpsHigh) {
          highFpsFrames++;
          lowFpsFrames = 0;
          if (highFpsFrames >= HIGH_THRESHOLD_FRAMES && currentRatio < maxPixelRatio) {
            const newRatio = Math.min(maxPixelRatio, currentRatio + 0.125);
            renderer!.setPixelRatio(newRatio);
            highFpsFrames = 0;
          }
        } else {
          lowFpsFrames = 0;
          highFpsFrames = 0;
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, renderer, minPixelRatio, maxPixelRatio, fpsLow, fpsHigh]);
}
