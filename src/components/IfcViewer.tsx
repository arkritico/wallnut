"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import {
  Components,
  IfcLoader,
  Worlds,
  SimpleScene,
  SimpleCamera,
  SimpleRenderer,
  Hider,
  Clipper,
  Classifier,
  FragmentsManager,
} from "@thatopen/components";
import type { FragmentsModel, RaycastResult, RenderedFaces } from "@thatopen/fragments";
import {
  Upload,
  Eye,
  Maximize2,
  Camera,
  Scissors,
  Info,
  Filter,
  Layers,
  Ruler,
  Box,
} from "lucide-react";
import ModelManagerPanel from "./ifc-viewer/ModelManagerPanel";
import type { LoadedModelInfo } from "./ifc-viewer/ModelManagerPanel";
import ClipperPanel from "./ifc-viewer/ClipperPanel";
import PropertiesPanel from "./ifc-viewer/PropertiesPanel";
import type { ElementProperties } from "./ifc-viewer/PropertiesPanel";
import CategoryFilterPanel from "./ifc-viewer/CategoryFilterPanel";
import type { CategoryNode } from "./ifc-viewer/CategoryFilterPanel";
import { translateCategoryName } from "./ifc-viewer/CategoryFilterPanel";

// ============================================================
// Types
// ============================================================

/** A highlight group: one color applied to a set of elements. */
export interface PhaseHighlight {
  color: string; // hex, e.g. "#dc2626"
  opacity: number; // 0.8 = completed, 0.25 = in-progress
  elements: Record<string, Set<number>>; // modelId → localIds
}

/** Imperative handle exposed via ref for parent toolbar integration */
export interface IfcViewerHandle {
  fitToModel: () => void;
  showAll: () => void;
  screenshot: () => void;
  togglePanel: (panel: "models" | "clipper" | "properties" | "categories") => void;
  getActivePanel: () => PanelType;
  /** Create a horizontal section cut at the model center (Dalux-style level cut) */
  createSectionCut: () => void;
  hasModel: boolean;
}

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
  /** Phase-based color highlights: each group tints its elements */
  phaseHighlights?: PhaseHighlight[];
  /** Selection highlights: rendered on top of phase highlights */
  selectionHighlights?: PhaseHighlight[];
  /** Elements to fly the camera to (modelId → localIds). Camera animates when this changes. */
  flyToTarget?: Record<string, Set<number>>;
  /** When true, category filters and model manager are disabled (external control mode) */
  externalVisibilityControl?: boolean;
  /** Ref to expose the underlying WebGL canvas element (for video capture) */
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  /** Hide the built-in toolbar (parent renders its own) */
  hideToolbar?: boolean;
  /** CSS class for the container */
  className?: string;
}

type PanelType = "models" | "clipper" | "properties" | "categories" | null;

// ============================================================
// Component
// ============================================================

// ============================================================
// Performance helpers
// ============================================================

/** Reusable Vector2 for raycasting — avoids allocation per click */
const _raycastMouse = new THREE.Vector2();

/** Cap devicePixelRatio to avoid GPU overload on high-DPI screens */
function clampedPixelRatio(max = 2): number {
  return Math.min(window.devicePixelRatio ?? 1, max);
}

