/**
 * AI-First Estimation — Prompt Engineering
 *
 * Builds the system prompt and project summary for the LLM-driven
 * cost estimation. The system prompt makes Claude act as a senior
 * Portuguese orçamentista (quantity surveyor). The project summary
 * condenses all parsed project data into a prompt-friendly format.
 */

import type { BuildingProject } from "./types";
import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
import type { WbsProject } from "./wbs-types";

// ============================================================
// System Prompt
// ============================================================

/**
 * Build the system prompt for AI cost estimation.
 * This prompt defines the AI's role, methodology, market references,
 * and strict output schema.
 */
export function buildEstimationSystemPrompt(): string {
  return `Você é um orçamentista sénior português com mais de 20 anos de experiência em construção residencial, hotelaria, e reabilitação em Portugal. O seu trabalho é analisar os dados de um projeto e produzir uma estimativa de custo informada e fiável, organizada por pacotes de trabalho, como faria para um cliente real.

## METODOLOGIA
1. COMPREENDA o projeto: que edifício é, que tipo de intervenção, que complexidade, que restrições existem.
2. Defina os PACOTES DE TRABALHO necessários (tipicamente 15-30 para uma obra completa).
3. Para cada pacote, estime QUANTIDADES baseadas nas dimensões do edifício e CUSTOS UNITÁRIOS baseados no mercado português 2024-2025.
4. Tenha em conta a LOCALIZAÇÃO (fator distrito) e o TIPO de obra (nova vs reabilitação).
5. Identifique RISCOS e assuma CONTINGÊNCIAS apropriadas.
6. Se tiver dados IFC com quantidades medidas, use-os como base. Se não, estime pela área bruta e tipologia.

## FATORES DE LOCALIZAÇÃO (base Lisboa = 1.00)
Lisboa 1.00, Porto 0.95, Setúbal 0.97, Braga 0.90, Faro 0.95, Aveiro 0.90, Coimbra 0.92, Évora 0.88, Leiria 0.90, Viseu 0.87, Santarém 0.90, Viana do Castelo 0.88, Vila Real 0.85, Bragança 0.85, Guarda 0.85, Castelo Branco 0.87, Portalegre 0.87, Beja 0.87, R.A. Açores 1.15, R.A. Madeira 1.10

## REFERÊNCIA DE PREÇOS (mercado português 2024-2025, EUR)

### Obra Nova
- Estaleiro e montagem: 3-5% do custo direto
- Demolições seletivas: 15-30 EUR/m²
- Escavação em terreno corrente: 8-18 EUR/m³
- Aterro e compactação: 6-12 EUR/m³
- Fundações diretas (sapatas): 250-320 EUR/m³
- Fundações indiretas (estacas): 80-150 EUR/ml
- Estrutura betão armado (pilares): 380-500 EUR/m³
- Estrutura betão armado (vigas): 350-450 EUR/m³
- Estrutura betão armado (lajes): 280-380 EUR/m³
- Estrutura metálica: 3.5-6.0 EUR/kg
- Alvenaria exterior (tijolo 30cm): 28-38 EUR/m²
- Alvenaria interior (tijolo 15cm): 18-25 EUR/m²
- Cobertura inclinada (telha cerâmica): 45-65 EUR/m²
- Cobertura plana (invertida): 55-75 EUR/m²
- Impermeabilização: 18-28 EUR/m²
- ETICS/capoto (80mm EPS): 48-68 EUR/m²
- Caixilharia alumínio RPT com vidro duplo: 300-450 EUR/m²
- Portas interiores: 250-400 EUR/Ud
- Portas exteriores: 500-900 EUR/Ud
- Reboco exterior: 16-24 EUR/m²
- Estuque projetado interior: 10-16 EUR/m²
- Pavimento cerâmico: 35-55 EUR/m²
- Pavimento flutuante: 25-40 EUR/m²
- Teto falso gesso cartonado: 28-38 EUR/m²
- Pintura interior (tinta plástica): 6-9 EUR/m²
- Pintura exterior: 8-12 EUR/m²
- Instalação elétrica completa: 45-70 EUR/m²
- Canalização (água + esgotos): 35-55 EUR/m²
- AVAC (sistema split/VRV): 40-90 EUR/m²
- Elevador (6 paragens): 35,000-55,000 EUR/Ud
- Segurança contra incêndio (SCIE): 8-18 EUR/m²
- ITED (telecomunicações): 12-22 EUR/m²
- Arranjos exteriores: 25-50 EUR/m²

### Reabilitação (majoração 15-40% vs obra nova)
- Demolição interior completa: 25-45 EUR/m²
- Reforço estrutural: +30-50% vs estrutura nova
- Recuperação fachada (limpeza + pintura): 25-40 EUR/m²
- Recuperação fachada (reparação profunda): 60-100 EUR/m²
- Recuperação cobertura: 55-85 EUR/m²
- Substituição caixilharia: 350-500 EUR/m²
- Beneficiação instalações elétricas: 55-85 EUR/m²
- Beneficiação canalização: 45-70 EUR/m²

### Hotelaria (majoração 20-50% vs residencial)
- Quartos (acabamento standard): 800-1,200 EUR/m²
- Quartos (acabamento premium): 1,200-1,800 EUR/m²
- Áreas comuns (lobby/restaurante): 1,000-2,000 EUR/m²
- Cozinha industrial: 1,500-2,500 EUR/m²
- Spa/piscina: 1,800-3,000 EUR/m²
- Sistemas de gestão hoteleira: 50-100 EUR/quarto

### Custos Globais por m² (referência verificação)
- Residencial standard: 900-1,200 EUR/m²
- Residencial premium: 1,200-1,800 EUR/m²
- Hotelaria standard: 1,200-1,800 EUR/m²
- Hotelaria premium: 1,800-2,800 EUR/m²
- Escritórios: 1,000-1,600 EUR/m²
- Reabilitação residencial: 700-1,200 EUR/m²
- Reabilitação hotelaria: 1,400-2,500 EUR/m²

## SEQUÊNCIA DE CONSTRUÇÃO (30 fases)
site_setup → demolition → earthworks → foundations → structure → external_walls → roof → waterproofing → external_frames → rough_in_plumbing → rough_in_electrical → rough_in_gas → rough_in_telecom → rough_in_hvac → internal_walls → insulation → external_finishes → internal_finishes → flooring → ceilings → carpentry → plumbing_fixtures → electrical_fixtures → painting → metalwork → fire_safety → elevators → external_works → testing → cleanup

## FORMATO DE SAÍDA
Retorne APENAS JSON válido. Sem texto antes ou depois do JSON. Siga exatamente este schema:

{
  "projectUnderstanding": {
    "buildingType": "string — tipo de edifício",
    "scope": "string — âmbito da intervenção",
    "complexity": "simple | medium | complex | very_complex",
    "grossFloorArea": 0,
    "location": "string — localização",
    "keyConstraints": ["lista de restrições relevantes"]
  },
  "workPackages": [
    {
      "code": "01",
      "name": "Estaleiro",
      "description": "Montagem e desmontagem de estaleiro, vedações, contentores, sinalização",
      "unit": "vg",
      "estimatedQuantity": 1,
      "unitCostRange": { "min": 0, "max": 0 },
      "totalCostRange": { "min": 0, "max": 0 },
      "confidence": "high | medium | low",
      "reasoning": "justificação breve",
      "phase": "site_setup"
    }
  ],
  "totalEstimate": {
    "min": 0,
    "max": 0,
    "mostLikely": 0
  },
  "suggestedSequence": ["site_setup", "demolition", "..."],
  "risks": [
    {
      "description": "string",
      "impact": "low | medium | high",
      "mitigation": "string"
    }
  ],
  "assumptions": ["lista de pressupostos"]
}

## REGRAS
- Todos os valores em EUR, sem IVA.
- A soma dos totalCostRange de todos os workPackages deve ser coerente com o totalEstimate.
- Inclua sempre: estaleiro, demolições (se reabilitação), estrutura, envolvente, instalações especiais, acabamentos.
- Não omita pacotes de trabalho por serem "menores" — cada capítulo de obra deve estar representado.
- A totalEstimate.mostLikely deve ser um valor ponderado realista, não a média aritmética.
- Justifique cada pacote com raciocínio concreto (não genérico).`;
}

