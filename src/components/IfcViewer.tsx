"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import {
  Components,
  IfcLoader,
  Worlds,
  SimpleScene,
  SimpleCamera,
  SimpleRenderer,
  Hider,
  FragmentsManager,
} from "@thatopen/components";
import type { FragmentsModel, RaycastResult, RenderedFaces } from "@thatopen/fragments";
import { Upload, Eye, Maximize2, Layers } from "lucide-react";

// ============================================================
// Types
// ============================================================

export interface IfcViewerProps {
  /** Optional IFC file data to load immediately */
  ifcData?: Uint8Array;
  /** Optional file name for the IFC data */
  ifcName?: string;
  /** Callback when an element is selected */
  onElementSelect?: (elementId: number | null, modelId: string) => void;
  /** Callback when model loads successfully */
  onModelLoaded?: (model: FragmentsModel) => void;
  /** External visibility map: modelId → Set of localIds to show (for 4D) */
  visibilityMap?: Record<string, Set<number>>;
  /** CSS class for the container */
  className?: string;
}

interface LoadedModelInfo {
  model: FragmentsModel;
  name: string;
  categories: string[];
}

// ============================================================
// Component
// ============================================================

export default function IfcViewer({
  ifcData,
  ifcName,
  onElementSelect,
  onModelLoaded,
  visibilityMap,
  className = "",
}: IfcViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<Components | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worldRef = useRef<any>(null);
  const hiderRef = useRef<Hider | null>(null);
  const ifcLoaderRef = useRef<IfcLoader | null>(null);

  const [loadedModels, setLoadedModels] = useState<LoadedModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<number | null>(null);
  const [showStoreys, setShowStoreys] = useState(false);

  // ── Initialize 3D scene ─────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    async function init() {
      if (!container || disposed) return;

      try {
        // 1. Create components instance
        const components = new Components();
        componentsRef.current = components;

        // 2. Create world
        const worlds = components.get(Worlds);
        const world = worlds.create();
        worldRef.current = world;

        // 3. Setup scene
        const scene = new SimpleScene(components);
        scene.setup({
          backgroundColor: new THREE.Color(0xf5f5f5),
          directionalLight: {
            color: new THREE.Color(0xffffff),
            intensity: 1.5,
            position: new THREE.Vector3(5, 10, 5),
          },
          ambientLight: {
            color: new THREE.Color(0xffffff),
            intensity: 0.6,
          },
        });
        world.scene = scene;

        // 4. Setup camera
        const camera = new SimpleCamera(components);
        world.camera = camera;

        // 5. Setup renderer
        const renderer = new SimpleRenderer(components, container);
        world.renderer = renderer;

        // 6. Init components (starts animation loop)
        components.init();

        // 7. Setup IFC loader with WASM path
        const ifcLoader = components.get(IfcLoader);
        await ifcLoader.setup({
          wasm: {
            path: "/wasm/",
            absolute: false,
          },
          autoSetWasm: false,
        });
        ifcLoaderRef.current = ifcLoader;

        // 8. Setup hider
        const hider = components.get(Hider);
        hiderRef.current = hider;

        // 9. Setup click picking
        const fragmentsManager = components.get(FragmentsManager);
        renderer.three.domElement.addEventListener("pointerdown", async (e) => {
          if (e.button !== 0) return; // left click only
          const rect = container.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
          );

          const result = await fragmentsManager.raycast({
            camera: camera.three as THREE.PerspectiveCamera,
            mouse,
            dom: renderer.three.domElement,
          });

          if (result) {
            const cast = result as RaycastResult;
            const modelId = cast.fragments?.modelId ?? "";
            setSelectedElement(cast.localId);
            onElementSelect?.(cast.localId, modelId);

            // Highlight picked element
            if (cast.localId != null && modelId) {
              await fragmentsManager.resetHighlight();
              await fragmentsManager.highlight(
                {
                  color: new THREE.Color(0x2563eb),
                  opacity: 0.6,
                  renderedFaces: 1 as unknown as RenderedFaces,
                  transparent: true,
                },
                { [modelId]: new Set([cast.localId]) },
              );
            }
          } else {
            setSelectedElement(null);
            onElementSelect?.(null, "");
            await fragmentsManager.resetHighlight();
          }
        });

        // 10. Handle resize
        const observer = new ResizeObserver(() => {
          if (!disposed && renderer) {
            renderer.resize();
            camera.updateAspect();
          }
        });
        observer.observe(container);

        // 11. If IFC data was provided, load it
        if (ifcData) {
          await loadIfcFile(ifcData, ifcName ?? "model.ifc");
        }

        return () => {
          observer.disconnect();
        };
      } catch (err) {
        console.error("Failed to init IFC viewer:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize 3D viewer");
      }
    }

    const cleanupPromise = init();

    return () => {
      disposed = true;
      cleanupPromise?.then((cleanup) => cleanup?.());
      if (componentsRef.current) {
        componentsRef.current.dispose();
        componentsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load IFC file ───────────────────────────────────────────
  const loadIfcFile = useCallback(async (data: Uint8Array, name: string) => {
    const ifcLoader = ifcLoaderRef.current;
    const world = worldRef.current;
    if (!ifcLoader || !world) return;

    setIsLoading(true);
    setError(null);

    try {
      const model = await ifcLoader.load(data, true, name);
      world.scene.three.add(model.object);

      // Fit camera to model
      const camera = world.camera as SimpleCamera;
      await camera.fitToItems();

      const categories = await model.getCategories();

      setLoadedModels((prev) => [...prev, { model, name, categories }]);
      onModelLoaded?.(model);
    } catch (err) {
      console.error("Failed to load IFC:", err);
      setError(err instanceof Error ? err.message : "Failed to load IFC file");
    } finally {
      setIsLoading(false);
    }
  }, [onModelLoaded]);

  // ── Load new IFC data when prop changes ─────────────────────
  useEffect(() => {
    if (ifcData && ifcLoaderRef.current && loadedModels.length === 0) {
      loadIfcFile(ifcData, ifcName ?? "model.ifc");
    }
  }, [ifcData, ifcName, loadIfcFile, loadedModels.length]);

  // ── Apply visibility map (for 4D timeline) ─────────────────
  useEffect(() => {
    const hider = hiderRef.current;
    if (!hider || !visibilityMap) return;

    async function applyVisibility() {
      if (!hider) return;
      // First hide everything
      await hider.set(false);
      // Then show only the specified elements
      if (visibilityMap && Object.keys(visibilityMap).length > 0) {
        await hider.set(true, visibilityMap);
      }
    }

    applyVisibility();
  }, [visibilityMap]);

  // ── File upload handler ─────────────────────────────────────
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result as ArrayBuffer);
      loadIfcFile(data, file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Camera controls ─────────────────────────────────────────
  async function handleFitToModel() {
    const world = worldRef.current;
    if (!world) return;
    const camera = world.camera as SimpleCamera;
    await camera.fitToItems();
  }

  async function handleShowAll() {
    const hider = hiderRef.current;
    if (!hider) return;
    await hider.set(true);
  }

  // ── Render ──────────────────────────────────────────────────
  const hasModel = loadedModels.length > 0;

  return (
    <div className={`relative flex flex-col bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 text-sm">
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded cursor-pointer hover:bg-accent-hover transition-colors text-xs font-medium">
          <Upload className="w-3.5 h-3.5" />
          IFC
          <input
            type="file"
            accept=".ifc"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {hasModel && (
          <>
            <div className="w-px h-5 bg-gray-200" />
            <button
              onClick={handleFitToModel}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Fit to model"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleShowAll}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Show all"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowStoreys(!showStoreys)}
              className={`p-1.5 rounded transition-colors ${showStoreys ? "text-accent bg-accent-light" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
              title="Storeys"
            >
              <Layers className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <span className="text-xs text-gray-400">
              {loadedModels.map((m) => m.name).join(", ")}
            </span>
          </>
        )}

        {selectedElement != null && (
          <span className="ml-auto text-xs text-accent font-mono">
            #{selectedElement}
          </span>
        )}
      </div>

      {/* 3D viewport */}
      <div
        ref={containerRef}
        className="flex-1 min-h-[400px]"
        style={{ touchAction: "none" }}
      />

      {/* Empty state */}
      {!hasModel && !isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-10">
          <div className="text-center text-gray-400">
            <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Carregar ficheiro IFC</p>
            <p className="text-xs mt-1">Arraste ou use o botão acima</p>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 mt-10">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600 font-medium">A carregar modelo...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute bottom-3 left-3 right-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700 font-medium"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Storey panel */}
      {showStoreys && hasModel && (
        <div className="absolute top-12 right-3 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-48 max-h-60 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Pisos</p>
          {loadedModels.flatMap((m) =>
            m.categories
              .filter((c) => c.includes("STOREY") || c.includes("BUILDING"))
              .map((c) => (
                <button
                  key={`${m.name}-${c}`}
                  onClick={() => setShowStoreys(false)}
                  className="block w-full text-left px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  {c.replace("IFC", "").replace("BUILDING", "")}
                </button>
              )),
          )}
          {loadedModels.every((m) => m.categories.filter((c) => c.includes("STOREY")).length === 0) && (
            <p className="text-xs text-gray-400 italic">Sem pisos no modelo</p>
          )}
        </div>
      )}
    </div>
  );
}
