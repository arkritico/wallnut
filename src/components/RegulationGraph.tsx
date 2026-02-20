"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import {
  Search, X, Maximize2, ChevronRight,
  Home, Building2, Layers, Tag, Eye, Link2, Activity,
} from "lucide-react";
import { getAnnotations, type RuleAnnotation, type AnnotationStatus } from "@/lib/rule-annotations";
import type {
  RegulationGraphData, GraphNode, GraphLink, RuleConditionDisplay,
} from "@/lib/regulation-graph";
import { BUILDING_TYPE_LABELS, BUILDING_TYPE_TAXONOMY } from "@/lib/regulation-graph";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-3d";
import type { PluginEvaluationResult } from "@/lib/plugins/types";
import GraphChatPanel from "./GraphChatPanel";

// ============================================================
// Types
// ============================================================

type FGNode = NodeObject<GraphNode>;
type FGRef = ForceGraphMethods<GraphNode, GraphLink>;

type SeverityFilter = "all" | "critical" | "warning" | "info" | "pass";

interface RegulationGraphProps {
  className?: string;
  evaluationResults?: PluginEvaluationResult[];
  /** When true, hides the internal sidebar (for embedding in master-detail layouts) */
  embedded?: boolean;
}

/** Breadcrumb path for tree navigation */
export interface BrowsePath {
  buildingType: string | null;   // null = all types
  buildingCategory: string | null; // taxonomy category
  phase: string | null;           // construction phase
  system: string | null;          // building system
  specialty: string | null;       // plugin ID
  subTopic: string | null;        // tag-derived sub-topic
  regulationId: string | null;    // filter to specific regulation (from 3D click)
}

type EvalStatus = "pass" | "fail" | "skipped" | "not-evaluated";

// ============================================================
// Constants
// ============================================================

