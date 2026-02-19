import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-error-handler";
import { getAvailablePlugins } from "@/lib/plugins/loader";
import { validateAllLoadedPlugins } from "@/lib/plugins/validate";
import { generateCoverageReport } from "@/lib/plugins/coverage";
import {
  buildFieldLookup,
  buildConditionDisplay,
  extractApplicableTypes,
  extractProjectScope,
} from "@/lib/regulation-graph";

export const GET = withApiHandler("rule-audit", async () => {
  const plugins = getAvailablePlugins();
  const fieldLookup = buildFieldLookup();

  // Build flat rule list with humanized metadata
  const rules = plugins.flatMap((plugin) =>
    plugin.rules.map((rule) => {
      const reg = plugin.regulations.find((r) => r.id === rule.regulationId);
      return {
        id: rule.id,
        specialtyId: plugin.id,
        specialtyName: plugin.name,
        regulationId: rule.regulationId,
        regulationRef: reg?.shortRef ?? rule.regulationId,
        article: rule.article,
        description: rule.description,
        severity: rule.severity,
        conditionCount: rule.conditions.length,
        conditions: rule.conditions.map((c) =>
          buildConditionDisplay(
            { field: c.field, operator: c.operator, value: c.value, formula: c.formula },
            fieldLookup,
          ).question,
        ),
        exclusions: (rule.exclusions ?? []).map((c) =>
          buildConditionDisplay(
            { field: c.field, operator: c.operator, value: c.value, formula: c.formula },
            fieldLookup,
          ).question,
        ),
        remediation: rule.remediation,
        tags: rule.tags,
        enabled: rule.enabled,
        applicableTypes: extractApplicableTypes(rule),
        projectScope: extractProjectScope(rule),
      };
    }),
  );

  // Build regulation list with cross-specialty info
  const regSpecialtyMap = new Map<string, string[]>();
  for (const plugin of plugins) {
    for (const reg of plugin.regulations) {
      const existing = regSpecialtyMap.get(reg.id) ?? [];
      existing.push(plugin.id);
      regSpecialtyMap.set(reg.id, existing);
    }
  }

  const seenRegIds = new Set<string>();
  const regulations = plugins.flatMap((plugin) =>
    plugin.regulations
      .filter((reg) => {
        if (seenRegIds.has(reg.id)) return false;
        seenRegIds.add(reg.id);
        return true;
      })
      .map((reg) => ({
        id: reg.id,
        shortRef: reg.shortRef,
        title: reg.title,
        status: reg.status,
        sourceType: reg.sourceType,
        sourceUrl: reg.sourceUrl,
        legalForce: reg.legalForce,
        ingestionStatus: reg.ingestionStatus,
        rulesCount: reg.rulesCount,
        specialties: regSpecialtyMap.get(reg.id) ?? [],
      })),
  );

  // Validation
  const validationResults = validateAllLoadedPlugins();
  const validationByPlugin: Record<string, { errors: string[]; warnings: string[] }> = {};
  let totalErrors = 0;
  for (const vr of validationResults) {
    validationByPlugin[vr.pluginId] = {
      errors: vr.errors.map((e) => `${e.file}:${e.path} — ${e.message}`),
      warnings: vr.warnings.map((w) => `${w.file}:${w.path} — ${w.message}`),
    };
    totalErrors += vr.errors.length;
  }

  // Coverage
  const coverageReport = generateCoverageReport();
  const coverageBySpecialty: Record<string, { score: number; total: number; covered: number }> = {};
  for (const area of coverageReport.areas) {
    coverageBySpecialty[area.pluginId] = {
      score: area.coverageScore,
      total: area.regulationCount,
      covered: area.ruleCount,
    };
  }

  // Stats
  const bySpecialty: Record<string, number> = {};
  const bySeverity: Record<string, number> = { critical: 0, warning: 0, info: 0, pass: 0 };
  let enabledRules = 0;
  let disabledRules = 0;
  for (const r of rules) {
    bySpecialty[r.specialtyId] = (bySpecialty[r.specialtyId] ?? 0) + 1;
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    if (r.enabled) enabledRules++;
    else disabledRules++;
  }

  return NextResponse.json({
    rules,
    regulations,
    validation: { totalErrors, byPlugin: validationByPlugin },
    coverage: {
      bySpecialty: coverageBySpecialty,
      overall: coverageReport.overallCoverageScore,
    },
    stats: {
      totalRules: rules.length,
      totalRegulations: regulations.length,
      bySpecialty,
      bySeverity,
      enabledRules,
      disabledRules,
    },
  });
});
