"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import {
  Search, X, Maximize2, ChevronDown, ChevronRight,
  Home, Building2, Hammer, Layers, Tag,
} from "lucide-react";
import type {
  RegulationGraphData, GraphNode, GraphLink,
} from "@/lib/regulation-graph";
import { BUILDING_TYPE_LABELS } from "@/lib/regulation-graph";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-3d";

// ============================================================
// Types
// ============================================================

type FGNode = NodeObject<GraphNode>;
type FGRef = ForceGraphMethods<GraphNode, GraphLink>;

type SeverityFilter = "all" | "critical" | "warning" | "info" | "pass";

interface RegulationGraphProps {
  className?: string;
}

/** Breadcrumb path for tree navigation */
interface BrowsePath {
  buildingType: string | null;   // null = all types
  projectScope: "new" | "rehab" | null; // null = all
  specialty: string | null;      // plugin ID
  subTopic: string | null;       // tag-derived sub-topic
  regulationId: string | null;   // filter to specific regulation (from 3D click)
}

// ============================================================
// Constants
// ============================================================

const SEVERITY_LABELS: Record<string, string> = {
  all: "Todas",
  critical: "Cr\u00edtico",
  warning: "Aviso",
  info: "Info",
  pass: "OK",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  pass: "#22c55e",
};

const PROJECT_SCOPE_LABELS: Record<string, string> = {
  new: "Constru\u00e7\u00e3o nova",
  rehab: "Reabilita\u00e7\u00e3o",
};

// ============================================================
// Component
// ============================================================

