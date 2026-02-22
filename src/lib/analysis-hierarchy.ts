/**
 * Analysis Hierarchy — Groups findings into a logical, human-readable structure.
 *
 * Hierarchy:
 *   Domain (e.g. "Safety & Protection")
 *     └─ Specialty (e.g. "Fire Safety")
 *          └─ Regulation (e.g. "RT-SCIE (DL 220/2008)")
 *               └─ Finding (individual compliance check)
 *
 * This transforms a flat list of findings into a tree that engineers
 * can read top-to-bottom: most critical domain first, then drill into
 * each specialty and its specific regulation violations.
 */

import type { Finding, RegulationArea, Severity } from "./types";

// ============================================================
// Domain definitions — logical groups of regulation specialties
// ============================================================

export interface DomainDefinition {
  id: string;
  label: string;
  description: string;
  /** Areas belonging to this domain, in display order */
  areas: RegulationArea[];
  /** Sort priority (lower = shown first when domains have equal severity) */
  basePriority: number;
}

/**
 * Engineering domains that group related regulation areas.
 * Order reflects the typical Portuguese project review flow:
 * safety-critical items first, then habitability, infrastructure, and admin.
 */
export const DOMAINS: DomainDefinition[] = [
  {
    id: "safety",
    label: "Segurança",
    description: "Segurança estrutural, incêndio e sísmica",
    areas: ["structural", "fire_safety"],
    basePriority: 0,
  },
  {
    id: "habitability",
    label: "Habitabilidade",
    description: "Conforto térmico, acústico e acessibilidade",
    areas: ["thermal", "acoustic", "accessibility"],
    basePriority: 1,
  },
  {
    id: "energy",
    label: "Energia e Sustentabilidade",
    description: "Eficiência energética, certificação e resíduos",
    areas: ["energy", "waste"],
    basePriority: 2,
  },
  {
    id: "infrastructure",
    label: "Infraestruturas",
    description: "Instalações elétricas, águas, gás, AVAC e telecomunicações",
    areas: ["electrical", "water_drainage", "gas", "hvac", "telecommunications", "elevators"],
    basePriority: 3,
  },
  {
    id: "architecture",
    label: "Arquitetura e Urbanismo",
    description: "Projeto de arquitetura, regulamentos municipais e peças desenhadas",
    areas: ["architecture", "general", "municipal", "drawings"],
    basePriority: 4,
  },
  {
    id: "licensing",
    label: "Licenciamento",
    description: "Procedimento de licenciamento urbanístico",
    areas: ["licensing"],
    basePriority: 5,
  },
];

// Reverse lookup: area → domain
const AREA_TO_DOMAIN = new Map<string, DomainDefinition>();
for (const domain of DOMAINS) {
  for (const area of domain.areas) {
    AREA_TO_DOMAIN.set(area, domain);
  }
}

// ============================================================
// Hierarchy tree types
// ============================================================

export interface RegulationGroup {
  regulation: string;
  findings: Finding[];
  /** Worst severity in this regulation group */
  worstSeverity: Severity;
  criticalCount: number;
  warningCount: number;
  passCount: number;
  infoCount: number;
}

export interface SpecialtyGroup {
  area: RegulationArea;
  regulations: RegulationGroup[];
  /** Worst severity across all regulations in this specialty */
  worstSeverity: Severity;
  criticalCount: number;
  warningCount: number;
  passCount: number;
  infoCount: number;
  totalFindings: number;
}

export interface DomainGroup {
  domain: DomainDefinition;
  specialties: SpecialtyGroup[];
  /** Worst severity across all specialties in this domain */
  worstSeverity: Severity;
  criticalCount: number;
  warningCount: number;
  passCount: number;
  infoCount: number;
  totalFindings: number;
}

export interface AnalysisHierarchy {
  domains: DomainGroup[];
  /** Findings that don't map to any domain (shouldn't happen, but safety net) */
  ungrouped: Finding[];
  totalCritical: number;
  totalWarning: number;
  totalPass: number;
  totalInfo: number;
}

// ============================================================
// Severity helpers
// ============================================================

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  pass: 3,
};

function worstSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b;
}

// ============================================================
// Build hierarchy
// ============================================================

/**
 * Transform a flat list of findings into a hierarchical tree.
 *
 * Sorting at every level:
 * - Domains: by worst severity, then base priority
 * - Specialties: by worst severity, then total findings desc
 * - Regulations: by worst severity, then total findings desc
 * - Findings: by severity (critical first, pass last)
 */
