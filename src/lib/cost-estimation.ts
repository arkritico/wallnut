/**
 * Cost estimation module based on Gerador de Preços reference data.
 *
 * Uses the price item code structure (3 letters + 3 digits) and unit pricing
 * from geradordeprecos.info to estimate remediation costs for non-compliance
 * findings. Includes 3-component breakdown (materials, labor, machinery),
 * parametric adjustments by district and building type, and automatic
 * quantity estimation from project data.
 *
 * Reference: geradordeprecos.info (Portugal, Reabilitação + Obra Nova)
 * Prices: EUR, Portuguese market 2024-2025
 */

import type { BuildingProject, Finding, RegulationArea } from "./types";
import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
// NOTE: price-db-loader uses fs/winston — imported lazily to avoid
// pulling Node.js modules into the client bundle (WbsSchedule.tsx imports formatCost).
import { aggregateIfcQuantities, lookupIfcQuantity, type IfcQuantitySummary } from "./ifc-quantity-takeoff";

// ============================================================
// Types
// ============================================================

export interface CostComponent {
  materials: number;
  labor: number;
  machinery: number;
}

export interface PriceWorkItem {
  /** Price item code (e.g., IOD010, ZFF120, IEI015) */
  code: string;
  /** Portuguese description */
  description: string;
  /** Price chapter path */
  chapter: string;
  /** Measurement unit */
  unit: string;  // Common: "m2" | "m" | "Ud" | "m3" | "kg" | "sistema" | "projeto" | "ensaio" | "vg" and others
  /** Unit cost (EUR) */
  unitCost: number;
  /** Cost breakdown */
  breakdown: CostComponent;
  /** Whether this is rehabilitation pricing (vs obra nova) */
  isRehab: boolean;
  /** Applicable regulation areas */
  areas: RegulationArea[];
  /** Regex patterns to match against finding descriptions */
  patterns: RegExp[];
  /** Detailed breakdown from scraper (for resource aggregation) */
  detailedBreakdown?: Array<{
    code: string;
    unit: string;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    total: number | null;
    type: 'material' | 'labor' | 'machinery';
  }>;
  /** Source typology (obra_nova, reabilitacao, espacos_urbanos) */
  typology?: "obra_nova" | "reabilitacao" | "espacos_urbanos";
}

export interface CostLineItem {
  /** Finding that triggered this cost */
  findingId: string;
  findingDescription: string;
  /** Price work item reference */
  workItem: PriceWorkItem;
  /** Estimated quantity */
  quantity: number;
  /** How quantity was determined */
  quantitySource: "measured" | "estimated" | "minimum";
  /** Total cost (quantity * unitCost) */
  totalCost: number;
  /** Adjusted cost after location/type factors */
  adjustedCost: number;
  /** Cost breakdown scaled to quantity */
  breakdown: CostComponent;
  /** Confidence level */
  confidence: "high" | "medium" | "low";
}

export interface CostEstimate {
  findingId: string;
  area: RegulationArea;
  description: string;
  minCost: number;
  maxCost: number;
  unit: string;
  confidence: "high" | "medium" | "low";
  notes: string;
  /** Detailed line items from CYPE database */
  lineItems?: CostLineItem[];
  /** Price reference code */
  priceCode?: string;
}

export interface CostSummary {
  estimates: CostEstimate[];
  totalMinCost: number;
  totalMaxCost: number;
  byArea: { area: RegulationArea; areaName: string; minCost: number; maxCost: number; count: number }[];
  currency: string;
  /** Detailed price line items */
  lineItems: CostLineItem[];
  /** Location adjustment factor applied */
  locationFactor: number;
  /** Building type adjustment factor */
  typeFactor: number;
  /** Contingency buffer */
  contingency: {
    percent: number;
    amount: number;
  };
  /** Total cost range including contingency */
  totalWithContingency: { min: number; max: number };
  /** Number of line items where bulk discount was applied */
  scaledLineItems: number;
  /** How many items came from the full price database (vs curated) */
  databaseItemsUsed: number;
}

// ============================================================
// Reference Price Database
// ============================================================

/**
 * Price work items database. Prices are reference values from
 * geradordeprecos.info for Portugal (2024-2025 market).
 *
 * Code structure: 3 letters (chapter/subchapter/section) + 3 digits (item)
 *   I = Instalações, O = Contra incêndios, D = Deteção = IOD
 *   Z = Reabilitação energética, F = Fachadas, F = ETICS = ZFF
 *   I = Instalações, E = Elétricas, I = Interiores = IEI
 */
