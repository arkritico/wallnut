import type {
  BuildingProject,
  AnalysisResult,
  Finding,
  Recommendation,
  RegulationSummary,
  Severity,
  EnergyClass,
  RegulationArea,
} from "./types";
import {
  MAX_U_VALUES,
  MAX_SOLAR_FACTOR,
  REFERENCE_VENTILATION,
  MAX_LINEAR_THERMAL_BRIDGE,
  ACOUSTIC_REQUIREMENTS,
  FIRE_RESISTANCE,
  MAX_EVACUATION_DISTANCE,
  MIN_EXIT_WIDTHS,
  FIRE_DETECTION_REQUIREMENTS,
  ACCESSIBILITY_REQUIREMENTS,
  RENEWABLE_REQUIREMENTS,
  ELECTRICAL_REQUIREMENTS,
  ITED_REQUIREMENTS,
  ITUR_REQUIREMENTS,
  GAS_REQUIREMENTS,
  WATER_DRAINAGE_REQUIREMENTS,
  STRUCTURAL_REQUIREMENTS,
  ELEVATOR_REQUIREMENTS,
  LICENSING_REQUIREMENTS,
  WASTE_REQUIREMENTS,
  CIVIL_CODE_BUILDING,
  AVAC_REQUIREMENTS,
  SCIE_NOTAS_TECNICAS,
  ELECTRICAL_TECHNICAL_DOCS,
  ANACOM_TECHNICAL_DOCS,
} from "./regulations";

let findingCounter = 0;
let recommendationCounter = 0;

function nextFindingId(): string {
  return `F-${++findingCounter}`;
}

function nextRecommendationId(): string {
  return `R-${++recommendationCounter}`;
}

export function analyzeProject(project: BuildingProject): AnalysisResult {
  findingCounter = 0;
  recommendationCounter = 0;

  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];

  // Run all analysis modules (ordered by project specialty hierarchy)
  findings.push(...analyzeArchitecture(project));     // 1. Architecture + Civil Code
  findings.push(...analyzeStructural(project));        // 2. Structures
  findings.push(...analyzeFireSafety(project));        // 3. Fire Safety (SCIE + NTs)
  findings.push(...analyzeAVAC(project));              // 4. AVAC
  findings.push(...analyzeWaterDrainage(project));     // 5. Water & Drainage
  findings.push(...analyzeGas(project));               // 6. Gas
  findings.push(...analyzeElectrical(project));        // 7. Electrical
  findings.push(...analyzeTelecom(project));           // 8. ITED/ITUR
  findings.push(...analyzeThermal(project));           // 9. Thermal
  findings.push(...analyzeAcoustic(project));          // 10. Acoustic
  findings.push(...analyzeAccessibility(project));     // 11. Accessibility
  findings.push(...analyzeEnergy(project));            // 12. Energy
  findings.push(...analyzeElevators(project));         // 13. Elevators
  findings.push(...analyzeLicensing(project));         // 14. Licensing
  findings.push(...analyzeWaste(project));             // 15. Waste
  findings.push(...analyzeGeneral(project));           // 16. General

  recommendations.push(...generateRecommendations(project, findings));

  // Build regulation summaries
  const regulationSummary = buildRegulationSummary(findings);

  // Calculate overall score and energy class
  const overallScore = calculateOverallScore(findings);
  const energyClass = estimateEnergyClass(project);

  return {
    projectName: project.name,
    overallScore,
    energyClass,
    findings,
    recommendations,
    regulationSummary,
  };
}

// ============================================================
// ARCHITECTURE ANALYSIS (RGEU + Civil Code)
// ============================================================

function analyzeArchitecture(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { architecture } = project;

  // Check architectural project / permit design
  if (!architecture.hasBuildingPermitDesign && !project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "architecture",
      regulation: "RJUE - DL 555/99",
      article: "Art. 11.º - Projeto de Arquitetura",
      description: `O projeto de arquitetura é a base de todo o processo de licenciamento. Deve ser subscrito por arquiteto inscrito na Ordem dos Arquitetos e incluir peças desenhadas e memória descritiva.`,
      severity: "critical",
    });
  }

  // Check RGEU compliance
  if (!architecture.meetsRGEU) {
    findings.push({
      id: nextFindingId(),
      area: "architecture",
      regulation: "RGEU - DL 38382/1951",
      article: "Arts. 65.º-75.º",
      description: `A conformidade com o RGEU deve ser verificada: pé-direito mínimo (2.70m habitável, 2.40m não habitável), áreas mínimas dos compartimentos, iluminação e ventilação naturais.`,
      severity: "warning",
    });
  }

  // Check ceiling height
  if (architecture.ceilingHeight !== undefined) {
    const minHeight = project.buildingType === "commercial" ? 3.00 : 2.70;
    if (architecture.ceilingHeight < minHeight) {
      findings.push({
        id: nextFindingId(),
        area: "architecture",
        regulation: "RGEU - DL 38382/1951",
        article: "Art. 65.º - Pé-direito",
        description: `O pé-direito (${architecture.ceilingHeight}m) é inferior ao mínimo regulamentar para espaços ${project.buildingType === "commercial" ? "comerciais" : "habitáveis"}.`,
        severity: "critical",
        currentValue: `${architecture.ceilingHeight}m`,
        requiredValue: `≥ ${minHeight}m`,
      });
    }
  }

  // Check natural light
  if (!architecture.hasNaturalLight) {
    findings.push({
      id: nextFindingId(),
      area: "architecture",
      regulation: "RGEU - DL 38382/1951",
      article: "Art. 71.º - Iluminação Natural",
      description: `Todos os compartimentos de habitação principal (salas, quartos) devem ter iluminação natural direta com vãos de área não inferior a 10% da área do compartimento.`,
      severity: "critical",
    });
  }

  // Check cross ventilation
  if (!architecture.hasCrossVentilation) {
    findings.push({
      id: nextFindingId(),
      area: "architecture",
      regulation: "RGEU - DL 38382/1951",
      article: "Art. 73.º - Ventilação Natural",
      description: `O RGEU exige ventilação natural cruzada nos fogos de habitação. Deve ser garantida a possibilidade de ventilação através de fachadas opostas ou perpendiculares.`,
      severity: "warning",
    });
  }

  // --- Civil Code checks ---

  // Window distance to neighbor (Art. 1360.º)
  if (architecture.windowDistanceToNeighbor !== undefined) {
    const minDist = CIVIL_CODE_BUILDING.neighborRelations.art1360.minDistance;
    if (architecture.windowDistanceToNeighbor < minDist) {
      findings.push({
        id: nextFindingId(),
        area: "architecture",
        regulation: "Código Civil",
        article: CIVIL_CODE_BUILDING.neighborRelations.art1360.article,
        description: `${CIVIL_CODE_BUILDING.neighborRelations.art1360.title}: A distância de janelas/varandas ao limite do prédio vizinho (${architecture.windowDistanceToNeighbor}m) é inferior ao mínimo legal de ${minDist}m. As janelas/portas/varandas sobre prédio alheio devem distar pelo menos 1.5m do limite.`,
        severity: "critical",
        currentValue: `${architecture.windowDistanceToNeighbor}m`,
        requiredValue: `≥ ${minDist}m`,
      });
    } else {
      findings.push({
        id: nextFindingId(),
        area: "architecture",
        regulation: "Código Civil",
        article: CIVIL_CODE_BUILDING.neighborRelations.art1360.article,
        description: `Distância de janelas ao limite vizinho cumpre o mínimo legal.`,
        severity: "pass",
      });
    }
  }

  // Rainwater drainage (Art. 1362.º - estilicídio)
  if (!architecture.hasRainwaterDrainage) {
    findings.push({
      id: nextFindingId(),
      area: "architecture",
      regulation: "Código Civil",
      article: CIVIL_CODE_BUILDING.neighborRelations.art1362.article,
      description: `${CIVIL_CODE_BUILDING.neighborRelations.art1362.title}: É proibido que as águas pluviais do telhado escorram diretamente para o terreno vizinho. Devem ser recolhidas e conduzidas por caleiras e tubos de queda.`,
      severity: "warning",
    });
  }

  // Horizontal property
  if (architecture.isHorizontalProperty) {
    if (!architecture.respectsCommonParts) {
      findings.push({
        id: nextFindingId(),
        area: "architecture",
        regulation: "Código Civil",
        article: CIVIL_CODE_BUILDING.horizontalProperty.art1422.article,
        description: `${CIVIL_CODE_BUILDING.horizontalProperty.art1422.title}: Em propriedade horizontal, é proibido prejudicar a segurança, linha arquitetónica ou arranjo estético do edifício. Alterações à fachada, estrutura e partes comuns requerem autorização da assembleia de condóminos.`,
        severity: "critical",
      });
    }
    findings.push({
      id: nextFindingId(),
      area: "architecture",
      regulation: "Código Civil",
      article: CIVIL_CODE_BUILDING.horizontalProperty.art1421.article,
      description: `${CIVIL_CODE_BUILDING.horizontalProperty.art1421.title}: As partes comuns imperativas (solo, telhado, colunas, paredes mestras, escadas, elevadores, entradas) não podem ser objeto de utilização exclusiva por qualquer condómino.`,
      severity: "info",
    });
  }

  // Civil code general compliance
  if (!architecture.hasCivilCodeCompliance) {
    findings.push({
      id: nextFindingId(),
      area: "architecture",
      regulation: "Código Civil",
      article: "Arts. 1344.º-1422.º",
      description: `O projeto deve verificar conformidade com o Código Civil no que respeita a: emissões para vizinhos (Art. 1346.º), distâncias de construções (Art. 1349.º), aberturas de janelas (Art. 1360.º), frestas (Art. 1361.º), estilicídio (Art. 1362.º) e regime de propriedade horizontal se aplicável.`,
      severity: "warning",
    });
  }

  return findings;
}

// ============================================================
// THERMAL ANALYSIS (REH / RECS)
// ============================================================

function analyzeThermal(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { envelope, location } = project;
  const winterZone = location.climateZoneWinter;
  const summerZone = location.climateZoneSummer;

  // Check external wall U-value
  const maxWallU = MAX_U_VALUES.walls[winterZone];
  if (envelope.externalWallUValue > maxWallU) {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Anexo - Requisitos de Qualidade Térmica",
      description: `O coeficiente de transmissão térmica das paredes exteriores (${envelope.externalWallUValue} W/(m².K)) excede o valor máximo admissível para a zona climática ${winterZone}.`,
      severity: "critical",
      currentValue: `${envelope.externalWallUValue} W/(m².K)`,
      requiredValue: `≤ ${maxWallU} W/(m².K)`,
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Anexo - Requisitos de Qualidade Térmica",
      description: `O coeficiente de transmissão térmica das paredes exteriores cumpre o valor máximo para a zona ${winterZone}.`,
      severity: "pass",
      currentValue: `${envelope.externalWallUValue} W/(m².K)`,
      requiredValue: `≤ ${maxWallU} W/(m².K)`,
    });
  }

  // Check roof U-value
  const maxRoofU = MAX_U_VALUES.roofs[winterZone];
  if (envelope.roofUValue > maxRoofU) {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Anexo - Requisitos de Qualidade Térmica",
      description: `O coeficiente de transmissão térmica da cobertura (${envelope.roofUValue} W/(m².K)) excede o valor máximo admissível para a zona climática ${winterZone}.`,
      severity: "critical",
      currentValue: `${envelope.roofUValue} W/(m².K)`,
      requiredValue: `≤ ${maxRoofU} W/(m².K)`,
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Anexo - Requisitos de Qualidade Térmica",
      description: `O coeficiente de transmissão térmica da cobertura cumpre o valor máximo para a zona ${winterZone}.`,
      severity: "pass",
      currentValue: `${envelope.roofUValue} W/(m².K)`,
      requiredValue: `≤ ${maxRoofU} W/(m².K)`,
    });
  }

  // Check floor U-value
  const maxFloorU = MAX_U_VALUES.floors[winterZone];
  if (envelope.floorUValue > maxFloorU) {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Anexo - Requisitos de Qualidade Térmica",
      description: `O coeficiente de transmissão térmica do pavimento (${envelope.floorUValue} W/(m².K)) excede o valor máximo admissível para a zona climática ${winterZone}.`,
      severity: "warning",
      currentValue: `${envelope.floorUValue} W/(m².K)`,
      requiredValue: `≤ ${maxFloorU} W/(m².K)`,
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Anexo - Requisitos de Qualidade Térmica",
      description: `O coeficiente de transmissão térmica do pavimento cumpre o valor máximo para a zona ${winterZone}.`,
      severity: "pass",
      currentValue: `${envelope.floorUValue} W/(m².K)`,
      requiredValue: `≤ ${maxFloorU} W/(m².K)`,
    });
  }

  // Check window U-value
  const maxWindowU = MAX_U_VALUES.windows[winterZone];
  if (envelope.windowUValue > maxWindowU) {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Anexo - Requisitos de Qualidade Térmica",
      description: `O coeficiente de transmissão térmica dos vãos envidraçados (${envelope.windowUValue} W/(m².K)) excede o valor máximo para a zona ${winterZone}.`,
      severity: "critical",
      currentValue: `${envelope.windowUValue} W/(m².K)`,
      requiredValue: `≤ ${maxWindowU} W/(m².K)`,
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Anexo - Requisitos de Qualidade Térmica",
      description: `O coeficiente de transmissão térmica dos vãos envidraçados cumpre o valor máximo para a zona ${winterZone}.`,
      severity: "pass",
      currentValue: `${envelope.windowUValue} W/(m².K)`,
      requiredValue: `≤ ${maxWindowU} W/(m².K)`,
    });
  }

  // Check solar factor
  const maxSolar = MAX_SOLAR_FACTOR[summerZone];
  if (envelope.windowSolarFactor > maxSolar) {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Controlo de Ganhos Solares",
      description: `O fator solar dos vãos envidraçados (${envelope.windowSolarFactor}) excede o máximo admissível para a zona ${summerZone}. Considerar proteções solares exteriores.`,
      severity: "warning",
      currentValue: `g = ${envelope.windowSolarFactor}`,
      requiredValue: `g ≤ ${maxSolar}`,
    });
  }

  // Check ventilation
  const minVent = project.buildingType === "residential"
    ? REFERENCE_VENTILATION.residential.minimum
    : REFERENCE_VENTILATION.commercial.minimum;
  if (envelope.airChangesPerHour < minVent) {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH / RECS",
      article: "Requisitos de Ventilação",
      description: `A taxa de renovação de ar (${envelope.airChangesPerHour} h⁻¹) é inferior ao mínimo regulamentar. Risco de problemas de qualidade do ar interior e condensações.`,
      severity: "critical",
      currentValue: `${envelope.airChangesPerHour} h⁻¹`,
      requiredValue: `≥ ${minVent} h⁻¹`,
    });
  }

  // Check thermal bridges
  if (envelope.linearThermalBridges > MAX_LINEAR_THERMAL_BRIDGE) {
    findings.push({
      id: nextFindingId(),
      area: "thermal",
      regulation: "REH - Portaria 349-B/2013",
      article: "Pontes Térmicas Lineares",
      description: `O coeficiente de transmissão térmica linear médio das pontes térmicas (${envelope.linearThermalBridges} W/(m.K)) é excessivo. Recomenda-se correção das pontes térmicas.`,
      severity: "warning",
      currentValue: `${envelope.linearThermalBridges} W/(m.K)`,
      requiredValue: `≤ ${MAX_LINEAR_THERMAL_BRIDGE} W/(m.K)`,
    });
  }

  return findings;
}