export function buildAnalysisHierarchy(findings: Finding[]): AnalysisHierarchy {
  // Step 1: bucket findings by area → regulation → finding[]
  const areaMap = new Map<string, Map<string, Finding[]>>();
  const ungrouped: Finding[] = [];

  for (const f of findings) {
    const domain = AREA_TO_DOMAIN.get(f.area);
    if (!domain) {
      ungrouped.push(f);
      continue;
    }

    let regMap = areaMap.get(f.area);
    if (!regMap) {
      regMap = new Map();
      areaMap.set(f.area, regMap);
    }

    const regKey = f.regulation || "(sem regulamento)";
    let regFindings = regMap.get(regKey);
    if (!regFindings) {
      regFindings = [];
      regMap.set(regKey, regFindings);
    }
    regFindings.push(f);
  }

  // Step 2: build domain groups
  const domainGroups: DomainGroup[] = [];

  for (const domainDef of DOMAINS) {
    const specialties: SpecialtyGroup[] = [];

    for (const area of domainDef.areas) {
      const regMap = areaMap.get(area);
      if (!regMap || regMap.size === 0) continue;

      const regulations: RegulationGroup[] = [];

      for (const [regulation, regFindings] of regMap) {
        // Sort findings within regulation by severity
        regFindings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

        const counts = countSeverities(regFindings);
        regulations.push({
          regulation,
          findings: regFindings,
          worstSeverity: regFindings[0].severity,
          ...counts,
        });
      }

      // Sort regulations: worst severity first, then by finding count
      regulations.sort((a, b) => {
        const sevDiff = SEVERITY_ORDER[a.worstSeverity] - SEVERITY_ORDER[b.worstSeverity];
        if (sevDiff !== 0) return sevDiff;
        return b.findings.length - a.findings.length;
      });

      const allFindings = regulations.flatMap(r => r.findings);
      const counts = countSeverities(allFindings);

      specialties.push({
        area: area as RegulationArea,
        regulations,
        worstSeverity: regulations[0]?.worstSeverity ?? "pass",
        ...counts,
        totalFindings: allFindings.length,
      });
    }

    if (specialties.length === 0) continue;

    // Sort specialties within domain
    specialties.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[a.worstSeverity] - SEVERITY_ORDER[b.worstSeverity];
      if (sevDiff !== 0) return sevDiff;
      return b.totalFindings - a.totalFindings;
    });

    const domainCounts = specialties.reduce(
      (acc, s) => ({
        criticalCount: acc.criticalCount + s.criticalCount,
        warningCount: acc.warningCount + s.warningCount,
        passCount: acc.passCount + s.passCount,
        infoCount: acc.infoCount + s.infoCount,
        totalFindings: acc.totalFindings + s.totalFindings,
      }),
      { criticalCount: 0, warningCount: 0, passCount: 0, infoCount: 0, totalFindings: 0 },
    );

    let domainWorst: Severity = "pass";
    for (const s of specialties) {
      domainWorst = worstSeverity(domainWorst, s.worstSeverity);
    }

    domainGroups.push({
      domain: domainDef,
      specialties,
      worstSeverity: domainWorst,
      ...domainCounts,
    });
  }

  // Sort domains: worst severity first, then base priority
  domainGroups.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.worstSeverity] - SEVERITY_ORDER[b.worstSeverity];
    if (sevDiff !== 0) return sevDiff;
    return a.domain.basePriority - b.domain.basePriority;
  });

  const totalCounts = domainGroups.reduce(
    (acc, d) => ({
      totalCritical: acc.totalCritical + d.criticalCount,
      totalWarning: acc.totalWarning + d.warningCount,
      totalPass: acc.totalPass + d.passCount,
      totalInfo: acc.totalInfo + d.infoCount,
    }),
    { totalCritical: 0, totalWarning: 0, totalPass: 0, totalInfo: 0 },
  );

  return {
    domains: domainGroups,
    ungrouped,
    ...totalCounts,
  };
}

function countSeverities(findings: Finding[]) {
  let criticalCount = 0;
  let warningCount = 0;
  let passCount = 0;
  let infoCount = 0;

  for (const f of findings) {
    switch (f.severity) {
      case "critical": criticalCount++; break;
      case "warning": warningCount++; break;
      case "pass": passCount++; break;
      case "info": infoCount++; break;
    }
  }

  return { criticalCount, warningCount, passCount, infoCount };
}

/**
 * Get the domain for a given regulation area.
 * Returns undefined for unknown areas.
 */
export function getDomainForArea(area: string): DomainDefinition | undefined {
  return AREA_TO_DOMAIN.get(area);
}