const CURATED_ITEMS: PriceWorkItem[] = [
  // ─── FIRE SAFETY (IO) ──────────────────────────────────────
  {
    code: "IOD010", description: "Central de deteção de incêndio analógica",
    chapter: "Instalações > Contra incêndios > Deteção e alarme",
    unit: "Ud", unitCost: 1850, breakdown: { materials: 1400, labor: 380, machinery: 70 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/central.*deteção|SADI|fire.*detection.*panel/i],
  },
  {
    code: "IOD102", description: "Detetor ótico de fumos analógico",
    chapter: "Instalações > Contra incêndios > Deteção e alarme",
    unit: "Ud", unitCost: 85, breakdown: { materials: 62, labor: 20, machinery: 3 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/detetor.*fumo|smoke.*detector|deteção.*automática/i],
  },
  {
    code: "IOD200", description: "Botoneira de alarme manual",
    chapter: "Instalações > Contra incêndios > Deteção e alarme",
    unit: "Ud", unitCost: 55, breakdown: { materials: 38, labor: 15, machinery: 2 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/botoneira|manual.*call.*point/i],
  },
  {
    code: "IOD300", description: "Sirene de alarme de incêndio",
    chapter: "Instalações > Contra incêndios > Deteção e alarme",
    unit: "Ud", unitCost: 95, breakdown: { materials: 70, labor: 22, machinery: 3 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/sirene|alarme.*incêndio|fire.*alarm/i],
  },
  {
    code: "IOA010", description: "Bloco autónomo de iluminação de emergência",
    chapter: "Instalações > Contra incêndios > Iluminação de emergência",
    unit: "Ud", unitCost: 65, breakdown: { materials: 48, labor: 15, machinery: 2 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/iluminação.*emergência|emergency.*lighting|bloco.*autónomo/i],
  },
  {
    code: "IOX010", description: "Extintor portátil ABC 6 kg",
    chapter: "Instalações > Contra incêndios > Extintores",
    unit: "Ud", unitCost: 52, breakdown: { materials: 40, labor: 10, machinery: 2 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/extintor/i],
  },
  {
    code: "IOT010", description: "Rede de sprinklers automáticos",
    chapter: "Instalações > Contra incêndios > Sistemas fixos de extinção",
    unit: "m2", unitCost: 45, breakdown: { materials: 28, labor: 14, machinery: 3 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/sprinkler/i],
  },
  {
    code: "IOR010", description: "Proteção passiva com placas de gesso (EI 60)",
    chapter: "Instalações > Contra incêndios > Proteção passiva",
    unit: "m2", unitCost: 42, breakdown: { materials: 25, labor: 15, machinery: 2 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/resistência.*fogo|fire.*resistance|REI|proteção.*passiva/i],
  },
  {
    code: "IOR050", description: "Pintura intumescente para estrutura metálica (R 60)",
    chapter: "Instalações > Contra incêndios > Proteção passiva",
    unit: "m2", unitCost: 32, breakdown: { materials: 18, labor: 12, machinery: 2 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/intumescente|proteção.*estrutura.*fogo/i],
  },
  {
    code: "IOB010", description: "Boca-de-incêndio armada tipo carretel (Ø25)",
    chapter: "Instalações > Contra incêndios > Redes de incêndio",
    unit: "Ud", unitCost: 680, breakdown: { materials: 520, labor: 140, machinery: 20 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/boca.*incêndio|carretel|rede.*incêndio.*armada/i],
  },
  {
    code: "IOS010", description: "Sinalização fotoluminescente de evacuação",
    chapter: "Instalações > Contra incêndios > Sinalização",
    unit: "Ud", unitCost: 18, breakdown: { materials: 12, labor: 5, machinery: 1 },
    isRehab: false, areas: ["fire_safety"],
    patterns: [/sinalização.*evacuação|sinal.*saída|exit.*sign/i],
  },

  // ─── ENERGY REHABILITATION (Z) ─────────────────────────────
  {
    code: "ZFF120", description: "Sistema ETICS (capoto) com EPS 60mm",
    chapter: "Reabilitação energética > Isolamento térmico fachadas",
    unit: "m2", unitCost: 48, breakdown: { materials: 30, labor: 16, machinery: 2 },
    isRehab: true, areas: ["thermal"],
    patterns: [/ETICS|capoto|isolamento.*exterior.*parede|parede.*exterior.*U|coeficiente.*transmissão.*parede/i],
  },
  {
    code: "ZFF150", description: "Sistema ETICS com lã mineral 60mm (A1 - incombustível)",
    chapter: "Reabilitação energética > Isolamento térmico fachadas",
    unit: "m2", unitCost: 62, breakdown: { materials: 40, labor: 19, machinery: 3 },
    isRehab: true, areas: ["thermal"],
    patterns: [/lã.*mineral.*fachada|isolamento.*exterior.*incombustível/i],
  },
  {
    code: "ZBL010", description: "Substituição de janela por caixilharia de alumínio RPT com vidro duplo",
    chapter: "Reabilitação energética > Substituição de aberturas",
    unit: "m2", unitCost: 420, breakdown: { materials: 320, labor: 85, machinery: 15 },
    isRehab: true, areas: ["thermal"],
    patterns: [/envidraçado|window.*U|janela|caixilharia|substituição.*janela/i],
  },
  {
    code: "ZBL020", description: "Substituição de janela por caixilharia PVC com vidro duplo",
    chapter: "Reabilitação energética > Substituição de aberturas",
    unit: "m2", unitCost: 380, breakdown: { materials: 290, labor: 75, machinery: 15 },
    isRehab: true, areas: ["thermal"],
    patterns: [/PVC.*janela|janela.*PVC/i],
  },
  {
    code: "ZHT010", description: "Isolamento térmico de cobertura com XPS 60mm",
    chapter: "Reabilitação energética > Isolamento térmico horizontal",
    unit: "m2", unitCost: 28, breakdown: { materials: 18, labor: 8, machinery: 2 },
    isRehab: true, areas: ["thermal"],
    patterns: [/cobertura.*U|roof.*U|isolamento.*cobertura/i],
  },
  {
    code: "ZHT020", description: "Isolamento térmico de pavimento com XPS 40mm",
    chapter: "Reabilitação energética > Isolamento térmico horizontal",
    unit: "m2", unitCost: 22, breakdown: { materials: 14, labor: 6, machinery: 2 },
    isRehab: true, areas: ["thermal"],
    patterns: [/pavimento.*U|floor.*U|isolamento.*pavimento/i],
  },
  {
    code: "ZTF010", description: "Correção de ponte térmica plana (caixa de estore)",
    chapter: "Reabilitação energética > Pontes térmicas",
    unit: "m", unitCost: 35, breakdown: { materials: 20, labor: 13, machinery: 2 },
    isRehab: true, areas: ["thermal"],
    patterns: [/ponte.*térmica|thermal.*bridge/i],
  },
  {
    code: "ZCC010", description: "Bomba de calor ar-água para aquecimento e AQS",
    chapter: "Reabilitação energética > Aquecimento, climatização e AQS",
    unit: "Ud", unitCost: 4500, breakdown: { materials: 3600, labor: 750, machinery: 150 },
    isRehab: true, areas: ["thermal", "energy"],
    patterns: [/bomba.*calor|heat.*pump/i],
  },
  {
    code: "ZCC050", description: "Kit solar térmico forçado 300L (2 coletores)",
    chapter: "Reabilitação energética > Aquecimento, climatização e AQS",
    unit: "Ud", unitCost: 3200, breakdown: { materials: 2500, labor: 580, machinery: 120 },
    isRehab: true, areas: ["thermal", "energy"],
    patterns: [/solar.*térmico|solar.*thermal|coletor.*solar/i],
  },
  {
    code: "ZCC080", description: "Sistema solar fotovoltaico 3.68 kWp (autoconsumo)",
    chapter: "Reabilitação energética > Instalações elétricas",
    unit: "Ud", unitCost: 5200, breakdown: { materials: 4000, labor: 1000, machinery: 200 },
    isRehab: true, areas: ["energy"],
    patterns: [/solar.*fotovoltaico|solar.*PV|fotovoltaico|autoconsumo/i],
  },

  // ─── INSULATION & WATERPROOFING (N) ────────────────────────
  {
    code: "NAT010", description: "Isolamento térmico de fachada pelo interior com lã mineral 50mm + gesso cartonado",
    chapter: "Isolamentos > Isolamentos térmicos",
    unit: "m2", unitCost: 38, breakdown: { materials: 24, labor: 12, machinery: 2 },
    isRehab: true, areas: ["thermal"],
    patterns: [/isolamento.*interior.*parede|parede.*interior.*isolamento/i],
  },
  {
    code: "NBB010", description: "Isolamento acústico de parede com lã mineral 50mm + gesso cartonado duplo",
    chapter: "Isolamentos > Isolamentos sonoros",
    unit: "m2", unitCost: 45, breakdown: { materials: 28, labor: 15, machinery: 2 },
    isRehab: false, areas: ["acoustic"],
    patterns: [/isolamento.*acústico|acoustic.*insulation|sons.*aéreos|airborne/i],
  },
  {
    code: "NBB020", description: "Pavimento flutuante com membrana resiliente para sons de percussão",
    chapter: "Isolamentos > Isolamentos sonoros",
    unit: "m2", unitCost: 32, breakdown: { materials: 20, labor: 10, machinery: 2 },
    isRehab: false, areas: ["acoustic"],
    patterns: [/sons.*percussão|impact.*insulation|pavimento.*flutuante/i],
  },
  {
    code: "NBB030", description: "Reforço acústico de fachada (janela + parede)",
    chapter: "Isolamentos > Isolamentos sonoros",
    unit: "m2", unitCost: 85, breakdown: { materials: 55, labor: 25, machinery: 5 },
    isRehab: true, areas: ["acoustic"],
    patterns: [/fachada.*acústic|isolamento.*fachada.*acústic|D2m/i],
  },

  // ─── ELECTRICAL (IE) ───────────────────────────────────────
  {
    code: "IEI015", description: "Rede de distribuição interior em habitação (T3)",
    chapter: "Instalações > Elétricas > Instalações interiores",
    unit: "Ud", unitCost: 4500, breakdown: { materials: 2800, labor: 1500, machinery: 200 },
    isRehab: false, areas: ["electrical"],
    patterns: [/instalação.*elétrica.*completa|rede.*distribuição.*interior/i],
  },
  {
    code: "IEP010", description: "Quadro elétrico de habitação (12 módulos)",
    chapter: "Instalações > Elétricas > Quadros e proteções",
    unit: "Ud", unitCost: 680, breakdown: { materials: 480, labor: 170, machinery: 30 },
    isRehab: false, areas: ["electrical"],
    patterns: [/quadro.*elétrico|distribution.*board|quadro.*habitação/i],
  },
  {
    code: "IEP020", description: "Interruptor diferencial 40A/30mA bipolar",
    chapter: "Instalações > Elétricas > Quadros e proteções",
    unit: "Ud", unitCost: 85, breakdown: { materials: 65, labor: 18, machinery: 2 },
    isRehab: false, areas: ["electrical"],
    patterns: [/diferencial|RCD|residual.*current/i],
  },
  {
    code: "IEP030", description: "Descarregador de sobretensões tipo 2 (SPD)",
    chapter: "Instalações > Elétricas > Quadros e proteções",
    unit: "Ud", unitCost: 165, breakdown: { materials: 130, labor: 30, machinery: 5 },
    isRehab: false, areas: ["electrical"],
    patterns: [/descarregador.*sobretensão|SPD|surge/i],
  },
  {
    code: "IEP050", description: "Elétrodo de terra e condutor (sistema TT)",
    chapter: "Instalações > Elétricas > Terra e equipotenciais",
    unit: "Ud", unitCost: 380, breakdown: { materials: 220, labor: 130, machinery: 30 },
    isRehab: false, areas: ["electrical"],
    patterns: [/terra.*proteção|earthing|ligação.*terra|elétrodo.*terra/i],
  },
  {
    code: "IEP060", description: "Ligações equipotenciais em instalação sanitária",
    chapter: "Instalações > Elétricas > Terra e equipotenciais",
    unit: "Ud", unitCost: 120, breakdown: { materials: 65, labor: 50, machinery: 5 },
    isRehab: false, areas: ["electrical"],
    patterns: [/equipotencial/i],
  },
  {
    code: "IEV010", description: "Ponto de carregamento de veículo elétrico (wallbox 7.4 kW)",
    chapter: "Instalações > Elétricas > Mobilidade elétrica",
    unit: "Ud", unitCost: 1450, breakdown: { materials: 1100, labor: 300, machinery: 50 },
    isRehab: false, areas: ["electrical"],
    patterns: [/VE.*carregamento|EV.*charging|wallbox|veículo.*elétrico/i],
  },
  {
    code: "IEI050", description: "Esquema unifilar do quadro elétrico",
    chapter: "Instalações > Elétricas > Documentação",
    unit: "Ud", unitCost: 250, breakdown: { materials: 0, labor: 250, machinery: 0 },
    isRehab: false, areas: ["electrical"],
    patterns: [/esquema.*unifilar|schematic.*diagram/i],
  },

  // ─── TELECOMMUNICATIONS (IL) ───────────────────────────────
  {
    code: "ILA010", description: "Armário de Telecomunicações de Edifício (ATE)",
    chapter: "Instalações > Telecomunicações > ITED",
    unit: "Ud", unitCost: 2200, breakdown: { materials: 1700, labor: 420, machinery: 80 },
    isRehab: false, areas: ["telecommunications"],
    patterns: [/ATE|armário.*telecomunicações.*edifício/i],
  },
  {
    code: "ILA020", description: "Armário de Telecomunicações Individual (ATI)",
    chapter: "Instalações > Telecomunicações > ITED",
    unit: "Ud", unitCost: 450, breakdown: { materials: 320, labor: 110, machinery: 20 },
    isRehab: false, areas: ["telecommunications"],
    patterns: [/ATI|armário.*telecomunicações.*individual/i],
  },
  {
    code: "ILA050", description: "Cabo de fibra óptica monomodo (ITED por fração)",
    chapter: "Instalações > Telecomunicações > Cablagem",
    unit: "Ud", unitCost: 380, breakdown: { materials: 250, labor: 110, machinery: 20 },
    isRehab: false, areas: ["telecommunications"],
    patterns: [/fibra.*óptica|fiber.*optic|monomodo/i],
  },
  {
    code: "ILA080", description: "Certificação ITED por fração (instalador credenciado ANACOM)",
    chapter: "Instalações > Telecomunicações > Certificação",
    unit: "Ud", unitCost: 350, breakdown: { materials: 0, labor: 350, machinery: 0 },
    isRehab: false, areas: ["telecommunications"],
    patterns: [/certificação.*ITED|ITED.*certif/i],
  },

  // ─── WATER & DRAINAGE (IF/IS) ──────────────────────────────
  {
    code: "IFA010", description: "Rede de abastecimento de água fria em habitação (PPR)",
    chapter: "Instalações > Abastecimento de água",
    unit: "Ud", unitCost: 2200, breakdown: { materials: 1400, labor: 700, machinery: 100 },
    isRehab: false, areas: ["water_drainage"],
    patterns: [/rede.*abastecimento|rede.*água.*fria/i],
  },
  {
    code: "IFA030", description: "Válvula anti-retorno PN16 (Ø32mm)",
    chapter: "Instalações > Abastecimento de água > Válvulas",
    unit: "Ud", unitCost: 85, breakdown: { materials: 60, labor: 22, machinery: 3 },
    isRehab: false, areas: ["water_drainage"],
    patterns: [/válvula.*retorno|check.*valve|anti.*retorno/i],
  },
  {
    code: "IFA040", description: "Redutor de pressão regulável (Ø25mm)",
    chapter: "Instalações > Abastecimento de água > Válvulas",
    unit: "Ud", unitCost: 120, breakdown: { materials: 85, labor: 30, machinery: 5 },
    isRehab: false, areas: ["water_drainage"],
    patterns: [/redutor.*pressão/i],
  },
  {
    code: "ISS010", description: "Separação de redes de drenagem (residual + pluvial)",
    chapter: "Instalações > Drenagem > Separação de redes",
    unit: "Ud", unitCost: 4500, breakdown: { materials: 2500, labor: 1700, machinery: 300 },
    isRehab: true, areas: ["water_drainage"],
    patterns: [/separação.*drenagem|drenagem.*separativa|sistema.*separativo/i],
  },
  {
    code: "ISV010", description: "Ventilação primária de coluna de queda (tubo PVC Ø75)",
    chapter: "Instalações > Drenagem > Ventilação",
    unit: "m", unitCost: 28, breakdown: { materials: 16, labor: 10, machinery: 2 },
    isRehab: false, areas: ["water_drainage"],
    patterns: [/ventilação.*drenagem|ventilação.*coluna|tubo.*queda/i],
  },

  // ─── GAS (IG) ──────────────────────────────────────────────
  {
    code: "IGI010", description: "Detetor de gás com electroválvula de corte",
    chapter: "Instalações > Gases combustíveis > Deteção",
    unit: "Ud", unitCost: 280, breakdown: { materials: 220, labor: 50, machinery: 10 },
    isRehab: false, areas: ["gas"],
    patterns: [/detetor.*gás|gas.*detector|electroválvula.*gás/i],
  },
  {
    code: "IGI020", description: "Ensaio de estanquidade de instalação de gás",
    chapter: "Instalações > Gases combustíveis > Ensaios",
    unit: "ensaio", unitCost: 250, breakdown: { materials: 20, labor: 200, machinery: 30 },
    isRehab: false, areas: ["gas"],
    patterns: [/ensaio.*estanquidade.*gás|pressure.*test.*gas/i],
  },

  // ─── ACCESSIBILITY ─────────────────────────────────────────
  {
    code: "HAR010", description: "Rampa acessível com corrimão duplo (DL 163/2006)",
    chapter: "Remates e trabalhos auxiliares > Acessibilidade",
    unit: "m", unitCost: 450, breakdown: { materials: 280, labor: 150, machinery: 20 },
    isRehab: true, areas: ["accessibility"],
    patterns: [/rampa.*acessível|accessible.*ramp|rampa.*inclinação/i],
  },
  {
    code: "HAW010", description: "Adaptação de instalação sanitária acessível",
    chapter: "Remates e trabalhos auxiliares > Acessibilidade",
    unit: "Ud", unitCost: 5500, breakdown: { materials: 3500, labor: 1700, machinery: 300 },
    isRehab: true, areas: ["accessibility"],
    patterns: [/WC.*acessível|IS.*acessível|sanitári.*acessível/i],
  },
  {
    code: "HAD010", description: "Alargamento de vão de porta (0.87 → 0.90m)",
    chapter: "Remates e trabalhos auxiliares > Acessibilidade",
    unit: "Ud", unitCost: 650, breakdown: { materials: 380, labor: 240, machinery: 30 },
    isRehab: true, areas: ["accessibility"],
    patterns: [/porta.*largura|door.*width|alargamento.*porta|largura.*porta/i],
  },
  {
    code: "SAE010", description: "Ascensor elétrico sem casa de máquinas (4 paragens)",
    chapter: "Equipamentos fixos > Ascensores",
    unit: "Ud", unitCost: 42000, breakdown: { materials: 35000, labor: 5500, machinery: 1500 },
    isRehab: false, areas: ["accessibility", "elevators"],
    patterns: [/ascensor|elevador/i],
  },

  // ─── VENTILATION (IV) ──────────────────────────────────────
  {
    code: "IVV010", description: "Ventilador de extração para cozinha (300 m³/h)",
    chapter: "Instalações > Ventilação > Extração",
    unit: "Ud", unitCost: 320, breakdown: { materials: 240, labor: 65, machinery: 15 },
    isRehab: false, areas: ["hvac"],
    patterns: [/extração.*cozinha|ventilador.*cozinha/i],
  },
  {
    code: "IVV020", description: "Ventilador de extração para WC (150 m³/h)",
    chapter: "Instalações > Ventilação > Extração",
    unit: "Ud", unitCost: 185, breakdown: { materials: 135, labor: 40, machinery: 10 },
    isRehab: false, areas: ["hvac"],
    patterns: [/extração.*WC|ventilador.*WC|extração.*sanitári/i],
  },
  {
    code: "IVC010", description: "Unidade de ventilação mecânica com recuperação de calor (VMC)",
    chapter: "Instalações > Ventilação > VMC",
    unit: "Ud", unitCost: 3800, breakdown: { materials: 2900, labor: 750, machinery: 150 },
    isRehab: true, areas: ["hvac", "thermal"],
    patterns: [/VMC|recuperação.*calor|ventilação.*mecânica.*controlada|HRV/i],
  },

  // ─── ACOUSTIC TESTING ──────────────────────────────────────
  {
    code: "XRA010", description: "Ensaio acústico in situ (D'nT,w + L'nT,w + D2m,nT,w)",
    chapter: "Controlo de qualidade > Ensaios acústicos",
    unit: "ensaio", unitCost: 1800, breakdown: { materials: 0, labor: 1800, machinery: 0 },
    isRehab: false, areas: ["acoustic"],
    patterns: [/ensaio.*acústico|acoustic.*test|medição.*acústica/i],
  },
  {
    code: "XRA020", description: "Projeto de condicionamento acústico (RRAE)",
    chapter: "Controlo de qualidade > Projetos de especialidade",
    unit: "projeto", unitCost: 2500, breakdown: { materials: 0, labor: 2500, machinery: 0 },
    isRehab: false, areas: ["acoustic"],
    patterns: [/projeto.*acústico|acoustic.*project/i],
  },

  // ─── LICENSING & PROJECTS ──────────────────────────────────
  {
    code: "YPA010", description: "Projeto de arquitetura (habitação unifamiliar)",
    chapter: "Projetos > Arquitetura",
    unit: "projeto", unitCost: 12000, breakdown: { materials: 0, labor: 12000, machinery: 0 },
    isRehab: false, areas: ["licensing"],
    patterns: [/projeto.*arquitetura|architectural.*project/i],
  },
  {
    code: "YPE010", description: "Projetos de especialidades (conjunto: térmico, acústico, SCIE, etc.)",
    chapter: "Projetos > Especialidades",
    unit: "projeto", unitCost: 8000, breakdown: { materials: 0, labor: 8000, machinery: 0 },
    isRehab: false, areas: ["licensing"],
    patterns: [/especialidades|specialty.*project/i],
  },

  // ─── WASTE MANAGEMENT (G) ─────────────────────────────────
  {
    code: "GRA010", description: "Plano de Prevenção e Gestão de RCD",
    chapter: "Gestão de resíduos > Plano de gestão",
    unit: "projeto", unitCost: 800, breakdown: { materials: 0, labor: 800, machinery: 0 },
    isRehab: false, areas: ["waste"],
    patterns: [/plano.*gestão.*resíduos|waste.*management.*plan|PPG|RCD/i],
  },

  // ─── DRAWINGS ──────────────────────────────────────────────
  {
    code: "YPD010", description: "Revisão de peças desenhadas (carimbos, escalas, cotagem)",
    chapter: "Projetos > Documentação",
    unit: "projeto", unitCost: 600, breakdown: { materials: 0, labor: 600, machinery: 0 },
    isRehab: false, areas: ["drawings"],
    patterns: [/carimbo|title.*block|cotagem|dimensioning|escala.*desenho/i],
  },

  // ─── RADON PROTECTION (NO) ─────────────────────────────────
  {
    code: "NOB010", description: "Barreira anti-radão em laje térrea (membrana + selagem)",
    chapter: "Isolamentos > Proteção contra radão",
    unit: "m2", unitCost: 18, breakdown: { materials: 12, labor: 5, machinery: 1 },
    isRehab: true, areas: ["hvac"],
    patterns: [/radão|radon/i],
  },

  // ─── STRUCTURAL (EST) ────────────────────────────────────
  {
    code: "EST010", description: "Reforço de pilar de betão armado",
    chapter: "Estruturas > Reforço estrutural > Pilares",
    unit: "Ud", unitCost: 3000, breakdown: { materials: 1500, labor: 1200, machinery: 300 },
    isRehab: true, areas: ["structural"],
    patterns: [/reforço.*pilar|pilar.*reforç|column.*reinforc|reinforc.*column/i],
  },
  {
    code: "EST020", description: "Reforço de viga de betão armado",
    chapter: "Estruturas > Reforço estrutural > Vigas",
    unit: "Ud", unitCost: 4000, breakdown: { materials: 2000, labor: 1600, machinery: 400 },
    isRehab: true, areas: ["structural"],
    patterns: [/reforço.*viga|viga.*reforç|beam.*reinforc|reinforc.*beam/i],
  },
  {
    code: "EST030", description: "Recalçamento de fundação",
    chapter: "Estruturas > Fundações > Recalçamento",
    unit: "m", unitCost: 1650, breakdown: { materials: 825, labor: 660, machinery: 165 },
    isRehab: true, areas: ["structural"],
    patterns: [/recalçamento|underpinning|fundação.*reforç|reforç.*fundação/i],
  },
  {
    code: "EST040", description: "Contraventamento sísmico",
    chapter: "Estruturas > Reforço estrutural > Contraventamento",
    unit: "m2", unitCost: 165, breakdown: { materials: 83, labor: 66, machinery: 16 },
    isRehab: true, areas: ["structural"],
    patterns: [/contraventamento|bracing|sísmico.*reforç|reforç.*sísmico|seismic/i],
  },
  {
    code: "EST050", description: "Reforço de parede resistente",
    chapter: "Estruturas > Reforço estrutural > Paredes",
    unit: "m2", unitCost: 235, breakdown: { materials: 118, labor: 94, machinery: 23 },
    isRehab: true, areas: ["structural"],
    patterns: [/parede.*resistente.*reforç|reforço.*parede.*resistente|load.*bearing.*wall/i],
  },
  {
    code: "EST060", description: "Proteção ao fogo da estrutura (REI)",
    chapter: "Estruturas > Proteção passiva > Resistência ao fogo",
    unit: "m2", unitCost: 55, breakdown: { materials: 28, labor: 22, machinery: 5 },
    isRehab: true, areas: ["structural", "fire_safety"],
    patterns: [/proteção.*fogo.*estrutura|estrutura.*proteção.*fogo|REI.*estrutur|estrutur.*REI/i],
  },
  {
    code: "EST070", description: "Reforço de ligação metálica",
    chapter: "Estruturas > Reforço estrutural > Ligações metálicas",
    unit: "Ud", unitCost: 1250, breakdown: { materials: 625, labor: 500, machinery: 125 },
    isRehab: true, areas: ["structural"],
    patterns: [/ligação.*metálica.*reforç|reforço.*ligação.*metálica|steel.*connection/i],
  },
  {
    code: "EST080", description: "Estudo geotécnico",
    chapter: "Estruturas > Fundações > Estudos",
    unit: "vg", unitCost: 7500, breakdown: { materials: 750, labor: 5250, machinery: 1500 },
    isRehab: false, areas: ["structural"],
    patterns: [/estudo.*geotécnico|geotechnical.*study|prospeção.*geotécnica|sondagem/i],
  },

  // ─── ARCHITECTURAL (ARQ) ─────────────────────────────────
  {
    code: "ARQ010", description: "Demolição e reconstrução de parede interior",
    chapter: "Arquitetura > Paredes interiores > Demolição e reconstrução",
    unit: "m2", unitCost: 82, breakdown: { materials: 33, labor: 41, machinery: 8 },
    isRehab: true, areas: ["architecture"],
    patterns: [/demolição.*parede.*interior|parede.*interior.*demolição|reconstrução.*parede/i],
  },
  {
    code: "ARQ020", description: "Alteração de fachada / ampliação de vão",
    chapter: "Arquitetura > Fachadas > Alteração de vãos",
    unit: "Ud", unitCost: 5250, breakdown: { materials: 2625, labor: 2100, machinery: 525 },
    isRehab: true, areas: ["architecture"],
    patterns: [/alteração.*fachada|ampliação.*vão|fachada.*vão|window.*enlarg|enlarg.*window/i],
  },
  {
    code: "ARQ030", description: "Aumento de pé-direito",
    chapter: "Arquitetura > Intervenções estruturais > Pé-direito",
    unit: "m2", unitCost: 325, breakdown: { materials: 130, labor: 163, machinery: 32 },
    isRehab: true, areas: ["architecture"],
    patterns: [/pé.*direito.*aument|aument.*pé.*direito|ceiling.*height/i],
  },
  {
    code: "ARQ040", description: "Parede de compartimentação corta-fogo",
    chapter: "Arquitetura > Proteção passiva > Compartimentação",
    unit: "m2", unitCost: 122, breakdown: { materials: 61, labor: 49, machinery: 12 },
    isRehab: true, areas: ["architecture", "fire_safety"],
    patterns: [/compartimentação.*corta.*fogo|corta.*fogo.*parede|fire.*compartment.*wall/i],
  },
  {
    code: "ARQ050", description: "Porta corta-fogo",
    chapter: "Arquitetura > Proteção passiva > Portas",
    unit: "Ud", unitCost: 825, breakdown: { materials: 495, labor: 280, machinery: 50 },
    isRehab: true, areas: ["architecture", "fire_safety"],
    patterns: [/porta.*corta.*fogo|corta.*fogo.*porta|fire.*door/i],
  },
  {
    code: "ARQ060", description: "Construção de rampa acessível",
    chapter: "Arquitetura > Acessibilidades > Rampas",
    unit: "m", unitCost: 1650, breakdown: { materials: 825, labor: 660, machinery: 165 },
    isRehab: true, areas: ["architecture", "accessibility"],
    patterns: [/rampa.*acessível.*construção|construção.*rampa.*acessível|rampa.*acessibilidade/i],
  },
  {
    code: "ARQ070", description: "Adaptação de instalação sanitária acessível",
    chapter: "Arquitetura > Acessibilidades > Instalações sanitárias",
    unit: "Ud", unitCost: 5750, breakdown: { materials: 2875, labor: 2300, machinery: 575 },
    isRehab: true, areas: ["architecture", "accessibility"],
    patterns: [/adaptação.*IS.*acessível|IS.*acessível.*adaptação|WC.*acessível.*adaptação|adaptação.*sanitári.*acessível/i],
  },
  {
    code: "ARQ080", description: "Melhoria de iluminação natural / claraboia",
    chapter: "Arquitetura > Iluminação natural > Claraboias",
    unit: "Ud", unitCost: 3250, breakdown: { materials: 1950, labor: 1040, machinery: 260 },
    isRehab: true, areas: ["architecture"],
    patterns: [/iluminação.*natural|claraboia|skylight|luz.*natural/i],
  },
];