// ============================================================
// FIRE SAFETY ANALYSIS (SCIE)
// ============================================================

function analyzeFireSafety(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { fireSafety, buildingType, numberOfFloors } = project;
  const category = fireSafety.riskCategory;

  // Check fire resistance
  const buildingCategory = buildingType === "residential" ? "residential" : "commercial";
  const requiredREI = FIRE_RESISTANCE[buildingCategory][category];
  if (fireSafety.fireResistanceOfStructure < requiredREI) {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 15º - Resistência ao Fogo",
      description: `A resistência ao fogo da estrutura (REI ${fireSafety.fireResistanceOfStructure}) é inferior ao exigido para a categoria de risco ${category}.`,
      severity: "critical",
      currentValue: `REI ${fireSafety.fireResistanceOfStructure}`,
      requiredValue: `REI ${requiredREI}`,
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 15º - Resistência ao Fogo",
      description: `A resistência ao fogo da estrutura cumpre o exigido para a categoria de risco ${category}.`,
      severity: "pass",
      currentValue: `REI ${fireSafety.fireResistanceOfStructure}`,
      requiredValue: `REI ${requiredREI}`,
    });
  }

  // Check evacuation distances
  const maxEvacDist = fireSafety.numberOfExits > 1
    ? MAX_EVACUATION_DISTANCE.multipleDirections
    : MAX_EVACUATION_DISTANCE.singleDirection;
  if (fireSafety.maxEvacuationDistance > maxEvacDist) {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 56º - Distâncias de Evacuação",
      description: `A distância máxima de evacuação (${fireSafety.maxEvacuationDistance}m) excede o limite regulamentar para ${fireSafety.numberOfExits > 1 ? "caminhos com alternativa" : "impasse"}.`,
      severity: "critical",
      currentValue: `${fireSafety.maxEvacuationDistance} m`,
      requiredValue: `≤ ${maxEvacDist} m`,
    });
  }

  // Check exit width
  const minWidth = MIN_EXIT_WIDTHS.unitOfPassage;
  if (fireSafety.evacuationRouteWidth < minWidth) {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 56º - Largura das Saídas",
      description: `A largura dos caminhos de evacuação (${fireSafety.evacuationRouteWidth}m) é inferior à unidade de passagem mínima.`,
      severity: "critical",
      currentValue: `${fireSafety.evacuationRouteWidth} m`,
      requiredValue: `≥ ${minWidth} m`,
    });
  }

  // Check fire detection requirements
  const detReqs = FIRE_DETECTION_REQUIREMENTS[buildingCategory][category];
  if (detReqs.detection && !fireSafety.hasFireDetection) {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 125º - Deteção de Incêndio",
      description: `O sistema de deteção automática de incêndio é obrigatório para a categoria de risco ${category} mas não está previsto no projeto.`,
      severity: "critical",
    });
  }

  if (detReqs.alarm && !fireSafety.hasFireAlarm) {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 130º - Alarme",
      description: `O sistema de alarme é obrigatório para esta utilização-tipo e categoria de risco, mas não está previsto.`,
      severity: "critical",
    });
  }

  if (detReqs.sprinklers && !fireSafety.hasSprinklers) {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 174º - Sistemas de Extinção Automática",
      description: `O sistema de extinção automática por água (sprinklers) é obrigatório para a categoria de risco ${category} mas não está previsto.`,
      severity: "critical",
    });
  }

  if (!fireSafety.hasEmergencyLighting && numberOfFloors > 1) {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 113º - Iluminação de Emergência",
      description: `A iluminação de emergência é obrigatória em edifícios com mais de 1 piso, mas não está prevista no projeto.`,
      severity: "warning",
    });
  }

  if (!fireSafety.hasFireExtinguishers) {
    findings.push({
      id: nextFindingId(),
      area: "fire_safety",
      regulation: "SCIE - Portaria 1532/2008",
      article: "Art. 163º - Extintores",
      description: `A existência de extintores portáteis é obrigatória em todas as utilizações-tipo. Devem ser previstos extintores adequados.`,
      severity: "warning",
    });
  }

  return findings;
}

// ============================================================
// AVAC ANALYSIS (HVAC - RECS/REH + DL 118/2013)
// ============================================================

function analyzeAVAC(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { avac } = project;
  const isCommercial = project.buildingType === "commercial" || project.buildingType === "mixed";

  // Check HVAC project (required for commercial > 25kW)
  if (isCommercial && !avac.hasHVACProject) {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "RECS - DL 118/2013",
      article: "Projeto AVAC",
      description: `Edifícios de comércio e serviços requerem projeto de AVAC elaborado por engenheiro mecânico ou eletrotécnico. O projeto deve incluir cálculos de cargas térmicas, dimensionamento de equipamentos e rede de condutas.`,
      severity: "critical",
    });
  }

  // Check kitchen extraction
  if (!avac.hasKitchenExtraction) {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "RGEU / REH",
      article: "Extração de Cozinha",
      description: `A cozinha deve ter sistema de extração mecânica com caudal mínimo de ${AVAC_REQUIREMENTS.ventilationRates.residential.kitchens} m³/h para remoção de vapores, odores e produtos de combustão.`,
      severity: "critical",
    });
  }

  // Check bathroom extraction
  if (!avac.hasBathroomExtraction) {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "RGEU / REH",
      article: "Extração de Instalações Sanitárias",
      description: `As instalações sanitárias sem janela (ou mesmo com janela, como boa prática) devem ter extração mecânica com caudal mínimo de ${AVAC_REQUIREMENTS.ventilationRates.residential.bathrooms} m³/h.`,
      severity: "warning",
    });
  }

  // Check ventilation system for commercial
  if (isCommercial && !avac.hasVentilationSystem) {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "RECS - Portaria 353-A/2013",
      article: "Ventilação Mecânica",
      description: `Edifícios de comércio e serviços devem ter sistema de ventilação mecânica que garanta os caudais mínimos de ar novo por pessoa (escritórios: ${AVAC_REQUIREMENTS.ventilationRates.commercial.offices} m³/(h.pessoa)).`,
      severity: "critical",
    });
  }

  // Check indoor air quality control (RECS)
  if (isCommercial && !avac.hasAirQualityControl) {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "RECS - Portaria 353-A/2013",
      article: "Qualidade do Ar Interior (QAI)",
      description: `O RECS exige monitorização da qualidade do ar interior em edifícios de comércio e serviços: CO₂ máx. ${AVAC_REQUIREMENTS.indoorAirQuality.maxCO2} ppm, PM2.5 máx. ${AVAC_REQUIREMENTS.indoorAirQuality.maxPM2_5} μg/m³, TVOC máx. ${AVAC_REQUIREMENTS.indoorAirQuality.maxTVOC} μg/m³.`,
      severity: "warning",
    });
  }

  // Check radon protection (DL 108/2018)
  if (!avac.hasRadonProtection) {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "DL 108/2018",
      article: "Proteção contra Radão",
      description: `O DL 108/2018 estabelece o nível de referência de ${AVAC_REQUIREMENTS.indoorAirQuality.maxRadon} Bq/m³ para concentração de radão em edifícios. Em zonas de risco (granito), devem ser previstas medidas de mitigação (ventilação do solo, membranas).`,
      severity: "info",
    });
  }

  // Check maintenance plan
  if (isCommercial && !avac.hasMaintenancePlan) {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "RECS - DL 118/2013",
      article: "Plano de Manutenção",
      description: `Edifícios de comércio e serviços com potência instalada > 25 kW requerem plano de manutenção preventiva (PMP) e técnico responsável pelo STE (Sistema Técnico de Edifício). Qualificação mínima: ${AVAC_REQUIREMENTS.maintenance.technicianQualification}.`,
      severity: "warning",
    });
  }

  // Check F-Gas compliance
  if (avac.installedHVACPower && avac.installedHVACPower > 0 && !avac.hasFGasCompliance) {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "Regulamento F-Gas (EU 517/2014)",
      article: "Gases Fluorados",
      description: `Equipamentos de refrigeração e AC com gases fluorados requerem: técnicos certificados, verificações de fugas periódicas, registo de intervenções e cumprimento dos limites de GWP.`,
      severity: "warning",
    });
  }

  // Natural ventilation checks for residential
  if (!isCommercial && avac.ventilationType === "natural") {
    findings.push({
      id: nextFindingId(),
      area: "avac",
      regulation: "REH - DL 118/2013",
      article: "Ventilação Natural",
      description: `O sistema de ventilação é exclusivamente natural. Garantir admissão de ar pelas fachadas principais e extração por condutas nas cozinhas e WC. Caudal mínimo: ${AVAC_REQUIREMENTS.ventilationRates.residential.livingAreas} h⁻¹.`,
      severity: "info",
    });
  }

  return findings;
}

// ============================================================
// ACCESSIBILITY ANALYSIS (DL 163/2006)
// ============================================================

