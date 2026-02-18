import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Helper functions for conversion

function mapSeverity(sev: string): string {
  if (sev === 'mandatory') return 'critical';
  if (sev === 'recommended') return 'warning';
  return 'info';
}

function toCamelCase(str: string): string {
  return str
    .replace(/[À-ÿ]/g, (c: string) => {
      const map: Record<string, string> = {'á':'a','à':'a','ã':'a','â':'a','é':'e','ê':'e','í':'i','ó':'o','ô':'o','õ':'o','ú':'u','ç':'c',
                   'Á':'A','À':'A','Ã':'A','Â':'A','É':'E','Ê':'E','Í':'I','Ó':'O','Ô':'O','Õ':'O','Ú':'U','Ç':'C'};
      return map[c] || c;
    })
    .replace(/[^a-zA-Z0-9]+(.)/g, (_: string, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, (c: string) => c.toLowerCase());
}

function buildFieldName(rule: any): string {
  const params = rule.parameters || {};
  const cat = rule.category || '';
  const paramName = params.parameter_name || '';
  const paramKeys = Object.keys(params).filter((k: string) => !['unit', 'table', 'parameter_name', 'nota', 'expected_value'].includes(k));

  let prefix = 'water';
  if (cat.includes('Drenagem') && cat.includes('pluviais')) prefix = 'drainage.stormwater';
  else if (cat.includes('Drenagem')) prefix = 'drainage';
  else if (cat.includes('Proteção contra incêndios')) prefix = 'fire';
  else if (cat.includes('Qualidade da água')) prefix = 'waterQuality';
  else if (cat.includes('Normas europeias')) prefix = 'euNorm';
  else if (cat.includes('Abastecimento')) prefix = 'water';

  if (paramName) return `${prefix}.${toCamelCase(paramName)}`;
  if (paramKeys.length > 0) return `${prefix}.${toCamelCase(paramKeys[0])}`;

  const ruleText = rule.rule_text || '';
  const textSlug = ruleText.substring(0, 40).replace(/[^a-zA-ZÀ-ÿ0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `${prefix}.${toCamelCase(textSlug)}`;
}

function buildConditions(rule: any): any[] {
  const params = rule.parameters || {};
  const conditions: any[] = [];
  const fieldName = buildFieldName(rule);

  if (params.table) {
    conditions.push({ field: fieldName, operator: 'lookup_table', value: params.table });
    return conditions;
  }

  if (params.parameter_name) {
    if (params.min !== undefined && params.max !== undefined) {
      conditions.push({ field: fieldName, operator: '<', value: params.min });
      return conditions;
    }
    if (params.min !== undefined) {
      conditions.push({ field: fieldName, operator: '<', value: params.min });
      return conditions;
    }
    if (params.max !== undefined) {
      conditions.push({ field: fieldName, operator: '>', value: params.max });
      return conditions;
    }
    if (params.expected_value !== undefined) {
      conditions.push({ field: fieldName, operator: '!=', value: parseFloat(params.expected_value) || params.expected_value });
      return conditions;
    }
  }

  const numericKeys = Object.keys(params).filter((k: string) =>
    !['unit', 'table', 'parameter_name', 'nota', 'expected_value', 'requer_coeficiente_simultaneidade'].includes(k) &&
    typeof params[k] === 'number'
  );

  if (numericKeys.length >= 2) {
    const minKey = numericKeys.find((k: string) => k.includes('minim') || k.includes('min'));
    const maxKey = numericKeys.find((k: string) => k.includes('maxim') || k.includes('max'));
    if (minKey && maxKey) {
      conditions.push({ field: fieldName, operator: '<', value: params[minKey] });
      return conditions;
    }
    if (minKey) {
      conditions.push({ field: fieldName, operator: '<', value: params[minKey] });
      return conditions;
    }
    if (maxKey) {
      conditions.push({ field: fieldName, operator: '>', value: params[maxKey] });
      return conditions;
    }
    const firstKey = numericKeys[0];
    const keyLower = firstKey.toLowerCase();
    if (keyLower.includes('minim') || keyLower.includes('min')) {
      conditions.push({ field: fieldName, operator: '<', value: params[firstKey] });
    } else if (keyLower.includes('maxim') || keyLower.includes('max')) {
      conditions.push({ field: fieldName, operator: '>', value: params[firstKey] });
    } else {
      const text = (rule.rule_text || '').toLowerCase();
      if (text.includes('não deve ser inferior') || text.includes('mínimo') || text.includes('pelo menos') || text.includes('>= ') || text.includes('no mínimo')) {
        conditions.push({ field: fieldName, operator: '<', value: params[firstKey] });
      } else if (text.includes('não deve ser superior') || text.includes('máximo') || text.includes('não deve ultrapassar') || text.includes('não deve exceder') || text.includes('<= ')) {
        conditions.push({ field: fieldName, operator: '>', value: params[firstKey] });
      } else {
        conditions.push({ field: fieldName, operator: '!=', value: params[firstKey] });
      }
    }
    return conditions;
  }

  if (numericKeys.length === 1) {
    const key = numericKeys[0];
    const val = params[key];
    const keyLower = key.toLowerCase();
    const text = (rule.rule_text || '').toLowerCase();
    if (keyLower.includes('minim') || keyLower.includes('min')) {
      conditions.push({ field: fieldName, operator: '<', value: val });
    } else if (keyLower.includes('maxim') || keyLower.includes('max')) {
      conditions.push({ field: fieldName, operator: '>', value: val });
    } else if (text.includes('não deve ser inferior') || text.includes('mínimo') || text.includes('pelo menos') || text.includes('no mínimo')) {
      conditions.push({ field: fieldName, operator: '<', value: val });
    } else if (text.includes('não deve ser superior') || text.includes('máximo') || text.includes('não deve ultrapassar') || text.includes('não deve exceder')) {
      conditions.push({ field: fieldName, operator: '>', value: val });
    } else if (keyLower.includes('pressao') && keyLower.includes('base')) {
      conditions.push({ field: fieldName, operator: '<', value: val });
    } else {
      conditions.push({ field: fieldName, operator: '!=', value: val });
    }
    return conditions;
  }

  if (params.min !== undefined) {
    conditions.push({ field: fieldName, operator: '<', value: params.min });
    return conditions;
  }
  if (params.max !== undefined) {
    conditions.push({ field: fieldName, operator: '>', value: params.max });
    return conditions;
  }

  return conditions;
}

function buildRequiredValue(rule: any): string {
  const params = rule.parameters || {};
  const unit = params.unit || '';

  if (params.parameter_name) {
    if (params.min !== undefined && params.max !== undefined) return `≥ ${params.min} ${unit} e ≤ ${params.max} ${unit}`;
    if (params.min !== undefined) return `≥ ${params.min} ${unit}`;
    if (params.max !== undefined) return `≤ ${params.max} ${unit}`;
    if (params.expected_value !== undefined) return `= ${params.expected_value} ${unit}`;
  }

  if (params.min !== undefined && params.max !== undefined) return `≥ ${params.min} ${unit} e ≤ ${params.max} ${unit}`;
  if (params.min !== undefined) return `≥ ${params.min} ${unit}`;
  if (params.max !== undefined) return `≤ ${params.max} ${unit}`;

  const numericKeys = Object.keys(params).filter((k: string) =>
    !['unit', 'table', 'parameter_name', 'nota', 'expected_value', 'requer_coeficiente_simultaneidade'].includes(k) &&
    typeof params[k] === 'number'
  );

  if (numericKeys.length >= 2) {
    const minKey = numericKeys.find((k: string) => k.includes('minim') || k.includes('min'));
    const maxKey = numericKeys.find((k: string) => k.includes('maxim') || k.includes('max'));
    if (minKey && maxKey) return `≥ ${params[minKey]} ${unit} e ≤ ${params[maxKey]} ${unit}`;
    if (minKey) return `≥ ${params[minKey]} ${unit}`;
    if (maxKey) return `≤ ${params[maxKey]} ${unit}`;
  }

  if (numericKeys.length === 1) {
    const key = numericKeys[0];
    const val = params[key];
    const keyLower = key.toLowerCase();
    const text = (rule.rule_text || '').toLowerCase();
    if (keyLower.includes('minim') || keyLower.includes('min') || text.includes('mínimo') || text.includes('não deve ser inferior')) {
      return `≥ ${val} ${unit}`;
    } else if (keyLower.includes('maxim') || keyLower.includes('max') || text.includes('máximo') || text.includes('não deve ser superior') || text.includes('não deve exceder') || text.includes('não deve ultrapassar')) {
      return `≤ ${val} ${unit}`;
    }
    return `= ${val} ${unit}`;
  }

  if (params.table) return `Conforme tabela regulamentar (${unit})`;
  return rule.rule_text ? rule.rule_text.substring(0, 80) : '';
}

function buildCurrentValueTemplate(rule: any): string {
  const fieldName = buildFieldName(rule);
  const unit = (rule.parameters || {}).unit || '';
  return `{${fieldName}} ${unit}`.trim();
}

function buildTags(rule: any): string[] {
  const tags: string[] = [];
  const cat = rule.category || '';
  const subcat = rule.subcategory || '';

  if (cat.includes('Abastecimento')) tags.push('abastecimento');
  if (cat.includes('Drenagem') && cat.includes('residuais')) tags.push('drenagem', 'águas residuais');
  if (cat.includes('Drenagem') && cat.includes('pluviais')) tags.push('drenagem', 'pluviais');
  if (cat.includes('Proteção contra incêndios')) tags.push('incêndio', 'SCIE');
  if (cat.includes('Qualidade da água')) tags.push('qualidade', 'água');
  if (cat.includes('Normas europeias')) tags.push('EN', 'norma europeia');

  if (subcat) {
    const words = subcat.split(/[\s\-\/]+/).filter((w: string) => w.length > 3);
    words.slice(0, 3).forEach((w: string) => {
      const lower = w.toLowerCase();
      if (!tags.includes(lower) && !['rede', 'para', 'com', 'por', 'sem'].includes(lower)) {
        tags.push(lower);
      }
    });
  }

  const reg = rule.regulation || '';
  if (reg.includes('RT-SCIE')) tags.push('RT-SCIE');
  if (reg.includes('DL 69/2023')) tags.push('DL 69/2023');
  if (reg.includes('EN 806')) tags.push('EN 806');
  if (reg.includes('EN 12056')) tags.push('EN 12056');

  return [...new Set(tags)].slice(0, 6);
}

function buildArticle(rule: any): string {
  const reg = rule.regulation || 'RGSPPDADAR';
  const art = rule.article || rule.reference || '';
  if (art.startsWith('RGSPPDADAR') || art.startsWith('RT-SCIE') || art.startsWith('DL') || art.startsWith('EN ')) {
    return art;
  }
  return `${reg} ${art}`;
}

function mapRegulationId(rule: any): string {
  const reg = rule.regulation || '';
  if (reg.includes('RT-SCIE')) return 'rt-scie-port-1532-2008';
  if (reg.includes('DL 69/2023')) return 'dl-69-2023';
  if (reg.includes('EN 806')) return 'en-806';
  if (reg.includes('EN 12056')) return 'en-12056';
  return 'rgsppdadar-dr23-95';
}

function getIdPrefix(rule: any): string {
  const cat = rule.category || '';
  if (cat.includes('Abastecimento')) return 'WATER-SUP';
  if (cat.includes('Drenagem') && cat.includes('pluviais')) return 'WATER-PLV';
  if (cat.includes('Drenagem')) return 'WATER-DRN';
  if (cat.includes('Proteção contra incêndios')) return 'FIRE-PRT';
  if (cat.includes('Qualidade')) return 'WATER-QUA';
  if (cat.includes('Normas europeias')) return 'EU-NRM';
  return 'WATER-GEN';
}

function isQuantitative(rule: any): boolean {
  const params = rule.parameters || {};
  const valType = rule.validation_type;

  if (valType === 'boolean') {
    const hasNumericParam = Object.keys(params).some((k: string) => {
      if (['unit', 'table', 'parameter_name', 'nota', 'requer_coeficiente_simultaneidade'].includes(k)) return false;
      return typeof params[k] === 'number';
    });
    if (params.expected_value !== undefined && !isNaN(parseFloat(params.expected_value))) return true;
    if (params.min !== undefined || params.max !== undefined) return true;
    if (hasNumericParam) return true;
    return false;
  }

  if (valType === 'spatial') return false;
  if (valType === 'range') return true;

  if (valType === 'formula') {
    if (params.table) return true;
    const hasNumeric = Object.keys(params).some((k: string) => {
      if (['unit', 'table', 'parameter_name', 'nota'].includes(k)) return false;
      return typeof params[k] === 'number';
    });
    if (params.min !== undefined || params.max !== undefined) return true;
    return hasNumeric;
  }

  if (valType === 'conditional') {
    const hasNumeric = Object.keys(params).some((k: string) => {
      if (['unit', 'table', 'parameter_name', 'nota'].includes(k)) return false;
      return typeof params[k] === 'number';
    });
    if (params.min !== undefined || params.max !== undefined) return true;
    return hasNumeric;
  }

  if (valType === 'lookup') {
    if (params.table) return true;
    return false;
  }

  return false;
}

function convertRule(rule: any, index: number): any {
  const prefix = getIdPrefix(rule);
  const num = String(index + 1).padStart(3, '0');
  return {
    id: `${prefix}-${num}`,
    regulationId: mapRegulationId(rule),
    article: buildArticle(rule),
    description: rule.rule_text,
    severity: mapSeverity(rule.severity),
    conditions: buildConditions(rule),
    currentValueTemplate: buildCurrentValueTemplate(rule),
    requiredValue: buildRequiredValue(rule),
    remediation: rule.recommendation || rule.explanation || 'Verificar e corrigir conforme regulamento.',
    enabled: true,
    tags: buildTags(rule),
    _sourceId: rule.id
  };
}

function isDuplicate(rule1: any, rule2: any): boolean {
  const art1 = (rule1.article || '').replace(/\s+/g, ' ').toLowerCase();
  const art2 = (rule2.article || '').replace(/\s+/g, ' ').toLowerCase();

  if (art1 === art2 || (art1.includes(art2) || art2.includes(art1))) {
    if (rule1.conditions && rule2.conditions && rule1.conditions.length > 0 && rule2.conditions.length > 0) {
      const field1 = rule1.conditions[0].field;
      const field2 = rule2.conditions[0].field;
      if (field1 === field2) return true;
    }

    const words1 = new Set((rule1.description || '').toLowerCase().split(/\s+/));
    const words2 = new Set((rule2.description || '').toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const w of words1) if (words2.has(w) && w.length > 3) overlap++;
    const maxLen = Math.max(words1.size, words2.size);
    if (maxLen > 0 && overlap / maxLen > 0.5) return true;
  }

  return false;
}

describe('Convert and consolidate RGSPPDADAR rules', () => {
  it('converts ingestion rules to plugin format and writes consolidated file', () => {
    const ingestionPath = path.resolve(__dirname, '..', '..', 'regulamentos', 'plumbing', 'rgsppdadar', 'rules.json');
    const pluginPath = path.resolve(__dirname, '..', 'data', 'plugins', 'water-drainage', 'regulations', 'rgsppdadar', 'rules.json');

    const ingestionData = JSON.parse(fs.readFileSync(ingestionPath, 'utf8'));
    const pluginData = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));

    expect(ingestionData.rules.length).toBe(331);
    expect(pluginData.rules.length).toBeGreaterThan(0);

    // Filter quantitative rules
    const quantitativeRules = ingestionData.rules.filter(isQuantitative);
    console.log(`Quantitative/verifiable rules: ${quantitativeRules.length} out of ${ingestionData.rules.length}`);
    expect(quantitativeRules.length).toBeGreaterThan(100);

    // Convert
    const categoryCounters: Record<string, number> = {};
    const convertedRules = quantitativeRules.map((rule: any) => {
      const prefix = getIdPrefix(rule);
      if (!categoryCounters[prefix]) categoryCounters[prefix] = 0;
      categoryCounters[prefix]++;
      return convertRule(rule, categoryCounters[prefix] - 1);
    });

    // Re-number sequentially per prefix
    const prefixCounts: Record<string, number> = {};
    convertedRules.forEach((r: any) => {
      const prefix = r.id.split('-').slice(0, 2).join('-');
      if (!prefixCounts[prefix]) prefixCounts[prefix] = 0;
      prefixCounts[prefix]++;
      const num = String(prefixCounts[prefix]).padStart(3, '0');
      r.id = `${prefix}-${num}`;
    });

    console.log('Converted rules by category:', prefixCounts);

    // Merge with existing plugin rules
    const existingRules = pluginData.rules;
    const mergedRules = [...existingRules];
    let duplicatesSkipped = 0;
    let added = 0;

    for (const newRule of convertedRules) {
      let isDup = false;
      for (const existing of mergedRules) {
        if (isDuplicate(newRule, existing)) {
          isDup = true;
          duplicatesSkipped++;
          break;
        }
      }
      if (!isDup) {
        delete newRule._sourceId;
        mergedRules.push(newRule);
        added++;
      } else {
        delete newRule._sourceId;
      }
    }

    console.log(`Duplicates skipped: ${duplicatesSkipped}`);
    console.log(`New rules added: ${added}`);
    console.log(`Total rules in merged file: ${mergedRules.length}`);

    mergedRules.forEach((r: any) => delete r._sourceId);

    // Validate all rules have required fields
    for (const rule of mergedRules) {
      expect(rule.id).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(rule.severity).toMatch(/^(critical|warning|info)$/);
      expect(rule.conditions).toBeInstanceOf(Array);
      expect(rule.enabled).toBe(true);
      expect(rule.tags).toBeInstanceOf(Array);
    }

    // Build output
    const output = {
      regulationRef: "dl-23-95-rgsppdadar",
      description: "Regras de conformidade consolidadas — RGSPPDADAR (DL 23/95), RT-SCIE, DL 69/2023, EN 806 e EN 12056",
      version: "3.0",
      lastUpdated: "2026-02-17",
      totalRules: mergedRules.length,
      extractedBy: "system-consolidation",
      extractedAt: "2026-02-17",
      sources: [
        "Decreto Regulamentar 23/95, de 23 de Agosto (RGSPPDADAR)",
        "Portaria 1532/2008 (RT-SCIE) + Portaria 135/2020",
        "Decreto-Lei 69/2023, de 21 de agosto",
        "EN 806-2:2005 / EN 806-3:2006 / EN 806-4:2010 / EN 806-5:2012",
        "EN 12056-1:2000 / EN 12056-2:2000 / EN 12056-3:2000"
      ],
      rules: mergedRules
    };

    // Write the consolidated file
    fs.writeFileSync(pluginPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`Written consolidated file to: ${pluginPath}`);

    // Verify written file
    const written = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
    expect(written.totalRules).toBe(mergedRules.length);
    expect(written.rules.length).toBe(mergedRules.length);
    expect(written.rules.length).toBeGreaterThan(24);
  });
});