// ============================================================
// Merged Database (curated + full price DB)
// ============================================================

let _mergedDb: PriceWorkItem[] | null = null;

/**
 * Get the cost estimation database, merging curated items (with hand-tuned
 * regex patterns) and the full 2,049-item price database from the scraper.
 * Curated items appear first for preferential matching; full DB items
 * that share a code with a curated item are skipped (curated version wins).
 */
function getCostDatabase(): PriceWorkItem[] {
  if (_mergedDb) return _mergedDb;

  const curatedCodes = new Set(CURATED_ITEMS.map(i => i.code));

  // Use pre-loaded price data if available (cached by price-matcher in pipeline)
  let fullDb: PriceWorkItem[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCachedPriceDatabase } = require("./price-db-loader") as { getCachedPriceDatabase: () => PriceWorkItem[] | null };
    fullDb = getCachedPriceDatabase() ?? [];
  } catch {
    // Module unavailable — use curated items only
  }

  // Full DB items that don't overlap with curated items
  const additional = fullDb.filter(i => !curatedCodes.has(i.code));

  _mergedDb = [...CURATED_ITEMS, ...additional];
  return _mergedDb;
}

// ============================================================
// Location Adjustment Factors (by district)
// ============================================================

/** Cost adjustment by Portuguese district. Lisboa = 1.0 reference. */
const DISTRICT_FACTORS: Record<string, number> = {
  "Lisboa": 1.00, "Porto": 0.95, "Setúbal": 0.97, "Faro": 1.02,
  "Braga": 0.90, "Aveiro": 0.90, "Coimbra": 0.92, "Leiria": 0.92,
  "Santarém": 0.90, "Viseu": 0.88, "Viana do Castelo": 0.88,
  "Vila Real": 0.85, "Bragança": 0.85, "Guarda": 0.85,
  "Castelo Branco": 0.87, "Portalegre": 0.87, "Évora": 0.90,
  "Beja": 0.88, "R.A. Madeira": 1.10, "R.A. Açores": 1.15,
};