function analyzeAccessibility(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { accessibility, numberOfFloors } = project;
  const reqs = ACCESSIBILITY_REQUIREMENTS;

  // Check entrance
  if (!accessibility.hasAccessibleEntrance) {
    findings.push({
      id: nextFindingId(),
      area: "accessibility",
      regulation: "DL 163/2006",
      article: "Secção 2.1 - Percurso Acessível",
      description: `O edifício não possui entrada acessível. É obrigatório garantir pelo menos um percurso acessível desde a via pública até à entrada principal.`,
      severity: "critical",
    });
  }

  // Check elevator requirement
  const elevatorThreshold = project.isRehabilitation
    ? reqs.elevatorRequired.rehabilitation
    : reqs.elevatorRequired.newBuildings;
  if (numberOfFloors >= elevatorThreshold && !accessibility.hasElevator) {
    findings.push({
      id: nextFindingId(),
      area: "accessibility",
      regulation: "DL 163/2006",
      article: "Secção 2.6 - Ascensores",
      description: `O edifício possui ${numberOfFloors} pisos. A instalação de ascensor é obrigatória em edifícios ${project.isRehabilitation ? "existentes com ≥5" : "novos com ≥4"} pisos.`,
      severity: "critical",
    });
  }

  // Check elevator dimensions if present
  if (accessibility.hasElevator) {
    if (accessibility.elevatorMinWidth && accessibility.elevatorMinWidth < reqs.elevator.minWidth) {
      findings.push({
        id: nextFindingId(),
        area: "accessibility",
        regulation: "DL 163/2006",
        article: "Secção 2.6 - Dimensões do Ascensor",
        description: `A largura da cabina do ascensor (${accessibility.elevatorMinWidth}m) é inferior ao mínimo regulamentar.`,
        severity: "warning",
        currentValue: `${accessibility.elevatorMinWidth} m`,
        requiredValue: `≥ ${reqs.elevator.minWidth} m`,
      });
    }
    if (accessibility.elevatorMinDepth && accessibility.elevatorMinDepth < reqs.elevator.minDepth) {
      findings.push({
        id: nextFindingId(),
        area: "accessibility",
        regulation: "DL 163/2006",
        article: "Secção 2.6 - Dimensões do Ascensor",
        description: `A profundidade da cabina do ascensor (${accessibility.elevatorMinDepth}m) é inferior ao mínimo regulamentar.`,
        severity: "warning",
        currentValue: `${accessibility.elevatorMinDepth} m`,
        requiredValue: `≥ ${reqs.elevator.minDepth} m`,
      });
    }
  }

  // Check door widths
  if (accessibility.doorWidths < reqs.doorWidth.accessible) {
    findings.push({
      id: nextFindingId(),
      area: "accessibility",
      regulation: "DL 163/2006",
      article: "Secção 2.3 - Portas",
      description: `A largura mínima das portas (${accessibility.doorWidths}m) é inferior ao exigido para acessibilidade.`,
      severity: accessibility.doorWidths < reqs.doorWidth.minimum ? "critical" : "warning",
      currentValue: `${accessibility.doorWidths} m`,
      requiredValue: `≥ ${reqs.doorWidth.accessible} m`,
    });
  }

  // Check corridor widths
  if (accessibility.corridorWidths < reqs.corridorWidth.accessible) {
    findings.push({
      id: nextFindingId(),
      area: "accessibility",
      regulation: "DL 163/2006",
      article: "Secção 2.2 - Corredores",
      description: `A largura mínima dos corredores (${accessibility.corridorWidths}m) é inferior ao exigido para acessibilidade.`,
      severity: accessibility.corridorWidths < reqs.corridorWidth.minimum ? "critical" : "warning",
      currentValue: `${accessibility.corridorWidths} m`,
      requiredValue: `≥ ${reqs.corridorWidth.accessible} m`,
    });
  }

  // Check accessible WC
  if (!accessibility.hasAccessibleWC && (project.buildingType !== "residential" || (project.numberOfDwellings ?? 0) > 1)) {
    findings.push({
      id: nextFindingId(),
      area: "accessibility",
      regulation: "DL 163/2006",
      article: "Secção 2.9 - Instalações Sanitárias",
      description: `O projeto não prevê instalação sanitária acessível. É obrigatória em edifícios abertos ao público e em edifícios de habitação coletiva.`,
      severity: "warning",
    });
  }

  // Check ramp gradient
  if (accessibility.rampGradient && accessibility.rampGradient > reqs.rampGradient.max6m) {
    findings.push({
      id: nextFindingId(),
      area: "accessibility",
      regulation: "DL 163/2006",
      article: "Secção 2.5 - Rampas",
      description: `A inclinação da rampa (${accessibility.rampGradient}%) excede o máximo regulamentar.`,
      severity: "warning",
      currentValue: `${accessibility.rampGradient}%`,
      requiredValue: `≤ ${reqs.rampGradient.max6m}%`,
    });
  }

  return findings;
}

// ============================================================
// ENERGY ANALYSIS
// ============================================================

function analyzeEnergy(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { systems } = project;

  // Check renewable energy contribution
  if (!systems.hasSolarPV && !systems.hasSolarThermal) {
    findings.push({
      id: nextFindingId(),
      area: "energy",
      regulation: "SCE - DL 101-D/2020",
      article: "Art. 29º - Energias Renováveis",
      description: `O projeto não prevê qualquer sistema de aproveitamento de energias renováveis. Os edifícios novos devem satisfazer uma componente de energia renovável conforme o SCE.`,
      severity: project.isRehabilitation ? "warning" : "critical",
    });
  }

  // Check solar thermal for residential with DHW
  if (
    project.buildingType === "residential" &&
    !project.isRehabilitation &&
    !systems.hasSolarThermal &&
    systems.dhwSystem !== "heat_pump" &&
    systems.dhwSystem !== "thermodynamic"
  ) {
    const required = RENEWABLE_REQUIREMENTS.minSolarThermalPerDwelling * (project.numberOfDwellings ?? 1);
    findings.push({
      id: nextFindingId(),
      area: "energy",
      regulation: "REH - Portaria 349-B/2013",
      article: "Contribuição Solar Mínima",
      description: `Em edifícios residenciais novos sem sistema solar térmico ou bomba de calor para AQS, é obrigatória a instalação de coletores solares térmicos (mínimo ~${required.toFixed(1)} m²).`,
      severity: "warning",
    });
  }

  // Check heating system efficiency
  if (systems.heatingSystem === "electric_radiator") {
    findings.push({
      id: nextFindingId(),
      area: "energy",
      regulation: "SCE - DL 101-D/2020",
      article: "Eficiência dos Sistemas",
      description: `O aquecimento por radiador elétrico (efeito Joule) é o sistema menos eficiente. Penaliza significativamente a classificação energética do edifício.`,
      severity: "warning",
    });
  }

  // Check DHW system
  if (systems.dhwSystem === "electric") {
    findings.push({
      id: nextFindingId(),
      area: "energy",
      regulation: "SCE - DL 101-D/2020",
      article: "Eficiência dos Sistemas de AQS",
      description: `A produção de AQS por termoacumulador elétrico é pouco eficiente. Considerar bomba de calor ou sistema solar térmico.`,
      severity: "warning",
    });
  }

  // Check lighting for commercial
  if (project.buildingType === "commercial" && systems.lightingPowerDensity) {
    const maxLPD = 10; // W/m² reference
    if (systems.lightingPowerDensity > maxLPD) {
      findings.push({
        id: nextFindingId(),
        area: "energy",
        regulation: "RECS",
        article: "Iluminação Interior",
        description: `A densidade de potência de iluminação (${systems.lightingPowerDensity} W/m²) é superior ao valor de referência. Considerar iluminação LED.`,
        severity: "warning",
        currentValue: `${systems.lightingPowerDensity} W/m²`,
        requiredValue: `≤ ${maxLPD} W/m²`,
      });
    }
  }

  return findings;
}

// ============================================================
// GENERAL / RGEU ANALYSIS
// ============================================================

function analyzeGeneral(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];

  // Check building height vs floors ratio (rough check)
  const avgFloorHeight = project.buildingHeight / project.numberOfFloors;
  if (avgFloorHeight < 2.70 && project.buildingType === "residential") {
    findings.push({
      id: nextFindingId(),
      area: "general",
      regulation: "RGEU",
      article: "Art. 65º - Pé-Direito Mínimo",
      description: `A altura média por piso (${avgFloorHeight.toFixed(2)}m) sugere que o pé-direito livre poderá ser inferior ao mínimo de 2,70m exigido pelo RGEU para compartimentos habitáveis.`,
      severity: "warning",
      currentValue: `~${avgFloorHeight.toFixed(2)} m/piso`,
      requiredValue: `≥ 2.70 m (pé-direito livre)`,
    });
  }

  if (avgFloorHeight < 3.00 && project.buildingType === "commercial") {
    findings.push({
      id: nextFindingId(),
      area: "general",
      regulation: "RGEU",
      article: "Art. 65º - Pé-Direito Mínimo",
      description: `A altura média por piso (${avgFloorHeight.toFixed(2)}m) sugere que o pé-direito livre poderá ser inferior ao mínimo de 3,00m exigido para espaços comerciais.`,
      severity: "warning",
      currentValue: `~${avgFloorHeight.toFixed(2)} m/piso`,
      requiredValue: `≥ 3.00 m (pé-direito livre)`,
    });
  }

  // Check window-to-floor ratio (natural lighting)
  const windowToFloorRatio = project.envelope.windowArea / project.usableFloorArea;
  if (windowToFloorRatio < 0.10) {
    findings.push({
      id: nextFindingId(),
      area: "general",
      regulation: "RGEU",
      article: "Art. 71º - Iluminação Natural",
      description: `A relação entre a área de vãos envidraçados e a área útil (${(windowToFloorRatio * 100).toFixed(1)}%) é inferior ao mínimo de 10% recomendado pelo RGEU para garantir iluminação natural adequada.`,
      severity: "warning",
      currentValue: `${(windowToFloorRatio * 100).toFixed(1)}%`,
      requiredValue: `≥ 10%`,
    });
  }

  return findings;
}

// ============================================================
// ELECTRICAL ANALYSIS (RTIEBT)
// ============================================================

function analyzeElectrical(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { electrical } = project;

  // Check power supply vs contracted power
  if (electrical.contractedPower > ELECTRICAL_REQUIREMENTS.threePhaseThreshold && electrical.supplyType === "single_phase") {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 311 - Alimentação",
      description: `A potência contratada (${electrical.contractedPower} kVA) excede o limite para alimentação monofásica (${ELECTRICAL_REQUIREMENTS.threePhaseThreshold} kVA). É obrigatória alimentação trifásica.`,
      severity: "critical",
      currentValue: `${electrical.contractedPower} kVA (monofásico)`,
      requiredValue: `Trifásico acima de ${ELECTRICAL_REQUIREMENTS.threePhaseThreshold} kVA`,
    });
  }

  // Check RCD (diferencial)
  if (!electrical.hasResidualCurrentDevice) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 531.2 - Proteção Diferencial",
      description: `O projeto não prevê dispositivo diferencial (RCD). A proteção diferencial é obrigatória em todas as instalações elétricas de baixa tensão.`,
      severity: "critical",
    });
  } else {
    if (electrical.rcdSensitivity > ELECTRICAL_REQUIREMENTS.rcd.highSensitivity) {
      findings.push({
        id: nextFindingId(),
        area: "electrical",
        regulation: "RTIEBT",
        article: "Secção 531.2 - Sensibilidade do Diferencial",
        description: `A sensibilidade do diferencial (${electrical.rcdSensitivity} mA) é insuficiente para circuitos de tomadas e zonas húmidas. É obrigatória proteção com sensibilidade ≤ 30 mA.`,
        severity: "critical",
        currentValue: `${electrical.rcdSensitivity} mA`,
        requiredValue: `≤ ${ELECTRICAL_REQUIREMENTS.rcd.highSensitivity} mA`,
      });
    } else {
      findings.push({
        id: nextFindingId(),
        area: "electrical",
        regulation: "RTIEBT",
        article: "Secção 531.2 - Proteção Diferencial",
        description: `A proteção diferencial com sensibilidade de ${electrical.rcdSensitivity} mA cumpre o exigido.`,
        severity: "pass",
        currentValue: `${electrical.rcdSensitivity} mA`,
        requiredValue: `≤ ${ELECTRICAL_REQUIREMENTS.rcd.highSensitivity} mA`,
      });
    }
  }

  // Check earthing system
  if (!electrical.hasEarthingSystem) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 542 - Terra de Proteção",
      description: `O projeto não prevê sistema de terra de proteção. O elétrodo de terra e a ligação à terra são obrigatórios em todas as instalações.`,
      severity: "critical",
    });
  } else if (electrical.earthingResistance && electrical.earthingResistance > ELECTRICAL_REQUIREMENTS.maxEarthingResistance.recommended) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 542 - Resistência de Terra",
      description: `A resistência do elétrodo de terra (${electrical.earthingResistance} Ω) é superior ao valor recomendado. Considerar melhorar o elétrodo de terra.`,
      severity: "warning",
      currentValue: `${electrical.earthingResistance} Ω`,
      requiredValue: `≤ ${ELECTRICAL_REQUIREMENTS.maxEarthingResistance.recommended} Ω (recomendado)`,
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 542 - Terra de Proteção",
      description: `O sistema de terra de proteção está previsto e a resistência cumpre os valores recomendados.`,
      severity: "pass",
    });
  }

  // Check equipotential bonding
  if (!electrical.hasEquipotentialBonding) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 544 - Ligações Equipotenciais",
      description: `Não estão previstas ligações equipotenciais. São obrigatórias as ligações equipotenciais principais e suplementares (casas de banho, cozinhas).`,
      severity: "critical",
    });
  }

  // Check main circuit breaker
  if (!electrical.hasMainCircuitBreaker) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 530 - Aparelho de Corte Geral",
      description: `Não está previsto disjuntor geral (aparelho de corte de entrada). É obrigatório um dispositivo de corte geral acessível na entrada da instalação.`,
      severity: "critical",
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 530 - Aparelho de Corte Geral",
      description: `Disjuntor geral (aparelho de corte de entrada) está previsto.`,
      severity: "pass",
    });
  }

  // Check individual circuit protection
  if (!electrical.hasIndividualCircuitProtection) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 533 - Proteção de Circuitos",
      description: `Os circuitos individuais não possuem proteção própria. Cada circuito deve ter disjuntor/fusível dimensionado para a secção dos condutores.`,
      severity: "critical",
    });
  }

  // Check surge protection
  if (!electrical.hasSurgeProtection && !project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 534 - Descarregadores de Sobretensões",
      description: `Não está previsto descarregador de sobretensões (SPD). A proteção contra sobretensões transitórias é obrigatória em edifícios novos (Tipo 1+2 ou Tipo 2).`,
      severity: "warning",
    });
  }

  // Check minimum number of circuits
  const dwellingSize = project.numberOfDwellings && project.numberOfDwellings > 0 ? "standard" : "small";
  const minCircuits = project.grossFloorArea > 100 ? ELECTRICAL_REQUIREMENTS.minCircuits.t2t3 : ELECTRICAL_REQUIREMENTS.minCircuits.t0t1;
  if (electrical.numberOfCircuits < minCircuits) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 801 - Circuitos Mínimos",
      description: `O número de circuitos (${electrical.numberOfCircuits}) é inferior ao mínimo recomendado (${minCircuits}) para a tipologia da fração. Circuitos de iluminação, tomadas e equipamentos dedicados devem ser separados.`,
      severity: "warning",
      currentValue: `${electrical.numberOfCircuits} circuitos`,
      requiredValue: `≥ ${minCircuits} circuitos`,
    });
  }

  // Check bathroom zone compliance
  if (!electrical.hasBathroomZoneCompliance) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 701 - Casas de Banho",
      description: `Não é garantida a conformidade com as zonas de segurança das casas de banho (Zonas 0 a 3). Os equipamentos e aparelhagem devem respeitar os graus IP e restrições de cada zona.`,
      severity: "warning",
    });
  }

  // Check separate circuits
  if (!electrical.hasSeparateLightingCircuits || !electrical.hasSeparateSocketCircuits) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 314 - Divisão em Circuitos",
      description: `Os circuitos de iluminação e tomadas devem ser separados para garantir que uma avaria num circuito não afete toda a instalação.`,
      severity: "warning",
    });
  }

  // Check dedicated appliance circuits
  if (!electrical.hasDedicatedApplianceCircuits) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 801 - Circuitos Dedicados",
      description: `Equipamentos de potência elevada (forno, placa, máquina de lavar, secador) devem ter circuitos dedicados com proteção e secção de cabo adequadas.`,
      severity: "warning",
    });
  }

  // Check schematic diagram
  if (!electrical.hasSchematicDiagram) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 514.5 - Documentação",
      description: `O projeto deve incluir esquema unifilar da instalação elétrica, indicando circuitos, proteções, secções de cabos e potências.`,
      severity: "warning",
    });
  }

  // Check distribution board labelling
  if (!electrical.hasDistributionBoardLabelling) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 514 - Identificação",
      description: `O quadro elétrico deve ter identificação clara de todos os circuitos e respetivas proteções.`,
      severity: "info",
    });
  }

  // Check EV charging preparation for new buildings
  if (!electrical.hasEVCharging && !project.isRehabilitation && project.buildingType === "residential") {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "DL 39/2010",
      article: "Pré-instalação para VE",
      description: `Edifícios residenciais novos com estacionamento devem prever pré-instalação para carregamento de veículos elétricos (mínimo ${ELECTRICAL_REQUIREMENTS.evCharging.minPowerPerSpot} kW por lugar).`,
      severity: project.isRehabilitation ? "info" : "warning",
    });
  }

  // Check outdoor IP protection
  if (!electrical.hasOutdoorIPProtection) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Secção 512.2 - Proteção IP",
      description: `Os equipamentos e aparelhagem instalados no exterior devem ter grau de proteção IP adequado (mínimo IP44 para uso exterior).`,
      severity: "info",
    });
  }

  // Check project approval for larger installations
  if (!electrical.hasProjectApproval && electrical.contractedPower > 10.35) {
    findings.push({
      id: nextFindingId(),
      area: "electrical",
      regulation: "RTIEBT",
      article: "Portaria 949-A/2006",
      description: `Instalações com potência superior a 10,35 kVA requerem projeto de instalações elétricas elaborado por técnico responsável e aprovação pela DGEG.`,
      severity: "critical",
      currentValue: `${electrical.contractedPower} kVA`,
      requiredValue: `Projeto obrigatório acima de 10.35 kVA`,
    });
  }

  return findings;
}