const IfcViewer = forwardRef<IfcViewerHandle, IfcViewerProps>(function IfcViewer({
  ifcData,
  ifcName,
  onElementSelect,
  onModelLoaded,
  visibilityMap,
  phaseHighlights,
  selectionHighlights,
  flyToTarget,
  externalVisibilityControl = false,
  canvasRef,
  hideToolbar = false,
  className = "",
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<Components | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worldRef = useRef<any>(null);
  const hiderRef = useRef<Hider | null>(null);
  const ifcLoaderRef = useRef<IfcLoader | null>(null);
  const clipperRef = useRef<Clipper | null>(null);
  const classifierRef = useRef<Classifier | null>(null);

  const [loadedModels, setLoadedModels] = useState<LoadedModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<number | null>(null);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);


  // Ortho/perspective toggle
  const [isOrtho, setIsOrtho] = useState(false);

  // Measurement mode
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurements, setMeasurements] = useState<{ id: string; distance: string }[]>([]);
  const measureStartRef = useRef<THREE.Vector3 | null>(null);
  const measureLinesRef = useRef<THREE.Group>(new THREE.Group());

  // New panel state
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [selectedElementData, setSelectedElementData] = useState<ElementProperties | null>(null);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [modelVisibility, setModelVisibility] = useState<Record<string, boolean>>({});

  // Stable refs for use in event handlers (closure-safe)
  const loadedModelsRef = useRef<LoadedModelInfo[]>([]);
  loadedModelsRef.current = loadedModels;
  const activePanelRef = useRef<PanelType>(null);
  activePanelRef.current = activePanel;
  const isMeasuringRef = useRef(false);
  isMeasuringRef.current = isMeasuring;

  // Imperative handle for parent toolbar integration
  useImperativeHandle(ref, () => ({
    fitToModel: () => handleFitToModel(),
    showAll: () => handleShowAll(),
    screenshot: () => handleScreenshot(),
    togglePanel: (panel: "models" | "clipper" | "properties" | "categories") => togglePanel(panel),
    getActivePanel: () => activePanel,
    createSectionCut: () => handleCreateSectionCut(),
    hasModel: loadedModels.length > 0,
  }), [activePanel, loadedModels.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle panel (only one open at a time) ──────────────────
  function togglePanel(panel: PanelType) {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  // ── Rebuild category tree from Classifier ─────────────────────
  const rebuildCategoryTree = useCallback(async () => {
    const classifier = classifierRef.current;
    if (!classifier) return;

    try {
      await classifier.byCategory();
      const categoryMap = classifier.list.get("category");
      if (!categoryMap) return;

      const nodes: CategoryNode[] = [];
      for (const [name, groupData] of categoryMap) {
        const modelIdMap = await groupData.get();
        let count = 0;
        const localIds: Record<string, number[]> = {};
        for (const [mid, idSet] of Object.entries(modelIdMap)) {
          count += idSet.size;
          localIds[mid] = Array.from(idSet);
        }
        if (count === 0) continue;
        nodes.push({
          name,
          displayName: translateCategoryName(name),
          count,
          localIds,
          visible: true,
        });
      }
      nodes.sort((a, b) => b.count - a.count);
      setCategoryTree(nodes);
    } catch (err) {
      console.warn("Failed to build category tree:", err);
    }
  }, []);

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

        // 3b. Add measurement lines group to scene
        scene.three.add(measureLinesRef.current);

        // 4. Setup renderer (must exist on world before camera is assigned)
        //    - powerPreference: prefer discrete GPU when available
        //    - preserveDrawingBuffer: needed for screenshot & video capture
        //    - antialias: smooth edges (disabled on low-end / mobile GPUs)
        const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        const renderer = new SimpleRenderer(components, container, {
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
          antialias: !isMobileDevice,
        });
        world.renderer = renderer;

        // Cap pixel ratio: 2 on desktop, 1.5 on mobile (big GPU savings)
        const gl = renderer.three as THREE.WebGLRenderer;
        gl.setPixelRatio(clampedPixelRatio(isMobileDevice ? 1.5 : 2));

        // Expose the canvas element for video capture
        if (canvasRef) {
          canvasRef.current = renderer.three.domElement;
        }

        // Prevent right-click context menu on 3D viewport
        renderer.three.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

        // Handle WebGL context loss gracefully
        renderer.three.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setError("Contexto WebGL perdido. Recarregue a página para restaurar o visualizador 3D.");
        });

        // 5. Setup camera — assigned to world AFTER renderer so
        //    newCameraControls() can find the renderer's DOM element.
        const camera = new SimpleCamera(components);
        try {
          world.camera = camera;
        } catch {
          camera.currentWorld = null;
          await new Promise(r => setTimeout(r, 0));
          world.camera = camera;
        }

        // 6. Init components (starts animation loop)
        components.init();

        // 7. Init FragmentsManager (required before loading any IFC)
        const fragmentsManager = components.get(FragmentsManager);
        fragmentsManager.init("/wasm/fragments-worker.mjs");

        // 8. Setup IFC loader with WASM path
        const ifcLoader = components.get(IfcLoader);
        await ifcLoader.setup({
          wasm: {
            path: "/wasm/",
            absolute: true,
          },
          autoSetWasm: false,
        });
        ifcLoaderRef.current = ifcLoader;

        // 9. Setup hider
        const hider = components.get(Hider);
        hiderRef.current = hider;

        // 10. Setup Clipper
        const clipper = components.get(Clipper);
        clipper.setup();
        clipper.material = new THREE.MeshBasicMaterial({
          color: 0x4D65FF,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.2,
        });
        clipperRef.current = clipper;

        // 11. Setup Classifier
        const classifier = components.get(Classifier);
        classifierRef.current = classifier;

        // 12. Setup click picking with property fetching + measurement
        const threeRaycaster = new THREE.Raycaster();
        renderer.three.domElement.addEventListener("pointerdown", async (e) => {
          if (e.button !== 0) return; // left click only

          // Auto-close non-properties panels on mobile when tapping the viewport
          if (isMobileDevice && activePanelRef.current && activePanelRef.current !== "properties") {
            setActivePanel(null);
          }

          // Don't pick if Clipper is in interactive creation mode
          if (clipper.enabled) return;

          const rect = container.getBoundingClientRect();
          _raycastMouse.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
          );

          // ── Measurement mode: raycast against scene meshes ──
          if (measureStartRef.current !== null || isMeasuringRef.current) {
            threeRaycaster.setFromCamera(_raycastMouse, camera.three);
            // Collect all mesh children (excluding measurement lines group)
            const meshes: THREE.Object3D[] = [];
            scene.three.traverse((child) => {
              if (child !== measureLinesRef.current && (child as THREE.Mesh).isMesh) {
                meshes.push(child);
              }
            });
            const hits = threeRaycaster.intersectObjects(meshes, false);
            if (hits.length > 0) {
              const hitPoint = hits[0].point.clone();

              if (measureStartRef.current === null) {
                // First click: set start point, draw a small sphere marker
                measureStartRef.current = hitPoint;
                const dotGeo = new THREE.SphereGeometry(0.05);
                const dotMat = new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false });
                const dot = new THREE.Mesh(dotGeo, dotMat);
                dot.position.copy(hitPoint);
                dot.renderOrder = 999;
                dot.name = "__measure_start__";
                measureLinesRef.current.add(dot);
              } else {
                // Second click: draw line + label, compute distance
                const start = measureStartRef.current;
                const end = hitPoint;
                const distance = start.distanceTo(end);

                // Line
                const lineGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
                const lineMat = new THREE.LineBasicMaterial({ color: 0xff3333, depthTest: false, linewidth: 2 });
                const line = new THREE.Line(lineGeo, lineMat);
                line.renderOrder = 999;
                measureLinesRef.current.add(line);

                // End dot
                const dotGeo = new THREE.SphereGeometry(0.05);
                const dotMat = new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false });
                const dot = new THREE.Mesh(dotGeo, dotMat);
                dot.position.copy(end);
                dot.renderOrder = 999;
                measureLinesRef.current.add(dot);

                // Remove the __measure_start__ marker name tag
                const startDot = measureLinesRef.current.children.find((c) => c.name === "__measure_start__");
                if (startDot) startDot.name = "";

                // Record measurement
                const label = distance < 1
                  ? `${(distance * 100).toFixed(1)} cm`
                  : `${distance.toFixed(3)} m`;
                setMeasurements((prev) => [...prev, { id: crypto.randomUUID(), distance: label }]);

                // Reset for next measurement
                measureStartRef.current = null;
              }
            }
            return; // Don't do element selection while measuring
          }

          const result = await fragmentsManager.raycast({
            camera: camera.three as THREE.PerspectiveCamera,
            mouse: _raycastMouse,
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

              // Fetch element properties
              const modelInfo = loadedModelsRef.current.find(
                (m) => m.model.modelId === modelId,
              );
              if (modelInfo) {
                try {
                  const items = await modelInfo.model.getItemsData([cast.localId]);
                  const item = items[0] as Record<string, unknown> | undefined;
                  const guidArr = await modelInfo.model.getGuidsByLocalIds([cast.localId]);

                  setSelectedElementData({
                    localId: cast.localId,
                    modelId,
                    modelName: modelInfo.name,
                    name: extractStringValue(item, "Name") ?? `Elemento #${cast.localId}`,
                    category: (item?.type as string) ?? "Desconhecido",
                    guid: guidArr?.[0] ?? "",
                    attributes: item ?? {},
                  });
                  setActivePanel("properties");
                } catch (err) {
                  console.warn("Failed to fetch element properties:", err);
                }
              }
            }
          } else {
            setSelectedElement(null);
            setSelectedElementData(null);
            onElementSelect?.(null, "");
            await fragmentsManager.resetHighlight();
          }
        });

        // 13. Handle resize (throttled to avoid GPU stalls during drag-resize)
        let resizeRaf = 0;
        const observer = new ResizeObserver(() => {
          if (disposed) return;
          cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(() => {
            if (!disposed && renderer) {
              renderer.resize();
              camera.updateAspect();
            }
          });
        });
        observer.observe(container);

        // 14. If IFC data was provided, load it
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
  /** Load a single IFC file. Set `skipFitAndRebuild` to true when
   *  loading in batch (the caller handles fit + rebuild after all files). */
  const loadIfcFile = useCallback(async (data: Uint8Array, name: string, skipFitAndRebuild = false) => {
    const ifcLoader = ifcLoaderRef.current;
    const world = worldRef.current;
    if (!ifcLoader || !world) return;

    setIsLoading(true);
    setError(null);

    const sizeMb = (data.byteLength / (1024 * 1024)).toFixed(1);
    setLoadingProgress(`A analisar ${name} (${sizeMb} MB)...`);

    try {
      setLoadingProgress(`A processar geometria — ${name}...`);
      const model = await ifcLoader.load(data, true, name);

      setLoadingProgress(`A adicionar ao cenário — ${name}...`);
      world.scene.three.add(model.object);

      setLoadingProgress(`A extrair categorias — ${name}...`);
      const categories = await model.getCategories();

      const newModel: LoadedModelInfo = { model, name, categories };
      setLoadedModels((prev) => [...prev, newModel]);
      setModelVisibility((prev) => ({ ...prev, [model.modelId]: true }));
      onModelLoaded?.(model);

      if (!skipFitAndRebuild) {
        const camera = world.camera as SimpleCamera;
        await camera.fitToItems();
        await rebuildCategoryTree();
      }
    } catch (err) {
      console.error(`Failed to load IFC ${name}:`, err);
      setError(`Falha ao carregar ${name}. O ficheiro pode estar corrompido ou num formato não suportado.`);
    } finally {
      if (!skipFitAndRebuild) {
        setIsLoading(false);
        setLoadingProgress(null);
      }
    }
  }, [onModelLoaded, rebuildCategoryTree]);

  /** Load multiple IFC files sequentially with batched camera fit. */
  const loadIfcBatch = useCallback(async (files: { data: Uint8Array; name: string }[]) => {
    setIsLoading(true);
    setError(null);

    for (let i = 0; i < files.length; i++) {
      setLoadingProgress(`Modelo ${i + 1}/${files.length}: ${files[i].name}`);
      await loadIfcFile(files[i].data, files[i].name, true);
    }

    // After all files: fit camera + rebuild category tree once
    const world = worldRef.current;
    if (world) {
      setLoadingProgress("A ajustar câmara...");
      const camera = world.camera as SimpleCamera;
      await camera.fitToItems();
    }
    await rebuildCategoryTree();

    setIsLoading(false);
    setLoadingProgress(null);
  }, [loadIfcFile, rebuildCategoryTree]);

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
      await hider.set(false);
      if (visibilityMap && Object.keys(visibilityMap).length > 0) {
        await hider.set(true, visibilityMap);
      }
    }

    applyVisibility();
  }, [visibilityMap]);

  // ── Apply phase color highlights + selection highlights (for 4D) ──
  useEffect(() => {
    const components = componentsRef.current;
    const hasPhase = phaseHighlights && phaseHighlights.length > 0;
    const hasSelection = selectionHighlights && selectionHighlights.length > 0;
    if (!components || (!hasPhase && !hasSelection)) return;

    const fragmentsManager = components.get(FragmentsManager);

    async function applyHighlights() {
      await fragmentsManager.resetHighlight();
      if (phaseHighlights) {
        for (const group of phaseHighlights) {
          await fragmentsManager.highlight(
            {
              color: new THREE.Color(group.color),
              opacity: group.opacity,
              renderedFaces: 1 as unknown as RenderedFaces,
              transparent: true,
            },
            group.elements,
          );
        }
      }
      if (selectionHighlights) {
        for (const group of selectionHighlights) {
          await fragmentsManager.highlight(
            {
              color: new THREE.Color(group.color),
              opacity: group.opacity,
              renderedFaces: 1 as unknown as RenderedFaces,
              transparent: true,
            },
            group.elements,
          );
        }
      }
    }

    applyHighlights();
  }, [phaseHighlights, selectionHighlights]);

  // ── Camera fly-to target elements ──────────────────────────
  useEffect(() => {
    const world = worldRef.current;
    if (!world || !flyToTarget) return;

    const modelId = Object.keys(flyToTarget)[0];
    if (!modelId) return;
    const localIds = flyToTarget[modelId];
    if (!localIds || localIds.size === 0) return;

    const model = loadedModels.find((m) => m.model.modelId === modelId)?.model;
    if (!model) return;

    async function flyTo() {
      try {
        const box = await model!.getMergedBox(Array.from(localIds));
        if (box.isEmpty()) return;
        const camera = world!.camera as SimpleCamera;
        await camera.controls.fitToBox(box, true, {
          cover: false,
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 40,
          paddingBottom: 40,
        });
      } catch {
        // Silently ignore — element may not have geometry
      }
    }

    flyTo();
  }, [flyToTarget, loadedModels]);

  // ── File upload handler ─────────────────────────────────────
  /** Size threshold (MB) above which we show a warning before loading */
  const FILE_SIZE_WARNING_MB = 30;
  /** Max recommended models before performance degrades */
  const MAX_RECOMMENDED_MODELS = 10;

  /** Read multiple files from the file list, check sizes, then load */
  async function processFiles(fileList: FileList) {
    const ifcFiles = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".ifc"));
    if (ifcFiles.length === 0) {
      setError("Apenas ficheiros .ifc são suportados.");
      return;
    }

    // Check model count
    const totalAfterLoad = loadedModels.length + ifcFiles.length;
    if (totalAfterLoad > MAX_RECOMMENDED_MODELS) {
      const overWarning = `Vai ter ${totalAfterLoad} modelos carregados. Acima de ${MAX_RECOMMENDED_MODELS} modelos o desempenho pode degradar significativamente.`;
      if (!window.confirm(overWarning)) return;
    }

    // Check total size
    const totalSizeMb = ifcFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
    if (totalSizeMb > FILE_SIZE_WARNING_MB) {
      const sizeWarning = ifcFiles.length === 1
        ? `${ifcFiles[0].name} tem ${Math.round(totalSizeMb)} MB. Ficheiros grandes podem causar lentidão. Continuar?`
        : `${ifcFiles.length} ficheiros totalizando ${Math.round(totalSizeMb)} MB. Continuar?`;
      if (!window.confirm(sizeWarning)) return;
    }

    // Read all files into Uint8Arrays
    const fileDataArr: { data: Uint8Array; name: string }[] = [];
    for (const file of ifcFiles) {
      const data = await new Promise<Uint8Array>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.readAsArrayBuffer(file);
      });
      fileDataArr.push({ data, name: file.name });
    }

    // Single file → load directly, multiple → batch
    if (fileDataArr.length === 1) {
      loadIfcFile(fileDataArr[0].data, fileDataArr[0].name);
    } else {
      loadIfcBatch(fileDataArr);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(files);
  }

  // ── Drag-and-drop handlers ──────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only leave if we actually left the container (not a child element)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    processFiles(files);
  }

  // ── Ortho/perspective toggle ────────────────────────────────
  function handleToggleOrtho() {
    const world = worldRef.current;
    if (!world) return;
    const camera = world.camera as SimpleCamera;
    const threeCamera = camera.three;

    if (isOrtho) {
      // Switch to perspective
      if (threeCamera instanceof THREE.OrthographicCamera) {
        const aspect = threeCamera.right / threeCamera.top || 1;
        const perspCam = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        perspCam.position.copy(threeCamera.position);
        perspCam.quaternion.copy(threeCamera.quaternion);
        camera.three = perspCam;
      }
    } else {
      // Switch to orthographic
      if (threeCamera instanceof THREE.PerspectiveCamera) {
        const frustumSize = 50;
        const aspect = threeCamera.aspect || 1;
        const orthoCam = new THREE.OrthographicCamera(
          -frustumSize * aspect / 2, frustumSize * aspect / 2,
          frustumSize / 2, -frustumSize / 2, 0.1, 1000
        );
        orthoCam.position.copy(threeCamera.position);
        orthoCam.quaternion.copy(threeCamera.quaternion);
        camera.three = orthoCam;
      }
    }
    setIsOrtho(!isOrtho);
    camera.updateAspect();
  }

  // ── Measurement tool handlers ───────────────────────────────
  function handleToggleMeasure() {
    if (isMeasuring) {
      // Exit measurement mode, clear pending start point
      measureStartRef.current = null;
    }
    setIsMeasuring(!isMeasuring);
  }

  function handleClearMeasurements() {
    const group = measureLinesRef.current;
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    setMeasurements([]);
    measureStartRef.current = null;
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
    // Reset category visibility state
    setCategoryTree((prev) => prev.map((c) => ({ ...c, visible: true })));
  }

  function handleScreenshot() {
    const world = worldRef.current;
    if (!world) return;
    const renderer = world.renderer as SimpleRenderer;
    const gl = renderer.three as THREE.WebGLRenderer;
    const scene = world.scene.three as THREE.Scene;
    const cam = (world.camera as SimpleCamera).three as THREE.Camera;
    gl.render(scene, cam);
    const dataUrl = gl.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `wallnut-screenshot-${new Date().toISOString().split("T")[0]}.png`;
    a.click();
  }

  /** Create a horizontal section cut through the center of the model (Dalux-style level cut) */
  function handleCreateSectionCut() {
    const clip = clipperRef.current;
    const world = worldRef.current;
    if (!clip || !world || loadedModelsRef.current.length === 0) return;

    // Compute combined bounding box of all models
    const box = new THREE.Box3();
    for (const m of loadedModelsRef.current) {
      const modelBox = m.model.box;
      if (!modelBox.isEmpty()) box.union(modelBox);
    }
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    // Place clip plane at the vertical center (cuts building in half horizontally)
    const normal = new THREE.Vector3(0, 1, 0);
    clip.createFromNormalAndCoplanarPoint(world, normal, center);
    // Open the clipper panel so user can adjust
    setActivePanel("clipper");
  }

  // ── Model manager handlers ──────────────────────────────────
  function handleToggleModelVisibility(modelId: string) {
    const model = loadedModels.find((m) => m.model.modelId === modelId);
    if (!model) return;

    const currentVisible = modelVisibility[modelId] !== false;
    const newVisible = !currentVisible;

    setModelVisibility((prev) => ({ ...prev, [modelId]: newVisible }));
    model.model.setVisible(undefined, newVisible);
  }

  function handleRemoveModel(modelId: string) {
    const world = worldRef.current;
    const modelInfo = loadedModels.find((m) => m.model.modelId === modelId);
    if (!modelInfo || !world) return;

    world.scene.three.remove(modelInfo.model.object);
    modelInfo.model.dispose();

    setLoadedModels((prev) => prev.filter((m) => m.model.modelId !== modelId));
    setModelVisibility((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });

    // Rebuild category tree without this model
    rebuildCategoryTree();
  }

  // ── Category filter handlers ────────────────────────────────
  async function handleToggleCategory(categoryName: string) {
    const hider = hiderRef.current;
    if (!hider) return;

    const cat = categoryTree.find((c) => c.name === categoryName);
    if (!cat) return;

    const newVisible = !cat.visible;

    // Build modelIdMap with Set<number>
    const modelIdMap: Record<string, Set<number>> = {};
    for (const [mid, ids] of Object.entries(cat.localIds)) {
      modelIdMap[mid] = new Set(ids);
    }

    await hider.set(newVisible, modelIdMap);

    setCategoryTree((prev) =>
      prev.map((c) => (c.name === categoryName ? { ...c, visible: newVisible } : c)),
    );
  }

  async function handleIsolateCategory(categoryName: string) {
    const hider = hiderRef.current;
    if (!hider) return;

    const cat = categoryTree.find((c) => c.name === categoryName);
    if (!cat) return;

    // Build modelIdMap for the isolated category
    const modelIdMap: Record<string, Set<number>> = {};
    for (const [mid, ids] of Object.entries(cat.localIds)) {
      modelIdMap[mid] = new Set(ids);
    }

    await hider.isolate(modelIdMap);

    // Update category tree — only isolated category is visible
    setCategoryTree((prev) =>
      prev.map((c) => ({ ...c, visible: c.name === categoryName })),
    );
  }

  // ── Fly to element from properties panel ────────────────────
  async function handleFlyToElement(modelId: string, localId: number) {
    const world = worldRef.current;
    const model = loadedModels.find((m) => m.model.modelId === modelId)?.model;
    if (!world || !model) return;

    try {
      const box = await model.getMergedBox([localId]);
      if (box.isEmpty()) return;
      const camera = world.camera as SimpleCamera;
      await camera.controls.fitToBox(box, true, {
        cover: false,
        paddingLeft: 40,
        paddingRight: 40,
        paddingTop: 40,
        paddingBottom: 40,
      });
    } catch {
      // Element may not have geometry
    }
  }

  // ── Render ──────────────────────────────────────────────────
  const hasModel = loadedModels.length > 0;
  const isExternalControl = externalVisibilityControl || !!visibilityMap;

  return (
    <div
      className={`relative flex flex-col bg-gray-100 rounded-lg overflow-hidden ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar (hidden when parent provides its own) */}
      {!hideToolbar && <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-200 text-sm overflow-x-auto scrollbar-none">
        {/* Upload IFC button */}
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded cursor-pointer hover:bg-accent-hover transition-colors text-xs font-medium">
          <Upload className="w-3.5 h-3.5" />
          IFC
          <input
            type="file"
            accept=".ifc"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {hasModel && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-1" />

            {/* Panel toggle buttons */}
            {!isExternalControl && (
              <ToolbarButton
                icon={<Layers className="w-4 h-4" />}
                label="Modelos"
                badge={loadedModels.length > 1 ? String(loadedModels.length) : undefined}
                active={activePanel === "models"}
                onClick={() => togglePanel("models")}
              />
            )}

            <ToolbarButton
              icon={<Scissors className="w-4 h-4" />}
              label="Cortes"
              active={activePanel === "clipper"}
              onClick={() => togglePanel("clipper")}
            />

            <ToolbarButton
              icon={<Info className="w-4 h-4" />}
              label="Propriedades"
              active={activePanel === "properties"}
              onClick={() => togglePanel("properties")}
            />

            {!isExternalControl && (
              <ToolbarButton
                icon={<Filter className="w-4 h-4" />}
                label="Categorias"
                active={activePanel === "categories"}
                onClick={() => togglePanel("categories")}
              />
            )}

            <div className="w-px h-5 bg-gray-200 mx-1" />

            {/* Utility buttons */}
            <button
              onClick={handleFitToModel}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Encaixar modelo"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleShowAll}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Mostrar tudo"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={handleScreenshot}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Captura de ecrã (PNG)"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              onClick={handleToggleOrtho}
              className={`p-1.5 rounded transition-colors ${isOrtho ? "bg-accent text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
              title={isOrtho ? "Vista perspetiva" : "Vista ortográfica"}
            >
              <Box className="w-4 h-4" />
            </button>

            <button
              onClick={handleToggleMeasure}
              className={`p-1.5 rounded transition-colors ${isMeasuring ? "bg-accent text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
              title={isMeasuring ? "Sair da medição" : "Medir distância"}
            >
              <Ruler className="w-4 h-4" />
            </button>

            {/* Model count & names */}
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <span className="text-xs text-gray-400 truncate max-w-[200px]" title={loadedModels.map((m) => m.name).join("\n")}>
              {loadedModels.length === 1
                ? loadedModels[0].name
                : `${loadedModels.length} modelos`}
            </span>
          </>
        )}

        {/* Selected element indicator */}
        {selectedElement != null && (
          <span className="ml-auto text-xs text-accent font-mono">
            #{selectedElement}
          </span>
        )}
      </div>}

      {/* 3D viewport */}
      <div
        ref={containerRef}
        className="flex-1 min-h-[250px] sm:min-h-[350px] md:min-h-[400px]"
        style={{ touchAction: "none" }}
      />

      {/* ── Panels ─────────────────────────────────────────────── */}

      {/* Model Manager Panel */}
      {activePanel === "models" && !isExternalControl && (
        <ModelManagerPanel
          models={loadedModels}
          visibility={modelVisibility}
          onToggleVisibility={handleToggleModelVisibility}
          onRemoveModel={handleRemoveModel}
          onFitAll={handleFitToModel}
        />
      )}

      {/* Clipper Panel */}
      {activePanel === "clipper" && clipperRef.current && worldRef.current && (
        <ClipperPanel
          clipper={clipperRef.current}
          world={worldRef.current}
          models={loadedModels}
        />
      )}

      {/* Properties Panel */}
      {activePanel === "properties" && (
        <PropertiesPanel
          element={selectedElementData}
          onFlyTo={handleFlyToElement}
          onClose={() => setActivePanel(null)}
        />
      )}

      {/* Category Filter Panel */}
      {activePanel === "categories" && !isExternalControl && (
        <CategoryFilterPanel
          categories={categoryTree}
          onToggleCategory={handleToggleCategory}
          onIsolateCategory={handleIsolateCategory}
          onShowAll={handleShowAll}
        />
      )}

      {/* ── Overlays ───────────────────────────────────────────── */}

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

      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent rounded-lg pointer-events-none">
          <div className="text-center">
            <Upload className="w-12 h-12 mx-auto mb-3 text-accent" />
            <p className="text-sm font-semibold text-accent">Largar ficheiro IFC aqui</p>
          </div>
        </div>
      )}

      {/* Loading overlay with progress */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 mt-10">
          <div className="text-center max-w-xs">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600 font-medium">
              {loadingProgress ?? "A carregar modelo..."}
            </p>
          </div>
        </div>
      )}

      {/* Measurement info bar */}
      {isMeasuring && (
        <div className="absolute top-12 left-3 z-20">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <Ruler className="w-3 h-3 text-accent" />
              <span className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">
                Medição
              </span>
              {measurements.length > 0 && (
                <button
                  onClick={handleClearMeasurements}
                  className="text-[10px] text-gray-400 hover:text-red-500 transition-colors ml-auto"
                >
                  Limpar
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-500">
              {measureStartRef.current ? "Clique no segundo ponto" : "Clique no primeiro ponto"}
            </p>
            {measurements.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {measurements.map((m) => (
                  <div key={m.id} className="text-xs text-gray-700 font-mono">
                    {m.distance}
                  </div>
                ))}
              </div>
            )}
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
    </div>
  );
});

export default IfcViewer;

// ============================================================
// Sub-components
// ============================================================

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, label, badge, active, onClick }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center gap-1 px-2 py-2 md:py-1.5 rounded text-xs transition-colors min-h-[44px] md:min-h-0 ${
        active
          ? "bg-accent text-white"
          : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
      }`}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge && (
        <span className={`text-[9px] font-medium px-1 rounded-full ${
          active ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ============================================================
// Helpers
// ============================================================

/** Extract a string value from an IFC item data object */
function extractStringValue(item: Record<string, unknown> | undefined, key: string): string | null {
  if (!item) return null;
  const val = item[key];
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null && "value" in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).value);
  }
  return null;
}