/** Cost adjustment by building type */
const TYPE_FACTORS: Record<string, number> = {
  residential: 1.0, commercial: 1.08, mixed: 1.05, industrial: 0.92,
};

// ============================================================
// Area Names
// ============================================================

const AREA_NAMES: Record<RegulationArea, string> = {
  architecture: "Arquitetura",
  structural: "Estruturas",
  fire_safety: "Segurança Contra Incêndio",
  hvac: "AVAC",
  water_drainage: "Águas e Drenagem",
  gas: "Gás",
  electrical: "Instalações Elétricas",
  telecommunications: "ITED/ITUR",
  thermal: "Desempenho Térmico",
  acoustic: "Acústica",
  accessibility: "Acessibilidades",
  energy: "Energia",
  elevators: "Ascensores",
  licensing: "Licenciamento",
  waste: "Resíduos",
  municipal: "Municipal",
  drawings: "Desenhos",
  general: "Geral",
};

// ============================================================
// Quantity Estimation
// ============================================================

/**
 * Estimate the quantity needed for a work item based on project data.
 * Returns { quantity, source } where source indicates how it was determined.
 */
function estimateQuantity(
  item: PriceWorkItem,
  finding: Finding,
  project?: BuildingProject,
  ifcQuantities?: IfcQuantitySummary | null,
): { quantity: number; source: "measured" | "estimated" | "minimum" } {
  // Try IFC-measured quantities first (most accurate)
  if (ifcQuantities) {
    const ifcResult = lookupIfcQuantity(ifcQuantities, item);
    if (ifcResult && ifcResult.quantity > 0) {
      return ifcResult;
    }
  }

  if (!project) return { quantity: 1, source: "minimum" };

  const area = project.usableFloorArea || 100;
  const wallArea = project.envelope?.externalWallArea || area * 0.8;
  const roofArea = project.envelope?.roofArea || area * 0.5;
  const windowArea = project.envelope?.windowArea || area * 0.15;
  const floors = project.numberOfFloors || 1;
  const dwellings = project.numberOfDwellings || 1;

  switch (item.unit) {
    case "m2":
      // Area-based items: use relevant surface area
      if (item.areas.includes("thermal") && /parede|fachada|ETICS|capoto/i.test(item.description)) {
        return { quantity: wallArea, source: "measured" };
      }
      if (item.areas.includes("thermal") && /cobertura|roof/i.test(item.description)) {
        return { quantity: roofArea, source: "measured" };
      }
      if (item.areas.includes("thermal") && /pavimento|floor/i.test(item.description)) {
        return { quantity: area, source: "measured" };
      }
      if (item.areas.includes("thermal") && /janela|envidraçado|window/i.test(item.description)) {
        return { quantity: windowArea, source: "measured" };
      }
      if (item.areas.includes("acoustic")) {
        // Acoustic insulation: estimate based on floor area
        return { quantity: area * 0.5, source: "estimated" };
      }
      if (item.areas.includes("fire_safety") && /sprinkler/i.test(item.description)) {
        return { quantity: area, source: "measured" };
      }
      if (item.areas.includes("fire_safety") && /proteção.*passiva|intumescente/i.test(item.description)) {
        // Estimate structural elements needing protection
        return { quantity: Math.max(20, area * 0.1), source: "estimated" };
      }
      if (/radão|radon/i.test(item.description)) {
        return { quantity: area, source: "measured" };
      }
      // Structural: seismic bracing area estimate
      if (item.areas.includes("structural") && /contraventamento|bracing/i.test(item.description)) {
        return { quantity: Math.max(10, area * 0.15), source: "estimated" };
      }
      // Structural: load-bearing wall reinforcement
      if (item.areas.includes("structural") && /parede.*resistente/i.test(item.description)) {
        return { quantity: Math.max(10, wallArea * 0.2), source: "estimated" };
      }
      // Structural: fire protection of structure (REI)
      if (item.areas.includes("structural") && /proteção.*fogo/i.test(item.description)) {
        return { quantity: Math.max(20, area * 0.15), source: "estimated" };
      }
      // Architectural: internal wall demolition/reconstruction
      if (item.areas.includes("architecture") && /parede.*interior/i.test(item.description)) {
        return { quantity: Math.max(5, area * 0.1), source: "estimated" };
      }
      // Architectural: ceiling height increase
      if (item.areas.includes("architecture") && /pé.*direito/i.test(item.description)) {
        return { quantity: Math.max(10, area * 0.3), source: "estimated" };
      }
      // Architectural: fire compartmentation wall
      if (item.areas.includes("architecture") && /compartimentação.*corta.*fogo/i.test(item.description)) {
        return { quantity: Math.max(8, area * 0.08), source: "estimated" };
      }
      return { quantity: Math.max(1, area * 0.3), source: "estimated" };

    case "m":
      // Linear items
      if (/ponte.*térmica/i.test(item.description)) {
        // Perimeter of windows + floor/wall junctions
        return { quantity: Math.sqrt(windowArea) * 4 * (windowArea / 2) + Math.sqrt(area) * 4, source: "estimated" };
      }
      if (/rampa/i.test(item.description)) {
        return { quantity: Math.max(3, floors * 3), source: "estimated" };
      }
      if (/ventilação.*coluna/i.test(item.description)) {
        return { quantity: floors * 3, source: "estimated" };
      }
      // Structural: foundation underpinning (estimate perimeter)
      if (item.areas.includes("structural") && /recalçamento|underpinning/i.test(item.description)) {
        return { quantity: Math.max(3, Math.sqrt(area) * 2), source: "estimated" };
      }
      // Architectural: accessible ramp construction
      if (item.areas.includes("architecture") && /rampa.*acessível/i.test(item.description)) {
        return { quantity: Math.max(3, floors * 4), source: "estimated" };
      }
      return { quantity: 5, source: "minimum" };

    case "Ud":
      // Unit items: estimate count based on building size
      if (/detetor.*fumo/i.test(item.description)) {
        // ~1 detector per 60m² per floor
        return { quantity: Math.max(2, Math.ceil(area / 60) * floors), source: "estimated" };
      }
      if (/botoneira/i.test(item.description)) {
        // 1 per exit per floor
        return { quantity: Math.max(1, floors * 2), source: "estimated" };
      }
      if (/sirene/i.test(item.description)) {
        return { quantity: Math.max(1, floors), source: "estimated" };
      }
      if (/bloco.*autónomo|iluminação.*emergência/i.test(item.description)) {
        // ~1 per 15m of evacuation path
        return { quantity: Math.max(4, Math.ceil(area / 15) * floors), source: "estimated" };
      }
      if (/extintor/i.test(item.description)) {
        // 1 per 200m² per floor (SCIE)
        return { quantity: Math.max(1, Math.ceil(area / 200) * floors), source: "estimated" };
      }
      if (/sinalização/i.test(item.description)) {
        return { quantity: Math.max(4, floors * 4), source: "estimated" };
      }
      if (/boca.*incêndio|carretel/i.test(item.description)) {
        // 1 per floor for multi-floor buildings
        return { quantity: Math.max(1, floors), source: "estimated" };
      }
      if (/ATI/i.test(item.description)) {
        return { quantity: dwellings, source: "measured" };
      }
      if (/fibra.*óptica/i.test(item.description)) {
        return { quantity: dwellings, source: "measured" };
      }
      if (/certificação.*ITED/i.test(item.description)) {
        return { quantity: dwellings, source: "measured" };
      }
      if (/diferencial|RCD/i.test(item.description)) {
        // Typically 2-3 RCDs per dwelling
        return { quantity: Math.max(1, dwellings * 2), source: "estimated" };
      }
      if (/equipotencial/i.test(item.description)) {
        // Estimate ~2 bathrooms per dwelling
        return { quantity: dwellings * 2, source: "estimated" };
      }
      if (/porta.*largura|alargamento/i.test(item.description)) {
        // Estimate doors needing widening
        return { quantity: Math.max(1, dwellings * 2), source: "estimated" };
      }
      if (/WC.*acessível|sanitári.*acessível/i.test(item.description)) {
        return { quantity: Math.max(1, Math.ceil(dwellings / 4)), source: "estimated" };
      }
      // Structural: column reinforcement (~1 per 25m² per floor)
      if (item.areas.includes("structural") && /reforço.*pilar|pilar.*reforç/i.test(item.description)) {
        return { quantity: Math.max(1, Math.ceil(area / 25) * floors), source: "estimated" };
      }
      // Structural: beam reinforcement (~1 per 30m² per floor)
      if (item.areas.includes("structural") && /reforço.*viga|viga.*reforç/i.test(item.description)) {
        return { quantity: Math.max(1, Math.ceil(area / 30) * floors), source: "estimated" };
      }
      // Structural: steel connection reinforcement
      if (item.areas.includes("structural") && /ligação.*metálica/i.test(item.description)) {
        return { quantity: Math.max(2, floors * 4), source: "estimated" };
      }
      // Architectural: facade alteration / window enlargement
      if (item.areas.includes("architecture") && /fachada.*vão|ampliação.*vão/i.test(item.description)) {
        return { quantity: Math.max(1, Math.ceil(dwellings * 0.5)), source: "estimated" };
      }
      // Architectural: fire door
      if (item.areas.includes("architecture") && /porta.*corta.*fogo/i.test(item.description)) {
        return { quantity: Math.max(1, floors * 2), source: "estimated" };
      }
      // Architectural: accessible WC adaptation
      if (item.areas.includes("architecture") && /adaptação.*sanitári|adaptação.*IS/i.test(item.description)) {
        return { quantity: Math.max(1, Math.ceil(dwellings / 4)), source: "estimated" };
      }
      // Architectural: skylight / natural light improvement
      if (item.areas.includes("architecture") && /claraboia|iluminação.*natural/i.test(item.description)) {
        return { quantity: Math.max(1, Math.ceil(dwellings * 0.3)), source: "estimated" };
      }
      return { quantity: 1, source: "minimum" };

    case "vg":
      // Lump-sum items (e.g., geotechnical study)
      return { quantity: 1, source: "minimum" };

    default:
      return { quantity: 1, source: "minimum" };
  }
}