// ============================================================
// ITED / ITUR ANALYSIS
// ============================================================

function analyzeTelecom(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { telecommunications: telecom } = project;
  const isMultiDwelling = (project.numberOfDwellings ?? 1) > 1;

  // --- ITED Analysis ---

  // Check ITED edition
  if (Number(telecom.itedEdition) < ITED_REQUIREMENTS.currentEdition && !project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - DL 123/2009",
      article: "Manual ITED 4ª Edição",
      description: `O projeto referencia a ${telecom.itedEdition}ª edição do manual ITED. A versão atual é a ${ITED_REQUIREMENTS.currentEdition}ª edição (Portaria 264/2023). Novos edifícios devem cumprir a edição em vigor.`,
      severity: "warning",
    });
  }

  // Check ATE requirement
  if (isMultiDwelling && !telecom.hasATE) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - DL 123/2009",
      article: "ATE - Armário de Telecomunicações de Edifício",
      description: `O edifício tem ${project.numberOfDwellings} frações e não prevê ATE (Armário de Telecomunicações de Edifício). O ATE é obrigatório em edifícios com mais de 1 fração.`,
      severity: "critical",
    });
  } else if (isMultiDwelling) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - DL 123/2009",
      article: "ATE - Armário de Telecomunicações de Edifício",
      description: `O ATE está previsto no projeto, conforme exigido.`,
      severity: "pass",
    });
  }

  // Check ATI requirement
  if (!telecom.hasATI) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - DL 123/2009",
      article: "ATI - Armário de Telecomunicações Individual",
      description: `Não está previsto ATI (Armário de Telecomunicações Individual). Cada fração autónoma deve possuir um ATI para concentração das redes interiores.`,
      severity: "critical",
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - DL 123/2009",
      article: "ATI - Armário de Telecomunicações Individual",
      description: `O ATI está previsto para as frações.`,
      severity: "pass",
    });
  }

  // Check fiber optic (mandatory in 4th edition)
  if (!telecom.hasFiberOptic && !project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - 4ª Edição",
      article: "Cablagem em Fibra Óptica",
      description: `O projeto não prevê cablagem em fibra óptica. A 4ª edição do ITED torna obrigatória a instalação de fibra óptica monomodo em edifícios novos.`,
      severity: "critical",
    });
  } else if (telecom.hasFiberOptic) {
    if (telecom.fiberType !== ITED_REQUIREMENTS.cabling.fiberType) {
      findings.push({
        id: nextFindingId(),
        area: "ited_itur",
        regulation: "ITED - 4ª Edição",
        article: "Tipo de Fibra Óptica",
        description: `A fibra óptica prevista é do tipo ${telecom.fiberType === "multi_mode" ? "multimodo" : telecom.fiberType}. A 4ª edição do ITED exige fibra monomodo (single mode) para novas instalações.`,
        severity: "warning",
      });
    } else {
      findings.push({
        id: nextFindingId(),
        area: "ited_itur",
        regulation: "ITED - 4ª Edição",
        article: "Cablagem em Fibra Óptica",
        description: `Fibra óptica monomodo prevista, conforme exigido.`,
        severity: "pass",
      });
    }
  }

  // Check copper cabling category
  if (telecom.hasCopperCabling) {
    const catOrder = ["none", "5e", "6", "6a", "7"];
    const minIdx = catOrder.indexOf(ITED_REQUIREMENTS.cabling.minCopperCategory);
    const curIdx = catOrder.indexOf(telecom.copperCableCategory);
    if (curIdx < minIdx) {
      findings.push({
        id: nextFindingId(),
        area: "ited_itur",
        regulation: "ITED - 4ª Edição",
        article: "Cablagem de Par de Cobre",
        description: `A cablagem de par de cobre é Categoria ${telecom.copperCableCategory}. A 4ª edição do ITED exige no mínimo Categoria ${ITED_REQUIREMENTS.cabling.minCopperCategory} para novas instalações.`,
        severity: "warning",
        currentValue: `Cat. ${telecom.copperCableCategory}`,
        requiredValue: `≥ Cat. ${ITED_REQUIREMENTS.cabling.minCopperCategory}`,
      });
    } else {
      findings.push({
        id: nextFindingId(),
        area: "ited_itur",
        regulation: "ITED - 4ª Edição",
        article: "Cablagem de Par de Cobre",
        description: `Cablagem de par de cobre Categoria ${telecom.copperCableCategory} cumpre o mínimo exigido.`,
        severity: "pass",
      });
    }
  }

  // Check coaxial cabling
  if (!telecom.hasCoaxialCabling && !project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - 4ª Edição",
      article: "Cablagem Coaxial",
      description: `Não está prevista cablagem coaxial. Apesar da tendência para IPTV, o cabo coaxial continua a ser exigido pelo ITED para distribuição de sinais CATV/MATV.`,
      severity: "warning",
    });
  }

  // Check minimum outlets
  const dwellings = project.numberOfDwellings ?? 1;
  const outletSize = project.grossFloorArea / dwellings;
  const minRJ45 = outletSize > 120 ? ITED_REQUIREMENTS.outlets.rj45.t4plus
    : outletSize > 90 ? ITED_REQUIREMENTS.outlets.rj45.t3
    : outletSize > 60 ? ITED_REQUIREMENTS.outlets.rj45.t2
    : ITED_REQUIREMENTS.outlets.rj45.t0t1;

  if (telecom.rj45OutletsPerDwelling < minRJ45) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - 4ª Edição",
      article: "Tomadas RJ45 Mínimas",
      description: `O número de tomadas RJ45 por fração (${telecom.rj45OutletsPerDwelling}) é inferior ao mínimo exigido (${minRJ45}) para a tipologia estimada.`,
      severity: "warning",
      currentValue: `${telecom.rj45OutletsPerDwelling} tomadas RJ45`,
      requiredValue: `≥ ${minRJ45} tomadas RJ45`,
    });
  }

  if (telecom.fiberOutletsPerDwelling < ITED_REQUIREMENTS.outlets.fiber.minimum && telecom.hasFiberOptic) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - 4ª Edição",
      article: "Tomadas de Fibra Óptica",
      description: `Cada fração deve ter pelo menos ${ITED_REQUIREMENTS.outlets.fiber.minimum} tomada de fibra óptica no ATI.`,
      severity: "warning",
    });
  }

  // Check riser/ducting
  if (isMultiDwelling && !telecom.hasRiserCableway) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - DL 123/2009",
      article: "Caminhos de Cabos",
      description: `Em edifícios com múltiplas frações, é obrigatória a coluna montante (caminhos de cabos verticais) entre o ATE e os pisos/frações.`,
      severity: "critical",
    });
  }

  // Check certification
  if (!telecom.hasITEDCertification && !project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - DL 123/2009",
      article: "Certificação ITED",
      description: `A instalação ITED requer certificação por instalador credenciado pela ANACOM. A certificação é obrigatória para obtenção de licença de utilização.`,
      severity: "warning",
    });
  }

  if (!telecom.installerITEDLicense) {
    findings.push({
      id: nextFindingId(),
      area: "ited_itur",
      regulation: "ITED - DL 123/2009",
      article: "Instalador Credenciado",
      description: `A execução do projeto ITED deve ser realizada por instalador com credenciação válida emitida pela ANACOM.`,
      severity: "warning",
    });
  }

  // --- ITUR Analysis (only for urbanizations) ---
  if (telecom.isUrbanization) {
    if (!telecom.hasITURProject) {
      findings.push({
        id: nextFindingId(),
        area: "ited_itur",
        regulation: "ITUR - DL 123/2009",
        article: "Projeto ITUR",
        description: `Loteamentos e urbanizações requerem projeto ITUR aprovado. O projeto deve prever infraestruturas subterrâneas para telecomunicações multi-operador.`,
        severity: "critical",
      });
    }

    if (!telecom.hasUndergroundDucts) {
      findings.push({
        id: nextFindingId(),
        area: "ited_itur",
        regulation: "ITUR - Manual 3ª Edição",
        article: "Infraestrutura Subterrânea",
        description: `O ITUR exige infraestrutura de tubagem subterrânea em PEAD (diâmetro mínimo ${ITUR_REQUIREMENTS.undergroundDucts.minDuctDiameter}mm, mínimo ${ITUR_REQUIREMENTS.undergroundDucts.minNumberOfDucts} tubos por percurso, profundidade ≥ ${ITUR_REQUIREMENTS.undergroundDucts.minDepth}m).`,
        severity: "critical",
      });
    }

    if (!telecom.hasCEE) {
      findings.push({
        id: nextFindingId(),
        area: "ited_itur",
        regulation: "ITUR - Manual 3ª Edição",
        article: "CEE - Câmara de Entrada de Edifício",
        description: `Cada edifício da urbanização deve possuir CEE (Câmara de Entrada de Edifício) para transição entre a rede ITUR e a rede ITED do edifício.`,
        severity: "critical",
      });
    }
  }

  return findings;
}

// ============================================================
// ACOUSTIC ANALYSIS (RRAE) - DL 129/2002 & DL 96/2008
// ============================================================

