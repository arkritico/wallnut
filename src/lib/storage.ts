/**
 * localStorage persistence for projects and app state.
 * Handles save/restore/delete of multiple projects.
 */

import type { BuildingProject, AnalysisResult } from "./types";

const STORAGE_KEYS = {
  projects: "wallnut_projects",
  currentProject: "wallnut_current_project",
  lastAnalysis: "wallnut_last_analysis",
  settings: "wallnut_settings",
} as const;

export interface SavedProject {
  id: string;
  name: string;
  project: BuildingProject;
  lastAnalysis?: AnalysisResult;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  language: "pt" | "en";
  lastProjectId?: string;
}

function isAvailable(): boolean {
  try {
    const test = "__wallnut_test__";
    localStorage.setItem(test, "1");
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Project CRUD
// ============================================================

export function getAllProjects(): SavedProject[] {
  if (!isAvailable()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.projects);
    if (!raw) return [];
    return JSON.parse(raw) as SavedProject[];
  } catch {
    return [];
  }
}

export function getProject(id: string): SavedProject | null {
  const projects = getAllProjects();
  return projects.find(p => p.id === id) ?? null;
}

export function saveProject(saved: SavedProject): void {
  if (!isAvailable()) return;
  const projects = getAllProjects();
  const idx = projects.findIndex(p => p.id === saved.id);
  if (idx >= 0) {
    projects[idx] = { ...saved, updatedAt: new Date().toISOString() };
  } else {
    projects.push(saved);
  }
  localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
}

export function deleteProject(id: string): void {
  if (!isAvailable()) return;
  const projects = getAllProjects().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
}

export function createProject(name: string, project: BuildingProject): SavedProject {
  const now = new Date().toISOString();
  const saved: SavedProject = {
    id: crypto.randomUUID(),
    name,
    project: { ...project, name },
    createdAt: now,
    updatedAt: now,
  };
  saveProject(saved);
  return saved;
}

// ============================================================
// Current project (auto-save)
// ============================================================

export function saveCurrentProject(project: BuildingProject): void {
  if (!isAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.currentProject, JSON.stringify(project));
  } catch {
    // Storage full or unavailable
  }
}

export function loadCurrentProject(): BuildingProject | null {
  if (!isAvailable()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.currentProject);
    if (!raw) return null;
    return JSON.parse(raw) as BuildingProject;
  } catch {
    return null;
  }
}

export function clearCurrentProject(): void {
  if (!isAvailable()) return;
  localStorage.removeItem(STORAGE_KEYS.currentProject);
}

// ============================================================
// Last analysis result
// ============================================================

export function saveLastAnalysis(result: AnalysisResult): void {
  if (!isAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.lastAnalysis, JSON.stringify(result));
  } catch {
    // Too large or storage full
  }
}

export function loadLastAnalysis(): AnalysisResult | null {
  if (!isAvailable()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.lastAnalysis);
    if (!raw) return null;
    return JSON.parse(raw) as AnalysisResult;
  } catch {
    return null;
  }
}

// ============================================================
// Settings
// ============================================================

export function getSettings(): AppSettings {
  if (!isAvailable()) return { language: "pt" };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return { language: "pt" };
    return JSON.parse(raw) as AppSettings;
  } catch {
    return { language: "pt" };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (!isAvailable()) return;
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}