// ============================================================
// Finding-to-CYPE Matching
// ============================================================

/**
 * Structural regulation keywords for matching findings to CYPE items.
 * Covers Eurocodes (EC0-EC8), Portuguese structural regulations, and common
 * structural engineering terms.
 */
const STRUCTURAL_KEYWORDS: RegExp[] = [
  // Eurocodes and Portuguese structural regulation references
  /eurocódigo|eurocode|EC[0-8]|EN\s*199[0-9]/i,
  /REBAP|RSA|regulamento.*estruturas.*betão/i,
  // Structural element keywords
  /pilar|coluna|column/i,
  /viga|beam/i,
  /fundação|foundation|sapata|estaca|pile/i,
  /laje|slab/i,
  /contraventamento|bracing/i,
  /sísmico|seismic|sismo/i,
  /parede.*resistente|load.*bearing/i,
  /estrutura.*metálica|steel.*structure/i,
  /ligação.*metálica|steel.*connection/i,
  /geotécnico|geotechnical|sondagem/i,
  /reforço.*estrutural|structural.*reinforc/i,
  /recalçamento|underpinning/i,
  /betão.*armado|reinforced.*concrete/i,
  /capacidade.*resistente|bearing.*capacity/i,
  /REI.*estrutur|estrutur.*REI/i,
];