function analyzeAcoustic(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { acoustic } = project;
  const isMultiDwelling = (project.numberOfDwellings ?? 1) > 1;

  // Check acoustic project
  if (!acoustic.hasAcousticProject && !project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "acoustic",
      regulation: "RRAE - DL 96/2008",
      article: "Art. 5º - Projeto de Condicionamento Acústico",
      description: `O projeto de condicionamento acústico é obrigatório para edifícios novos. Deve ser elaborado por técnico competente e incluir verificação dos requisitos do RRAE.`,
      severity: "warning",
    });
  }

  // Check airborne insulation between dwellings
  if (isMultiDwelling) {
    if (!acoustic.hasAirborneInsulation) {
      findings.push({
        id: nextFindingId(),
        area: "acoustic",
        regulation: "RRAE - DL 96/2008",
        article: "Art. 5º - Isolamento Sonoro a Sons Aéreos",
        description: `Não está garantido o isolamento a sons aéreos entre frações. O RRAE exige D'nT,w ≥ ${ACOUSTIC_REQUIREMENTS.airborne.betweenDwellings} dB entre fogos.`,
        severity: "critical",
        requiredValue: `D'nT,w ≥ ${ACOUSTIC_REQUIREMENTS.airborne.betweenDwellings} dB`,
      });
    } else if (acoustic.airborneInsulationValue !== undefined) {
      if (acoustic.airborneInsulationValue < ACOUSTIC_REQUIREMENTS.airborne.betweenDwellings) {
        findings.push({
          id: nextFindingId(),
          area: "acoustic",
          regulation: "RRAE - DL 96/2008",
          article: "Art. 5º - Isolamento Sonoro a Sons Aéreos",
          description: `O isolamento a sons aéreos entre frações (${acoustic.airborneInsulationValue} dB) é inferior ao mínimo exigido.`,
          severity: "critical",
          currentValue: `D'nT,w = ${acoustic.airborneInsulationValue} dB`,
          requiredValue: `D'nT,w ≥ ${ACOUSTIC_REQUIREMENTS.airborne.betweenDwellings} dB`,
        });
      } else {
        findings.push({
          id: nextFindingId(),
          area: "acoustic",
          regulation: "RRAE - DL 96/2008",
          article: "Art. 5º - Isolamento Sonoro a Sons Aéreos",
          description: `O isolamento a sons aéreos entre frações cumpre o mínimo regulamentar.`,
          severity: "pass",
          currentValue: `D'nT,w = ${acoustic.airborneInsulationValue} dB`,
          requiredValue: `D'nT,w ≥ ${ACOUSTIC_REQUIREMENTS.airborne.betweenDwellings} dB`,
        });
      }
    }

    // Check impact sound insulation
    if (!acoustic.hasImpactInsulation) {
      findings.push({
        id: nextFindingId(),
        area: "acoustic",
        regulation: "RRAE - DL 96/2008",
        article: "Art. 5º - Isolamento a Sons de Percussão",
        description: `Não está garantido o isolamento a sons de percussão. O RRAE exige L'nT,w ≤ ${ACOUSTIC_REQUIREMENTS.impact.betweenDwellings} dB entre fogos.`,
        severity: "critical",
        requiredValue: `L'nT,w ≤ ${ACOUSTIC_REQUIREMENTS.impact.betweenDwellings} dB`,
      });
    } else if (acoustic.impactInsulationValue !== undefined) {
      if (acoustic.impactInsulationValue > ACOUSTIC_REQUIREMENTS.impact.betweenDwellings) {
        findings.push({
          id: nextFindingId(),
          area: "acoustic",
          regulation: "RRAE - DL 96/2008",
          article: "Art. 5º - Isolamento a Sons de Percussão",
          description: `O nível de ruído de percussão entre frações (${acoustic.impactInsulationValue} dB) excede o máximo admissível. Considerar pavimento flutuante.`,
          severity: "critical",
          currentValue: `L'nT,w = ${acoustic.impactInsulationValue} dB`,
          requiredValue: `L'nT,w ≤ ${ACOUSTIC_REQUIREMENTS.impact.betweenDwellings} dB`,
        });
      } else {
        findings.push({
          id: nextFindingId(),
          area: "acoustic",
          regulation: "RRAE - DL 96/2008",
          article: "Art. 5º - Isolamento a Sons de Percussão",
          description: `O isolamento a sons de percussão cumpre o limite regulamentar.`,
          severity: "pass",
          currentValue: `L'nT,w = ${acoustic.impactInsulationValue} dB`,
          requiredValue: `L'nT,w ≤ ${ACOUSTIC_REQUIREMENTS.impact.betweenDwellings} dB`,
        });
      }
    }
  }

  // Check facade insulation
  const facadeReq = acoustic.buildingLocation === "quiet"
    ? ACOUSTIC_REQUIREMENTS.facade.quietZone
    : ACOUSTIC_REQUIREMENTS.facade.mixedZone;

  if (!acoustic.hasFacadeInsulation) {
    findings.push({
      id: nextFindingId(),
      area: "acoustic",
      regulation: "RRAE - DL 96/2008",
      article: "Art. 5º - Isolamento Sonoro de Fachada",
      description: `Não está verificado o isolamento sonoro de fachada. Para zona ${acoustic.buildingLocation === "quiet" ? "sensível" : "mista"}, o RRAE exige D2m,nT,w ≥ ${facadeReq} dB.`,
      severity: "warning",
      requiredValue: `D2m,nT,w ≥ ${facadeReq} dB`,
    });
  } else if (acoustic.facadeInsulationValue !== undefined) {
    if (acoustic.facadeInsulationValue < facadeReq) {
      findings.push({
        id: nextFindingId(),
        area: "acoustic",
        regulation: "RRAE - DL 96/2008",
        article: "Art. 5º - Isolamento Sonoro de Fachada",
        description: `O isolamento de fachada (${acoustic.facadeInsulationValue} dB) é inferior ao mínimo para zona ${acoustic.buildingLocation === "quiet" ? "sensível" : "mista"}.`,
        severity: "critical",
        currentValue: `D2m,nT,w = ${acoustic.facadeInsulationValue} dB`,
        requiredValue: `D2m,nT,w ≥ ${facadeReq} dB`,
      });
    } else {
      findings.push({
        id: nextFindingId(),
        area: "acoustic",
        regulation: "RRAE - DL 96/2008",
        article: "Art. 5º - Isolamento Sonoro de Fachada",
        description: `O isolamento sonoro de fachada cumpre o mínimo regulamentar.`,
        severity: "pass",
        currentValue: `D2m,nT,w = ${acoustic.facadeInsulationValue} dB`,
        requiredValue: `D2m,nT,w ≥ ${facadeReq} dB`,
      });
    }
  }

  // Check equipment noise control
  if (!acoustic.hasEquipmentNoiseControl && (project.buildingType === "commercial" || isMultiDwelling)) {
    findings.push({
      id: nextFindingId(),
      area: "acoustic",
      regulation: "RRAE - DL 96/2008",
      article: "Art. 5º - Ruído de Equipamentos",
      description: `Deve ser garantido o controlo de ruído dos equipamentos coletivos (elevadores, AVAC, bombas) para cumprimento dos limites do RRAE (LAr,nT ≤ 27-32 dB(A) conforme uso).`,
      severity: "warning",
    });
  }

  return findings;
}

// ============================================================
// GAS INSTALLATIONS ANALYSIS (DL 521/99)
// ============================================================

function analyzeGas(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { gas } = project;

  if (!gas.hasGasInstallation || gas.gasType === "none") {
    // No gas installation - no analysis needed
    return findings;
  }

  // Check gas project approval
  if (!gas.hasGasProject) {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Art. 15º - Projeto de Gás",
      description: `A instalação de gás requer projeto aprovado pela DGEG, elaborado por técnico credenciado. O projeto é obrigatório para instalações com gás canalizado.`,
      severity: "critical",
    });
  }

  // Check gas detector
  if (!gas.hasGasDetector) {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Segurança - Deteção de Gás",
      description: `Recomenda-se a instalação de detetor de gás nos locais com aparelhos a gás. Para gás natural, o detetor deve ser instalado na parte superior; para GPL, na parte inferior.`,
      severity: "warning",
    });
  }

  // Check emergency valve
  if (!gas.hasEmergencyValve) {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Art. 12º - Válvula de Corte de Emergência",
      description: `A instalação deve prever válvula de corte de emergência acessível na entrada do edifício/fração. Permite corte rápido do abastecimento em caso de fuga.`,
      severity: "critical",
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Art. 12º - Válvula de Corte de Emergência",
      description: `Válvula de corte de emergência prevista na instalação.`,
      severity: "pass",
    });
  }

  // Check ventilation
  if (!gas.hasVentilation) {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Art. 20º - Ventilação",
      description: `Os locais com aparelhos a gás devem ter ventilação adequada (aberturas permanentes com área mínima de ${GAS_REQUIREMENTS.ventilation.minOpeningArea} cm² por aparelho). Essencial para combustão e segurança.`,
      severity: "critical",
    });
  }

  // Check flue system
  if (!gas.hasFlueSystem && gas.gasType !== "lpg_bottle") {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Art. 21º - Evacuação de Produtos de Combustão",
      description: `Os aparelhos a gás do tipo B e C requerem sistema de exaustão/chaminé para evacuação dos produtos de combustão. A ausência pode causar intoxicação por monóxido de carbono.`,
      severity: "critical",
    });
  }

  // Check pressure test
  if (!gas.hasPressureTest) {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Ensaio de Estanquidade",
      description: `Antes da colocação em serviço, a rede de gás deve ser sujeita a ensaio de estanquidade (${GAS_REQUIREMENTS.pressureTest.testPressure} mbar durante ${GAS_REQUIREMENTS.pressureTest.duration} min). Obrigatório e registado.`,
      severity: "critical",
    });
  }

  // Check pipe material
  const allowed = GAS_REQUIREMENTS.allowedPipeMaterials as readonly string[];
  if (gas.pipesMaterial !== "none" && !allowed.includes(gas.pipesMaterial)) {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Materiais da Tubagem",
      description: `O material da tubagem não está entre os materiais permitidos para instalações de gás (cobre, aço, polietileno, multicamada).`,
      severity: "critical",
    });
  }

  // Check certification
  if (!gas.hasGasCertification) {
    findings.push({
      id: nextFindingId(),
      area: "gas",
      regulation: "DL 521/99",
      article: "Certificação da Instalação",
      description: `A instalação de gás deve ser certificada por instalador credenciado pela DGEG. A certificação é obrigatória para ligação à rede e para obtenção de licença de utilização.`,
      severity: "warning",
    });
  }

  return findings;
}

// ============================================================
// WATER & DRAINAGE ANALYSIS (DL 23/95 - RGSPPDADAR)
// ============================================================

function analyzeWaterDrainage(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { waterDrainage } = project;

  // Check public water connection
  if (!waterDrainage.hasPublicWaterConnection) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Art. 20º - Abastecimento de Água",
      description: `O edifício deve estar ligado à rede pública de abastecimento de água sempre que disponível. A ligação é obrigatória em zonas urbanizadas.`,
      severity: "warning",
    });
  }

  // Check water meter
  if (!waterDrainage.hasWaterMeter) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Contagem de Água",
      description: `Cada fração autónoma deve ter contador de água individual. A contagem individual é obrigatória em edifícios de habitação coletiva.`,
      severity: "warning",
    });
  }

  // Check valve
  if (!waterDrainage.hasCheckValve) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Art. 93º - Válvula Anti-retorno",
      description: `Deve existir válvula anti-retorno (de retenção) para evitar contaminação da rede pública por refluxo. Obrigatória na ligação ao ramal de distribuição.`,
      severity: "critical",
    });
  }

  // Check pipe material
  const deprecated = WATER_DRAINAGE_REQUIREMENTS.pipeMaterials.deprecatedMaterials as readonly string[];
  if (deprecated.includes(waterDrainage.waterPipeMaterial)) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Materiais das Tubagens",
      description: `A tubagem em aço galvanizado é desaconselhada em novas instalações (problemas de corrosão e qualidade da água). Utilizar PPR, PEX, multicamada ou cobre.`,
      severity: "warning",
      currentValue: "Aço galvanizado",
      requiredValue: "PPR, PEX, Multicamada ou Cobre",
    });
  }

  // Check separate drainage system
  if (!waterDrainage.hasSeparateDrainageSystem) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Art. 116º - Sistema Separativo",
      description: `A rede de drenagem deve ser separativa (águas residuais domésticas separadas das pluviais). O sistema separativo é obrigatório em novas construções.`,
      severity: "critical",
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Art. 116º - Sistema Separativo",
      description: `Sistema de drenagem separativo previsto, conforme exigido.`,
      severity: "pass",
    });
  }

  // Check drainage ventilation
  if (!waterDrainage.hasVentilatedDrainage) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Art. 202º - Ventilação da Rede",
      description: `A rede de drenagem de águas residuais deve ser ventilada para evitar sifonagem e maus odores. Prever colunas de ventilação ou válvulas de admissão de ar.`,
      severity: "warning",
    });
  }

  // Check siphons
  if (!waterDrainage.hasDrainageSiphons) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Art. 209º - Sifões",
      description: `Todos os aparelhos sanitários devem possuir sifão com fecho hídrico mínimo de ${WATER_DRAINAGE_REQUIREMENTS.drainage.minSiphonHeight}mm para impedir a entrada de gases da rede de esgotos.`,
      severity: "critical",
    });
  }

  // Check grease trap for commercial
  if (project.buildingType === "commercial" && !waterDrainage.hasGreaseTrap) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Caixa de Gorduras",
      description: `Edifícios comerciais com cozinha/restauração devem prever caixa de retenção de gorduras antes da ligação à rede pública de drenagem.`,
      severity: "warning",
    });
  }

  // Check backflow prevention
  if (!waterDrainage.hasBackflowPrevention) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Prevenção de Refluxo",
      description: `Devem ser previstos dispositivos anti-refluxo nas ligações de drenagem em pisos abaixo da cota da rede pública para prevenir inundações por refluxo.`,
      severity: "info",
    });
  }

  // Check stormwater management
  if (!waterDrainage.hasStormwaterManagement && !project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "water_drainage",
      regulation: "DL 23/95 - RGSPPDADAR",
      article: "Gestão de Águas Pluviais",
      description: `Recomenda-se a implementação de medidas de gestão de águas pluviais (retenção, infiltração ou reutilização) para reduzir o caudal de ponta na rede pública.`,
      severity: "info",
    });
  }

  return findings;
}

