"use client";

import { useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import { Trash2, FlipHorizontal, MousePointerClick, Eye, EyeOff } from "lucide-react";
import type { Clipper, SimplePlane } from "@thatopen/components";
import type { LoadedModelInfo } from "./ModelManagerPanel";

// ============================================================
// Types
// ============================================================

interface ClipperPanelProps {
  clipper: Clipper;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  world: any;
  models: LoadedModelInfo[];
  onPlaneCreated?: () => void;
}

interface PlaneInfo {
  id: string;
  label: string;
  plane: SimplePlane;
}

// ============================================================
// Preset definitions
// ============================================================

const PRESETS = [
  { label: "+X", normal: new THREE.Vector3(1, 0, 0), side: "max" as const, axis: "x" as const },
  { label: "-X", normal: new THREE.Vector3(-1, 0, 0), side: "min" as const, axis: "x" as const },
  { label: "+Y", normal: new THREE.Vector3(0, 1, 0), side: "max" as const, axis: "y" as const },
  { label: "-Y", normal: new THREE.Vector3(0, -1, 0), side: "min" as const, axis: "y" as const },
  { label: "+Z", normal: new THREE.Vector3(0, 0, 1), side: "max" as const, axis: "z" as const },
  { label: "-Z", normal: new THREE.Vector3(0, 0, -1), side: "min" as const, axis: "z" as const },
] as const;

// ============================================================
// Component
// ============================================================

export default function ClipperPanel({
  clipper,
  world,
  models,
  onPlaneCreated,
}: ClipperPanelProps) {
  const [planes, setPlanes] = useState<PlaneInfo[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Refresh plane list from clipper
  const refreshPlanes = useCallback(() => {
    const items: PlaneInfo[] = [];
    let idx = 0;
    for (const [id, plane] of clipper.list) {
      const n = plane.normal;
      let label = `Plano ${idx + 1}`;
      if (Math.abs(n.x) > 0.9) label = n.x > 0 ? "Plano X+" : "Plano X-";
      else if (Math.abs(n.y) > 0.9) label = n.y > 0 ? "Plano Y+" : "Plano Y-";
      else if (Math.abs(n.z) > 0.9) label = n.z > 0 ? "Plano Z+" : "Plano Z-";
      items.push({ id, label, plane });
      idx++;
    }
    setPlanes(items);
  }, [clipper]);

  // Subscribe to clipper events
  useEffect(() => {
    const onCreated = () => {
      refreshPlanes();
      onPlaneCreated?.();
    };
    const onDeleted = () => refreshPlanes();

    clipper.onAfterCreate.add(onCreated);
    clipper.onAfterDelete.add(onDeleted);

    // Initial sync
    refreshPlanes();

    return () => {
      clipper.onAfterCreate.remove(onCreated);
      clipper.onAfterDelete.remove(onDeleted);
    };
  }, [clipper, refreshPlanes, onPlaneCreated]);

  // Calculate combined bounding box of all models
  function getModelsBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const m of models) {
      const modelBox = m.model.box;
      if (!modelBox.isEmpty()) box.union(modelBox);
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10));
    }
    return box;
  }

  // Create a preset clipping plane
  function handlePreset(presetIdx: number) {
    const preset = PRESETS[presetIdx];
    const box = getModelsBoundingBox();
    const center = box.getCenter(new THREE.Vector3());

    const point = new THREE.Vector3(center.x, center.y, center.z);
    if (preset.side === "max") {
      point[preset.axis] = box.max[preset.axis];
    } else {
      point[preset.axis] = box.min[preset.axis];
    }

    clipper.createFromNormalAndCoplanarPoint(
      world,
      preset.normal.clone(),
      point,
    );
  }

  // Toggle interactive creation mode
  function handleInteractiveCreate() {
    if (isCreating) {
      clipper.enabled = false;
      setIsCreating(false);
    } else {
      clipper.enabled = true;
      setIsCreating(true);
    }
  }

  // Flip a plane's normal
  function handleFlip(info: PlaneInfo) {
    const negNormal = info.plane.normal.clone().negate();
    info.plane.setFromNormalAndCoplanarPoint(negNormal, info.plane.origin);
    refreshPlanes();
  }

  // Toggle plane visibility
  function handleToggleVisibility(info: PlaneInfo) {
    info.plane.visible = !info.plane.visible;
    refreshPlanes();
  }

  // Delete a specific plane
  async function handleDelete(info: PlaneInfo) {
    await clipper.delete(world, info.id);
  }

  // Delete all planes
  function handleDeleteAll() {
    clipper.deleteAll();
    refreshPlanes();
    if (isCreating) {
      clipper.enabled = false;
      setIsCreating(false);
    }
  }

  return (
    <div className="absolute top-12 right-3 bg-white rounded-lg shadow-lg border border-gray-200 w-64 z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Planos de Corte
        </p>
        {planes.length > 0 && (
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {planes.length}
          </span>
        )}
      </div>

      {/* Preset buttons */}
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Presets</p>
        <div className="grid grid-cols-6 gap-1">
          {PRESETS.map((preset, idx) => (
            <button
              key={preset.label}
              onClick={() => handlePreset(idx)}
              className="px-1.5 py-1 text-[10px] font-mono font-medium bg-gray-100 hover:bg-accent hover:text-white rounded transition-colors text-gray-600"
              title={`Criar plano ${preset.label}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive creation */}
      <div className="px-3 py-2 border-b border-gray-100">
        <button
          onClick={handleInteractiveCreate}
          className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs transition-colors ${
            isCreating
              ? "bg-accent text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <MousePointerClick className="w-3.5 h-3.5" />
          {isCreating ? "A criar... (clique no modelo)" : "Criar interativo"}
        </button>
      </div>

      {/* Active planes list */}
      <div className="max-h-36 overflow-y-auto p-2 space-y-1">
        {planes.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-2 py-2 text-center">
            Sem planos ativos
          </p>
        ) : (
          planes.map((info) => (
            <div
              key={info.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50 transition-colors group"
            >
              {/* Label */}
              <span className="flex-1 text-xs text-gray-600 truncate">
                {info.label}
              </span>

              {/* Toggle visibility */}
              <button
                onClick={() => handleToggleVisibility(info)}
                className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
                title={info.plane.visible ? "Ocultar plano" : "Mostrar plano"}
              >
                {info.plane.visible ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3" />
                )}
              </button>

              {/* Flip */}
              <button
                onClick={() => handleFlip(info)}
                className="p-0.5 rounded text-gray-400 hover:text-accent transition-colors"
                title="Inverter plano"
              >
                <FlipHorizontal className="w-3 h-3" />
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(info)}
                className="p-0.5 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                title="Remover plano"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {planes.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100">
          <button
            onClick={handleDeleteAll}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Remover todos
          </button>
        </div>
      )}
    </div>
  );
}
