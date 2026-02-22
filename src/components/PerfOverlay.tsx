"use client";

import { useEffect, useState, useRef } from "react";

interface PerfOverlayProps {
  /** Pass a THREE.WebGLRenderer to read GPU draw calls */
  renderer?: { info: { render: { calls: number; triangles: number } } } | null;
}

/**
 * Debug performance overlay showing FPS, memory usage, and GPU stats.
 * Toggle with Shift+F. Only visible in development or when explicitly enabled.
 */
export default function PerfOverlay({ renderer }: PerfOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [fps, setFps] = useState(0);
  const [memory, setMemory] = useState<number | null>(null);
  const [drawCalls, setDrawCalls] = useState(0);
  const [triangles, setTriangles] = useState(0);
  const rafRef = useRef(0);

  // Toggle with Shift+F
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // FPS + memory sampling loop
  useEffect(() => {
    if (!visible) return;

    let frameCount = 0;
    let lastTime = performance.now();

    function tick() {
      frameCount++;
      const now = performance.now();
      const elapsed = now - lastTime;

      if (elapsed >= 500) {
        const currentFps = Math.round((frameCount * 1000) / elapsed);
        setFps(currentFps);
        frameCount = 0;
        lastTime = now;

        // Memory (Chrome-only performance.memory API)
        const perfMemory = (performance as PerformanceWithMemory).memory;
        if (perfMemory) {
          setMemory(Math.round(perfMemory.usedJSHeapSize / (1024 * 1024)));
        }

        // GPU stats from renderer
        if (renderer) {
          setDrawCalls(renderer.info.render.calls);
          setTriangles(renderer.info.render.triangles);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, renderer]);

  if (!visible) return null;

  return (
    <div className="fixed top-1 left-1 z-[9999] bg-black/80 text-green-400 font-mono text-[10px] leading-tight px-2 py-1.5 rounded pointer-events-none select-none">
      <div>{fps} FPS</div>
      {memory != null && <div>{memory} MB heap</div>}
      {renderer && (
        <>
          <div>{drawCalls} draws</div>
          <div>{(triangles / 1000).toFixed(1)}k tris</div>
        </>
      )}
    </div>
  );
}

// Chrome-only type
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}