/**
 * Architectural regulation keywords for matching findings to CYPE items.
 * Covers RGEU, DL 163/2006, RJUE, and common architectural/building terms.
 */
const ARCHITECTURAL_KEYWORDS: RegExp[] = [
  // Portuguese architectural regulations
  /RGEU|regulamento.*geral.*edificações/i,
  /DL\s*163\/2006|decreto.*lei.*163/i,
  /RJUE|regime.*jurídico.*urbanização/i,
  // Architectural element keywords
  /parede.*interior|internal.*wall/i,
  /fachada.*alteração|alteração.*fachada|ampliação.*vão/i,
  /pé.*direito|ceiling.*height/i,
  /compartimentação|compartment/i,
  /porta.*corta.*fogo|fire.*door/i,
  /rampa.*acessível|accessible.*ramp/i,
  /IS.*acessível|WC.*acessível|sanitári.*acessível/i,
  /iluminação.*natural|natural.*light|claraboia|skylight/i,
  /demolição.*reconstrução|reconstrução.*parede/i,
  /acessibilidade|accessibility/i,
  /área.*útil|usable.*area/i,
  /tipologia|layout/i,
];

/**
 * Compute token similarity score between a finding text and a price item.
 * Returns a value 0-100 based on overlapping significant words.
 */