export default function RegulationGraph({ className = "" }: RegulationGraphProps) {
  const fgRef = useRef<FGRef | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const [graphData, setGraphData] = useState<RegulationGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRegulations, setExpandedRegulations] = useState<Set<string>>(new Set());

  // Tree browser
  const [browsePath, setBrowsePath] = useState<BrowsePath>({
    buildingType: null,
    projectScope: null,
    specialty: null,
    subTopic: null,
    regulationId: null,
  });

  // ForceGraph3D loaded dynamically (no SSR)
  const [ForceGraph, setForceGraph] = useState<React.ComponentType<any> | null>(null);

  // Dimensions
  const [dims, setDims] = useState({ width: 800, height: 600 });

  // ── Load ForceGraph3D dynamically ─────────────────────────
  useEffect(() => {
    import("react-force-graph-3d").then(mod => {
      setForceGraph(() => mod.default);
    });
  }, []);

  // ── Fetch graph data ──────────────────────────────────────
  useEffect(() => {
    fetch("/api/regulation-graph")
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: RegulationGraphData) => {
        setGraphData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // ── Resize observer ───────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setDims({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    setDims({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  // ── Rule matching logic for tree browsing ─────────────────
  const ruleMatchesBrowse = useCallback((node: GraphNode, path: BrowsePath): boolean => {
    if (node.type !== "rule") return false;

    // Building type filter: rule matches if universal (no types) or includes the selected type
    if (path.buildingType) {
      if (node.applicableTypes && node.applicableTypes.length > 0) {
        if (!node.applicableTypes.includes(path.buildingType)) return false;
      }
      // Universal rules (empty applicableTypes) always match
    }

    // Project scope filter
    if (path.projectScope) {
      if (node.projectScope !== "all" && node.projectScope !== path.projectScope) return false;
    }

    // Specialty filter
    if (path.specialty && node.specialtyId !== path.specialty) return false;

    // Sub-topic filter
    if (path.subTopic && node.subTopic !== path.subTopic) return false;

    // Regulation filter (from 3D click)
    if (path.regulationId && node.regulationId !== path.regulationId) return false;

    return true;
  }, []);

  // ── Compute filtered rules for tree counts ────────────────
  const allRules = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter(n => n.type === "rule");
  }, [graphData]);

  const filteredRules = useMemo(() => {
    return allRules.filter(r => ruleMatchesBrowse(r, browsePath));
  }, [allRules, browsePath, ruleMatchesBrowse]);

  // ── Tree level data ───────────────────────────────────────

  // Building type options with counts
  const buildingTypeOptions = useMemo(() => {
    if (!graphData) return [];
    const counts = new Map<string, number>();
    for (const rule of allRules) {
      if (rule.applicableTypes && rule.applicableTypes.length > 0) {
        for (const t of rule.applicableTypes) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        value: type,
        label: BUILDING_TYPE_LABELS[type] || type,
        count,
      }));
  }, [allRules, graphData]);

  // Specialty options with counts (filtered by building type + project scope)
  const specialtyOptions = useMemo(() => {
    const partialPath = { ...browsePath, specialty: null, subTopic: null };
    const matching = allRules.filter(r => ruleMatchesBrowse(r, partialPath));
    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    const colors = new Map<string, string>();
    for (const rule of matching) {
      counts.set(rule.specialtyId, (counts.get(rule.specialtyId) ?? 0) + 1);
      if (!labels.has(rule.specialtyId)) {
        const spec = graphData?.nodes.find(n => n.type === "specialty" && n.specialtyId === rule.specialtyId);
        if (spec) {
          labels.set(rule.specialtyId, spec.label);
          colors.set(rule.specialtyId, spec.color);
        }
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({
        value: id,
        label: labels.get(id) ?? id,
        color: colors.get(id) ?? "#6b7280",
        count,
      }));
  }, [allRules, browsePath, graphData, ruleMatchesBrowse]);

  // Sub-topic options with counts (filtered by building type + project scope + specialty)
  const subTopicOptions = useMemo(() => {
    const partialPath = { ...browsePath, subTopic: null };
    const matching = allRules.filter(r => ruleMatchesBrowse(r, partialPath));
    const counts = new Map<string, number>();
    for (const rule of matching) {
      if (rule.subTopic) {
        counts.set(rule.subTopic, (counts.get(rule.subTopic) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({
        value: topic,
        label: topic,
        count,
      }));
  }, [allRules, browsePath, ruleMatchesBrowse]);

  // ── Compute visible graph data ────────────────────────────
  const visibleData = useMemo(() => {
    if (!graphData) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

    const searchLower = searchQuery.toLowerCase();

    const visibleNodes = graphData.nodes.filter(node => {
      // Specialty filter from tree browser
      if (browsePath.specialty && node.specialtyId !== browsePath.specialty) return false;

      if (node.type === "specialty") return true;
      if (node.type === "regulation") return true;

      // Rules: must pass tree browser filters + expansion + severity + search
      if (node.type === "rule") {
        if (!expandedRegulations.has(node.regulationId!)) return false;
        if (!ruleMatchesBrowse(node, browsePath)) return false;
        if (severityFilter !== "all" && node.severity !== severityFilter) return false;
        if (searchLower) {
          return (
            node.label.toLowerCase().includes(searchLower) ||
            node.description?.toLowerCase().includes(searchLower) ||
            node.article?.toLowerCase().includes(searchLower) ||
            node.tags?.some(t => t.toLowerCase().includes(searchLower)) ||
            false
          );
        }
        return true;
      }
      return false;
    });

    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleLinks = graphData.links.filter(l => {
      const srcId = typeof l.source === "string" ? l.source : (l.source as any)?.id;
      const tgtId = typeof l.target === "string" ? l.target : (l.target as any)?.id;
      return visibleIds.has(srcId) && visibleIds.has(tgtId);
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, expandedRegulations, severityFilter, browsePath, searchQuery, ruleMatchesBrowse]);

  // ── Custom node rendering ─────────────────────────────────
  const nodeThreeObject = useCallback((node: FGNode) => {
    const n = node as unknown as GraphNode;
    const size = n.type === "specialty" ? 8 : n.type === "regulation" ? 4 : 1.5;
    const segments = n.type === "specialty" ? 24 : n.type === "regulation" ? 16 : 8;
    const color = n.color;

    const group = new THREE.Group();

    const geo = new THREE.SphereGeometry(size, segments, segments);
    const mat = new THREE.MeshPhongMaterial({
      color,
      transparent: n.type === "rule",
      opacity: n.type === "rule" ? 0.75 : 1,
      emissive: new THREE.Color(color),
      emissiveIntensity: n.type === "specialty" ? 0.3 : 0.1,
    });
    group.add(new THREE.Mesh(geo, mat));

    if (n.type !== "rule") {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = 512;
      canvas.height = 128;
      ctx.clearRect(0, 0, 512, 128);
      ctx.font = n.type === "specialty" ? "bold 36px system-ui, sans-serif" : "28px system-ui, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = n.label.length > 30 ? n.label.slice(0, 28) + "..." : n.label;
      ctx.fillText(text, 256, 64);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      const scale = n.type === "specialty" ? 40 : 25;
      sprite.scale.set(scale, scale / 4, 1);
      sprite.position.set(0, size + 6, 0);
      group.add(sprite);
    }

    return group;
  }, []);

  // ── Node label for hover tooltip ──────────────────────────
  const nodeLabel = useCallback((node: FGNode) => {
    const n = node as unknown as GraphNode;
    if (n.type === "specialty") {
      return `<div style="background:#1e1e2e;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;max-width:280px">
        <b>${n.label}</b><br/><span style="color:#94a3b8">${n.rulesCount} regras</span></div>`;
    }
    if (n.type === "regulation") {
      return `<div style="background:#1e1e2e;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;max-width:280px">
        <b>${n.shortRef || n.label}</b><br/><span style="color:#94a3b8">${n.rulesCount} regras</span><br/>
        <span style="color:#64748b;font-size:11px">Clique para expandir/colapsar</span></div>`;
    }
    return `<div style="background:#1e1e2e;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;max-width:320px">
      <b style="color:${SEVERITY_COLORS[n.severity!] || '#fff'}">${n.label}</b><br/>
      <span style="color:#cbd5e1">${n.article || ""}</span><br/>
      <span style="color:#94a3b8;font-size:12px">${(n.description || "").slice(0, 120)}${(n.description || "").length > 120 ? "..." : ""}</span></div>`;
  }, []);

  // ── Click handler ─────────────────────────────────────────
  const handleNodeClick = useCallback((node: FGNode) => {
    const n = node as unknown as GraphNode;

    if (n.type === "regulation") {
      // Always expand the regulation's rules in the 3D graph
      setExpandedRegulations(prev => {
        const next = new Set(prev);
        next.add(n.regulationId!);
        return next;
      });
      // Navigate sidebar to show this regulation's rules
      setBrowsePath({
        buildingType: null,
        projectScope: null,
        specialty: n.specialtyId,
        subTopic: null,
        regulationId: n.regulationId!,
      });
    }

    if (n.type === "specialty") {
      // Navigate sidebar to this specialty's rules
      setBrowsePath({
        buildingType: null,
        projectScope: null,
        specialty: n.specialtyId,
        subTopic: null,
        regulationId: null,
      });
      // Expand all regulations for this specialty
      if (graphData) {
        const regIds = graphData.nodes
          .filter(nd => nd.type === "regulation" && nd.specialtyId === n.specialtyId)
          .map(nd => nd.regulationId!)
          .filter(Boolean);
        setExpandedRegulations(prev => {
          const next = new Set(prev);
          regIds.forEach(id => next.add(id));
          return next;
        });
      }
    }

    if (n.type === "rule") {
      // Navigate to this rule's specialty + regulation context
      setBrowsePath({
        buildingType: null,
        projectScope: null,
        specialty: n.specialtyId,
        subTopic: null,
        regulationId: n.regulationId!,
      });
    }

    setSelectedNode(n);

    if (fgRef.current && node.x != null && node.y != null && node.z != null) {
      const distance = n.type === "specialty" ? 200 : n.type === "regulation" ? 120 : 60;
      fgRef.current.cameraPosition(
        { x: node.x, y: node.y, z: node.z! + distance },
        { x: node.x, y: node.y, z: node.z! },
        800,
      );
    }
  }, [graphData]);

  const linkColor = useCallback((link: GraphLink) => link.type === "cross-specialty" ? "#ff6b6b" : "#2a2a3a", []);
  const linkWidth = useCallback((link: GraphLink) => link.type === "cross-specialty" ? 2 : 0.3, []);
  const handleZoomToFit = useCallback(() => { fgRef.current?.zoomToFit(600, 40); }, []);

  // ── Initial zoom ──────────────────────────────────────────
  useEffect(() => {
    if (!fgRef.current || !visibleData.nodes.length) return;
    const timer = setTimeout(() => { fgRef.current?.zoomToFit(800, 60); }, 1500);
    return () => clearTimeout(timer);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Specialties for graph sidebar ─────────────────────────
  const specialties = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter(n => n.type === "specialty").sort((a, b) => (b.rulesCount ?? 0) - (a.rulesCount ?? 0));
  }, [graphData]);

  // ── Breadcrumb segments ───────────────────────────────────
  const breadcrumbs = useMemo(() => {
    const crumbs: Array<{ label: string; onClick: () => void }> = [];
    crumbs.push({
      label: "Todos",
      onClick: () => setBrowsePath({ buildingType: null, projectScope: null, specialty: null, subTopic: null, regulationId: null }),
    });
    if (browsePath.buildingType) {
      crumbs.push({
        label: BUILDING_TYPE_LABELS[browsePath.buildingType] || browsePath.buildingType,
        onClick: () => setBrowsePath(prev => ({ ...prev, projectScope: null, specialty: null, subTopic: null, regulationId: null })),
      });
    }
    if (browsePath.projectScope) {
      crumbs.push({
        label: PROJECT_SCOPE_LABELS[browsePath.projectScope],
        onClick: () => setBrowsePath(prev => ({ ...prev, specialty: null, subTopic: null, regulationId: null })),
      });
    }
    if (browsePath.specialty) {
      const spec = specialties.find(s => s.specialtyId === browsePath.specialty);
      crumbs.push({
        label: spec?.label ?? browsePath.specialty,
        onClick: () => setBrowsePath(prev => ({ ...prev, subTopic: null, regulationId: null })),
      });
    }
    if (browsePath.regulationId) {
      const regNode = graphData?.nodes.find(n => n.type === "regulation" && n.regulationId === browsePath.regulationId && n.specialtyId === browsePath.specialty);
      crumbs.push({
        label: regNode?.shortRef || regNode?.label || browsePath.regulationId,
        onClick: () => {},
      });
    }
    if (browsePath.subTopic) {
      crumbs.push({
        label: browsePath.subTopic,
        onClick: () => {},
      });
    }
    return crumbs;
  }, [browsePath, specialties, graphData]);

  // ── Determine current tree level ──────────────────────────
  // When a regulation is selected (from 3D click), jump straight to rules
  const currentLevel = browsePath.regulationId ? "rules"
    : !browsePath.buildingType ? "buildingType"
    : !browsePath.projectScope ? "projectScope"
    : !browsePath.specialty ? "specialty"
    : !browsePath.subTopic ? "subTopic"
    : "rules";

  // ── Render ────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <p className="text-red-400">Erro ao carregar grafo: {error}</p>
      </div>
    );
  }

  return (
    <div className={`relative flex ${className}`} style={{ minHeight: 600 }}>
      {/* ── Sidebar ──────────────────────────────────────── */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col text-gray-200 shrink-0">
        {/* Breadcrumb */}
        <div className="px-4 pt-4 pb-2 border-b border-gray-800">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 text-gray-600" />}
                <button
                  onClick={crumb.onClick}
                  className={`hover:text-blue-400 transition-colors ${
                    i === breadcrumbs.length - 1 ? "text-white font-medium" : "text-gray-500"
                  }`}
                >
                  {i === 0 ? <Home className="w-3.5 h-3.5" /> : crumb.label}
                </button>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5">
            {filteredRules.length} regras correspondem
          </p>
        </div>

        {/* Tree level content */}
        <div className="flex-1 overflow-y-auto">
          {/* Level 1: Building Type */}
          {currentLevel === "buildingType" && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-gray-500" />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo de Edif\u00edcio</label>
              </div>
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, buildingType: "_all", regulationId: null }))}
                className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 bg-gray-800/50 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <span>Todos os tipos</span>
                <span className="text-xs text-gray-500">{allRules.length}</span>
              </button>
              {buildingTypeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBrowsePath(prev => ({ ...prev, buildingType: opt.value, regulationId: null }))}
                  className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
                >
                  <span>{opt.label}</span>
                  <span className="text-xs text-gray-500">{opt.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Level 2: Project Scope */}
          {currentLevel === "projectScope" && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Hammer className="w-4 h-4 text-gray-500" />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">\u00c2mbito do Projeto</label>
              </div>
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, projectScope: null, specialty: null, subTopic: null, regulationId: null }))}
                className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 bg-gray-800/50 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <span>Todos (novo + reabilita\u00e7\u00e3o)</span>
                <span className="text-xs text-gray-500">{filteredRules.length}</span>
              </button>
              {(["new", "rehab"] as const).map(scope => {
                const count = allRules.filter(r => ruleMatchesBrowse(r, { ...browsePath, projectScope: scope, specialty: null, subTopic: null })).length;
                return (
                  <button
                    key={scope}
                    onClick={() => setBrowsePath(prev => ({ ...prev, projectScope: scope, regulationId: null }))}
                    className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
                  >
                    <span>{PROJECT_SCOPE_LABELS[scope]}</span>
                    <span className="text-xs text-gray-500">{count}</span>
                  </button>
                );
              })}
              {/* Skip button */}
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, projectScope: null, regulationId: null }))}
                className="w-full text-left px-3 py-1.5 text-xs rounded-lg mt-2 text-gray-600 hover:text-gray-400 transition-colors"
              >
                Saltar \u2192 escolher especialidade
              </button>
            </div>
          )}

          {/* Level 3: Specialty */}
          {currentLevel === "specialty" && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-gray-500" />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Especialidade</label>
              </div>
              {specialtyOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBrowsePath(prev => ({ ...prev, specialty: opt.value, regulationId: null }))}
                  className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                    <span>{opt.label}</span>
                  </div>
                  <span className="text-xs text-gray-500">{opt.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Level 4: Sub-topic */}
          {currentLevel === "subTopic" && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-gray-500" />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sub-tema</label>
              </div>
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, subTopic: "_all", regulationId: null }))}
                className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 bg-gray-800/50 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <span>Todos os temas</span>
                <span className="text-xs text-gray-500">{filteredRules.length}</span>
              </button>
              {subTopicOptions.slice(0, 30).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBrowsePath(prev => ({ ...prev, subTopic: opt.value, regulationId: null }))}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg mb-0.5 text-gray-400 hover:bg-gray-800 transition-colors flex items-center justify-between"
                >
                  <span className="truncate">{opt.label}</span>
                  <span className="text-xs text-gray-500 shrink-0 ml-2">{opt.count}</span>
                </button>
              ))}
              {subTopicOptions.length > 30 && (
                <p className="text-xs text-gray-600 px-3 mt-1">+{subTopicOptions.length - 30} mais...</p>
              )}
            </div>
          )}

          {/* Level 5: Rule list */}
          {currentLevel === "rules" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Regras ({filteredRules.length})
                </label>
                {/* Severity filter pills */}
                <div className="flex gap-1">
                  {(["all", "critical", "warning", "info"] as const).map(sev => (
                    <button
                      key={sev}
                      onClick={() => setSeverityFilter(sev)}
                      className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                        severityFilter === sev ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      {SEVERITY_LABELS[sev]}
                    </button>
                  ))}
                </div>
              </div>
              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Filtrar regras..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              {/* Rule cards */}
              <div className="flex flex-col gap-1">
                {filteredRules
                  .filter(r => {
                    if (severityFilter !== "all" && r.severity !== severityFilter) return false;
                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      return (
                        r.label.toLowerCase().includes(q) ||
                        r.description?.toLowerCase().includes(q) ||
                        r.article?.toLowerCase().includes(q) ||
                        r.tags?.some(t => t.toLowerCase().includes(q)) ||
                        false
                      );
                    }
                    return true;
                  })
                  .slice(0, 100)
                  .map(rule => (
                    <button
                      key={rule.id}
                      onClick={() => setSelectedNode(rule)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        selectedNode?.id === rule.id ? "bg-blue-600/20 border border-blue-500/30" : "hover:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: SEVERITY_COLORS[rule.severity!] }}
                        />
                        <span className="text-xs font-mono text-gray-300 truncate">{rule.label}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate pl-3.5">
                        {rule.article || rule.description?.slice(0, 60)}
                      </p>
                    </button>
                  ))}
                {filteredRules.length > 100 && (
                  <p className="text-xs text-gray-600 text-center mt-2">
                    A mostrar 100 de {filteredRules.length} regras
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stats footer */}
        {graphData && (
          <div className="p-3 border-t border-gray-800">
            <div className="grid grid-cols-2 gap-y-1 text-[11px]">
              <span className="text-gray-500">Especialidades</span>
              <span className="text-right font-medium text-gray-400">{graphData.stats.totalSpecialties}</span>
              <span className="text-gray-500">Regulamentos</span>
              <span className="text-right font-medium text-gray-400">{graphData.stats.totalRegulations}</span>
              <span className="text-gray-500">Regras total</span>
              <span className="text-right font-medium text-gray-400">{graphData.stats.totalRules}</span>
              <span className="text-gray-500">Filtradas</span>
              <span className="text-right font-medium text-blue-400">{filteredRules.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 3D Viewport ──────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 relative bg-[#0a0a0f]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 z-10">
            <div className="text-center text-white">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">A carregar grafo de regulamentos...</p>
            </div>
          </div>
        )}

        {ForceGraph && graphData && (
          <ForceGraph
            ref={fgRef}
            graphData={visibleData}
            width={dims.width}
            height={dims.height}
            backgroundColor="#0a0a0f"
            nodeThreeObject={nodeThreeObject}
            nodeLabel={nodeLabel}
            onNodeClick={handleNodeClick}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkOpacity={0.4}
            linkDirectionalParticles={(link: GraphLink) => link.type === "cross-specialty" ? 2 : 0}
            linkDirectionalParticleSpeed={0.003}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleColor={() => "#ff6b6b"}
            warmupTicks={50}
            cooldownTime={3000}
            showNavInfo={false}
          />
        )}

        {/* Toolbar */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
          <button
            onClick={handleZoomToFit}
            className="p-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 rounded-lg backdrop-blur-sm transition-colors"
            title="Ajustar zoom"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 z-10">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Legenda</p>
          <div className="flex flex-col gap-1.5 text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
              Especialidade
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" />
              Regulamento (clique p/ expandir)
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: SEVERITY_COLORS.critical }} />
              Cr\u00edtico
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: SEVERITY_COLORS.warning }} />
              Aviso
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: SEVERITY_COLORS.info }} />
              Info
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-4 h-0.5 bg-red-400 inline-block" />
              Liga\u00e7\u00e3o cruzada
            </div>
          </div>
        </div>

        {/* Selected node detail panel */}
        {selectedNode && (
          <div className="absolute top-4 left-4 w-96 bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700 z-20 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm flex items-start justify-between p-4 pb-2 border-b border-gray-800">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedNode.color }} />
                <h3 className="font-semibold text-white text-sm truncate">
                  {selectedNode.type === "regulation" ? selectedNode.shortRef : selectedNode.label}
                </h3>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-gray-500 hover:text-gray-300 shrink-0 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-4 pt-3 text-sm">
              {selectedNode.type === "specialty" && (
                <>
                  <p className="text-gray-400 text-xs mb-2">Especialidade</p>
                  <p className="text-gray-300 mb-1">{selectedNode.label}</p>
                  <p className="text-gray-500 text-xs">{selectedNode.rulesCount} regras</p>
                </>
              )}
              {selectedNode.type === "regulation" && (
                <>
                  <p className="text-gray-400 text-xs mb-2">Regulamento</p>
                  <p className="text-gray-300 mb-1">{selectedNode.label}</p>
                  {selectedNode.legalForce && <p className="text-gray-500 text-xs mb-1">Forca legal: {selectedNode.legalForce}</p>}
                  <p className="text-gray-500 text-xs mb-2">{selectedNode.rulesCount} regras</p>
                  <p className="text-[10px] text-blue-400">Regras visiveis na barra lateral</p>
                </>
              )}
              {selectedNode.type === "rule" && (
                <>
                  {/* Header: severity + article */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        backgroundColor: SEVERITY_COLORS[selectedNode.severity!] + "22",
                        color: SEVERITY_COLORS[selectedNode.severity!],
                      }}
                    >
                      {selectedNode.severity}
                    </span>
                    {selectedNode.article && (
                      <span className="text-gray-400 text-xs font-medium">{selectedNode.article}</span>
                    )}
                  </div>

                  {/* Description */}
                  {selectedNode.description && (
                    <p className="text-gray-300 text-xs leading-relaxed mb-3">{selectedNode.description}</p>
                  )}

                  {/* Scope badges */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {selectedNode.applicableTypes && selectedNode.applicableTypes.length > 0 ? (
                      selectedNode.applicableTypes.map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded text-[10px]">
                          {BUILDING_TYPE_LABELS[t] || t}
                        </span>
                      ))
                    ) : (
                      <span className="px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded text-[10px]">Universal</span>
                    )}
                    {selectedNode.projectScope !== "all" && (
                      <span className="px-1.5 py-0.5 bg-purple-900/30 text-purple-400 rounded text-[10px]">
                        {selectedNode.projectScope === "new" ? "Construcao nova" : "Reabilitacao"}
                      </span>
                    )}
                  </div>

                  {/* Conditions — the actual rule logic */}
                  {selectedNode.conditions && selectedNode.conditions.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Condicoes ({selectedNode.conditions.length})
                      </p>
                      <div className="bg-gray-800/60 rounded-lg p-2 flex flex-col gap-1.5">
                        {selectedNode.conditions.map((cond, i) => (
                          <div key={i} className="text-[11px] font-mono leading-snug">
                            <span className="text-cyan-400">{cond.field}</span>
                            {" "}
                            <span className="text-yellow-400">{cond.operator}</span>
                            {" "}
                            <span className="text-green-400">
                              {cond.formula
                                ? cond.formula
                                : typeof cond.value === "object"
                                  ? JSON.stringify(cond.value)
                                  : String(cond.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Required value */}
                  {selectedNode.requiredValue && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor requerido</p>
                      <p className="text-xs text-gray-300 bg-gray-800/40 rounded px-2 py-1">{selectedNode.requiredValue}</p>
                    </div>
                  )}

                  {/* Remediation */}
                  {selectedNode.remediation && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Remediacao</p>
                      <p className="text-xs text-emerald-400/80 bg-emerald-900/10 rounded px-2 py-1.5 leading-relaxed">
                        {selectedNode.remediation}
                      </p>
                    </div>
                  )}

                  {/* Tags */}
                  {selectedNode.tags && selectedNode.tags.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded text-[10px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
