/**
 * Municipal PDM (Plano Diretor Municipal) database and compliance checker.
 * Contains zoning parameters for major Portuguese municipalities and
 * auto-checks project data against PDM constraints.
 */

import type { BuildingProject, Finding, RegulationArea } from "./types";

// ── PDM Zone Types ──────────────────────────────────────────

export type PdmZoneClass =
  | "solo_urbano_consolidado"         // Urbanized land - consolidated
  | "solo_urbano_programar"           // Urbanized land - to program
  | "solo_urbano_equipamentos"        // Urban - equipment
  | "solo_rustico_agricola"           // Rural - agricultural
  | "solo_rustico_florestal"          // Rural - forestry
  | "solo_rustico_ren"                // Rural - REN (ecological reserve)
  | "solo_rustico_ran"                // Rural - RAN (agricultural reserve)
  | "espaco_verde"                    // Green/park space
  | "espaco_central"                  // Central / mixed use
  | "espaco_residencial"              // Residential
  | "espaco_actividades_economicas"   // Economic activities / industrial
  | "espaco_uso_especial_turismo"     // Special use - tourism
  | "espaco_uso_especial_equipamento" // Special use - public equipment
  | "nucleo_historico"                // Historic center
  | "area_urbanizacao_programada"     // Planned urbanization area
  | "unknown";

export interface PdmZoneConstraints {
  /** Zone display name */
  label: string;
  /** Maximum building height in meters */
  maxHeight?: number;
  /** Maximum number of floors (above ground) */
  maxFloors?: number;
  /** COS - Coeficiente de Ocupação do Solo (0-1) */
  cos?: number;
  /** CAS - Coeficiente de Afetação do Solo / utilização (ratio) */
  cas?: number;
  /** Minimum front setback in meters */
  setbackFront?: number;
  /** Minimum side setback in meters */
  setbackSide?: number;
  /** Minimum rear setback in meters */
  setbackRear?: number;
  /** Minimum lot area in m² */
  minLotArea?: number;
  /** Allowed building types */
  allowedTypes?: ("residential" | "commercial" | "mixed" | "industrial")[];
  /** Is new construction allowed? */
  newConstructionAllowed: boolean;
  /** Is rehabilitation/renovation allowed? */
  rehabilitationAllowed: boolean;
  /** Requires special authorization? */
  requiresSpecialAuth?: boolean;
  /** Notes/observations */
  notes?: string;
}

// ── Default zone constraints (generic Portuguese municipal rules) ──

