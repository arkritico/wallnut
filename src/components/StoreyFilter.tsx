"use client";

import { useMemo } from "react";
import { normalizeStorey } from "@/lib/element-task-mapper";

export interface StoreyFilterProps {
  storeys: string[];
  selected: string | null;
  onSelect: (storey: string | null) => void;
}

/** Sort storeys by their numeric level (P-2 < P-1 < P0 < P1 < PCOB). */
function storeySortKey(s: string): number {
  const norm = normalizeStorey(s);
  if (norm === "PCOB") return 9999;
  const m = norm.match(/^P(-?\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

export default function StoreyFilter({
  storeys,
  selected,
  onSelect,
}: StoreyFilterProps) {
  const sorted = useMemo(
    () => [...storeys].sort((a, b) => storeySortKey(a) - storeySortKey(b)),
    [storeys],
  );

  if (sorted.length === 0) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-gray-200 overflow-x-auto max-w-[90%]">
      <button
        onClick={() => onSelect(null)}
        className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors ${
          selected === null
            ? "bg-accent text-white"
            : "text-gray-500 hover:bg-gray-100"
        }`}
      >
        Todos
      </button>
      {sorted.map((storey) => (
        <button
          key={storey}
          onClick={() => onSelect(selected === storey ? null : storey)}
          className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors ${
            selected === storey
              ? "bg-accent text-white"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          {normalizeStorey(storey)}
        </button>
      ))}
    </div>
  );
}