// ============================================================
// STRUCTURAL / SEISMIC ANALYSIS (Eurocodes)
// ============================================================

function analyzeStructural(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { structural } = project;

  // Check structural project
  if (!structural.hasStructuralProject) {
    findings.push({
      id: nextFindingId(),
      area: "structural",
      regulation: "Eurocódigos (EC0-EC8)",
      article: "Projeto de Estabilidade",
      description: `O projeto de estabilidade (estruturas) é obrigatório para todos os edifícios novos. Deve ser elaborado por engenheiro civil inscrito na Ordem dos Engenheiros.`,
      severity: "critical",
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "structural",
      regulation: "Eurocódigos (EC0-EC8)",
      article: "Projeto de Estabilidade",
      description: `Projeto de estabilidade previsto.`,
      severity: "pass",
    });
  }

  // Check geotechnical study
  if (!structural.hasGeotechnicalStudy) {
    const required = project.numberOfFloors > STRUCTURAL_REQUIREMENTS.geotechnicalStudy.requiredAboveFloors
      || structural.foundationType === "deep";
    findings.push({
      id: nextFindingId(),
      area: "structural",
      regulation: "EC7 - NP EN 1997-1",
      article: "Estudo Geotécnico",
      description: `${required ? "O estudo geotécnico é obrigatório para este edifício" : "O estudo geotécnico é recomendado"} (${project.numberOfFloors} pisos, fundações ${structural.foundationType === "deep" ? "profundas" : "superficiais"}). Permite dimensionar corretamente as fundações e avaliar o comportamento do solo.`,
      severity: required ? "critical" : "warning",
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "structural",
      regulation: "EC7 - NP EN 1997-1",
      article: "Estudo Geotécnico",
      description: `Estudo geotécnico realizado.`,
      severity: "pass",
    });
  }

  // Check seismic design
  if (!structural.hasSeismicDesign) {
    findings.push({
      id: nextFindingId(),
      area: "structural",
      regulation: "EC8 - NP EN 1998-1",
      article: "Projeto Sismo-resistente",
      description: `O projeto estrutural deve incluir verificação à ação sísmica conforme o Eurocódigo 8. Portugal é um país com sismicidade moderada a elevada, especialmente no sul e região de Lisboa.`,
      severity: "critical",
    });
  } else {
    const importanceFactor = STRUCTURAL_REQUIREMENTS.importanceFactors[structural.importanceClass];
    findings.push({
      id: nextFindingId(),
      area: "structural",
      regulation: "EC8 - NP EN 1998-1",
      article: "Projeto Sismo-resistente",
      description: `Projeto sismo-resistente previsto. Classe de importância ${structural.importanceClass} (γI=${importanceFactor}), zona sísmica ${structural.seismicZone}, solo tipo ${structural.soilType}, ductilidade ${structural.ductilityClass}.`,
      severity: "pass",
    });
  }

  // Check soil type amplification warning
  if (structural.soilType === "D" || structural.soilType === "E") {
    const factor = STRUCTURAL_REQUIREMENTS.soilFactors[structural.soilType];
    findings.push({
      id: nextFindingId(),
      area: "structural",
      regulation: "EC8 - NP EN 1998-1",
      article: "Classificação do Solo",
      description: `O solo tipo ${structural.soilType} apresenta fator de amplificação sísmica elevado (S=${factor}). Requer atenção especial no dimensionamento das fundações e estrutura.`,
      severity: "warning",
      currentValue: `Solo tipo ${structural.soilType}`,
      requiredValue: `Fator S = ${factor}`,
    });
  }

  // Check importance class for special buildings
  if ((project.buildingType === "commercial") && structural.importanceClass === "II") {
    findings.push({
      id: nextFindingId(),
      area: "structural",
      regulation: "EC8 - NP EN 1998-1",
      article: "Classe de Importância",
      description: `Verificar se a classe de importância II é adequada. Edifícios com grande ocupação (escolas, centros comerciais, hospitais) podem exigir classe III ou IV.`,
      severity: "info",
    });
  }

  return findings;
}

// ============================================================
// ELEVATOR ANALYSIS (DL 320/2002)
// ============================================================

function analyzeElevators(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { elevators } = project;

  if (!elevators.hasElevator || elevators.numberOfElevators === 0) {
    // Check if elevator is required
    if (project.numberOfFloors >= 4) {
      findings.push({
        id: nextFindingId(),
        area: "elevators",
        regulation: "DL 163/2006 / RGEU",
        article: "Obrigatoriedade de Ascensor",
        description: `O edifício tem ${project.numberOfFloors} pisos. A instalação de pelo menos um ascensor é obrigatória em edifícios novos com 4 ou mais pisos (incluindo rés-do-chão).`,
        severity: "critical",
      });
    }
    return findings;
  }

  // Check number of elevators for tall buildings
  if (project.numberOfFloors >= 8 && elevators.numberOfElevators < ELEVATOR_REQUIREMENTS.minElevators.above8floors) {
    findings.push({
      id: nextFindingId(),
      area: "elevators",
      regulation: "RGEU / Boas Práticas",
      article: "Número de Ascensores",
      description: `Edifícios com ${project.numberOfFloors} pisos devem ter pelo menos ${ELEVATOR_REQUIREMENTS.minElevators.above8floors} ascensores para garantir adequada mobilidade vertical e redundância.`,
      severity: "warning",
      currentValue: `${elevators.numberOfElevators} ascensor(es)`,
      requiredValue: `≥ ${ELEVATOR_REQUIREMENTS.minElevators.above8floors} ascensores`,
    });
  }

  // Check CE marking
  if (!elevators.hasCEMarking) {
    findings.push({
      id: nextFindingId(),
      area: "elevators",
      regulation: "DL 320/2002",
      article: "Diretiva Ascensores 2014/33/UE",
      description: `Os ascensores novos devem possuir marcação CE conforme a Diretiva Europeia 2014/33/UE, garantindo conformidade com os requisitos essenciais de saúde e segurança.`,
      severity: "critical",
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "elevators",
      regulation: "DL 320/2002",
      article: "Diretiva Ascensores 2014/33/UE",
      description: `Marcação CE do ascensor verificada.`,
      severity: "pass",
    });
  }

  // Check maintenance contract
  if (!elevators.hasMaintenanceContract) {
    findings.push({
      id: nextFindingId(),
      area: "elevators",
      regulation: "DL 320/2002",
      article: "Art. 4º - Manutenção",
      description: `É obrigatório contrato de manutenção com empresa qualificada. A manutenção deve incluir pelo menos ${ELEVATOR_REQUIREMENTS.maintenance.minInspectionsPerYear} visitas anuais.`,
      severity: "critical",
    });
  }

  // Check periodic inspection
  if (!elevators.hasPeriodicInspection) {
    findings.push({
      id: nextFindingId(),
      area: "elevators",
      regulation: "DL 320/2002",
      article: "Art. 6º - Inspeção Periódica",
      description: `Os ascensores devem ser sujeitos a inspeção periódica por entidade acreditada (organismo de inspeção) a cada ${ELEVATOR_REQUIREMENTS.inspection.intervalYears} anos. A inspeção é obrigatória por lei.`,
      severity: "critical",
    });
  }

  // Check emergency communication
  if (!elevators.hasEmergencyCommunication) {
    findings.push({
      id: nextFindingId(),
      area: "elevators",
      regulation: "EN 81-20",
      article: "Comunicação de Emergência",
      description: `O ascensor deve dispor de sistema de comunicação bidirecional permanente (24h) com serviço de socorro, acessível da cabina. Obrigatório pela EN 81-20.`,
      severity: "critical",
    });
  }

  // Check accessible elevator
  if (!elevators.hasAccessibleElevator) {
    findings.push({
      id: nextFindingId(),
      area: "elevators",
      regulation: "DL 163/2006",
      article: "Secção 2.6 - Ascensor Acessível",
      description: `Pelo menos um ascensor deve ser acessível (cabina mín. ${ELEVATOR_REQUIREMENTS.accessible.minCabinWidth}x${ELEVATOR_REQUIREMENTS.accessible.minCabinDepth}m, porta ≥${ELEVATOR_REQUIREMENTS.accessible.minDoorWidth}m) com sinalética em Braille e anúncio sonoro dos pisos.`,
      severity: "warning",
    });
  }

  // Check pit and headroom
  if (!elevators.hasPitAndHeadroom) {
    findings.push({
      id: nextFindingId(),
      area: "elevators",
      regulation: "EN 81-20",
      article: "Fosso e Altura Livre",
      description: `O fosso do ascensor deve ter profundidade mínima e a caixa deve garantir altura livre adequada acima do último piso servido, conforme EN 81-20.`,
      severity: "warning",
    });
  }

  return findings;
}

// ============================================================
// LICENSING ANALYSIS (RJUE - DL 555/99)
// ============================================================

function analyzeLicensing(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { licensing } = project;

  // Check architectural project
  if (!licensing.hasArchitecturalProject) {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJUE - DL 555/99",
      article: "Art. 11º - Projeto de Arquitetura",
      description: `O projeto de arquitetura é obrigatório para operações urbanísticas sujeitas a licenciamento ou comunicação prévia. Deve ser subscrito por arquiteto inscrito na Ordem.`,
      severity: "critical",
    });
  }

  // Check specialty projects
  if (!licensing.hasSpecialtyProjects) {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJUE - DL 555/99",
      article: "Art. 11º - Projetos de Especialidades",
      description: `Os projetos de especialidades são obrigatórios: estabilidade, águas e esgotos, eletricidade, gás, telecomunicações (ITED), térmica (REH/RECS), acústica (RRAE), SCIE e acessibilidade.`,
      severity: "critical",
    });
  }

  // Check termo de responsabilidade
  if (!licensing.hasTermoDeResponsabilidade) {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJUE - DL 555/99",
      article: "Art. 10º - Termo de Responsabilidade",
      description: `Os termos de responsabilidade dos autores do projeto (arquiteto e engenheiros das especialidades) são obrigatórios para instruir o pedido de licenciamento.`,
      severity: "critical",
    });
  }

  // Check construction license
  if (!licensing.hasConstructionLicense && licensing.projectPhase !== "none") {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJUE - DL 555/99",
      article: "Art. 4º - Alvará de Construção",
      description: `O alvará de construção (ou admissão de comunicação prévia) é obrigatório antes do início das obras. Iniciar obra sem licença constitui contraordenação grave.`,
      severity: licensing.projectPhase === "utilization" ? "info" : "critical",
    });
  }

  // Check technical director
  if (!licensing.hasTechnicalDirector) {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJUE - DL 555/99",
      article: "Art. 63º - Diretor de Obra",
      description: `A obra deve ter diretor de obra e diretor de fiscalização designados, inscritos na respetiva Ordem profissional. A responsabilidade deve ser comunicada à câmara municipal.`,
      severity: "warning",
    });
  }

  // Check utilization license
  if (!licensing.hasUtilizationLicense && licensing.projectPhase === "utilization") {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJUE - DL 555/99",
      article: "Art. 62º - Licença de Utilização",
      description: `A licença de utilização é obrigatória para ocupar ou utilizar o edifício. Requer conclusão da obra, certificações (ITED, gás, eletricidade) e vistoria municipal.`,
      severity: "critical",
    });
  }

  // Check protected area
  if (licensing.isProtectedArea) {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJUE - DL 555/99",
      article: "Art. 13º-A - Áreas Protegidas",
      description: `O edifício está em área protegida ou com património classificado. O projeto requer parecer favorável da DGPC (Direção-Geral do Património Cultural) ou entidade competente. Os prazos de apreciação são mais longos.`,
      severity: "warning",
    });
  }

  // Check ARU benefits
  if (licensing.isInARU && project.isRehabilitation) {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJRU - DL 307/2009",
      article: "Área de Reabilitação Urbana",
      description: `O edifício está em ARU (Área de Reabilitação Urbana). Pode beneficiar de: IVA a 6% na empreitada, isenção de IMI até 5 anos, isenção de IMT, dedução em IRS e taxas municipais reduzidas.`,
      severity: "pass",
    });
  }

  // Check municipal approval
  if (!licensing.hasMunicipalApproval && licensing.projectPhase !== "none" && licensing.projectPhase !== "utilization") {
    findings.push({
      id: nextFindingId(),
      area: "licensing",
      regulation: "RJUE - DL 555/99",
      article: "Aprovação Municipal",
      description: `A câmara municipal aprecia o projeto no prazo de ${LICENSING_REQUIREMENTS.deadlines.licensingDecision} dias (licenciamento) ou ${LICENSING_REQUIREMENTS.deadlines.priorCommunicationDecision} dias (comunicação prévia). Aguardar deferimento antes de iniciar obras.`,
      severity: "info",
    });
  }

  return findings;
}

