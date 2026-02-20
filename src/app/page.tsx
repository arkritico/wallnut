"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import ProjectForm from "@/components/ProjectForm";
import ProjectWizard from "@/components/ProjectWizard";
import AuthProvider from "@/components/AuthProvider";
import AuthGate from "@/components/AuthGate";
import AnalysisResults from "@/components/AnalysisResults";
import { ErrorBoundary, ToastProvider } from "@/components/ErrorBoundary";
import WbsSchedule from "@/components/WbsSchedule";
import { runAllCalculations, type AllCalculations } from "@/lib/calculations";
import type { BuildingProject, AnalysisResult } from "@/lib/types";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import {
  getAllProjects,
  saveProject,
  deleteProject,
  createProject as createSavedProject,
  saveCurrentProject,
  loadCurrentProject,
  type SavedProject,
  getSettings,
  saveSettings,
} from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  getAllCloudProjects,
  saveCloudProject,
  deleteCloudProject,
  createCloudProject,
  getCurrentUser,
  onAuthStateChange,
  type CloudProject,
} from "@/lib/supabase-storage";
import { I18nContext, getTranslations, type Language } from "@/lib/i18n";
import { initErrorMonitoring } from "@/lib/error-monitoring";
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  FolderOpen,
  Globe,
  Clock,
  Cloud,
  Moon,
  Sun,
  Hammer,
  GitCompareArrows,
  Play,
  Users,
  Menu,
} from "lucide-react";

import MobileNav, { MobileNavLink } from "@/components/MobileNav";
import CompareProjects from "@/components/CompareProjects";
import CollaborationPanel from "@/components/CollaborationPanel";
import type { ProjectRole } from "@/lib/collaboration";
import { getUserRole } from "@/lib/collaboration";
import { phaseColor } from "@/lib/phase-colors";
import type { ConstructionPhase, ProjectSchedule } from "@/lib/wbs-types";
import { generateMSProjectXML } from "@/lib/msproject-export";

import UnifiedUpload from "@/components/UnifiedUpload";
import type { UnifiedPipelineResult } from "@/lib/unified-pipeline";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getAvailablePlugins } from "@/lib/plugins/loader";
import { SPECIALTY_NAMES } from "@/lib/regulation-constants";

const IfcViewer = dynamic(() => import("@/components/IfcViewer"), {
  ssr: false,
  loading: () => <div className="flex-1 min-h-[600px] flex items-center justify-center text-gray-400">A carregar visualizador 3D...</div>,
});
const FourDViewer = dynamic(() => import("@/components/FourDViewer"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center p-12 text-gray-400">A carregar 4D...</div>,
});
const EvmDashboard = dynamic(() => import("@/components/EvmDashboard"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center p-12 text-gray-400">A carregar EVM...</div>,
});

type AppView = "landing" | "dashboard" | "wizard" | "form" | "results" | "wbs" | "compare" | "unified" | "viewer" | "fourd" | "evm";


function WallnutLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 162 45" fill="currentColor" className={className} aria-label="Wallnut Design + Build">
      <path d="M36.48 0.096c-1.73 0-3.72 0-5.46 0-.47 0-.47.003-.59.493-0.67 2.72-3.46 13.99-4.38 17.71 0 .008-.003.008-.005.013-.001.008-.006.017-.009.025 0 0 0 0 0 .003-.025.04-.066.07-.118.07-.06 0-.11-.038-.129-.092-.001-.005-.006-.01-.009-.022-1.4-4.87-4.84-16.73-5.15-17.82-.04-.14-.076-.26-.175-.33l-.005-.002c-.05-.033-.113-.053-.198-.058h-.008-1.93-1.92-.008c-.085.005-.148.02-.197.052h-.006v.003c-.101.07-.137.19-.175.33-.315 1.09-3.75 12.96-5.15 17.82-.003.01-.005.016-.008.022-.02.052-.069.09-.129.09-.053 0-.096-.03-.118-.07 0 0 0 0 0-.003-.003-.008-.005-.016-.008-.025 0-.005-.003-.008-.005-.013C9.66 14.58 6.87 3.31 6.2.59 6.08.1 6.08.096 5.6.096 3.87.096 1.88.096.14.096.07.096.008.156.008.233c0 .013 0 .024.003.035l.284 1.2c1.12 4.2 7.3 27.15 7.56 28.19.076.31.213.4.525.39 1.36-.02 2.73-.014 4.09-.003.277 0 .416-.06.507-.356 1.095-3.66 4.578-15.13 5.225-17.25 0 0 .003-.003.005-.005.017-.052.06-.09.115-.096.055.005.098.044.115.096 0 0 .003 0 .005.005.646 2.13 4.133 13.6 5.226 17.25.087.296.228.356.504.354 1.364-.01 2.728-.016 4.09-.003.313.005.45-.077.526-.39.255-1.03 6.438-23.98 7.556-28.19l.284-1.2s.003-.024.003-.035c0-.074-.06-.137-.137-.137h-.01Z" />
      <path d="M57.11 29.858s-.003-.003-.005-.008c-1.41-3.84-9.93-27.21-10.72-29.38-.08-.22-.167-.37-.46-.37-.622.006-1.246.006-1.87.008h-.012c-.625 0-1.249-.005-1.87-.008-.293 0-.378.146-.46.37-.786 2.17-9.32 25.54-10.72 29.38l-.006.008c-.002.014-.008.027-.008.04 0 .083.066.148.148.148 1.714.003 3.738-.005 5.452-.008.564 0 .501.057.668-.483 1.462-4.7 5.962-17.96 6.616-19.93.017-.05.03-.107.05-.158.016-.06.065-.107.128-.107h.017s.005 0 .008 0c.06 0 .112.047.128.107.02.05.034.107.05.158.658 1.97 5.157 15.23 6.617 19.93.167.54.104.483.668.483 1.714.003 3.738.01 5.452.005.082 0 .148-.065.148-.148 0-.013-.005-.027-.008-.04Z" />
      <path d="M75.247 25.178v-.167c.01-.178-.052-.28-.25-.266 0 0-.257 0-.386 0-2.908 0-6.405 0-9.316 0h-.008c-.08 0-.143-.063-.143-.142 0-7.791.006-16.592.006-24.383-.006-.08-.069-.14-.145-.14h-.003c-1.566 0-4.015-.005-5.581 0-.082 0-.148.066-.148.148v.003c0 4.77 0 24.802 0 29.647 0 .082.066.148.148.148 5.047 0 10.634 0 15.68 0h.006c.082 0 .145-.074.145-.156.003-1.473-.005-3.22-.005-4.694Z" />
      <path d="M94.529 29.806s0-.006 0-.011 0-.008-.005-.014 0-.005 0-.008c-.81-1.49-1.722-3.1-2.5-4.6-.208-.402-.447-.485-.852-.482-.83.005-1.657.008-2.487.008-.643 0-1.166 0-1.66 0-.317 0-.638 0-.955 0-.704 0-1.484 0-2.618 0h-.008c-.08 0-.143-.063-.143-.142 0-7.791.006-16.592.006-24.383-.006-.08-.069-.14-.145-.14h-.003c-1.566 0-4.015-.006-5.581 0-.082 0-.148.066-.148.148v.003c0 4.77 0 24.802 0 29.647 0 .082.066.148.148.148 5.047 0 10.634 0 15.68 0h.003.003c.243 0 .49 0 .734 0 .178 0 .216 0 .397 0 .082 0 .148-.066.148-.148 0-.014-.006-.024-.008-.038l-.006.005Z" />
      <path d="M114.075.153s0 0 0-.003c0-.082-.066-.147-.145-.147-1.553-.006-3.982 0-5.537 0h-.003c-.077 0-.14.06-.145.137 0 .096 0 11.915 0 17.444 0 .167 0 .252 0 .433 0 0-.003.003-.003.005-.008.052-.052.09-.107.09-.038 0-.068-.019-.087-.049-1.074-1.652-10.42-16.094-11.422-17.658-.121-.189-.255-.285-.488-.285-1.512.008-3.229.01-4.74.003-.08 0-.143.063-.143.142 0 6.008.003 12.51-.005 18.515 0 .367.093.682.265.994 1.507 2.763 3.007 5.53 4.51 8.295.321.592.649 1.178.972 1.767.011.016.03.03.052.03.03 0 .057-.025.057-.058 0-5.931 0-11.726 0-17.701 0-.06.05-.11.11-.11.036 0 .063.017.085.04 0 0 .005.006.01.014.03.047 9.61 14.878 11.354 17.608.173.271.354.37.666.364 1.4-.014 2.802-.005 4.201-.005.548 0 .55-.003.55-.543 0 0 0-29.288 0-29.326l-.008.003Z" />
      <path d="M138.227.142c-.006-.08-.066-.14-.143-.14-1.536 0-3.946-.002-5.482 0-.08 0-.145.066-.145.148v.003c0 .038 0 .077 0 .115-.006.096 0 .23 0 .42 0 1.048 0 13.434 0 18.553 0 .663-.06 1.325-.228 1.966-.43 1.638-1.377 2.824-3.006 3.412-.649.236-1.318.318-1.989.31-.671.008-1.339-.074-1.988-.31-1.629-.589-2.577-1.775-3.007-3.412-.167-.641-.227-1.304-.227-1.966-.003-5.118 0-17.505 0-18.553 0-.189.006-.323 0-.42 0-.038 0-.077 0-.115v-.003c0-.082-.066-.148-.145-.148-1.536-.003-3.94 0-5.48 0h-.002c-.077 0-.137.06-.143.137 0 2.936-.022 16.76.019 19.892.036 2.665.95 4.995 2.848 6.915 1.915 1.936 4.26 2.881 6.94 3.144.399.038.794.057 1.188.06.394 0 .789-.019 1.189-.06 2.675-.263 5.025-1.208 6.94-3.144 1.897-1.92 2.812-4.25 2.848-6.915.04-3.133.022-16.956.022-19.892h-.008Z" />
      <path d="M162 .277c0-.178-.08-.274-.269-.274h-10.54L140.653 0c-.186 0-.268.093-.268.274 0 .276 0 4.412 0 4.688 0 .178.08.274.268.274.071 0 5.888 0 7.41.003.091 0 .165.074.165.164 0 5.507-.006 21.467-.003 24.345v.003c0 .082.066.148.148.148.791 0 4.844 0 5.636 0 .082 0 .148-.066.148-.148v-.003c0-2.875-.003-18.838-.003-24.345 0-.09.074-.164.164-.164 1.523 0 7.197 0 7.2 0 .071 0 .142 0 .213 0 .186 0 .269-.093.269-.274 0-.277 0-4.412 0-4.688Z" />
      <path d="M15.763 36.646c-.392-.734-.975-1.303-1.734-1.687-.75-.378-1.679-.572-2.755-.572H7.887v9.856h3.387c1.076 0 2.005-.192 2.755-.572.759-.384 1.342-.953 1.734-1.695.386-.731.583-1.63.583-2.67 0-1.04-.197-1.936-.583-2.665v.005Zm-6.252-.813h1.668c1.2 0 2.095.288 2.662.852.567.564.854 1.449.854 2.626s-.287 2.065-.854 2.635c-.567.57-1.463.857-2.66.857H9.514v-6.967l-.003-.003Z" />
      <path d="M27.73 35.792v-1.402h-6.482v9.856h6.482v-1.405h-4.894v-2.895h4.587v-1.405h-4.587v-2.75h4.894Z" />
      <path d="M38.656 39.732c-.446-.408-1.15-.706-2.092-.892l-1.43-.282c-.56-.118-.96-.285-1.193-.498-.22-.2-.326-.474-.326-.833 0-.46.175-.813.537-1.082.375-.279.898-.419 1.558-.419.553 0 1.057.08 1.492.238.433.157.846.414 1.227.762l.194.178.591-1.315-.093-.093c-.402-.402-.904-.712-1.49-.92-.58-.202-1.218-.307-1.895-.307-.736 0-1.39.124-1.941.367-.561.247-1.005.6-1.323 1.052-.32.457-.482.991-.482 1.594 0 .75.233 1.355.693 1.796.45.43 1.13.745 2.027.929l1.432.296c.608.118 1.032.276 1.265.471.214.178.318.433.318.78 0 .406-.156.723-.48.97-.333.254-.872.383-1.601.383-.422 0-.816-.038-1.172-.11-.353-.07-.684-.183-.991-.333-.31-.151-.619-.342-.92-.567l-.195-.145-.58 1.35.112.09c.463.373 1.013.663 1.64.866.625.202 1.331.304 2.106.304s1.399-.118 1.947-.351c.556-.238.994-.578 1.298-1.013.307-.438.463-.953.463-1.528 0-.734-.236-1.32-.699-1.742l.003.005Z" />
      <path d="M45.695 34.39h-1.627v9.856h1.627V34.39Z" />
      <path d="M55.117 38.864v1.35h2.369v2.353c-.241.082-.488.148-.742.2-.386.077-.789.118-1.194.118-1.123 0-1.958-.298-2.479-.89-.528-.597-.793-1.49-.793-2.654s.277-2.04.822-2.653c.54-.608 1.337-.919 2.372-.919.375 0 .706.033.98.096.271.063.534.167.783.31.255.145.523.339.797.583l.192.167.635-1.35-.093-.096c-.416-.392-.898-.693-1.427-.898-.528-.206-1.155-.31-1.862-.31-.99 0-1.87.208-2.595.617-.73.41-1.298 1.002-1.687 1.758-.386.75-.583 1.65-.583 2.68s.184 1.93.548 2.676c.367.758.928 1.35 1.665 1.758.728.403 1.638.608 2.7.608.6 0 1.208-.066 1.805-.192.063-.014.123-.027.184-.041v.09l.04-.099c.507-.12.948-.276 1.31-.463l.104-.052v-4.743h-3.82v-.006Z" />
      <path d="M70.62 34.39v7.04l-5.305-7.04h-1.249v9.856h1.545v-7.06l5.318 7.06h1.238V34.39h-1.547Z" />
      <path d="M88.102 38.503v-3.922h-1.57v3.922h-3.94v1.536h3.94v4.015h1.57v-4.015h3.94v-1.536h-3.94Z" />
      <path d="M109.466 39.702c-.225-.233-.496-.416-.81-.548.24-.137.449-.307.63-.51.382-.43.578-.97.578-1.606 0-.838-.3-1.498-.89-1.963-.575-.454-1.406-.687-2.46-.687h-4.032v9.856h4.204c1.065 0 1.906-.244 2.5-.72.605-.488.915-1.19.915-2.09 0-.712-.214-1.292-.635-1.73v-.003Zm-1.668-1.503c-.312.244-.803.37-1.46.37h-2.27v-2.816h2.27c.657 0 1.148.124 1.46.37.3.238.45.578.45 1.038s-.15.802-.45 1.04Zm-3.73 1.747h2.497c.619 0 1.107.115 1.452.345.326.216.482.58.482 1.117s-.16.893-.485 1.112c-.345.233-.832.35-1.45.35h-2.497v-2.922l.003-.002Z" />
      <path d="M121.289 34.39v5.85c0 .886-.203 1.558-.6 1.993-.39.43-.997.649-1.79.649-.795 0-1.44-.216-1.808-.647-.378-.435-.57-1.108-.57-1.998V34.39h-1.64v5.885c0 1.325.334 2.35.997 3.042.662.696 1.678 1.046 3.02 1.046s2.31-.35 2.985-1.046c.677-.693 1.02-1.717 1.02-3.042V34.39h-1.614v-.001Z" />
      <path d="M129.711 34.39h-1.627v9.856h1.627V34.39Z" />
      <path d="M136.574 42.789V34.39h-1.627v9.856h6.321v-1.457h-4.694Z" />
      <path d="M153.497 36.646c-.392-.734-.975-1.303-1.734-1.687-.75-.378-1.678-.572-2.754-.572h-3.388v9.856h3.388c1.076 0 2.005-.192 2.754-.572.76-.384 1.342-.953 1.734-1.695.386-.731.583-1.63.583-2.67 0-1.04-.197-1.936-.583-2.665v.005Zm-6.249-.813h1.667c1.2 0 2.095.288 2.662.852.567.564.855 1.449.855 2.626s-.288 2.065-.855 2.635c-.567.57-1.463.857-2.66.857h-1.668v-6.967l-.002-.003Z" />
    </svg>
  );
}

