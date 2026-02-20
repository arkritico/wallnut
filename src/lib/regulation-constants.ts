/**
 * Shared constants for regulation display across components.
 * Extracted from RegulationGraph.tsx and IngestionDashboard.tsx to avoid duplication.
 */

import type { IngestionStatus } from "./plugins/types";
import type { Severity } from "./types";

// ── Severity ──

export const SEVERITY_LABELS: Record<string, string> = {
  all: "Todas",
  critical: "Crítico",
  warning: "Aviso",
  info: "Info",
  pass: "OK",
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  pass: "#22c55e",
};

export const SEVERITY_BG: Record<Severity, string> = {
  critical: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-blue-100 text-blue-800",
  pass: "bg-green-100 text-green-800",
};

// ── Construction Phases ──

export const PHASE_LABELS: Record<string, string> = {
  projeto: "Projeto",
  licenciamento: "Licenciamento",
  construcao: "Construção",
  certificacao: "Certificação",
};

// ── Building Systems ──

export const SYSTEM_LABELS: Record<string, string> = {
  estrutura: "Estrutura",
  mep: "MEP",
  envolvente: "Envolvente",
  seguranca: "Segurança",
  administrativo: "Administrativo",
};

// ── Ingestion Status ──

export const INGESTION_STATUS_CONFIG: Record<
  IngestionStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  pending: { label: "Pendente", color: "text-gray-500", bg: "bg-gray-100", dot: "bg-gray-400" },
  partial: { label: "Parcial", color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-400" },
  complete: { label: "Completo", color: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-400" },
  verified: { label: "Verificado", color: "text-green-600", bg: "bg-green-50", dot: "bg-green-500" },
};

// ── Specialty Display Names ──

export const SPECIALTY_NAMES: Record<string, string> = {
  electrical: "Instalações Elétricas",
  "fire-safety": "Segurança Contra Incêndio",
  thermal: "Desempenho Térmico",
  acoustic: "Acústica",
  structural: "Estruturas",
  "water-drainage": "Águas e Drenagem",
  gas: "Instalações de Gás",
  hvac: "AVAC",
  telecommunications: "Telecomunicações",
  accessibility: "Acessibilidade",
  energy: "Eficiência Energética",
  elevators: "Ascensores",
  licensing: "Licenciamento",
  waste: "Resíduos de Construção",
  drawings: "Peças Desenhadas",
  architecture: "Arquitetura",
  general: "Regulamento Geral",
  municipal: "Regulamentos Municipais",
};

// ── Legal Force ──

export const LEGAL_FORCE_LABELS: Record<string, string> = {
  legal: "Legal",
  regulatory: "Regulamentar",
  normative: "Normativo",
  contractual: "Contratual",
  informative: "Informativo",
};

export const LEGAL_FORCE_COLORS: Record<string, string> = {
  legal: "bg-red-100 text-red-700",
  regulatory: "bg-orange-100 text-orange-700",
  normative: "bg-blue-100 text-blue-700",
  contractual: "bg-purple-100 text-purple-700",
  informative: "bg-gray-100 text-gray-700",
};

// ── Source Type ──

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  public_dre: "DRE",
  public_erse: "ERSE",
  public_operator: "Operador",
  proprietary_iec: "IEC",
  proprietary_ipq: "IPQ/NP",
  proprietary_en: "EN",
  manual_extract: "Manual",
};
