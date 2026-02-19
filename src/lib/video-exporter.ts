/**
 * 4D Video Exporter — captures WebGL canvas frames with overlays
 * using the browser-native MediaRecorder API.
 *
 * Records the 3D viewport as it animates through the project timeline,
 * adding date overlay, progress bar, and Wallnut watermark.
 *
 * Output: WebM blob (VP8/VP9 codec, browser-native, zero dependencies).
 */

// ============================================================
// Types
// ============================================================

export interface VideoExportOptions {
  /** Frames per second (24 or 30) */
  fps: number;
  /** Days of simulation per second of video (e.g. 7 = 1 week/sec) */
  speed: number;
  /** Video resolution */
  resolution: "720p" | "1080p" | "4K";
  /** Show current date text overlay */
  showDateOverlay: boolean;
  /** Show progress bar at bottom */
  showProgressBar: boolean;
  /** Show Wallnut branding watermark */
  showWatermark: boolean;
}

export interface VideoExportProgress {
  /** Current frame number */
  frame: number;
  /** Total estimated frames */
  totalFrames: number;
  /** Progress 0-1 */
  percent: number;
  /** Current date being rendered */
  currentDate: string;
  /** Is recording finished? */
  done: boolean;
  /** If done, the output blob */
  blob?: Blob;
  /** If error occurred */
  error?: string;
}

type ProgressCallback = (progress: VideoExportProgress) => void;

// ============================================================
// Resolution map
// ============================================================

const RESOLUTIONS: Record<VideoExportOptions["resolution"], { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "4K": { width: 3840, height: 2160 },
};

// ============================================================
// VideoExporter class
// ============================================================

export class VideoExporter {
  private canvas: HTMLCanvasElement;
  private options: VideoExportOptions;
  private offscreen: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private cancelled = false;
  private recording = false;

  constructor(canvas: HTMLCanvasElement, options: VideoExportOptions) {
    this.canvas = canvas;
    this.options = options;

    // Create offscreen canvas at target resolution
    const res = RESOLUTIONS[options.resolution];
    this.offscreen = document.createElement("canvas");
    this.offscreen.width = res.width;
    this.offscreen.height = res.height;
    const ctx = this.offscreen.getContext("2d");
    if (!ctx) throw new Error("Failed to create offscreen canvas context");
    this.offscreenCtx = ctx;
  }