// ============================================================
// Project Summary Builder
// ============================================================

/**
 * Condense all parsed project data into a prompt-friendly summary.
 * Typically produces 3-8KB of structured text.
 */
export function buildProjectSummaryForAI(
  project: BuildingProject,
  ifcAnalyses?: SpecialtyAnalysisResult[],
  wbsProject?: WbsProject,
  pdfText?: string,
): string {
  const sections: string[] = [];

  // ── Project Basics ─────────────────────────────────────────
  sections.push(`## PROJETO`);
  sections.push(`Nome: ${project.name || "Não definido"}`);
  sections.push(`Tipo: ${translateBuildingType(project.buildingType)}`);
  sections.push(`Reabilitação: ${project.isRehabilitation ? "Sim" : "Não"}${project.isMajorRehabilitation ? " (grande reabilitação)" : ""}`);

  if (project.location) {
    const loc = project.location;
    sections.push(`Localização: ${loc.municipality || "?"}, ${loc.district || "?"}`);
    if (loc.climateZoneWinter) sections.push(`Zona climática: ${loc.climateZoneWinter}/${loc.climateZoneSummer}`);
  }

  sections.push(`Área bruta: ${project.grossFloorArea || "?"} m²`);
  sections.push(`Área útil: ${project.usableFloorArea || "?"} m²`);
  sections.push(`Pisos: ${project.numberOfFloors || "?"}`);
  sections.push(`Altura: ${project.buildingHeight || "?"} m`);
  if (project.numberOfDwellings) sections.push(`Fogos: ${project.numberOfDwellings}`);
  if (project.yearBuilt) sections.push(`Ano de construção: ${project.yearBuilt}`);

  // ── Architecture ───────────────────────────────────────────
  if (project.architecture) {
    const arch = project.architecture;
    const archParts: string[] = [];
    if (arch.ceilingHeight) archParts.push(`pé-direito ${arch.ceilingHeight}m`);
    if (arch.hasNaturalLight) archParts.push("iluminação natural");
    if (arch.hasCrossVentilation) archParts.push("ventilação cruzada");
    if (arch.facadeArea) archParts.push(`fachada ${arch.facadeArea}m²`);
    if (archParts.length) sections.push(`Arquitetura: ${archParts.join(", ")}`);
  }

  // ── Structural ─────────────────────────────────────────────
  if (project.structural) {
    const str = project.structural;
    const strParts: string[] = [];
    if (str.structuralSystem) strParts.push(str.structuralSystem);
    if ((str as Record<string, unknown>).concreteClass) strParts.push(`betão ${(str as Record<string, unknown>).concreteClass}`);
    if ((str as Record<string, unknown>).steelGrade) strParts.push(`aço ${(str as Record<string, unknown>).steelGrade}`);
    if (strParts.length) sections.push(`Sistema estrutural: ${strParts.join(", ")}`);
  }

  // ── Envelope ───────────────────────────────────────────────
  if (project.envelope) {
    const env = project.envelope;
    const envParts: string[] = [];
    if (env.externalWallUValue) envParts.push(`U-parede ${env.externalWallUValue} W/m².K`);
    if (env.roofUValue) envParts.push(`U-cobertura ${env.roofUValue} W/m².K`);
    if (env.windowUValue) envParts.push(`U-janela ${env.windowUValue} W/m².K`);
    if (env.windowSolarFactor) envParts.push(`g-vidro ${env.windowSolarFactor}`);
    if (envParts.length) sections.push(`Envolvente: ${envParts.join(", ")}`);
  }

  // ── IFC Model Summary ─────────────────────────────────────
  if (ifcAnalyses && ifcAnalyses.length > 0) {
    sections.push("");
    sections.push(`## MODELO IFC`);

    for (const analysis of ifcAnalyses) {
      const s = analysis.summary;
      sections.push(`Especialidade: ${analysis.specialty}`);
      sections.push(`Elementos: ${s.totalElements}`);

      // Element breakdown
      const typeCounts = Object.entries(s.elementsByType)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => `${count} ${type.replace("IFC", "").toLowerCase()}`)
        .join(", ");
      if (typeCounts) sections.push(`Tipos: ${typeCounts}`);

      // Aggregated quantities
      if (s.totalArea) sections.push(`Área total: ${Math.round(s.totalArea)} m²`);
      if (s.totalVolume) sections.push(`Volume total: ${Math.round(s.totalVolume * 100) / 100} m³`);
      if (s.totalLength) sections.push(`Comprimento total: ${Math.round(s.totalLength)} m`);

      // Storeys
      if (s.storeys.length > 0) {
        sections.push(`Pisos (${s.storeys.length}): ${s.storeys.slice(0, 10).join(", ")}${s.storeys.length > 10 ? "..." : ""}`);
      }

      // Materials
      if (s.materialsUsed.length > 0) {
        sections.push(`Materiais: ${s.materialsUsed.slice(0, 10).join(", ")}${s.materialsUsed.length > 10 ? "..." : ""}`);
      }
    }
  }

  // ── BOQ Summary ────────────────────────────────────────────
  if (wbsProject) {
    sections.push("");
    sections.push(`## MAPA DE QUANTIDADES`);
    sections.push(`Classificação: ${wbsProject.classification}`);

    let totalArticles = 0;
    for (const ch of wbsProject.chapters) {
      let chArticles = 0;
      let chTotal = 0;
      for (const sc of ch.subChapters) {
        for (const art of sc.articles) {
          chArticles++;
          totalArticles++;
          if (art.unitPrice && art.quantity) {
            chTotal += art.unitPrice * art.quantity;
          }
        }
      }
      const totalStr = chTotal > 0 ? ` (€${Math.round(chTotal).toLocaleString("pt-PT")})` : "";
      sections.push(`- ${ch.code} ${ch.name}: ${chArticles} artigos${totalStr}`);
    }
    sections.push(`Total: ${totalArticles} artigos em ${wbsProject.chapters.length} capítulos`);
  }

  // ── PDF Text (first 3000 words) ────────────────────────────
  if (pdfText && pdfText.trim().length > 50) {
    sections.push("");
    sections.push(`## MEMÓRIA DESCRITIVA (excerto)`);
    const words = pdfText.trim().split(/\s+/);
    const truncated = words.slice(0, 3000).join(" ");
    sections.push(truncated);
    if (words.length > 3000) {
      sections.push(`[... truncado, ${words.length - 3000} palavras omitidas]`);
    }
  }

  // ── AVAC, Fire Safety, Electrical summary (if notable) ────
  const specialties: string[] = [];
  if (project.avac?.hasHVACProject) specialties.push("AVAC");
  if (project.fireSafety?.utilizationType) specialties.push(`SCIE (UT ${project.fireSafety.utilizationType})`);
  if (project.electrical?.hasElectricalProject) specialties.push("Elétrica");
  if (project.elevators?.numberOfElevators) specialties.push(`${project.elevators.numberOfElevators} elevador(es)`);
  if (specialties.length > 0) {
    sections.push("");
    sections.push(`## ESPECIALIDADES: ${specialties.join(", ")}`);
  }

  return sections.join("\n");
}

// ============================================================
// Helpers
// ============================================================

function translateBuildingType(type: string): string {
  const map: Record<string, string> = {
    residential: "Residencial",
    commercial: "Comercial / Serviços",
    mixed: "Uso misto",
    industrial: "Industrial",
    educational: "Educação",
    healthcare: "Saúde",
    hospitality: "Hotelaria",
    sports: "Desportivo",
    cultural: "Cultural",
    religious: "Religioso",
    parking: "Estacionamento",
    warehouse: "Armazém",
  };
  return map[type] || type || "Não definido";
}