function tokenSimilarity(searchText: string, item: PriceWorkItem): number {
  const textTokens = new Set(
    searchText.toLowerCase().split(/[\s,.:;()\-/]+/).filter(w => w.length > 3)
  );
  const itemTokens = [
    ...item.description.toLowerCase().split(/[\s,.:;()\-/]+/).filter(w => w.length > 3),
    ...item.chapter.toLowerCase().split(/[\s>,:;()\-/]+/).filter(w => w.length > 3),
  ];
  if (itemTokens.length === 0) return 0;

  let hits = 0;
  for (const token of itemTokens) {
    if (textTokens.has(token)) hits++;
  }
  return Math.round((hits / itemTokens.length) * 100);
}

/**
 * Match a finding to the most appropriate price work item(s).
 *
 * Matching strategy (scored):
 * 1. Pattern match + area match → score 100 (curated items come first)
 * 2. Pattern match only → score 80
 * 3. Area match + token similarity → similarity score
 * 4. Keyword fallback for structural/architectural → score based on word overlap
 *
 * Returns items sorted by score (best first).
 */
export function matchFindingToPrice(finding: Finding): PriceWorkItem[] {
  const searchText = `${finding.description} ${finding.regulation} ${finding.article ?? ""}`;
  const scored: { item: PriceWorkItem; score: number }[] = [];
  const db = getCostDatabase();

  for (const item of db) {
    const areaMatch = item.areas.includes(finding.area);
    const patternMatch = item.patterns.some(p => p.test(searchText));

    if (patternMatch && areaMatch) {
      scored.push({ item, score: 100 });
      continue;
    }

    // Token similarity for area-matched items from the full DB
    if (areaMatch) {
      const sim = tokenSimilarity(searchText, item);
      if (sim >= 25) {
        scored.push({ item, score: sim });
        continue;
      }
    }

    // Structural keyword fallback
    if (finding.area === "structural" && item.areas.includes("structural")) {
      const keywordMatch = STRUCTURAL_KEYWORDS.some(kw => kw.test(searchText));
      if (keywordMatch) {
        const descWords = item.description.toLowerCase().split(/\s+/);
        const textLower = searchText.toLowerCase();
        const wordOverlap = descWords.filter(w => w.length > 3 && textLower.includes(w)).length;
        if (wordOverlap > 0) {
          scored.push({ item, score: 20 + wordOverlap * 10 });
        }
      }
    }

    // Architectural keyword fallback
    if (finding.area === "architecture" && item.areas.includes("architecture")) {
      const keywordMatch = ARCHITECTURAL_KEYWORDS.some(kw => kw.test(searchText));
      if (keywordMatch) {
        const descWords = item.description.toLowerCase().split(/\s+/);
        const textLower = searchText.toLowerCase();
        const wordOverlap = descWords.filter(w => w.length > 3 && textLower.includes(w)).length;
        if (wordOverlap > 0) {
          scored.push({ item, score: 20 + wordOverlap * 10 });
        }
      }
    }
  }

  // Sort by score descending, return items only
  return scored.sort((a, b) => b.score - a.score).map(s => s.item);
}

// ============================================================
// Scale Factors (bulk pricing discounts)
// ============================================================

/**
 * Apply bulk pricing discount based on quantity.
 * Large quantities get unit-cost reductions due to economies of scale.
 *
 * Thresholds (by unit type):
 * - m2/m3: >200 units → 5%, >500 → 10%, >1000 → 15%
 * - m:     >100 units → 5%, >300 → 10%, >600 → 15%
 * - Ud:    >10 units  → 3%, >50 → 8%, >100 → 12%
 * - Other: no discount
 */