  /**
   * Record a complete 4D animation sequence.
   *
   * @param startDate - Project start date (ISO)
   * @param finishDate - Project finish date (ISO)
   * @param seekToDate - Callback to advance the timeline to a specific date.
   *                     This should trigger visual state changes in the 3D viewer.
   * @param waitForRender - Async callback to wait for one render frame.
   * @param onProgress - Progress callback.
   * @returns The final WebM blob.
   */
  async record(
    startDate: string,
    finishDate: string,
    seekToDate: (dateMs: number) => void,
    waitForRender: () => Promise<void>,
    onProgress: ProgressCallback,
  ): Promise<Blob> {
    this.cancelled = false;
    this.recording = true;
    this.chunks = [];

    const startMs = new Date(startDate).getTime();
    const finishMs = new Date(finishDate).getTime();
    const totalDurationMs = finishMs - startMs;
    const msPerVideoSecond = this.options.speed * 86_400_000; // days/sec × ms/day
    const videoDurationSec = totalDurationMs / msPerVideoSecond;
    const totalFrames = Math.ceil(videoDurationSec * this.options.fps);
    const msPerFrame = totalDurationMs / totalFrames;

    // Setup MediaRecorder
    const stream = this.offscreen.captureStream(this.options.fps);

    // Prefer VP9, fallback to VP8, then default
    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    let selectedMime = "";
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    this.recorder = new MediaRecorder(stream, {
      mimeType: selectedMime || undefined,
      videoBitsPerSecond: this.options.resolution === "4K" ? 20_000_000 : 8_000_000,
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    // Start recording
    this.recorder.start();

    // Render each frame
    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.cancelled) {
        this.recorder.stop();
        this.recording = false;
        throw new Error("Recording cancelled");
      }

      const currentMs = startMs + frame * msPerFrame;
      const currentDate = new Date(currentMs).toISOString().split("T")[0];
      const progress = frame / totalFrames;

      // Seek the timeline to this date
      seekToDate(currentMs);

      // Wait for the 3D scene to render
      await waitForRender();

      // Draw the composite frame
      this.drawFrame(currentDate, progress);

      // Report progress (throttled: every 6th frame ≈ 5 updates/sec at 30fps)
      if (frame === 0 || frame === totalFrames - 1 || frame % 6 === 0) {
        onProgress({
          frame,
          totalFrames,
          percent: progress,
          currentDate,
          done: false,
        });
      }

      // Yield to browser to keep UI responsive
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    // Stop recording and collect the blob
    return new Promise<Blob>((resolve, reject) => {
      if (!this.recorder) {
        reject(new Error("No recorder"));
        return;
      }

      this.recorder.onstop = () => {
        this.recording = false;
        const blob = new Blob(this.chunks, { type: selectedMime || "video/webm" });
        onProgress({
          frame: totalFrames,
          totalFrames,
          percent: 1,
          currentDate: finishDate,
          done: true,
          blob,
        });
        resolve(blob);
      };

      this.recorder.stop();
    });
  }

  /**
   * Cancel an in-progress recording.
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Check if currently recording.
   */
  get isRecording(): boolean {
    return this.recording;
  }

  /**
   * Estimated video duration in seconds.
   */
  static estimateDuration(
    startDate: string,
    finishDate: string,
    speed: number,
  ): number {
    const startMs = new Date(startDate).getTime();
    const finishMs = new Date(finishDate).getTime();
    const totalDays = (finishMs - startMs) / 86_400_000;
    return totalDays / speed;
  }

  // ── Private: draw one composite frame ──────────────────────

  private drawFrame(dateLabel: string, progress: number): void {
    const ctx = this.offscreenCtx;
    const w = this.offscreen.width;
    const h = this.offscreen.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw the WebGL canvas (3D scene)
    ctx.drawImage(this.canvas, 0, 0, w, h);

    const barHeight = Math.round(h * 0.04); // 4% of height
    const fontSize = Math.round(h * 0.022); // ~24px at 1080p
    const padding = Math.round(h * 0.015);

    // ── Bottom overlay bar ──────────────────────
    if (this.options.showDateOverlay || this.options.showProgressBar || this.options.showWatermark) {
      // Semi-transparent dark bar
      ctx.fillStyle = "rgba(32, 42, 48, 0.85)"; // Wallnut dark slate
      ctx.fillRect(0, h - barHeight - padding * 2, w, barHeight + padding * 2);
    }

    // ── Date overlay (bottom-left) ──────────────
    if (this.options.showDateOverlay) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 ${fontSize}px Calibri, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";

      const dateStr = formatDatePT(dateLabel);
      ctx.fillText(dateStr, padding, h - barHeight / 2 - padding);
    }

    // ── Progress bar (bottom) ───────────────────
    if (this.options.showProgressBar) {
      const barY = h - barHeight;
      const barX = 0;

      // Background
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(barX, barY, w, barHeight);

      // Fill
      ctx.fillStyle = "#4D65FF"; // Wallnut accent blue
      ctx.fillRect(barX, barY, w * progress, barHeight);

      // Progress percentage text
      ctx.fillStyle = "#ffffff";
      ctx.font = `500 ${Math.round(fontSize * 0.7)}px Calibri, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${Math.round(progress * 100)}%`,
        w / 2,
        barY + barHeight / 2,
      );
    }

    // ── Watermark (bottom-right) ────────────────
    if (this.options.showWatermark) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.font = `400 ${Math.round(fontSize * 0.65)}px Calibri, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "WALLNUT Design+Build",
        w - padding,
        h - barHeight / 2 - padding,
      );
    }
  }
}

// ============================================================
// Helpers
// ============================================================

function formatDatePT(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Trigger a browser download for a blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