const DEFAULT_ZONE_CONSTRAINTS: Record<PdmZoneClass, PdmZoneConstraints> = {
  solo_urbano_consolidado: {
    label: "Solo Urbano Consolidado",
    maxHeight: 21,
    maxFloors: 6,
    cos: 0.60,
    cas: 1.5,
    setbackFront: 3,
    setbackSide: 3,
    setbackRear: 6,
    allowedTypes: ["residential", "commercial", "mixed"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
  },
  solo_urbano_programar: {
    label: "Solo Urbano a Programar",
    maxHeight: 15,
    maxFloors: 4,
    cos: 0.40,
    cas: 1.0,
    setbackFront: 5,
    setbackSide: 3,
    setbackRear: 6,
    minLotArea: 300,
    allowedTypes: ["residential", "commercial", "mixed"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
    notes: "Sujeito a plano de urbanização ou de pormenor",
  },
  solo_urbano_equipamentos: {
    label: "Solo Urbano - Equipamentos",
    maxHeight: 15,
    maxFloors: 4,
    cos: 0.50,
    allowedTypes: ["commercial"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
    requiresSpecialAuth: true,
  },
  solo_rustico_agricola: {
    label: "Solo Rústico Agrícola",
    maxHeight: 6.5,
    maxFloors: 2,
    cos: 0.02,
    minLotArea: 5000,
    allowedTypes: [],
    newConstructionAllowed: false,
    rehabilitationAllowed: true,
    notes: "Construção nova condicionada a exploração agrícola. Apenas habitação para agricultor.",
  },
  solo_rustico_florestal: {
    label: "Solo Rústico Florestal",
    maxHeight: 6.5,
    maxFloors: 2,
    cos: 0.02,
    minLotArea: 5000,
    allowedTypes: [],
    newConstructionAllowed: false,
    rehabilitationAllowed: true,
    notes: "Construção condicionada. Requer parecer ICNF.",
  },
  solo_rustico_ren: {
    label: "Reserva Ecológica Nacional (REN)",
    newConstructionAllowed: false,
    rehabilitationAllowed: false,
    requiresSpecialAuth: true,
    notes: "Área non aedificandi. Apenas usos compatíveis com DL 166/2008. Requer parecer CCDR.",
  },
  solo_rustico_ran: {
    label: "Reserva Agrícola Nacional (RAN)",
    newConstructionAllowed: false,
    rehabilitationAllowed: false,
    requiresSpecialAuth: true,
    notes: "Solo afeto à atividade agrícola. Desafetação requer parecer da DRAP e CRAN.",
  },
  espaco_verde: {
    label: "Espaço Verde / Parque Urbano",
    maxHeight: 6,
    maxFloors: 1,
    cos: 0.05,
    allowedTypes: [],
    newConstructionAllowed: false,
    rehabilitationAllowed: true,
    notes: "Apenas equipamentos de apoio ao espaço verde (quiosques, instalações sanitárias).",
  },
  espaco_central: {
    label: "Espaço Central / Uso Misto",
    maxHeight: 25,
    maxFloors: 7,
    cos: 0.80,
    cas: 3.0,
    setbackFront: 0,
    setbackSide: 0,
    allowedTypes: ["residential", "commercial", "mixed"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
    notes: "Permite maior densidade. R/C preferencialmente comercial.",
  },
  espaco_residencial: {
    label: "Espaço Residencial",
    maxHeight: 15,
    maxFloors: 4,
    cos: 0.50,
    cas: 1.2,
    setbackFront: 5,
    setbackSide: 3,
    setbackRear: 6,
    minLotArea: 200,
    allowedTypes: ["residential", "mixed"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
  },
  espaco_actividades_economicas: {
    label: "Espaço de Atividades Económicas",
    maxHeight: 15,
    maxFloors: 3,
    cos: 0.60,
    cas: 1.0,
    setbackFront: 10,
    setbackSide: 5,
    setbackRear: 8,
    minLotArea: 500,
    allowedTypes: ["commercial", "industrial"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
  },
  espaco_uso_especial_turismo: {
    label: "Espaço de Uso Especial - Turismo",
    maxHeight: 12,
    maxFloors: 3,
    cos: 0.20,
    setbackFront: 10,
    allowedTypes: ["commercial"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
    requiresSpecialAuth: true,
    notes: "Requer parecer do Turismo de Portugal.",
  },
  espaco_uso_especial_equipamento: {
    label: "Espaço de Uso Especial - Equipamento",
    maxHeight: 15,
    maxFloors: 4,
    cos: 0.40,
    allowedTypes: ["commercial"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
  },
  nucleo_historico: {
    label: "Núcleo Histórico / Centro Histórico",
    maxFloors: 4,
    cos: 0.80,
    allowedTypes: ["residential", "commercial", "mixed"],
    newConstructionAllowed: false,
    rehabilitationAllowed: true,
    requiresSpecialAuth: true,
    notes: "Intervenções condicionadas: manter volumetria, cércea e tipologia. Requer parecer DGPC ou DRCA.",
  },
  area_urbanizacao_programada: {
    label: "Área de Urbanização Programada",
    maxHeight: 18,
    maxFloors: 5,
    cos: 0.40,
    cas: 1.2,
    setbackFront: 5,
    setbackSide: 3,
    setbackRear: 6,
    minLotArea: 250,
    allowedTypes: ["residential", "commercial", "mixed"],
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
    notes: "Requer plano de pormenor aprovado ou unidade de execução.",
  },
  unknown: {
    label: "Classificação PDM desconhecida",
    newConstructionAllowed: true,
    rehabilitationAllowed: true,
    notes: "Verifique a classificação do terreno no PDM do município.",
  },
};

// ── Municipality-specific overrides ──────────────────────────

interface MunicipalityPdm {
  name: string;
  district: string;
  pdmYear: number;
  /** Override constraints by zone class */
  overrides?: Partial<Record<PdmZoneClass, Partial<PdmZoneConstraints>>>;
  /** Default max height for the municipality (cércea dominante) */
  defaultMaxHeight?: number;
  /** Default max floors */
  defaultMaxFloors?: number;
  /** Special rules or observations */
  notes?: string;
}

const MUNICIPALITY_PDM: Record<string, MunicipalityPdm> = {
  lisboa: {
    name: "Lisboa",
    district: "Lisboa",
    pdmYear: 2012,
    defaultMaxHeight: 28,
    defaultMaxFloors: 8,
    notes: "PDM Lisboa: respeitar cércea dominante da frente urbana. Regime simplificado em ARU.",
    overrides: {
      espaco_central: { maxHeight: 35, maxFloors: 10, cos: 0.85, cas: 4.0 },
      nucleo_historico: { maxFloors: 5, notes: "Baixa Pombalina, Alfama, Mouraria: regras especiais DGPC." },
      espaco_residencial: { maxHeight: 21, maxFloors: 6, cos: 0.60, cas: 2.0 },
    },
  },
  porto: {
    name: "Porto",
    district: "Porto",
    pdmYear: 2021,
    defaultMaxHeight: 22,
    defaultMaxFloors: 7,
    notes: "PDM Porto 2021: Carta de Qualificação do Solo. Centro Histórico é Património Mundial UNESCO.",
    overrides: {
      nucleo_historico: {
        maxFloors: 4,
        notes: "Centro Histórico UNESCO: intervenções requerem parecer SRU Porto Vivo e IGESPAR.",
      },
      espaco_central: { maxHeight: 28, maxFloors: 8, cos: 0.80, cas: 3.5 },
    },
  },
  braga: {
    name: "Braga",
    district: "Braga",
    pdmYear: 2015,
    defaultMaxHeight: 18,
    defaultMaxFloors: 5,
    overrides: {
      espaco_residencial: { maxHeight: 15, maxFloors: 4, cos: 0.45 },
    },
  },
  coimbra: {
    name: "Coimbra",
    district: "Coimbra",
    pdmYear: 2014,
    defaultMaxHeight: 21,
    defaultMaxFloors: 6,
    notes: "Alta e Sofia: Património Mundial UNESCO. Regime especial de proteção.",
    overrides: {
      nucleo_historico: { maxFloors: 3, notes: "Alta de Coimbra: regime especial UNESCO." },
    },
  },
  faro: {
    name: "Faro",
    district: "Faro",
    pdmYear: 2015,
    defaultMaxHeight: 15,
    defaultMaxFloors: 4,
    notes: "Proximidade ao Parque Natural da Ria Formosa pode condicionar construção.",
    overrides: {
      espaco_residencial: { maxHeight: 12, maxFloors: 3, cos: 0.40 },
    },
  },
  funchal: {
    name: "Funchal",
    district: "Madeira",
    pdmYear: 2018,
    defaultMaxHeight: 18,
    defaultMaxFloors: 5,
    notes: "Zona Velha: regime de proteção especial. Zonas altas: condicionadas por declive.",
  },
  aveiro: {
    name: "Aveiro",
    district: "Aveiro",
    pdmYear: 2019,
    defaultMaxHeight: 18,
    defaultMaxFloors: 5,
  },
  leiria: {
    name: "Leiria",
    district: "Leiria",
    pdmYear: 2015,
    defaultMaxHeight: 15,
    defaultMaxFloors: 4,
  },
  setubal: {
    name: "Setúbal",
    district: "Setúbal",
    pdmYear: 2014,
    defaultMaxHeight: 18,
    defaultMaxFloors: 5,
    notes: "Proximidade ao Parque Natural da Arrábida pode condicionar. POOC em vigor.",
  },
  guimaraes: {
    name: "Guimarães",
    district: "Braga",
    pdmYear: 2015,
    defaultMaxHeight: 15,
    defaultMaxFloors: 4,
    notes: "Centro Histórico: Património Mundial UNESCO. Requer parecer DGPC.",
    overrides: {
      nucleo_historico: { maxFloors: 3, notes: "Centro Histórico UNESCO: volumetria e materiais condicionados." },
    },
  },
  viseu: {
    name: "Viseu",
    district: "Viseu",
    pdmYear: 2013,
    defaultMaxHeight: 15,
    defaultMaxFloors: 4,
  },
  almada: {
    name: "Almada",
    district: "Setúbal",
    pdmYear: 2017,
    defaultMaxHeight: 21,
    defaultMaxFloors: 6,
  },
  sintra: {
    name: "Sintra",
    district: "Lisboa",
    pdmYear: 2019,
    defaultMaxHeight: 12,
    defaultMaxFloors: 3,
    notes: "Paisagem Cultural de Sintra (UNESCO). Zona de proteção com restrições severas.",
    overrides: {
      espaco_residencial: { maxHeight: 9, maxFloors: 2, cos: 0.30, minLotArea: 400 },
      nucleo_historico: { maxFloors: 2, notes: "Centro Histórico de Sintra: condicionado pela UNESCO e DGPC." },
    },
  },
  cascais: {
    name: "Cascais",
    district: "Lisboa",
    pdmYear: 2015,
    defaultMaxHeight: 15,
    defaultMaxFloors: 4,
    overrides: {
      espaco_residencial: { maxHeight: 12, maxFloors: 3, cos: 0.40 },
    },
  },
  oeiras: {
    name: "Oeiras",
    district: "Lisboa",
    pdmYear: 2015,
    defaultMaxHeight: 21,
    defaultMaxFloors: 6,
  },
  loures: {
    name: "Loures",
    district: "Lisboa",
    pdmYear: 2015,
    defaultMaxHeight: 18,
    defaultMaxFloors: 5,
  },
  matosinhos: {
    name: "Matosinhos",
    district: "Porto",
    pdmYear: 2019,
    defaultMaxHeight: 21,
    defaultMaxFloors: 6,
  },
  vila_nova_de_gaia: {
    name: "Vila Nova de Gaia",
    district: "Porto",
    pdmYear: 2019,
    defaultMaxHeight: 21,
    defaultMaxFloors: 6,
    overrides: {
      nucleo_historico: { maxFloors: 4, notes: "Zona ribeirinha: proteção da relação visual com Centro Histórico do Porto." },
    },
  },
};

// ── PDM Zone Detection ──────────────────────────────────────

/**
 * Attempt to detect PDM zone class from the project's pdmZoning string.
 */
export function detectPdmZone(pdmZoning?: string): PdmZoneClass {
  if (!pdmZoning) return "unknown";
  const z = pdmZoning.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/\bren\b/.test(z)) return "solo_rustico_ren";
  if (/\bran\b/.test(z)) return "solo_rustico_ran";
  if (/nucleo\s*histor|centro\s*histor|patrimoni/.test(z)) return "nucleo_historico";
  if (/verde|parque\s*urban/.test(z)) return "espaco_verde";
  if (/central|mist[oa]|uso\s*misto/.test(z)) return "espaco_central";
  if (/actividade|econom|industr/.test(z)) return "espaco_actividades_economicas";
  if (/turism/.test(z)) return "espaco_uso_especial_turismo";
  if (/equipamento/.test(z)) return "espaco_uso_especial_equipamento";
  if (/residencial|habita/.test(z)) return "espaco_residencial";
  if (/urbano.*consolidado|consolidad/.test(z)) return "solo_urbano_consolidado";
  if (/urbano.*programar|urbaniza.*programa/.test(z)) return "solo_urbano_programar";
  if (/urbano/.test(z)) return "solo_urbano_consolidado";
  if (/rustic.*agric/.test(z)) return "solo_rustico_agricola";
  if (/rustic.*florest/.test(z)) return "solo_rustico_florestal";
  if (/rustic/.test(z)) return "solo_rustico_agricola";

  return "unknown";
}

// ── Constraint Resolution ───────────────────────────────────

/**
 * Get the effective PDM constraints for a project, merging defaults
 * with municipality-specific overrides.
 */
export function getPdmConstraints(
  municipality: string,
  pdmZoning?: string,
): { zone: PdmZoneClass; constraints: PdmZoneConstraints; municipalityData?: MunicipalityPdm } {
  const zone = detectPdmZone(pdmZoning);
  const base = { ...DEFAULT_ZONE_CONSTRAINTS[zone] };

  // Find municipality data
  const key = municipality
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  const muni = MUNICIPALITY_PDM[key];

  if (muni) {
    // Apply municipality defaults
    if (muni.defaultMaxHeight && !base.maxHeight) {
      base.maxHeight = muni.defaultMaxHeight;
    }
    if (muni.defaultMaxFloors && !base.maxFloors) {
      base.maxFloors = muni.defaultMaxFloors;
    }

    // Apply zone-specific overrides
    const override = muni.overrides?.[zone];
    if (override) {
      Object.assign(base, override);
    }

    if (muni.notes && !base.notes) {
      base.notes = muni.notes;
    }
  }

  return { zone, constraints: base, municipalityData: muni };
}

// ── PDM Compliance Checker ──────────────────────────────────

let pdmFindingCounter = 0;

export function checkPdmCompliance(project: BuildingProject): Finding[] {
  pdmFindingCounter = 0;
  const findings: Finding[] = [];
  const pdmZoning = project.localRegulations.pdmZoning;
  const municipality = project.location.municipality;

  if (!pdmZoning && !municipality) return findings;

  const { zone, constraints, municipalityData } = getPdmConstraints(municipality, pdmZoning);

  // If zone is unknown and no PDM zoning specified, just add an info
  if (zone === "unknown") {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: "PDM Municipal",
      article: "Classificação do Solo",
      description: `A classificação PDM do terreno não foi especificada. Verifique a planta de ordenamento do PDM de ${municipality || "do município"} para obter os parâmetros urbanísticos aplicáveis.`,
      severity: "warning",
      remediation: `Consultar a planta de ordenamento e regulamento do PDM de ${municipality || "do município"} no site da câmara municipal ou no portal do SNIT (snit.dgterritorio.gov.pt). Identificar a classificação e qualificação do solo para a parcela.`,
    });
    return findings;
  }

  const reg = municipalityData
    ? `PDM ${municipalityData.name} (${municipalityData.pdmYear})`
    : "PDM Municipal";

  // Check if construction is allowed
  if (!project.isRehabilitation && !constraints.newConstructionAllowed) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: `${constraints.label}`,
      description: `A zona ${constraints.label} não permite construção nova. ${constraints.notes || ""}`,
      severity: "critical",
      remediation: constraints.rehabilitationAllowed
        ? "Considerar a requalificação como projeto de reabilitação em vez de construção nova, ou solicitar desafetação junto da entidade competente."
        : "Esta zona não permite edificação. Consultar a câmara municipal sobre alternativas ou possível reclassificação do solo.",
    });
  }

  if (project.isRehabilitation && !constraints.rehabilitationAllowed) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: `${constraints.label}`,
      description: `A zona ${constraints.label} não permite intervenções de reabilitação sem autorização especial.`,
      severity: "critical",
      remediation: "Solicitar parecer prévio à câmara municipal e às entidades competentes (CCDR, APA) antes de submeter o projeto.",
    });
  }

  // Check building type compatibility
  if (constraints.allowedTypes && constraints.allowedTypes.length > 0) {
    if (!constraints.allowedTypes.includes(project.buildingType)) {
      const allowed = constraints.allowedTypes.join(", ");
      findings.push({
        id: `PDM-${++pdmFindingCounter}`,
        area: "local",
        regulation: reg,
        article: "Usos Compatíveis",
        description: `O uso "${project.buildingType}" não é compatível com a zona ${constraints.label}. Usos permitidos: ${allowed}.`,
        severity: "critical",
        currentValue: project.buildingType,
        requiredValue: allowed,
        remediation: `Alterar o uso proposto para um dos usos compatíveis (${allowed}) ou solicitar parecer à câmara municipal sobre a possibilidade de uso misto.`,
      });
    }
  }

  // Check height
  if (constraints.maxHeight && project.buildingHeight > constraints.maxHeight) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "Cércea Máxima",
      description: `A altura do edifício (${project.buildingHeight}m) excede a cércea máxima permitida na zona ${constraints.label}.`,
      severity: "critical",
      currentValue: `${project.buildingHeight}m`,
      requiredValue: `≤ ${constraints.maxHeight}m`,
      remediation: `Reduzir a altura do edifício para no máximo ${constraints.maxHeight}m (cércea máxima da zona). Considerar reduzir o número de pisos ou o pé-direito.`,
    });
  } else if (constraints.maxHeight) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "Cércea Máxima",
      description: `A altura do edifício cumpre a cércea máxima da zona ${constraints.label}.`,
      severity: "pass",
      currentValue: `${project.buildingHeight}m`,
      requiredValue: `≤ ${constraints.maxHeight}m`,
    });
  }

  // Check floors
  if (constraints.maxFloors && project.numberOfFloors > constraints.maxFloors) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "Número Máximo de Pisos",
      description: `O número de pisos (${project.numberOfFloors}) excede o máximo permitido na zona ${constraints.label}.`,
      severity: "critical",
      currentValue: `${project.numberOfFloors} pisos`,
      requiredValue: `≤ ${constraints.maxFloors} pisos`,
      remediation: `Reduzir o projeto para no máximo ${constraints.maxFloors} pisos acima do solo. Se necessário, explorar pisos enterrados (caves) que tipicamente não contam para a cércea.`,
    });
  } else if (constraints.maxFloors) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "Número Máximo de Pisos",
      description: `O número de pisos cumpre o limite da zona ${constraints.label}.`,
      severity: "pass",
      currentValue: `${project.numberOfFloors} pisos`,
      requiredValue: `≤ ${constraints.maxFloors} pisos`,
    });
  }

  // Check COS (coefficient of soil occupation)
  if (constraints.cos && project.grossFloorArea > 0) {
    // Estimate footprint as GFA / floors (simplified)
    const estimatedFootprint = project.grossFloorArea / Math.max(1, project.numberOfFloors);
    // We don't have lot area, but we can flag if COS would imply a minimum lot
    const minLotFromCos = estimatedFootprint / constraints.cos;
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "COS - Coeficiente de Ocupação do Solo",
      description: `COS máximo: ${constraints.cos}. Com a implantação estimada de ~${Math.round(estimatedFootprint)} m², o lote mínimo necessário seria ~${Math.round(minLotFromCos)} m². Verificar contra a área real do lote.`,
      severity: "info",
      requiredValue: `COS ≤ ${constraints.cos}`,
    });
  }

  // Special authorization warning
  if (constraints.requiresSpecialAuth) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "Autorização Especial",
      description: `A zona ${constraints.label} requer autorização especial para intervenções. ${constraints.notes || ""}`,
      severity: "warning",
      remediation: "Solicitar parecer prévio à câmara municipal e entidades relevantes (DGPC, CCDR, APA, ICNF) antes de submeter o projeto de licenciamento.",
    });
  }

  // Protected area checks
  if (project.licensing.isProtectedArea) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "Área Protegida / Património",
      description: "O projeto situa-se em área protegida ou zona de proteção de património classificado. Estão em vigor condicionantes específicas do POAP, ZEP ou regulamentação DGPC.",
      severity: "warning",
      remediation: "1) Consultar a DGPC/DRCA para zonas de proteção de imóveis classificados. 2) Para áreas protegidas naturais, consultar o ICNF. 3) Para REN/RAN, contactar a CCDR regional. 4) Incluir parecer favorável da entidade com a submissão do projeto.",
    });
  }

  // ARU (Área de Reabilitação Urbana)
  if (project.licensing.isInARU) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "Área de Reabilitação Urbana (ARU)",
      description: "O projeto localiza-se numa ARU, beneficiando de incentivos fiscais (IVA 6%, IMI, IRC) e procedimento simplificado para obras de reabilitação (comunicação prévia).",
      severity: "info",
      remediation: "Aproveitar os benefícios ARU: IVA reduzido a 6% para obras de reabilitação, isenção de IMI, dedução de IRS. Verificar o regime aplicável na Estratégia de Reabilitação Urbana do município.",
    });
  }

  // Municipality-specific notes
  if (municipalityData?.notes) {
    findings.push({
      id: `PDM-${++pdmFindingCounter}`,
      area: "local",
      regulation: reg,
      article: "Notas Municipais",
      description: municipalityData.notes,
      severity: "info",
    });
  }

  return findings;
}

/**
 * Get all available municipalities with PDM data.
 */
export function getAvailableMunicipalities(): string[] {
  return Object.values(MUNICIPALITY_PDM).map(m => m.name).sort();
}

/**
 * Get available PDM zone classifications with labels.
 */
export function getPdmZoneOptions(): { value: PdmZoneClass; label: string }[] {
  return Object.entries(DEFAULT_ZONE_CONSTRAINTS)
    .filter(([key]) => key !== "unknown")
    .map(([key, val]) => ({ value: key as PdmZoneClass, label: val.label }));
}