function applyScaleFactor(unitCost: number, quantity: number, unit: string): { cost: number; scaled: boolean } {
  let discount = 0;

  if (unit === "m2" || unit === "m3") {
    if (quantity > 1000) discount = 0.15;
    else if (quantity > 500) discount = 0.10;
    else if (quantity > 200) discount = 0.05;
  } else if (unit === "m") {
    if (quantity > 600) discount = 0.15;
    else if (quantity > 300) discount = 0.10;
    else if (quantity > 100) discount = 0.05;
  } else if (unit === "Ud") {
    if (quantity > 100) discount = 0.12;
    else if (quantity > 50) discount = 0.08;
    else if (quantity > 10) discount = 0.03;
  }

  return {
    cost: unitCost * (1 - discount),
    scaled: discount > 0,
  };
}

// ============================================================
// Contingency Buffers
// ============================================================

/**
 * Calculate contingency percentage based on match confidence and project stage.
 *
 * - High-confidence matches with measured quantities: 5%
 * - Medium-confidence or estimated quantities: 10%
 * - Low-confidence or minimum quantities: 15%
 *
 * Project stage modifier:
 * - "concept"/"design": +5%
 * - "licensing"/"construction": +0%
 * - No stage info: +3%
 */
function calculateContingency(
  lineItems: CostLineItem[],
  project?: BuildingProject,
): { percent: number; amount: number } {
  if (lineItems.length === 0) return { percent: 0, amount: 0 };

  // Weighted average confidence
  let totalCost = 0;
  let weightedConfidence = 0;
  for (const li of lineItems) {
    const confScore = li.confidence === "high" ? 5 : li.confidence === "medium" ? 10 : 15;
    weightedConfidence += confScore * li.adjustedCost;
    totalCost += li.adjustedCost;
  }
  const basePercent = totalCost > 0 ? weightedConfidence / totalCost : 10;

  // Project stage modifier
  let stageModifier = 3; // default: unknown stage
  const stage = (project as Record<string, unknown> | undefined)?.projectStage as string | undefined;
  if (stage === "concept" || stage === "design") {
    stageModifier = 5;
  } else if (stage === "licensing" || stage === "construction") {
    stageModifier = 0;
  }

  const percent = Math.round(basePercent + stageModifier);
  const amount = Math.round(totalCost * percent / 100);
  return { percent, amount };
}

// ============================================================
// Main Estimation Functions
// ============================================================

/**
 * Estimate remediation costs using CYPE reference data.
 * Optionally uses project data for quantity estimation and parametric adjustments.
 * Now uses full 2,049-item CYPE database with scale factors and contingency.
 */
export function estimateCosts(
  findings: Finding[],
  project?: BuildingProject,
  ifcAnalyses?: SpecialtyAnalysisResult[],
): CostSummary {
  const lineItems: CostLineItem[] = [];
  const estimates: CostEstimate[] = [];
  const nonCompliant = findings.filter(f => f.severity === "critical" || f.severity === "warning");
  let scaledLineItems = 0;
  let databaseItemsUsed = 0;

  // Aggregate IFC quantities if available
  const ifcQuantities = ifcAnalyses && ifcAnalyses.length > 0
    ? aggregateIfcQuantities(ifcAnalyses)
    : null;

  // Location and type adjustment factors
  const locationFactor = project?.location?.district
    ? (DISTRICT_FACTORS[project.location.district] ?? 1.0)
    : 1.0;
  const typeFactor = project?.buildingType
    ? (TYPE_FACTORS[project.buildingType] ?? 1.0)
    : 1.0;
  const combinedFactor = locationFactor * typeFactor;

  // Track which curated codes we use vs full DB codes
  const curatedCodes = new Set(CURATED_ITEMS.map(i => i.code));

  for (const finding of nonCompliant) {
    let matched = false;

    // Try to match using the matchFindingToPrice function (curated first, then full DB)
    const matchedItems = matchFindingToPrice(finding);

    if (matchedItems.length > 0) {
      const item = matchedItems[0];
      const { quantity, source } = estimateQuantity(item, finding, project, ifcQuantities);

      // Apply bulk pricing discount
      const { cost: scaledUnitCost, scaled } = applyScaleFactor(item.unitCost, quantity, item.unit);
      if (scaled) scaledLineItems++;

      // Track if item came from full DB (not curated)
      if (!curatedCodes.has(item.code)) databaseItemsUsed++;

      const baseCost = scaledUnitCost * quantity;
      const adjustedCost = Math.round(baseCost * combinedFactor);

      // Scale breakdown proportionally if discount was applied
      const costRatio = item.unitCost > 0 ? scaledUnitCost / item.unitCost : 1;

      const lineItem: CostLineItem = {
        findingId: finding.id,
        findingDescription: finding.description,
        workItem: item,
        quantity,
        quantitySource: source,
        totalCost: Math.round(baseCost),
        adjustedCost,
        breakdown: {
          materials: Math.round(item.breakdown.materials * costRatio * quantity * combinedFactor),
          labor: Math.round(item.breakdown.labor * costRatio * quantity * combinedFactor),
          machinery: Math.round(item.breakdown.machinery * costRatio * quantity * combinedFactor),
        },
        confidence: source === "measured" ? "high" : source === "estimated" ? "medium" : "low",
      };
      lineItems.push(lineItem);

      estimates.push({
        findingId: finding.id,
        area: finding.area,
        description: finding.description,
        minCost: Math.round(adjustedCost * 0.8),
        maxCost: Math.round(adjustedCost * 1.3),
        unit: item.unit,
        confidence: lineItem.confidence,
        notes: `${item.code}: ${item.description} (${quantity.toFixed(1)} ${item.unit} × ${formatCost(scaledUnitCost)}/${item.unit}${scaled ? " c/ desconto" : ""})`,
        lineItems: [lineItem],
        priceCode: item.code,
      });
      matched = true;
    }

    // Fallback for unmatched critical findings
    if (!matched && finding.severity === "critical") {
      estimates.push({
        findingId: finding.id,
        area: finding.area,
        description: finding.description,
        minCost: Math.round(1000 * combinedFactor),
        maxCost: Math.round(10000 * combinedFactor),
        unit: "estimativa",
        confidence: "low",
        notes: "Estimativa genérica. Consulte geradordeprecos.info para orçamentação precisa.",
      });
    }
  }

  // Contingency buffer
  const contingency = calculateContingency(lineItems, project);

  // Aggregate by area
  const areaMap = new Map<RegulationArea, { minCost: number; maxCost: number; count: number }>();
  for (const est of estimates) {
    const existing = areaMap.get(est.area) || { minCost: 0, maxCost: 0, count: 0 };
    existing.minCost += est.minCost;
    existing.maxCost += est.maxCost;
    existing.count += 1;
    areaMap.set(est.area, existing);
  }

  const byArea = Array.from(areaMap.entries())
    .map(([area, data]) => ({
      area,
      areaName: AREA_NAMES[area] || area,
      ...data,
    }))
    .sort((a, b) => b.maxCost - a.maxCost);

  const totalMinCost = estimates.reduce((sum, e) => sum + e.minCost, 0);
  const totalMaxCost = estimates.reduce((sum, e) => sum + e.maxCost, 0);

  return {
    estimates,
    totalMinCost,
    totalMaxCost,
    byArea,
    currency: "EUR",
    lineItems,
    locationFactor,
    typeFactor,
    contingency,
    totalWithContingency: {
      min: totalMinCost + Math.round(totalMinCost * contingency.percent / 100),
      max: totalMaxCost + Math.round(totalMaxCost * contingency.percent / 100),
    },
    scaledLineItems,
    databaseItemsUsed,
  };
}

/**
 * Format a cost value in EUR (Portuguese locale).
 */
export function formatCost(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
