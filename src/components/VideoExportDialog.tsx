"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { X, Film } from "lucide-react";
import {
  VideoExporter,
  downloadBlob,
  type VideoExportOptions,
  type VideoExportProgress,
} from "@/lib/video-exporter";

// ============================================================
// Props
// ============================================================

interface VideoExportDialogProps {
  /** WebGL canvas to capture */
  canvas: HTMLCanvasElement | null;
  /** Project start date (ISO) */
  startDate: string;
  /** Project finish date (ISO) */
  finishDate: string;
  /** Callback to seek the timeline to a date (ms) */
  onSeekToDate: (dateMs: number) => void;
  /** Close the dialog */
  onClose: () => void;
}

// ============================================================
// Defaults
// ============================================================

const DEFAULT_OPTIONS: VideoExportOptions = {
  fps: 30,
  resolution: "1080p",
  speed: 7,
  showDateOverlay: true,
  showProgressBar: true,
  showWatermark: true,
};

const SPEED_OPTIONS = [
  { value: 1, label: "1 dia/seg" },
  { value: 3, label: "3 dias/seg" },
  { value: 7, label: "7 dias/seg" },
  { value: 14, label: "14 dias/seg" },
  { value: 30, label: "30 dias/seg" },
];

// ============================================================
// Component
// ============================================================

export default function VideoExportDialog({
  canvas,
  startDate,
  finishDate,
  onSeekToDate,
  onClose,
}: VideoExportDialogProps) {
  const [options, setOptions] = useState<VideoExportOptions>(DEFAULT_OPTIONS);
  const [progress, setProgress] = useState<VideoExportProgress | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exporterRef = useRef<VideoExporter | null>(null);

  // Estimated duration
  const estimatedDuration = useMemo(
    () => VideoExporter.estimateDuration(startDate, finishDate, options.speed),
    [startDate, finishDate, options.speed],
  );

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `~${Math.round(seconds)} seg`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `~${mins}m ${secs}s`;
  };

  // ── Option setters ──────────────────────────────────
  const updateOption = useCallback(
    <K extends keyof VideoExportOptions>(key: K, value: VideoExportOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Estimated file size (MB)
  const estimatedSizeMB = useMemo(() => {
    const bitrate = options.resolution === "4K" ? 20_000_000 : 8_000_000;
    return Math.round((estimatedDuration * bitrate) / 8_000_000);
  }, [estimatedDuration, options.resolution]);

  // Canvas validity check
  const canvasValid = canvas != null && canvas.width > 0 && canvas.height > 0;

  // ── Start recording ─────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      setError("Canvas 3D não disponível ou sem dimensões válidas");
      return;
    }

    setError(null);
    setIsRecording(true);

    try {
      const exporter = new VideoExporter(canvas, options);
      exporterRef.current = exporter;

      const waitForRender = () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

      const blob = await exporter.record(
        startDate,
        finishDate,
        onSeekToDate,
        waitForRender,
        (p) => setProgress(p),
      );

      // Download
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `wallnut-4d-${dateStr}.webm`;
      downloadBlob(blob, filename);

      exporterRef.current = null;
    } catch (err) {
      if (err instanceof Error && err.message === "Recording cancelled") {
        // User cancelled — no error
      } else {
        setError(err instanceof Error ? err.message : "Erro na exportação");
      }
    } finally {
      setIsRecording(false);
    }
  }, [canvas, options, startDate, finishDate, onSeekToDate]);

  // ── Cancel recording ────────────────────────────────
  const handleCancel = useCallback(() => {
    exporterRef.current?.cancel();
    exporterRef.current = null;
    setIsRecording(false);
    setProgress(null);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[420px] max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-gray-800">
              Exportar Vídeo 4D
            </h2>
          </div>
          <button
            onClick={isRecording ? handleCancel : onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="px-5 py-4 space-y-4">
          {/* Resolution */}
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Resolução
            </label>
            <div className="flex gap-2">
              {(["720p", "1080p", "4K"] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => updateOption("resolution", res)}
                  disabled={isRecording}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    options.resolution === res
                      ? "bg-accent text-white font-medium"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          {/* FPS */}
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              FPS
            </label>
            <div className="flex gap-2">
              {[24, 30].map((fps) => (
                <button
                  key={fps}
                  onClick={() => updateOption("fps", fps)}
                  disabled={isRecording}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    options.fps === fps
                      ? "bg-accent text-white font-medium"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {fps}
                </button>
              ))}
            </div>
          </div>

          {/* Speed */}
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Velocidade
            </label>
            <select
              value={options.speed}
              onChange={(e) => updateOption("speed", Number(e.target.value))}
              disabled={isRecording}
              className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:border-accent"
            >
              {SPEED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Overlays */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">
              Sobreposições
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.showDateOverlay}
                onChange={(e) => updateOption("showDateOverlay", e.target.checked)}
                disabled={isRecording}
                className="accent-accent w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-600">Data no vídeo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.showProgressBar}
                onChange={(e) => updateOption("showProgressBar", e.target.checked)}
                disabled={isRecording}
                className="accent-accent w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-600">Barra de progresso</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.showWatermark}
                onChange={(e) => updateOption("showWatermark", e.target.checked)}
                disabled={isRecording}
                className="accent-accent w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-600">Marca Wallnut</span>
            </label>
          </div>

          {/* Duration + size estimate */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">Duração estimada</span>
            <span className="text-xs font-medium text-gray-700">
              {formatDuration(estimatedDuration)}
              <span className="ml-2 text-gray-400 font-normal">~{estimatedSizeMB} MB</span>
            </span>
          </div>
        </div>

        {/* Progress */}
        {isRecording && progress && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-600">
                A gravar... {progress.currentDate}
              </span>
              <span className="text-xs font-medium text-accent">
                {Math.round(progress.percent * 100)}%
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-150 rounded-full"
                style={{ width: `${progress.percent * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Frame {progress.frame}/{progress.totalFrames}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-5 py-2 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          {isRecording ? (
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
            >
              Cancelar
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={handleExport}
                disabled={!canvasValid}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  canvasValid
                    ? "bg-accent text-white hover:bg-accent-hover"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                Exportar WebM
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