export default function Home() {
  const [view, setView] = useState<AppView>("landing");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [calculations, setCalculations] = useState<AllCalculations | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<BuildingProject | null>(null);

  // Auth state
  const [authUser, setAuthUser] = useState<{ email?: string } | null>(null);
  const [useCloud, setUseCloud] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // i18n
  const [lang, setLang] = useState<Language>("pt");
  const t = getTranslations(lang);

  // Dark mode
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Plugin stats for landing page footer
  const pluginStats = useMemo(() => {
    const plugins = getAvailablePlugins();
    return {
      total: plugins.reduce((sum, p) => sum + p.rules.length, 0),
      specialties: plugins.map(p => ({
        id: p.id,
        name: SPECIALTY_NAMES[p.id] ?? p.name,
        count: p.rules.length,
      })),
    };
  }, []);

  // Unified pipeline exports (stored as blobs for download buttons)
  const [unifiedResult, setUnifiedResult] = useState<UnifiedPipelineResult | null>(null);

  // Collaboration
  const [showCollab, setShowCollab] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<ProjectRole | null>(null);

  // Fetch collaboration role when project changes
  useEffect(() => {
    if (currentProjectId && useCloud) {
      getUserRole(currentProjectId).then(setCurrentUserRole);
    } else {
      setCurrentUserRole(null);
    }
    setShowCollab(false);
  }, [currentProjectId, useCloud]);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("wallnut-dark", next ? "1" : "0");
  }

  // Load saved state on mount
  useEffect(() => {
    // Dark mode preference
    const savedDark = localStorage.getItem("wallnut-dark");
    if (savedDark === "1" || (!savedDark && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }

    // Error monitoring
    initErrorMonitoring();

    // PWA service worker registration
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    setSavedProjects(getAllProjects());
    const settings = getSettings();
    setLang(settings.language);
    const saved = loadCurrentProject();
    if (saved) setCurrentProject(saved);

    // Check Supabase auth
    if (isSupabaseConfigured()) {
      getCurrentUser().then(user => {
        if (user) {
          setAuthUser({ email: user.email ?? undefined });
          setUseCloud(true);
          // Load cloud projects
          getAllCloudProjects().then(cloudProjects => {
            setSavedProjects(cloudProjects.map(cp => ({
              id: cp.id,
              name: cp.name,
              project: cp.project,
              lastAnalysis: cp.lastAnalysis ?? undefined,
              createdAt: cp.createdAt,
              updatedAt: cp.updatedAt,
            })));
          });
        }
        setAuthChecked(true);
      }).catch(() => {
        setAuthChecked(true);
      });

      const { data: { subscription } } = onAuthStateChange((user) => {
        if (user && typeof user === "object" && "email" in user) {
          setAuthUser({ email: (user as { email?: string }).email });
          setUseCloud(true);
        } else {
          setAuthUser(null);
          setUseCloud(false);
          setSavedProjects(getAllProjects());
        }
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    if (useCloud) {
      const cloudProjects = await getAllCloudProjects();
      setSavedProjects(cloudProjects.map(cp => ({
        id: cp.id,
        name: cp.name,
        project: cp.project,
        lastAnalysis: cp.lastAnalysis ?? undefined,
        createdAt: cp.createdAt,
        updatedAt: cp.updatedAt,
      })));
    } else {
      setSavedProjects(getAllProjects());
    }
  }, [useCloud]);

  function handleLanguageChange(newLang: Language) {
    setLang(newLang);
    saveSettings({ ...getSettings(), language: newLang });
  }

  function handleNewProject() {
    setCurrentProject(null);
    setCurrentProjectId(null);
    setResult(null);
    setCalculations(null);
    setView("wizard");
  }

  function handleWizardComplete(project: BuildingProject) {
    setCurrentProject(project);
    setView("form");
  }

  function handleWizardCancel() {
    setView("landing");
  }

  function handleOpenProject(saved: SavedProject) {
    setCurrentProject(saved.project);
    setCurrentProjectId(saved.id);
    setResult(saved.lastAnalysis ?? null);
    setCalculations(null);
    setView(saved.lastAnalysis ? "results" : "form");
  }

  async function handleDeleteProject(id: string) {
    if (useCloud) {
      await deleteCloudProject(id);
    } else {
      deleteProject(id);
    }
    await refreshProjects();
    if (currentProjectId === id) {
      setCurrentProjectId(null);
      setCurrentProject(null);
      setResult(null);
    }
  }

  async function handleAnalyze(project: BuildingProject) {
    setIsLoading(true);
    try {
      let analysisResult: AnalysisResult;
      let calcs: AllCalculations;

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(project),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        analysisResult = data.result;
        calcs = data.calculations;
      } catch {
        // Fallback to client-side analysis
        const { analyzeProject } = await import("@/lib/analyzer");
        analysisResult = await analyzeProject(project);
        calcs = runAllCalculations(project);
      }

      setResult(analysisResult);
      setCalculations(calcs);

      saveCurrentProject(project);
      setCurrentProject(project);

      // Save to project list (cloud or local)
      if (currentProjectId) {
        const existing = savedProjects.find(p => p.id === currentProjectId);
        if (existing) {
          const updated = {
            ...existing,
            name: project.name,
            project,
            lastAnalysis: analysisResult,
            updatedAt: new Date().toISOString(),
          };
          if (useCloud) {
            await saveCloudProject({
              id: updated.id,
              userId: authUser?.email || "local",
              name: updated.name,
              project: updated.project,
              lastAnalysis: updated.lastAnalysis ?? null,
              createdAt: updated.createdAt,
              updatedAt: updated.updatedAt,
            });
          } else {
            saveProject(updated);
          }
        }
      } else if (project.name) {
        if (useCloud) {
          const cloud = await createCloudProject(project.name, project);
          cloud.lastAnalysis = analysisResult;
          await saveCloudProject(cloud);
          setCurrentProjectId(cloud.id);
        } else {
          const saved = createSavedProject(project.name, project);
          saved.lastAnalysis = analysisResult;
          saveProject(saved);
          setCurrentProjectId(saved.id);
        }
      }
      await refreshProjects();
      setView("results");
    } finally {
      setIsLoading(false);
    }
  }

  // Section targeting for results → form bridge
  const [formTargetSection, setFormTargetSection] = useState<string | undefined>(undefined);

  function handleReset() {
    setResult(null);
    setCalculations(null);
    setFormTargetSection(undefined);
    setUnifiedResult(null);
    setView("landing");
  }

  /** When capacity optimizer applies changes, regenerate MS Project XML */
  const handleScheduleOptimized = useCallback((optimizedSchedule: ProjectSchedule) => {
    if (!unifiedResult) return;
    const xml = generateMSProjectXML(optimizedSchedule);
    setUnifiedResult((prev) =>
      prev ? { ...prev, schedule: optimizedSchedule, msProjectXml: xml } : prev,
    );
  }, [unifiedResult]);

  async function handleUnifiedComplete(pipelineResult: UnifiedPipelineResult) {
    setUnifiedResult(pipelineResult);
    setCurrentProject(pipelineResult.project);

    const project = pipelineResult.project;
    const analysisResult = pipelineResult.analysis ?? null;

    if (analysisResult) {
      setResult(analysisResult);
      setCalculations(runAllCalculations(project));
    }

    // Persist to Supabase or localStorage (same pattern as handleAnalyze)
    try {
      saveCurrentProject(project);
      if (currentProjectId) {
        const existing = savedProjects.find(p => p.id === currentProjectId);
        if (existing) {
          const updated = {
            ...existing,
            name: project.name,
            project,
            lastAnalysis: analysisResult ?? undefined,
            updatedAt: new Date().toISOString(),
          };
          if (useCloud) {
            await saveCloudProject({
              id: updated.id,
              userId: authUser?.email || "local",
              name: updated.name,
              project: updated.project,
              lastAnalysis: updated.lastAnalysis ?? null,
              createdAt: updated.createdAt,
              updatedAt: updated.updatedAt,
            });
          } else {
            saveProject(updated);
          }
        }
      } else if (project.name) {
        if (useCloud) {
          const cloud = await createCloudProject(project.name, project);
          cloud.lastAnalysis = analysisResult;
          await saveCloudProject(cloud);
          setCurrentProjectId(cloud.id);
        } else {
          const saved = createSavedProject(project.name, project);
          saved.lastAnalysis = analysisResult ?? undefined;
          saveProject(saved);
          setCurrentProjectId(saved.id);
        }
      }
      await refreshProjects();
    } catch (err) {
      console.error("Failed to persist pipeline result:", err);
    }

    setView(analysisResult ? "results" : "form");
  }

  function handleBackToForm(targetSection?: string) {
    setResult(null);
    setFormTargetSection(targetSection);
    setView("form");
  }

  function handleAuthChange() {
    getCurrentUser().then(user => {
      if (user) {
        setAuthUser({ email: user.email ?? undefined });
        setUseCloud(true);
        getAllCloudProjects().then(cloudProjects => {
          setSavedProjects(cloudProjects.map(cp => ({
            id: cp.id,
            name: cp.name,
            project: cp.project,
            lastAnalysis: cp.lastAnalysis ?? undefined,
            createdAt: cp.createdAt,
            updatedAt: cp.updatedAt,
          })));
        });
      } else {
        setAuthUser(null);
        setUseCloud(false);
        setSavedProjects(getAllProjects());
      }
    });
  }

  // Shared header component
  function AppHeader({ showBack, showEdit }: { showBack?: boolean; showEdit?: boolean }) {
    return (
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
          <button onClick={handleReset} className="text-gray-900 hover:text-accent transition-colors">
            <WallnutLogo className="h-6 w-auto" />
          </button>
          <div className="hidden md:flex items-center gap-3">
            {showEdit && (
              <button onClick={() => handleBackToForm()} className="text-sm text-accent hover:text-accent-hover font-medium">
                {t.editProject}
              </button>
            )}
            {savedProjects.length > 0 && (
              <button
                onClick={() => { refreshProjects(); setView("dashboard"); }}
                className="text-sm text-gray-500 hover:text-accent font-medium"
              >
                {t.myProjects}
              </button>
            )}
            {useCloud && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Cloud className="w-3 h-3" />
              </span>
            )}
            <AuthProvider user={authUser} onAuthChange={handleAuthChange} />
            <button onClick={toggleDarkMode} className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors" title={darkMode ? "Modo claro" : "Modo escuro"}>
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => handleLanguageChange(lang === "pt" ? "en" : "pt")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <Globe className="w-4 h-4" />{lang === "pt" ? "EN" : "PT"}
            </button>
          </div>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </header>
    );
  }

  return (
    <ErrorBoundary>
    <ToastProvider>
    <I18nContext.Provider value={{ lang, t, setLang: handleLanguageChange }}>
    <AuthGate user={authUser} checked={!isSupabaseConfigured() || authUser !== null || authChecked} onAuthChange={handleAuthChange}>
      {/* Landing */}
      {view === "landing" && (
        <main className="min-h-screen bg-white">
          {/* Navigation */}
          <nav className="max-w-6xl mx-auto px-6 py-4 md:py-6 flex items-center justify-between">
            <WallnutLogo className="h-7 w-auto text-gray-900" />

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-4">
              {useCloud && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Cloud className="w-3 h-3" />
                </span>
              )}
              <AuthProvider user={authUser} onAuthChange={handleAuthChange} />
              <button onClick={toggleDarkMode} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title={darkMode ? "Modo claro" : "Modo escuro"}>
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleLanguageChange(lang === "pt" ? "en" : "pt")}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                {lang === "pt" ? "EN" : "PT"}
              </button>
              {savedProjects.length > 0 && (
                <button
                  onClick={() => { refreshProjects(); setView("dashboard"); }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-accent font-medium transition-colors"
                >
                  <FolderOpen className="w-4 h-4" />
                  {t.myProjects}
                </button>
              )}
            </div>
          </nav>

          {/* Mobile navigation drawer */}
          <MobileNav isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
            {savedProjects.length > 0 && (
              <MobileNavLink onClick={() => { refreshProjects(); setView("dashboard"); setMobileMenuOpen(false); }}>
                <FolderOpen className="w-4 h-4" /> {t.myProjects}
              </MobileNavLink>
            )}
            <Link href="/regulamentos" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-sm">
              <Hammer className="w-4 h-4" /> {lang === "pt" ? "Regulamentos" : "Regulations"}
            </Link>
            <div className="border-t border-gray-100 my-2" />
            <MobileNavLink onClick={() => { toggleDarkMode(); }}>
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {darkMode ? "Modo claro" : "Modo escuro"}
            </MobileNavLink>
            <MobileNavLink onClick={() => { handleLanguageChange(lang === "pt" ? "en" : "pt"); setMobileMenuOpen(false); }}>
              <Globe className="w-4 h-4" /> {lang === "pt" ? "English" : "Português"}
            </MobileNavLink>
          </MobileNav>

          {/* Hero */}
          <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
            <h1 className="text-5xl md:text-[4.5rem] leading-[1.1] font-semibold tracking-tight text-gray-900 mb-8">
              {t.heroHeadline}
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-12">
              {t.heroSubline}
            </p>
            <button
              onClick={() => setView("unified")}
              className="inline-flex items-center gap-3 px-10 py-4 bg-accent text-white font-semibold rounded-lg hover:bg-accent-hover transition-colors text-lg"
            >
              {lang === "pt" ? "Carregar Ficheiros" : "Upload Files"}
              <ChevronRight className="w-5 h-5" />
            </button>
            <p className="mt-4 text-sm text-gray-300">{t.inputFormats}</p>
            <div className="mt-3 flex items-center justify-center gap-4 text-sm">
              <Link href="/regulamentos" className="text-gray-400 hover:text-accent transition-colors">
                {lang === "pt" ? "Explorar regulamentos" : "Explore regulations"}
              </Link>
              {savedProjects.length > 0 && (
                <>
                  <span className="text-gray-200">&middot;</span>
                  <button
                    onClick={() => { refreshProjects(); setView("dashboard"); }}
                    className="text-gray-400 hover:text-accent transition-colors"
                  >
                    {lang === "pt" ? "Abrir projeto" : "Open project"}
                  </button>
                </>
              )}
            </div>
          </section>

          {/* Capabilities */}
          <section className="max-w-5xl mx-auto px-6 pb-20">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="border border-gray-100 rounded-xl p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-2">{t.capCostTitle}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{t.capCostDesc}</p>
              </div>
              <div className="border border-gray-100 rounded-xl p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-2">{t.capScheduleTitle}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{t.capScheduleDesc}</p>
              </div>
              <div className="border border-gray-100 rounded-xl p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-2">{t.cap4DTitle}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{t.cap4DDesc}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8 max-w-3xl mx-auto">
              <div className="border border-gray-100 rounded-xl p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-2">{t.capComplianceTitle}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{t.capComplianceDesc}</p>
              </div>
              <div className="border border-gray-100 rounded-xl p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-2">{t.capRegAITitle}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{t.capRegAIDesc}</p>
              </div>
            </div>
          </section>

          {/* Specialty badges */}
          <footer className="max-w-5xl mx-auto px-6 pb-16">
            <div className="border-t border-gray-100 pt-8">
              <p className="text-center text-[0.65rem] text-gray-300 mb-4 uppercase tracking-[0.2em]">{t.regulationsCovered}</p>
              <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-400">
                {pluginStats.specialties.map(s => (
                  <span key={s.id} className="px-3 py-1 border border-gray-100 rounded-full">
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </footer>
        </main>
      )}

      {/* Dashboard */}
      {view === "dashboard" && (
        <main className="min-h-screen bg-gray-50">
          <AppHeader />

          <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">{t.myProjects}</h2>
              <div className="flex items-center gap-2">
                {savedProjects.length >= 2 && (
                  <button
                    onClick={() => setView("compare")}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                  >
                    <GitCompareArrows className="w-4 h-4" />
                    {lang === "pt" ? "Comparar" : "Compare"}
                  </button>
                )}
                <button
                  onClick={handleNewProject}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  {t.createNewProject}
                </button>
              </div>
            </div>

            {savedProjects.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{t.noProjects}</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {savedProjects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(saved => (
                  <div
                    key={saved.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:border-accent transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{saved.name || (lang === "pt" ? "Projeto sem nome" : "Unnamed project")}</h3>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {t.lastModified}: {new Date(saved.updatedAt).toLocaleDateString("pt-PT")}
                          </span>
                          <span>{saved.project.location.municipality}</span>
                          {saved.lastAnalysis && (
                            <span className="flex items-center gap-1">
                              {lang === "pt" ? "Pontuação" : "Score"}: {saved.lastAnalysis.overallScore}/100
                              <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold bg-gray-100">
                                {saved.lastAnalysis.energyClass}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleOpenProject(saved)}
                          className="px-4 py-2 bg-accent-light text-accent rounded-lg hover:bg-accent-medium text-sm font-medium transition-colors"
                        >
                          {t.openProject}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(t.confirmDelete)) handleDeleteProject(saved.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Wizard */}
      {view === "wizard" && (
        <main className="min-h-screen bg-gray-50">
          <AppHeader />
          <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <ProjectWizard
                onComplete={handleWizardComplete}
                onCancel={handleWizardCancel}
                onStartUnified={() => setView("unified")}
              />
            </div>
          </div>
        </main>
      )}

      {/* Form */}
      {view === "form" && (
        <main className="min-h-screen bg-gray-50">
          <AppHeader />
          <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">{t.projectData}</h2>
              <ProjectForm
                onSubmit={handleAnalyze}
                isLoading={isLoading}
                initialProject={currentProject ?? undefined}
                initialSection={formTargetSection}
              />
            </div>
          </div>
        </main>
      )}

      {/* Results */}
      {view === "results" && result && (
        <main className="min-h-screen bg-gray-50">
          <AppHeader showEdit />
          <div className="max-w-5xl mx-auto px-4 py-8">
            {/* 4D Simulation Hero Card */}
            {unifiedResult?.schedule && unifiedResult.elementMapping && (
              <div
                className="mb-6 relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white cursor-pointer group hover:shadow-2xl transition-all"
                onClick={() => setView("fourd")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setView("fourd"); }}
              >
                <div className="relative z-10 p-6 flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Clock className="w-5 h-5 text-accent flex-shrink-0" />
                      <h3 className="text-lg font-bold tracking-tight">
                        {lang === "pt" ? "Simulação 4D da Construção" : "4D Construction Simulation"}
                      </h3>
                    </div>
                    <p className="text-gray-400 text-sm mb-3">
                      {lang === "pt"
                        ? "Reproduza a sequência construtiva sobre o modelo BIM"
                        : "Play the construction sequence over the BIM model"}
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <span className="text-gray-400">
                        <span className="text-white font-semibold">{Math.ceil(unifiedResult.schedule.totalDurationDays / 30)}</span>{" "}
                        {lang === "pt" ? "meses" : "months"}
                      </span>
                      <span className="text-gray-400">
                        <span className="text-white font-semibold">{unifiedResult.schedule.tasks.filter(t => !t.isSummary).length}</span>{" "}
                        {lang === "pt" ? "tarefas" : "tasks"}
                      </span>
                      <span className="text-gray-400">
                        <span className="text-white font-semibold">{unifiedResult.elementMapping.stats.mapped}</span>{" "}
                        {lang === "pt" ? "elementos 3D" : "3D elements"}
                      </span>
                      <span className="text-gray-400">
                        <span className="text-white font-semibold">{unifiedResult.schedule.totalCost.toLocaleString("pt-PT")}</span> &euro;
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 bg-accent rounded-lg shadow-lg shadow-accent/25 group-hover:bg-accent-hover transition-colors">
                    <Play className="w-5 h-5" />
                    <span className="font-semibold">{lang === "pt" ? "Abrir" : "Open"}</span>
                  </div>
                </div>
                {/* Mini phase timeline bar */}
                <div className="relative h-1.5 bg-gray-700/50">
                  {(() => {
                    const s = unifiedResult.schedule;
                    const sMs = new Date(s.startDate).getTime();
                    const tMs = new Date(s.finishDate).getTime() - sMs;
                    if (tMs <= 0) return null;
                    const pg = new Map<string, { s: number; e: number }>();
                    for (const task of s.tasks) {
                      if (task.isSummary) continue;
                      const ts = new Date(task.startDate).getTime();
                      const te = new Date(task.finishDate).getTime();
                      const p = pg.get(task.phase);
                      if (p) { p.s = Math.min(p.s, ts); p.e = Math.max(p.e, te); }
                      else pg.set(task.phase, { s: ts, e: te });
                    }
                    return Array.from(pg.entries()).map(([phase, range]) => (
                      <div
                        key={phase}
                        className="absolute h-full"
                        style={{
                          left: `${((range.s - sMs) / tMs) * 100}%`,
                          width: `${Math.max(0.3, ((range.e - range.s) / tMs) * 100)}%`,
                          backgroundColor: phaseColor(phase as ConstructionPhase),
                          opacity: 0.85,
                        }}
                      />
                    ));
                  })()}
                </div>
              </div>
            )}

            <div className="mb-4 flex justify-end gap-2">
              {unifiedResult?.schedule && (
                <button
                  onClick={() => setView("evm")}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <GitCompareArrows className="w-4 h-4" />
                  {lang === "pt" ? "Valor Ganho (EVM)" : "Earned Value (EVM)"}
                </button>
              )}
              {useCloud && currentProjectId && (
                <button
                  onClick={() => setShowCollab(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Users className="w-4 h-4" />
                  {t.collaboration}
                </button>
              )}
            </div>
            <AnalysisResults
              result={result}
              calculations={calculations}
              project={currentProject ?? undefined}
              onReset={handleReset}
              onEditProject={handleBackToForm}
              budgetExcel={unifiedResult?.budgetExcel}
              msProjectXml={unifiedResult?.msProjectXml}
              ccpmGanttExcel={unifiedResult?.ccpmGanttExcel}
              complianceExcel={unifiedResult?.complianceExcel}
              projectId={currentProjectId ?? undefined}
              userRole={currentUserRole}
              ifcAnalyses={unifiedResult?.ifcAnalyses}
              cashFlow={unifiedResult?.cashFlow}
            />
          </div>
          {currentProjectId && (
            <CollaborationPanel
              projectId={currentProjectId}
              userRole={currentUserRole}
              isOpen={showCollab}
              onClose={() => setShowCollab(false)}
            />
          )}
        </main>
      )}

      {/* WBS → Schedule */}
      {view === "wbs" && (
        <main className="min-h-screen bg-gray-50">
          <AppHeader />
          <div className="max-w-5xl mx-auto px-4 py-8">
            <WbsSchedule onBack={() => setView("landing")} />
          </div>
        </main>
      )}

      {/* Compare Projects */}
      {view === "compare" && (
        <main className="min-h-screen bg-gray-50">
          <AppHeader />
          <div className="max-w-5xl mx-auto px-4 py-8">
            <CompareProjects
              projects={savedProjects}
              onBack={() => setView("dashboard")}
            />
          </div>
        </main>
      )}

      {/* 3D IFC Viewer */}
      {view === "viewer" && (
        <main className="min-h-screen bg-gray-50 flex flex-col">
          <AppHeader />
          <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <button
                  onClick={() => setView("landing")}
                  className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t.back}
                </button>
                <h1 className="text-xl font-bold text-gray-900 mt-1">
                  {lang === "pt" ? "Visualizador IFC" : "IFC Viewer"}
                </h1>
              </div>
            </div>
            <IfcViewer className="flex-1 min-h-[600px] border border-gray-200 rounded-xl" />
          </div>
        </main>
      )}

      {/* 4D Construction Timeline */}
      {view === "fourd" && unifiedResult?.schedule && unifiedResult?.elementMapping && (
        <main className="min-h-screen bg-gray-50 flex flex-col">
          <AppHeader />
          <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <button
                  onClick={() => setView("results")}
                  className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t.back}
                </button>
                <h1 className="text-xl font-bold text-gray-900 mt-1">
                  {lang === "pt" ? "Simulação 4D" : "4D Simulation"}
                </h1>
              </div>
            </div>
            <FourDViewer
              schedule={unifiedResult.schedule}
              elementMapping={unifiedResult.elementMapping}
              ifcData={unifiedResult.ifcFileData}
              ifcName={unifiedResult.ifcFileName}
              onScheduleOptimized={handleScheduleOptimized}
              className="flex-1 min-h-[700px] border border-gray-200 rounded-xl overflow-hidden"
            />
          </div>
        </main>
      )}

      {/* Earned Value Management */}
      {view === "evm" && unifiedResult?.schedule && (
        <main className="min-h-screen bg-gray-50">
          <AppHeader />
          <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="mb-4">
              <button
                onClick={() => setView("results")}
                className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                {t.back}
              </button>
              <h1 className="text-xl font-bold text-gray-900 mt-1">
                {lang === "pt" ? "Valor Ganho (EVM)" : "Earned Value Management"}
              </h1>
            </div>
            <EvmDashboard schedule={unifiedResult.schedule} />
          </div>
        </main>
      )}

      {/* Unified Multi-File Pipeline */}
      {view === "unified" && (
        <main className="min-h-screen bg-gray-50">
          <AppHeader />
          <div className="max-w-3xl mx-auto px-4 py-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <UnifiedUpload
                existingProject={currentProject ?? undefined}
                onComplete={handleUnifiedComplete}
                onCancel={() => setView("landing")}
              />
            </div>
          </div>
        </main>
      )}
    </AuthGate>
    </I18nContext.Provider>
    </ToastProvider>
    </ErrorBoundary>
  );
}