const SEVERITY_LABELS: Record<string, string> = {
  all: "Todas",
  critical: "Crítico",
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

const PHASE_LABELS: Record<string, string> = {
  projeto: "Projeto",
  licenciamento: "Licenciamento",
  construcao: "Construção",
  certificacao: "Certificação",
};

const PHASE_RADIUS: Record<string, number> = {
  projeto: 100,
  licenciamento: 200,
  construcao: 300,
  certificacao: 400,
};

const PHASE_COLORS: Record<string, string> = {
  projeto: "#3b82f6",
  licenciamento: "#8b5cf6",
  construcao: "#f59e0b",
  certificacao: "#22c55e",
};

const SYSTEM_LABELS: Record<string, string> = {
  estrutura: "Estrutura",
  mep: "MEP",
  envolvente: "Envolvente",
  seguranca: "Segurança",
  administrativo: "Administrativo",
};

const EVAL_COLORS: Record<EvalStatus, string> = {
  pass: "#22c55e",
  fail: "#ef4444",
  skipped: "#6b7280",
  "not-evaluated": "transparent",
};

const DEFAULT_BROWSE: BrowsePath = {
  buildingType: null,
  buildingCategory: null,
  phase: null,
  system: null,
  specialty: null,
  subTopic: null,
  regulationId: null,
};

// ============================================================
// Component
// ============================================================

export default function RegulationGraph({ className = "", evaluationResults, embedded = false }: RegulationGraphProps) {
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
  const [browsePath, setBrowsePath] = useState<BrowsePath>({ ...DEFAULT_BROWSE });

  // Toggles
  const [showFieldDeps, setShowFieldDeps] = useState(true);
  const [showEvalOverlay, setShowEvalOverlay] = useState(false);

  // ForceGraph3D loaded dynamically (no SSR)
  const [ForceGraph, setForceGraph] = useState<React.ComponentType<any> | null>(null);

  // Dimensions
  const [dims, setDims] = useState({ width: 800, height: 600 });

  // Annotation overlay
  const [annotations, setAnnotationsState] = useState<Record<string, RuleAnnotation>>({});
  const [showAnnotations, setShowAnnotations] = useState(false);

  // Phase rings refs (added to scene)
  const phaseRingsRef = useRef<THREE.Group | null>(null);

  // ── Build evaluation status map ─────────────────────────────
  const evalStatusMap = useMemo(() => {
    const map = new Map<string, EvalStatus>();
    if (!evaluationResults) return map;

    for (const result of evaluationResults) {
      // Skipped rules
      for (const ruleId of result.rulesSkipped) {
        map.set(ruleId, "skipped");
      }
      // Fired rules (produced findings = fail)
      for (const finding of result.findings) {
        if (finding.sourceRuleId) {
          map.set(finding.sourceRuleId, "fail");
        }
      }
    }
    // Rules that were evaluated but not skipped and not fired = pass
    // We need to know which rules are active — derive from graph data later
    return map;
  }, [evaluationResults]);

  // ── Load ForceGraph3D dynamically ─────────────────────────
  useEffect(() => {
    import("react-force-graph-3d").then(mod => {
      setForceGraph(() => mod.default);
    });
  }, []);

  // ── Fetch graph data + annotations ───────────────────────
  useEffect(() => {
    setAnnotationsState(getAnnotations());
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

  // ── Auto-expand all regulations on first load ─────────────
  useEffect(() => {
    if (!graphData) return;
    setExpandedRegulations(prev => {
      if (prev.size > 0) return prev; // already expanded by user
      const allRegIds = new Set(
        graphData.nodes
          .filter(n => n.type === "regulation" && n.regulationId)
          .map(n => n.regulationId!),
      );
      return allRegIds;
    });
  }, [graphData]);

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

  // ── Apply radial layout forces ─────────────────────────────
  useEffect(() => {
    if (!fgRef.current || !graphData) return;

    const fg = fgRef.current;

    // Custom radial force: push nodes toward their phase ring radius
    fg.d3Force("radial", (alpha: number) => {
      for (const node of graphData.nodes as FGNode[]) {
        if (!node.constructionPhase) continue;
        const targetR = PHASE_RADIUS[node.constructionPhase] ?? 300;

        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const currentR = Math.sqrt(x * x + y * y) || 1;
        const strength = 0.03 * alpha;
        const dr = (targetR - currentR) * strength;

        node.vx = (node.vx ?? 0) + (x / currentR) * dr;
        node.vy = (node.vy ?? 0) + (y / currentR) * dr;
      }
    });

    // Flatten Z axis slightly (2.5D feel)
    fg.d3Force("flatten", (alpha: number) => {
      for (const node of graphData.nodes as FGNode[]) {
        node.vz = (node.vz ?? 0) - (node.z ?? 0) * 0.05 * alpha;
      }
    });

    // Reheat simulation
    fg.d3ReheatSimulation();
  }, [graphData]);

  // ── Add phase ring geometry to scene ────────────────────────
  useEffect(() => {
    if (!fgRef.current || !graphData) return;

    const fg = fgRef.current;
    const scene = fg.scene();
    if (!scene) return;

    // Remove old rings if re-rendering
    if (phaseRingsRef.current) {
      scene.remove(phaseRingsRef.current);
    }

    const group = new THREE.Group();

    for (const [phase, radius] of Object.entries(PHASE_RADIUS)) {
      // Torus ring
      const ringGeo = new THREE.TorusGeometry(radius, 0.5, 8, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: PHASE_COLORS[phase] ?? "#666",
        transparent: true,
        opacity: 0.15,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2; // Flat on XY plane
      group.add(ring);

      // Phase label as sprite
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = 512;
      canvas.height = 64;
      ctx.clearRect(0, 0, 512, 64);
      ctx.font = "bold 32px system-ui, sans-serif";
      ctx.fillStyle = PHASE_COLORS[phase] ?? "#888";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(PHASE_LABELS[phase]?.toUpperCase() ?? phase, 256, 32);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.6, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(60, 8, 1);
      sprite.position.set(0, radius + 15, 0);
      group.add(sprite);
    }

    scene.add(group);
    phaseRingsRef.current = group;

    return () => {
      if (phaseRingsRef.current && scene) {
        scene.remove(phaseRingsRef.current);
      }
    };
  }, [graphData, loading]);

  // ── Rule matching logic for tree browsing ─────────────────
  const ruleMatchesBrowse = useCallback((node: GraphNode, path: BrowsePath): boolean => {
    if (node.type !== "rule") return false;

    // Building type filter
    if (path.buildingType) {
      if (node.applicableTypes && node.applicableTypes.length > 0) {
        if (!node.applicableTypes.includes(path.buildingType)) return false;
      }
    }

    // Building category filter
    if (path.buildingCategory && path.buildingCategory !== "_all") {
      const cat = BUILDING_TYPE_TAXONOMY[path.buildingCategory];
      if (cat) {
        const catTypes = Object.keys(cat.types);
        if (node.applicableTypes && node.applicableTypes.length > 0) {
          if (!node.applicableTypes.some(t => catTypes.includes(t))) return false;
        }
      }
    }

    // Phase filter
    if (path.phase && node.constructionPhase !== path.phase) return false;

    // System filter
    if (path.system && node.buildingSystem !== path.system) return false;

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

  // Building category options with counts (grouped taxonomy)
  const buildingCategoryOptions = useMemo(() => {
    if (!graphData) return [];
    return Object.entries(BUILDING_TYPE_TAXONOMY).map(([key, cat]) => {
      const catTypes = Object.keys(cat.types);
      let count = 0;
      for (const rule of allRules) {
        if (rule.applicableTypes && rule.applicableTypes.length > 0) {
          if (rule.applicableTypes.some(t => catTypes.includes(t))) count++;
        }
      }
      return { value: key, label: cat.label, count };
    }).filter(o => o.count > 0);
  }, [allRules, graphData]);

  // Phase options with counts
  const phaseOptions = useMemo(() => {
    const partialPath = { ...browsePath, phase: null, system: null, specialty: null, subTopic: null };
    const matching = allRules.filter(r => ruleMatchesBrowse(r, partialPath));
    const counts = new Map<string, number>();
    for (const rule of matching) {
      if (rule.constructionPhase) {
        counts.set(rule.constructionPhase, (counts.get(rule.constructionPhase) ?? 0) + 1);
      }
    }
    return (["projeto", "licenciamento", "construcao", "certificacao"] as const)
      .filter(p => counts.has(p))
      .map(p => ({
        value: p,
        label: PHASE_LABELS[p],
        color: PHASE_COLORS[p],
        count: counts.get(p) ?? 0,
      }));
  }, [allRules, browsePath, ruleMatchesBrowse]);

  // System options with counts
  const systemOptions = useMemo(() => {
    const partialPath = { ...browsePath, system: null, specialty: null, subTopic: null };
    const matching = allRules.filter(r => ruleMatchesBrowse(r, partialPath));
    const counts = new Map<string, number>();
    for (const rule of matching) {
      if (rule.buildingSystem) {
        counts.set(rule.buildingSystem, (counts.get(rule.buildingSystem) ?? 0) + 1);
      }
    }
    return (["estrutura", "mep", "envolvente", "seguranca", "administrativo"] as const)
      .filter(s => counts.has(s))
      .map(s => ({
        value: s,
        label: SYSTEM_LABELS[s],
        count: counts.get(s) ?? 0,
      }));
  }, [allRules, browsePath, ruleMatchesBrowse]);

  // Specialty options with counts
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

  // Sub-topic options with counts
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

  // ── Connected rules (for selected rule highlight) ──────────
  const connectedRuleIds = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "rule" || !graphData) return new Set<string>();
    const connected = new Set<string>();
    for (const link of graphData.links) {
      if (link.type !== "field-dependency") continue;
      const srcId = typeof link.source === "string" ? link.source : (link.source as any)?.id;
      const tgtId = typeof link.target === "string" ? link.target : (link.target as any)?.id;
      if (srcId === selectedNode.id) connected.add(tgtId);
      if (tgtId === selectedNode.id) connected.add(srcId);
    }
    return connected;
  }, [selectedNode, graphData]);

  // ── Compute visible graph data ────────────────────────────
  const visibleData = useMemo(() => {
    if (!graphData) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

    const searchLower = searchQuery.toLowerCase();

    const visibleNodes = graphData.nodes.filter(node => {
      // Specialty filter from tree browser
      if (browsePath.specialty && node.specialtyId !== browsePath.specialty) return false;

      // Phase filter for non-rule nodes too
      if (browsePath.phase && node.constructionPhase !== browsePath.phase) return false;

      // System filter
      if (browsePath.system && node.buildingSystem !== browsePath.system) return false;

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
      // Hide field-dependency links if toggle is off
      if (l.type === "field-dependency" && !showFieldDeps) return false;

      const srcId = typeof l.source === "string" ? l.source : (l.source as any)?.id;
      const tgtId = typeof l.target === "string" ? l.target : (l.target as any)?.id;
      return visibleIds.has(srcId) && visibleIds.has(tgtId);
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, expandedRegulations, severityFilter, browsePath, searchQuery, ruleMatchesBrowse, showFieldDeps]);

  // ── Annotation color helper ──────────────────────────────
  const ANNOTATION_RING_COLORS: Record<AnnotationStatus, string> = {
    reviewed: "#10b981",
    irrelevant: "#6b7280",
    "needs-fix": "#f97316",
  };

  // ── Custom node rendering ─────────────────────────────────
  const nodeThreeObject = useCallback((node: FGNode) => {
    const n = node as unknown as GraphNode;
    const size = n.type === "specialty" ? 8 : n.type === "regulation" ? 4 : 1.5;
    const segments = n.type === "specialty" ? 24 : n.type === "regulation" ? 16 : 8;

    // Check annotation for rule nodes
    const ann = n.type === "rule" && showAnnotations ? annotations[n.label] : undefined;
    const isIrrelevant = ann?.status === "irrelevant";

    // Check if connected to selected rule
    const isConnected = n.type === "rule" && connectedRuleIds.has(n.id);
    const isSelected = selectedNode?.id === n.id;

    // Evaluation overlay
    const evalSt = showEvalOverlay && n.type === "rule" ? (evalStatusMap.get(n.label) ?? "not-evaluated") : null;

    const group = new THREE.Group();

    // Main sphere — use specialty color for rules
    const nodeColor = isIrrelevant ? "#4b5563" : n.color;
    const geo = new THREE.SphereGeometry(size, segments, segments);
    const mat = new THREE.MeshPhongMaterial({
      color: nodeColor,
      transparent: n.type === "rule",
      opacity: isIrrelevant ? 0.2 : (evalSt === "skipped" ? 0.3 : n.type === "rule" ? 0.75 : 1),
      emissive: new THREE.Color(nodeColor),
      emissiveIntensity: isConnected || isSelected ? 0.6 : n.type === "specialty" ? 0.3 : 0.1,
    });
    group.add(new THREE.Mesh(geo, mat));

    // Severity indicator (small offset sphere for rules)
    if (n.type === "rule" && n.severity && n.severity !== "pass" && !isIrrelevant) {
      const sevSize = 0.5;
      const sevGeo = new THREE.SphereGeometry(sevSize, 6, 6);
      const sevMat = new THREE.MeshBasicMaterial({
        color: SEVERITY_COLORS[n.severity] ?? "#6b7280",
      });
      const sevMesh = new THREE.Mesh(sevGeo, sevMat);
      sevMesh.position.set(size + 0.3, size + 0.3, 0);
      group.add(sevMesh);
    }

    // Annotation ring
    if (ann && !isIrrelevant) {
      const ringColor = ANNOTATION_RING_COLORS[ann.status];
      const ringGeo = new THREE.RingGeometry(size + 0.3, size + 0.8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      group.add(new THREE.Mesh(ringGeo, ringMat));
    }

    // Evaluation overlay ring
    if (evalSt && evalSt !== "not-evaluated") {
      const evalColor = EVAL_COLORS[evalSt];
      const evalGeo = new THREE.RingGeometry(size + 1, size + 1.5, 32);
      const evalMat = new THREE.MeshBasicMaterial({
        color: evalColor,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });
      group.add(new THREE.Mesh(evalGeo, evalMat));
    }

    // Connected rule glow
    if (isConnected) {
      const glowGeo = new THREE.SphereGeometry(size * 1.8, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: nodeColor,
        transparent: true,
        opacity: 0.15,
      });
      group.add(new THREE.Mesh(glowGeo, glowMat));
    }

    // Label sprite for non-rule nodes
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
  }, [showAnnotations, annotations, connectedRuleIds, selectedNode, showEvalOverlay, evalStatusMap]);

  // ── Node label for hover tooltip ──────────────────────────
  const nodeLabel = useCallback((node: FGNode) => {
    const n = node as unknown as GraphNode;
    if (n.type === "specialty") {
      return `<div style="background:#1e1e2e;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;max-width:280px">
        <b>${n.label}</b><br/><span style="color:#94a3b8">${n.rulesCount} regras</span>
        <br/><span style="color:#64748b;font-size:11px">${PHASE_LABELS[n.constructionPhase ?? ""] ?? ""} · ${SYSTEM_LABELS[n.buildingSystem ?? ""] ?? ""}</span></div>`;
    }
    if (n.type === "regulation") {
      return `<div style="background:#1e1e2e;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;max-width:280px">
        <b>${n.shortRef || n.label}</b><br/><span style="color:#94a3b8">${n.rulesCount} regras</span><br/>
        <span style="color:#64748b;font-size:11px">Clique para expandir/colapsar</span></div>`;
    }
    const sevBadge = n.severity ? `<span style="color:${SEVERITY_COLORS[n.severity] || '#fff'};font-size:10px;text-transform:uppercase">${SEVERITY_LABELS[n.severity] ?? n.severity}</span> · ` : "";
    return `<div style="background:#1e1e2e;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;max-width:320px">
      <b>${n.label}</b><br/>
      ${sevBadge}<span style="color:#cbd5e1">${n.article || ""}</span><br/>
      <span style="color:#94a3b8;font-size:12px">${(n.description || "").slice(0, 120)}${(n.description || "").length > 120 ? "..." : ""}</span></div>`;
  }, []);

  // ── Click handler ─────────────────────────────────────────
  const handleNodeClick = useCallback((node: FGNode) => {
    const n = node as unknown as GraphNode;

    if (n.type === "regulation") {
      setExpandedRegulations(prev => {
        const next = new Set(prev);
        next.add(n.regulationId!);
        return next;
      });
      setBrowsePath(prev => ({
        ...prev,
        specialty: n.specialtyId,
        regulationId: n.regulationId!,
      }));
    }

    if (n.type === "specialty") {
      setBrowsePath(prev => ({
        ...prev,
        specialty: n.specialtyId,
        subTopic: null,
        regulationId: null,
      }));
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
      setBrowsePath(prev => ({
        ...prev,
        specialty: n.specialtyId,
        regulationId: n.regulationId!,
      }));
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

  const linkColor = useCallback((link: GraphLink) => {
    if (link.type === "cross-specialty") return "#ff6b6b";
    if (link.type === "amends") return "#eab308";
    if (link.type === "field-dependency") return "#06b6d4";
    return "#2a2a3a";
  }, []);
  const linkWidth = useCallback((link: GraphLink) => {
    if (link.type === "cross-specialty") return 2;
    if (link.type === "amends") return 1.5;
    if (link.type === "field-dependency") return 0.8;
    return 0.3;
  }, []);
  const linkLabel = useCallback((link: GraphLink) => {
    if (link.type === "cross-specialty" && link.sharedFields?.length) {
      return `<div style="background:#1e1e2e;color:#ff6b6b;padding:6px 10px;border-radius:6px;font-size:11px;max-width:300px">
        <b>Campos partilhados (${link.sharedFields.length})</b><br/>
        <span style="color:#94a3b8">${link.sharedFields.slice(0, 8).join(", ")}${link.sharedFields.length > 8 ? ` (+${link.sharedFields.length - 8})` : ""}</span></div>`;
    }
    if (link.type === "field-dependency" && link.sharedField) {
      return `<div style="background:#1e1e2e;color:#06b6d4;padding:6px 10px;border-radius:6px;font-size:11px">
        <b>Campo partilhado</b><br/><span style="color:#94a3b8;font-family:monospace">${link.sharedField}</span></div>`;
    }
    if (link.type === "amends") {
      return `<div style="background:#1e1e2e;color:#eab308;padding:6px 10px;border-radius:6px;font-size:11px">Altera/Republica</div>`;
    }
    return "";
  }, []);
  const handleZoomToFit = useCallback(() => { fgRef.current?.zoomToFit(600, 40); }, []);

  // ── Chat panel: select rule by ID ──────────────────────────
  const handleSelectRule = useCallback((ruleLabel: string) => {
    if (!graphData) return;
    const node = graphData.nodes.find(n => n.type === "rule" && n.label === ruleLabel);
    if (!node) return;

    if (node.regulationId) {
      setExpandedRegulations(prev => {
        const next = new Set(prev);
        next.add(node.regulationId!);
        return next;
      });
    }

    setBrowsePath(prev => ({
      ...prev,
      specialty: node.specialtyId,
      regulationId: node.regulationId!,
    }));

    setSelectedNode(node);

    const fgNode = node as unknown as FGNode;
    if (fgRef.current && fgNode.x != null && fgNode.y != null && fgNode.z != null) {
      fgRef.current.cameraPosition(
        { x: fgNode.x, y: fgNode.y, z: fgNode.z! + 60 },
        { x: fgNode.x, y: fgNode.y, z: fgNode.z! },
        800,
      );
    }
  }, [graphData]);

  // ── Initial zoom ──────────────────────────────────────────
  useEffect(() => {
    if (!fgRef.current || !visibleData.nodes.length) return;
    const timer = setTimeout(() => { fgRef.current?.zoomToFit(800, 60); }, 1500);
    return () => clearTimeout(timer);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Specialties for reference ─────────────────────────────
  const specialties = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter(n => n.type === "specialty").sort((a, b) => (b.rulesCount ?? 0) - (a.rulesCount ?? 0));
  }, [graphData]);

  // ── Breadcrumb segments ───────────────────────────────────
  const breadcrumbs = useMemo(() => {
    const crumbs: Array<{ label: string; onClick: () => void }> = [];
    crumbs.push({
      label: "Todos",
      onClick: () => setBrowsePath({ ...DEFAULT_BROWSE }),
    });
    if (browsePath.buildingCategory) {
      const cat = BUILDING_TYPE_TAXONOMY[browsePath.buildingCategory];
      crumbs.push({
        label: cat?.label ?? browsePath.buildingCategory,
        onClick: () => setBrowsePath(prev => ({ ...prev, buildingType: null, phase: null, system: null, specialty: null, subTopic: null, regulationId: null })),
      });
    }
    if (browsePath.phase) {
      crumbs.push({
        label: PHASE_LABELS[browsePath.phase] ?? browsePath.phase,
        onClick: () => setBrowsePath(prev => ({ ...prev, system: null, specialty: null, subTopic: null, regulationId: null })),
      });
    }
    if (browsePath.system) {
      crumbs.push({
        label: SYSTEM_LABELS[browsePath.system] ?? browsePath.system,
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
  const currentLevel = browsePath.regulationId ? "rules"
    : !browsePath.buildingCategory ? "buildingCategory"
    : !browsePath.phase ? "phase"
    : !browsePath.system ? "system"
    : !browsePath.specialty ? "specialty"
    : !browsePath.subTopic ? "subTopic"
    : "rules";

  // ── Evaluation stats ──────────────────────────────────────
  const evalStats = useMemo(() => {
    if (!evaluationResults) return null;
    let pass = 0, fail = 0, skipped = 0;
    for (const result of evaluationResults) {
      skipped += result.rulesSkipped.length;
      fail += result.findings.length;
      pass += result.totalActiveRules - result.rulesSkipped.length - result.findings.length;
    }
    return { pass: Math.max(0, pass), fail, skipped };
  }, [evaluationResults]);

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
      {/* ── Sidebar (hidden in embedded mode) ──────────── */}
      {!embedded && <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col text-gray-200 shrink-0">
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
          {/* Level 1: Building Category (grouped taxonomy) */}
          {currentLevel === "buildingCategory" && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-gray-500" />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo de Edifício</label>
              </div>
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, buildingCategory: "_all", regulationId: null }))}
                className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 bg-gray-800/50 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <span>Todos os tipos</span>
                <span className="text-xs text-gray-500">{allRules.length}</span>
              </button>
              {buildingCategoryOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBrowsePath(prev => ({ ...prev, buildingCategory: opt.value, regulationId: null }))}
                  className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
                >
                  <span>{opt.label}</span>
                  <span className="text-xs text-gray-500">{opt.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Level 2: Construction Phase */}
          {currentLevel === "phase" && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-gray-500" />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fase de Construção</label>
              </div>
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, phase: "_all", regulationId: null }))}
                className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 bg-gray-800/50 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <span>Todas as fases</span>
                <span className="text-xs text-gray-500">{filteredRules.length}</span>
              </button>
              {phaseOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBrowsePath(prev => ({ ...prev, phase: opt.value, regulationId: null }))}
                  className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                    <span>{opt.label}</span>
                  </div>
                  <span className="text-xs text-gray-500">{opt.count}</span>
                </button>
              ))}
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, phase: "_all", regulationId: null }))}
                className="w-full text-left px-3 py-1.5 text-xs rounded-lg mt-2 text-gray-600 hover:text-gray-400 transition-colors"
              >
                Saltar → escolher sistema
              </button>
            </div>
          )}

          {/* Level 3: Building System */}
          {currentLevel === "system" && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-gray-500" />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sistema</label>
              </div>
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, system: "_all", regulationId: null }))}
                className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 bg-gray-800/50 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <span>Todos os sistemas</span>
                <span className="text-xs text-gray-500">{filteredRules.length}</span>
              </button>
              {systemOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBrowsePath(prev => ({ ...prev, system: opt.value, regulationId: null }))}
                  className="w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
                >
                  <span>{opt.label}</span>
                  <span className="text-xs text-gray-500">{opt.count}</span>
                </button>
              ))}
              <button
                onClick={() => setBrowsePath(prev => ({ ...prev, system: "_all", regulationId: null }))}
                className="w-full text-left px-3 py-1.5 text-xs rounded-lg mt-2 text-gray-600 hover:text-gray-400 transition-colors"
              >
                Saltar → escolher especialidade
              </button>
            </div>
          )}

          {/* Level 4: Specialty */}
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

          {/* Level 5: Sub-topic */}
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

          {/* Level 6: Rule list */}
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
                          style={{ backgroundColor: rule.specialtyColor ?? rule.color }}
                        />
                        <span className="text-xs font-mono text-gray-300 truncate">{rule.label}</span>
                        {rule.severity && rule.severity !== "pass" && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: SEVERITY_COLORS[rule.severity] }}
                            title={SEVERITY_LABELS[rule.severity]}
                          />
                        )}
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
              {graphData.stats.fieldDependencyLinks > 0 && (
                <>
                  <span className="text-gray-500">Dependências</span>
                  <span className="text-right font-medium text-cyan-400">{graphData.stats.fieldDependencyLinks}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>}

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
            linkLabel={linkLabel}
            linkOpacity={0.4}
            linkCurvature={(link: GraphLink) => link.type === "field-dependency" ? 0.2 : 0}
            linkDirectionalParticles={(link: GraphLink) => link.type === "cross-specialty" ? 2 : link.type === "amends" ? 1 : link.type === "field-dependency" ? 1 : 0}
            linkDirectionalParticleSpeed={(link: GraphLink) => link.type === "amends" ? 0.005 : 0.003}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleColor={(link: GraphLink) => link.type === "amends" ? "#eab308" : link.type === "field-dependency" ? "#06b6d4" : "#ff6b6b"}
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
          <button
            onClick={() => setShowFieldDeps(p => !p)}
            className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
              showFieldDeps ? "bg-cyan-800/80 text-cyan-300" : "bg-gray-800/80 hover:bg-gray-700 text-gray-300"
            }`}
            title={showFieldDeps ? "Ocultar dependências" : "Mostrar dependências"}
          >
            <Link2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAnnotations(p => !p)}
            className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
              showAnnotations ? "bg-emerald-800/80 text-emerald-300" : "bg-gray-800/80 hover:bg-gray-700 text-gray-300"
            }`}
            title={showAnnotations ? "Ocultar anotações" : "Mostrar anotações"}
          >
            <Eye className="w-4 h-4" />
          </button>
          {evaluationResults && (
            <button
              onClick={() => setShowEvalOverlay(p => !p)}
              className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                showEvalOverlay ? "bg-green-800/80 text-green-300" : "bg-gray-800/80 hover:bg-gray-700 text-gray-300"
              }`}
              title={showEvalOverlay ? "Ocultar avaliação" : "Mostrar avaliação"}
            >
              <Activity className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Evaluation stats bar */}
        {showEvalOverlay && evalStats && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm rounded-lg px-4 py-2 z-10 flex gap-4 text-xs">
            <span className="text-green-400">{evalStats.pass} passaram</span>
            <span className="text-red-400">{evalStats.fail} falharam</span>
            <span className="text-gray-400">{evalStats.skipped} saltadas</span>
          </div>
        )}

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
              Regulamento
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              Regra (cor = especialidade)
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-4 h-0.5 bg-cyan-400 inline-block" />
              Dependência de campo
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-red-400 inline-block" />
              Ligação cruzada
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-yellow-400 inline-block" />
              Altera/Republica
            </div>
            {showAnnotations && (
              <>
                <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-700">
                  <span className="w-2 h-2 rounded-full ring-2 ring-emerald-400 inline-block" />
                  Revista
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full ring-2 ring-orange-400 inline-block" />
                  Corrigir
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-600 opacity-30 inline-block" />
                  Irrelevante
                </div>
              </>
            )}
            {showEvalOverlay && (
              <>
                <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-700">
                  <span className="w-2 h-2 rounded-full ring-2 ring-green-400 inline-block" />
                  Passou
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full ring-2 ring-red-400 inline-block" />
                  Falhou
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-600 opacity-30 inline-block" />
                  Saltada
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <GraphChatPanel browsePath={browsePath} onSelectRule={handleSelectRule} />

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
                  <p className="text-gray-500 text-xs mb-1">{selectedNode.rulesCount} regras</p>
                  <div className="flex gap-2 mt-2">
                    <span className="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-[10px]">{PHASE_LABELS[selectedNode.constructionPhase ?? ""] ?? ""}</span>
                    <span className="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-[10px]">{SYSTEM_LABELS[selectedNode.buildingSystem ?? ""] ?? ""}</span>
                  </div>
                </>
              )}
              {selectedNode.type === "regulation" && (
                <>
                  <p className="text-gray-400 text-xs mb-2">Regulamento</p>
                  <p className="text-gray-300 mb-1">{selectedNode.label}</p>
                  {selectedNode.legalForce && <p className="text-gray-500 text-xs mb-1">Força legal: {selectedNode.legalForce}</p>}
                  <p className="text-gray-500 text-xs mb-2">{selectedNode.rulesCount} regras</p>
                  <p className="text-[10px] text-blue-400">Regras visíveis na barra lateral</p>
                </>
              )}
              {selectedNode.type === "rule" && (
                <>
                  {/* Header: severity badge + article */}
                  <div className="flex items-center gap-2 mb-2">
                    {selectedNode.severity && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          backgroundColor: SEVERITY_COLORS[selectedNode.severity] + "22",
                          color: SEVERITY_COLORS[selectedNode.severity],
                        }}
                      >
                        {SEVERITY_LABELS[selectedNode.severity] ?? selectedNode.severity}
                      </span>
                    )}
                    {selectedNode.article && (
                      <span className="text-gray-400 text-xs font-medium">{selectedNode.article}</span>
                    )}
                  </div>

                  {/* Phase + System badges */}
                  <div className="flex gap-2 mb-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px]" style={{
                      backgroundColor: (PHASE_COLORS[selectedNode.constructionPhase ?? ""] ?? "#666") + "22",
                      color: PHASE_COLORS[selectedNode.constructionPhase ?? ""] ?? "#888",
                    }}>
                      {PHASE_LABELS[selectedNode.constructionPhase ?? ""] ?? ""}
                    </span>
                    <span className="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-[10px]">
                      {SYSTEM_LABELS[selectedNode.buildingSystem ?? ""] ?? ""}
                    </span>
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
                        {selectedNode.projectScope === "new" ? "Construção nova" : "Reabilitação"}
                      </span>
                    )}
                  </div>

                  {/* Connected rules via field dependencies */}
                  {connectedRuleIds.size > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-cyan-500 uppercase tracking-wide mb-1">
                        Regras conectadas ({connectedRuleIds.size})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {[...connectedRuleIds].slice(0, 8).map(id => {
                          const connNode = graphData?.nodes.find(n => n.id === id);
                          return connNode ? (
                            <button
                              key={id}
                              onClick={() => setSelectedNode(connNode)}
                              className="px-1.5 py-0.5 bg-cyan-900/20 text-cyan-400 rounded text-[10px] hover:bg-cyan-900/40 transition-colors"
                            >
                              {connNode.label}
                            </button>
                          ) : null;
                        })}
                        {connectedRuleIds.size > 8 && (
                          <span className="text-[10px] text-gray-600">+{connectedRuleIds.size - 8} mais</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Conditions */}
                  {selectedNode.conditions && selectedNode.conditions.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Verifica ({selectedNode.conditions.length})
                      </p>
                      <div className="bg-gray-800/60 rounded-lg p-2.5 flex flex-col gap-2">
                        {(selectedNode.conditions as RuleConditionDisplay[]).map((cond, i) => (
                          <div key={i} className="text-xs leading-relaxed">
                            <p className="text-gray-200">{cond.question}</p>
                            <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                              {cond.field} {cond.operator} {cond.formula || (typeof cond.value === "object" ? JSON.stringify(cond.value) : String(cond.value ?? ""))}
                            </p>
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
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Remediação</p>
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