// ============================================================
// CONSTRUCTION WASTE ANALYSIS (DL 46/2008)
// ============================================================

function analyzeWaste(project: BuildingProject): Finding[] {
  const findings: Finding[] = [];
  const { waste } = project;

  // Check waste management plan (PPG)
  if (!waste.hasWasteManagementPlan) {
    findings.push({
      id: nextFindingId(),
      area: "waste",
      regulation: "DL 46/2008",
      article: "Art. 10º - Plano de Prevenção e Gestão (PPG)",
      description: `O Plano de Prevenção e Gestão de Resíduos de Construção e Demolição (PPG-RCD) é obrigatório para obras sujeitas a licenciamento. Deve acompanhar o projeto para efeitos de licenciamento.`,
      severity: "critical",
    });
  } else {
    findings.push({
      id: nextFindingId(),
      area: "waste",
      regulation: "DL 46/2008",
      article: "Art. 10º - Plano de Prevenção e Gestão (PPG)",
      description: `Plano de Prevenção e Gestão de RCD previsto.`,
      severity: "pass",
    });
  }

  // Check sorting on site
  if (!waste.hasSortingOnSite) {
    findings.push({
      id: nextFindingId(),
      area: "waste",
      regulation: "DL 46/2008",
      article: "Art. 9º - Triagem em Obra",
      description: `A triagem de RCD em obra é obrigatória. Os resíduos devem ser separados por fluxos (betão, metais, madeira, plásticos, vidro, resíduos perigosos) antes do transporte.`,
      severity: "warning",
    });
  }

  // Check licensed transporter
  if (!waste.hasLicensedTransporter) {
    findings.push({
      id: nextFindingId(),
      area: "waste",
      regulation: "DL 46/2008",
      article: "Art. 11º - Transporte de RCD",
      description: `O transporte de RCD deve ser efetuado por operador de gestão de resíduos licenciado pela APA. O transporte sem licença constitui contraordenação ambiental.`,
      severity: "critical",
    });
  }

  // Check licensed destination
  if (!waste.hasLicensedDestination) {
    findings.push({
      id: nextFindingId(),
      area: "waste",
      regulation: "DL 46/2008",
      article: "Art. 12º - Destino Final",
      description: `Os RCD devem ter destino final em operador licenciado (reciclagem, valorização ou aterro). A deposição em local não licenciado é crime ambiental.`,
      severity: "critical",
    });
  }

  // Check e-GAR registration
  if (!waste.hasWasteRegistration) {
    findings.push({
      id: nextFindingId(),
      area: "waste",
      regulation: "DL 46/2008",
      article: "Guia e-GAR",
      description: `O transporte de RCD deve ser acompanhado de guia eletrónica de acompanhamento de resíduos (e-GAR) emitida na plataforma SILiAmb da APA.`,
      severity: "warning",
    });
  }

  // Check recycling target
  if (waste.recyclingPercentageTarget < WASTE_REQUIREMENTS.recyclingTarget) {
    findings.push({
      id: nextFindingId(),
      area: "waste",
      regulation: "DL 46/2008",
      article: "Meta de Reciclagem",
      description: `A meta europeia é de ${WASTE_REQUIREMENTS.recyclingTarget}% de valorização de RCD. O objetivo definido (${waste.recyclingPercentageTarget}%) está abaixo da meta.`,
      severity: "warning",
      currentValue: `${waste.recyclingPercentageTarget}%`,
      requiredValue: `≥ ${WASTE_REQUIREMENTS.recyclingTarget}%`,
    });
  }

  // Check demolition audit
  if (project.isRehabilitation && !waste.hasDemolitionAudit) {
    findings.push({
      id: nextFindingId(),
      area: "waste",
      regulation: "DL 46/2008",
      article: "Auditoria Prévia à Demolição",
      description: `Em obras de reabilitação ou demolição, é recomendada auditoria prévia para identificar materiais perigosos (amianto, tintas com chumbo) e maximizar a reutilização/reciclagem.`,
      severity: "warning",
    });
  }

  return findings;
}

// ============================================================
// RECOMMENDATIONS ENGINE
// ============================================================

function generateRecommendations(project: BuildingProject, findings: Finding[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const criticalAreas = new Set(findings.filter(f => f.severity === "critical").map(f => f.area));
  const warningAreas = new Set(findings.filter(f => f.severity === "warning").map(f => f.area));

  // Thermal improvements
  if (criticalAreas.has("thermal") || warningAreas.has("thermal")) {
    const winterZone = project.location.climateZoneWinter;

    if (project.envelope.externalWallUValue > MAX_U_VALUES.walls[winterZone]) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "thermal",
        title: "Reforço do isolamento térmico das paredes",
        description: `Aplicar sistema ETICS (isolamento térmico pelo exterior) ou isolamento na caixa-de-ar com espessura adequada para atingir U ≤ ${MAX_U_VALUES.walls[winterZone]} W/(m².K). O ETICS é preferível por corrigir simultaneamente as pontes térmicas.`,
        impact: "high",
        estimatedSavings: "Redução de 15-25% nas necessidades de aquecimento",
        regulatoryBasis: "REH - Portaria 349-B/2013",
      });
    }

    if (project.envelope.roofUValue > MAX_U_VALUES.roofs[winterZone]) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "thermal",
        title: "Reforço do isolamento térmico da cobertura",
        description: `Aplicar isolamento na cobertura (XPS, EPS ou lã mineral) para atingir U ≤ ${MAX_U_VALUES.roofs[winterZone]} W/(m².K). Em coberturas planas, considerar isolamento invertido. Em coberturas inclinadas, isolar na esteira ou nas vertentes.`,
        impact: "high",
        estimatedSavings: "Redução de 10-20% nas necessidades de aquecimento",
        regulatoryBasis: "REH - Portaria 349-B/2013",
      });
    }

    if (project.envelope.windowUValue > MAX_U_VALUES.windows[winterZone]) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "thermal",
        title: "Substituição de vãos envidraçados",
        description: `Substituir as janelas por caixilharia com corte térmico (alumínio com rotura térmica ou PVC) e vidro duplo com caixa-de-ar ≥ 16mm para atingir U ≤ ${MAX_U_VALUES.windows[winterZone]} W/(m².K).`,
        impact: "high",
        estimatedSavings: "Redução de 10-15% nas necessidades de aquecimento e melhoria do conforto acústico",
        regulatoryBasis: "REH - Portaria 349-B/2013",
      });
    }

    if (project.envelope.windowFrameType === "aluminum_no_break") {
      recommendations.push({
        id: nextRecommendationId(),
        area: "thermal",
        title: "Upgrade de caixilharia",
        description: `A caixilharia de alumínio sem corte térmico possui pontes térmicas significativas. Substituir por caixilharia com rotura térmica, PVC, ou madeira para melhorar significativamente o desempenho térmico.`,
        impact: "medium",
        regulatoryBasis: "REH - Boas práticas de construção",
      });
    }

    if (!project.envelope.hasHRV && project.envelope.airChangesPerHour < REFERENCE_VENTILATION.residential.recommended) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "thermal",
        title: "Instalação de ventilação mecânica com recuperação de calor",
        description: `Instalar sistema VMC (Ventilação Mecânica Controlada) com recuperação de calor (eficiência ≥ 70%). Garante a qualidade do ar interior mantendo as perdas térmicas controladas.`,
        impact: "medium",
        estimatedSavings: "Redução de 5-15% nas necessidades de aquecimento",
        regulatoryBasis: "REH - Qualidade do Ar Interior",
      });
    }
  }

  // Energy system improvements
  if (criticalAreas.has("energy") || warningAreas.has("energy")) {
    if (project.systems.heatingSystem === "electric_radiator") {
      recommendations.push({
        id: nextRecommendationId(),
        area: "energy",
        title: "Substituição do sistema de aquecimento",
        description: `Substituir os radiadores elétricos por bomba de calor ar-água ou ar-ar (COP ≥ 3.5). A poupança energética é significativa: uma bomba de calor consome ~3x menos energia para a mesma quantidade de calor produzido.`,
        impact: "high",
        estimatedSavings: "Redução de 60-70% no consumo de energia para aquecimento",
        regulatoryBasis: "SCE - DL 101-D/2020",
      });
    }

    if (project.systems.dhwSystem === "electric") {
      recommendations.push({
        id: nextRecommendationId(),
        area: "energy",
        title: "Substituição do sistema de AQS",
        description: `Substituir o termoacumulador elétrico por bomba de calor termodinâmica ou sistema solar térmico com apoio. Uma bomba de calor para AQS (COP ~3) reduz o consumo de energia para aquecimento de águas em ~65%.`,
        impact: "high",
        estimatedSavings: "Redução de 50-70% no consumo de energia para AQS",
        regulatoryBasis: "SCE - DL 101-D/2020",
      });
    }

    if (!project.systems.hasSolarPV) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "energy",
        title: "Instalação de painéis solares fotovoltaicos",
        description: `Instalar sistema fotovoltaico para autoconsumo. Portugal tem excelente recurso solar (1400-1800 kWh/m²/ano). Um sistema de 1-2 kWp por fração pode cobrir 30-50% do consumo elétrico.`,
        impact: "medium",
        estimatedSavings: "Redução de 30-50% na fatura elétrica",
        regulatoryBasis: "SCE - Contribuição de Renováveis",
      });
    }

    if (!project.systems.hasSolarThermal && project.buildingType === "residential") {
      recommendations.push({
        id: nextRecommendationId(),
        area: "energy",
        title: "Instalação de coletores solares térmicos",
        description: `Instalar painel solar térmico para aquecimento de águas sanitárias (AQS). Em Portugal, um sistema bem dimensionado pode cobrir 60-80% das necessidades anuais de AQS.`,
        impact: "medium",
        estimatedSavings: "Redução de 60-80% no consumo de energia para AQS",
        regulatoryBasis: "REH - Portaria 349-B/2013",
      });
    }
  }

  // Fire safety improvements
  if (criticalAreas.has("fire_safety")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "fire_safety",
      title: "Revisão do projeto de segurança contra incêndio",
      description: `Existem não conformidades críticas no projeto SCIE. Recomenda-se a revisão completa do projeto por técnico especializado, incluindo: meios de evacuação, sistemas de deteção/alarme, resistência ao fogo dos elementos estruturais e meios de extinção.`,
      impact: "high",
      regulatoryBasis: "SCIE - DL 224/2015, Portaria 1532/2008",
    });
  }

  // Accessibility improvements
  if (criticalAreas.has("accessibility")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "accessibility",
      title: "Correção das condições de acessibilidade",
      description: `O projeto apresenta incumprimentos ao DL 163/2006. É fundamental garantir o percurso acessível desde a via pública, dimensões adequadas de portas e corredores, e instalações sanitárias acessíveis.`,
      impact: "high",
      regulatoryBasis: "DL 163/2006 - Acessibilidade",
    });
  }

  // Electrical improvements
  if (criticalAreas.has("electrical") || warningAreas.has("electrical")) {
    if (!project.electrical.hasResidualCurrentDevice || project.electrical.rcdSensitivity > 30) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "electrical",
        title: "Instalação de proteção diferencial adequada",
        description: `Instalar disjuntores diferenciais de 30 mA (alta sensibilidade) em todos os circuitos de tomadas e zonas húmidas. Considerar diferenciais do tipo A ou tipo B para proteção contra correntes de defeito contínuas (inversores, VE).`,
        impact: "high",
        regulatoryBasis: "RTIEBT - Secção 531.2",
      });
    }

    if (!project.electrical.hasSurgeProtection) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "electrical",
        title: "Instalação de descarregador de sobretensões (SPD)",
        description: `Instalar SPD Tipo 2 (ou Tipo 1+2 combinado em zonas com risco de descargas atmosféricas) no quadro elétrico principal. Protege equipamentos eletrónicos sensíveis contra sobretensões transitórias.`,
        impact: "medium",
        regulatoryBasis: "RTIEBT - Secção 534",
      });
    }

    if (!project.electrical.hasEVCharging && project.buildingType === "residential") {
      recommendations.push({
        id: nextRecommendationId(),
        area: "electrical",
        title: "Pré-instalação para veículo elétrico",
        description: `Prever pré-instalação de circuito dedicado para carregamento de veículo elétrico (mínimo ${ELECTRICAL_REQUIREMENTS.evCharging.minPowerPerSpot} kW). Incluir tubagem, cablagem dimensionada e proteção no quadro. O custo de pré-instalação é muito inferior ao da instalação posterior.`,
        impact: "medium",
        regulatoryBasis: "DL 39/2010 - Mobilidade Elétrica",
      });
    }

    recommendations.push({
      id: nextRecommendationId(),
      area: "electrical",
      title: "Revisão do projeto elétrico por técnico responsável",
      description: `Garantir que o projeto elétrico é elaborado e assinado por técnico responsável (engenheiro eletrotécnico ou técnico DGEG). O projeto deve incluir esquema unifilar, memória descritiva, cálculos de dimensionamento e verificação de quedas de tensão.`,
      impact: "high",
      regulatoryBasis: "RTIEBT - Portaria 949-A/2006",
    });
  }

  // ITED/ITUR improvements
  if (criticalAreas.has("ited_itur") || warningAreas.has("ited_itur")) {
    if (!project.telecommunications.hasFiberOptic) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "ited_itur",
        title: "Instalação de fibra óptica monomodo",
        description: `A 4ª edição do ITED exige fibra óptica monomodo. Mesmo em reabilitação, a instalação de fibra é fortemente recomendada para preparar o edifício para serviços de banda larga de nova geração (≥1 Gbps).`,
        impact: "high",
        regulatoryBasis: "ITED 4ª Edição - Portaria 264/2023",
      });
    }

    if (!project.telecommunications.hasATI) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "ited_itur",
        title: "Instalação de ATI em cada fração",
        description: `Instalar Armário de Telecomunicações Individual (ATI) em cada fração para centralizar a distribuição de redes internas. O ATI deve ter dimensões mínimas de 30x50x12 cm e estar acessível.`,
        impact: "high",
        regulatoryBasis: "ITED - DL 123/2009",
      });
    }

    const copperCategory = project.telecommunications.copperCableCategory;
    if (copperCategory === "5e" || copperCategory === "none") {
      recommendations.push({
        id: nextRecommendationId(),
        area: "ited_itur",
        title: "Upgrade de cablagem de par de cobre",
        description: `Utilizar cablagem UTP mínimo Categoria 6 (de preferência Cat. 6a) para suportar velocidades de 1-10 Gbps. A Cat. 5e limita a velocidade a 1 Gbps e distâncias menores.`,
        impact: "medium",
        regulatoryBasis: "ITED 4ª Edição",
      });
    }

    recommendations.push({
      id: nextRecommendationId(),
      area: "ited_itur",
      title: "Certificação ITED por instalador credenciado",
      description: `A certificação ITED é obrigatória para obtenção da licença de utilização. Contratar instalador com credenciação ANACOM válida. O certificado ITED é emitido após ensaios e verificação da instalação.`,
      impact: "high",
      regulatoryBasis: "ITED - DL 123/2009",
    });
  }

  // Acoustic improvements
  if (criticalAreas.has("acoustic") || warningAreas.has("acoustic")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "acoustic",
      title: "Projeto de condicionamento acústico",
      description: `Elaborar projeto de condicionamento acústico por técnico competente. Deve verificar isolamento a sons aéreos (paredes e lajes), sons de percussão (lajes com pavimento flutuante) e isolamento de fachada.`,
      impact: "high",
      regulatoryBasis: "RRAE - DL 96/2008",
    });
  }

  // Gas improvements
  if (criticalAreas.has("gas") || warningAreas.has("gas")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "gas",
      title: "Revisão da instalação de gás",
      description: `Garantir que a instalação de gás é projetada e executada por instalador credenciado pela DGEG. Incluir ensaio de estanquidade, válvulas de emergência, ventilação adequada e deteção de gás.`,
      impact: "high",
      regulatoryBasis: "DL 521/99",
    });
  }

  // Water/drainage improvements
  if (criticalAreas.has("water_drainage") || warningAreas.has("water_drainage")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "water_drainage",
      title: "Revisão das redes de águas e drenagem",
      description: `Garantir sistema separativo de drenagem, válvulas anti-retorno, ventilação da rede e sifões em todos os aparelhos. Utilizar materiais modernos (PPR, PEX, multicamada) para abastecimento.`,
      impact: "high",
      regulatoryBasis: "DL 23/95 - RGSPPDADAR",
    });

    if (!project.waterDrainage.hasWaterReuse && !project.isRehabilitation) {
      recommendations.push({
        id: nextRecommendationId(),
        area: "water_drainage",
        title: "Reutilização de águas cinzentas/pluviais",
        description: `Considerar sistema de reutilização de águas cinzentas ou recolha de águas pluviais para rega e autoclismos. Pode reduzir o consumo de água potável em 30-40%.`,
        impact: "medium",
        estimatedSavings: "Redução de 30-40% no consumo de água",
        regulatoryBasis: "Boas práticas de sustentabilidade",
      });
    }
  }

  // Structural improvements
  if (criticalAreas.has("structural")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "structural",
      title: "Projeto de estabilidade e estudo geotécnico",
      description: `Elaborar projeto de estabilidade conforme Eurocódigos e estudo geotécnico do terreno. Fundamental para a segurança estrutural e dimensionamento das fundações, especialmente em zona sísmica.`,
      impact: "high",
      regulatoryBasis: "Eurocódigos EC0-EC8",
    });
  }

  // Elevator improvements
  if (criticalAreas.has("elevators") || warningAreas.has("elevators")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "elevators",
      title: "Conformidade do ascensor",
      description: `Garantir marcação CE, contrato de manutenção com empresa qualificada, inspeção periódica por entidade acreditada e comunicação de emergência 24h. A acessibilidade do ascensor deve cumprir o DL 163/2006.`,
      impact: "high",
      regulatoryBasis: "DL 320/2002, EN 81-20",
    });
  }

  // Licensing improvements
  if (criticalAreas.has("licensing") || warningAreas.has("licensing")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "licensing",
      title: "Regularização do licenciamento",
      description: `Garantir todos os instrumentos de licenciamento: projeto de arquitetura, projetos de especialidades, termos de responsabilidade, alvará de construção e licença de utilização. Consultar a câmara municipal sobre o enquadramento legal da operação.`,
      impact: "high",
      regulatoryBasis: "RJUE - DL 555/99",
    });
  }

  // Waste improvements
  if (criticalAreas.has("waste") || warningAreas.has("waste")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "waste",
      title: "Gestão de resíduos de construção",
      description: `Elaborar PPG (Plano de Prevenção e Gestão de RCD), garantir triagem em obra, transporte por operador licenciado e destino final em operador autorizado. Registar movimentos via e-GAR.`,
      impact: "medium",
      regulatoryBasis: "DL 46/2008",
    });
  }

  // Architecture improvements
  if (criticalAreas.has("architecture") || warningAreas.has("architecture")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "architecture",
      title: "Conformidade com Código Civil e RGEU",
      description: `Verificar conformidade do projeto de arquitetura com o Código Civil (vizinhança, aberturas, estilicídio) e RGEU (dimensões mínimas, pé-direito, iluminação natural, ventilação). Estes são requisitos de base para aprovação camarária.`,
      impact: "high",
      regulatoryBasis: "Código Civil + RGEU",
    });
  }

  // AVAC improvements
  if (criticalAreas.has("avac") || warningAreas.has("avac")) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "avac",
      title: "Projeto de AVAC e qualidade do ar",
      description: `Garantir projeto de AVAC com ventilação adequada (extração cozinha/WC, caudais de ar novo), controlo de qualidade do ar interior e plano de manutenção preventiva. Verificar conformidade com regulamento F-Gas para equipamentos com gases fluorados.`,
      impact: "high",
      regulatoryBasis: "RECS/REH - DL 118/2013",
    });
  }

  // General best-practice recommendations (always included)
  recommendations.push({
    id: nextRecommendationId(),
    area: "general",
    title: "Certificação energética",
    description: `Garantir a obtenção do Certificado Energético (CE) emitido por Perito Qualificado do SCE. A classe energética influencia o valor de mercado do imóvel e é obrigatória para venda ou arrendamento.`,
    impact: "medium",
    regulatoryBasis: "SCE - DL 101-D/2020",
  });

  if (project.isRehabilitation) {
    recommendations.push({
      id: nextRecommendationId(),
      area: "general",
      title: "Benefícios fiscais para reabilitação",
      description: `Projetos de reabilitação urbana podem beneficiar de IVA reduzido a 6%, isenção de IMI/IMT, e dedução em IRS. Verificar elegibilidade junto da Câmara Municipal e enquadramento em ARU (Área de Reabilitação Urbana).`,
      impact: "medium",
    });
  }

  return recommendations;
}

// ============================================================
// SCORING & ENERGY CLASS
// ============================================================

function buildRegulationSummary(findings: Finding[]): RegulationSummary[] {
  const areas: { area: RegulationArea; name: string }[] = [
    { area: "architecture", name: "1. Arquitetura (RGEU + Código Civil)" },
    { area: "structural", name: "2. Estruturas / Sísmica (Eurocódigos)" },
    { area: "fire_safety", name: "3. Segurança Contra Incêndio (SCIE + NTs)" },
    { area: "avac", name: "4. AVAC (Ventilação e Ar Condicionado)" },
    { area: "water_drainage", name: "5. Águas e Drenagem (RGSPPDADAR)" },
    { area: "gas", name: "6. Instalações de Gás (DL 521/99)" },
    { area: "electrical", name: "7. Instalações Elétricas (RTIEBT + ISQ/EREDES)" },
    { area: "ited_itur", name: "8. Telecomunicações (ITED/ITUR + ANACOM)" },
    { area: "thermal", name: "9. Desempenho Térmico (REH/RECS)" },
    { area: "acoustic", name: "10. Acústica (RRAE)" },
    { area: "accessibility", name: "11. Acessibilidade (DL 163/2006)" },
    { area: "energy", name: "12. Eficiência Energética (SCE)" },
    { area: "elevators", name: "13. Ascensores (DL 320/2002)" },
    { area: "licensing", name: "14. Licenciamento (RJUE)" },
    { area: "waste", name: "15. Resíduos de Construção (DL 46/2008)" },
    { area: "local", name: "16. Regulamentos Municipais" },
    { area: "general", name: "17. Regulamento Geral (RGEU)" },
  ];

  return areas.map(({ area, name }) => {
    const areaFindings = findings.filter(f => f.area === area);
    const criticalCount = areaFindings.filter(f => f.severity === "critical").length;
    const warningCount = areaFindings.filter(f => f.severity === "warning").length;
    const passCount = areaFindings.filter(f => f.severity === "pass").length;
    const total = areaFindings.length;

    let status: "compliant" | "non_compliant" | "partially_compliant" = "compliant";
    if (criticalCount > 0) status = "non_compliant";
    else if (warningCount > 0) status = "partially_compliant";

    const score = total > 0 ? Math.round((passCount / total) * 100) : 100;

    return {
      area,
      name,
      status,
      findingsCount: criticalCount + warningCount,
      score,
    };
  });
}

function calculateOverallScore(findings: Finding[]): number {
  const total = findings.length;
  if (total === 0) return 100;

  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 100 / total * 1.5;
    else if (f.severity === "warning") score -= 100 / total * 0.75;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function estimateEnergyClass(project: BuildingProject): EnergyClass {
  let ratio = 1.0; // Start at reference level (B-)

  // Envelope quality adjustments
  const winterZone = project.location.climateZoneWinter;
  const wallRef = MAX_U_VALUES.walls[winterZone];
  ratio *= 0.7 + 0.3 * (project.envelope.externalWallUValue / wallRef);

  const roofRef = MAX_U_VALUES.roofs[winterZone];
  ratio *= 0.8 + 0.2 * (project.envelope.roofUValue / roofRef);

  const windowRef = MAX_U_VALUES.windows[winterZone];
  ratio *= 0.8 + 0.2 * (project.envelope.windowUValue / windowRef);

  // System efficiency adjustments
  if (project.systems.heatingSystem === "heat_pump") ratio *= 0.6;
  else if (project.systems.heatingSystem === "gas_boiler") ratio *= 0.85;
  else if (project.systems.heatingSystem === "electric_radiator") ratio *= 1.4;

  if (project.systems.dhwSystem === "heat_pump" || project.systems.dhwSystem === "thermodynamic") ratio *= 0.7;
  else if (project.systems.dhwSystem === "solar_thermal") ratio *= 0.6;
  else if (project.systems.dhwSystem === "electric") ratio *= 1.3;

  // Renewable contribution
  if (project.systems.hasSolarPV) ratio *= 0.8;
  if (project.systems.hasSolarThermal) ratio *= 0.85;
  if (project.envelope.hasHRV) ratio *= 0.9;

  // Map to energy class
  if (ratio <= 0.25) return "A+";
  if (ratio <= 0.50) return "A";
  if (ratio <= 0.75) return "B";
  if (ratio <= 1.00) return "B-";
  if (ratio <= 1.50) return "C";
  if (ratio <= 2.00) return "D";
  if (ratio <= 2.50) return "E";
  return "F";
}
