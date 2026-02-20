/**
 * Parametric Pricing Engine
 *
 * The Gerador de Preços (geradordeprecos.info) requires
 * clicking into each item and configuring parameters to see the
 * "Preço Composto" breakdown. This module models those parametric
 * variations so we can estimate prices for any configuration without
 * needing API access.
 *
 * For items where we have real exports (via import), those
 * override our parametric estimates.
 *
 * Sources: Portuguese market data 2024-2025, reference ranges.
 */

// ============================================================
// Core Types
// ============================================================

export interface ParametricItem {
  /** Price code prefix */
  code: string;
  /** Base description */
  description: string;
  chapter: string;
  /** Configuration parameters that affect price */
  parameters: ParameterDef[];
  /** Base price calculation given parameter values */
  calculatePrice: (params: Record<string, string | number>) => PriceResult;
  /** Default parameter values */
  defaults: Record<string, string | number>;
}

export interface ParameterDef {
  key: string;
  label: string;
  type: "select" | "number" | "boolean";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  unit?: string;
}

export interface PriceResult {
  unitCost: number;
  unit: string;
  breakdown: { materials: number; labor: number; machinery: number };
  /** Generated price code with variation suffix */
  variantCode: string;
  /** Full description with parameters */
  fullDescription: string;
  /** Confidence: "parametric" means modeled, "imported" means from real data */
  source: "parametric" | "imported";
  /** Notes on how the price was calculated */
  notes: string[];
}

export interface PriceImportRow {
  code: string;
  description: string;
  unit: string;
  unitCost: number;
  materials: number;
  labor: number;
  machinery: number;
  source: string;
}

// ============================================================
// User Override Store
// ============================================================

/** Imported prices override parametric estimates */
const importedPrices = new Map<string, PriceImportRow>();

export function importPrices(rows: PriceImportRow[]): number {
  let count = 0;
  for (const row of rows) {
    if (row.code && row.unitCost > 0) {
      importedPrices.set(row.code, row);
      count++;
    }
  }
  return count;
}

export function getImportedPrice(code: string): PriceImportRow | undefined {
  return importedPrices.get(code);
}

export function clearImportedPrices(): void {
  importedPrices.clear();
}

export function getImportedCount(): number {
  return importedPrices.size;
}

// ============================================================
// Parse CYPE Excel/CSV Export
// ============================================================

/**
 * Parse a CYPE Gerador de Preços export (CSV or tab-separated).
 * CYPE exports typically have columns:
 *   Código | Descrição | Unidade | Preço Unitário | Materiais | Mão de Obra | Equipamento
 *
 * Some exports use semicolons, others tabs. We detect automatically.
 */
export function parsePriceExport(text: string): PriceImportRow[] {
  const rows: PriceImportRow[] = [];
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return rows;

  // Detect separator
  const header = lines[0];
  const sep = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 4) continue;

    // Try to parse numeric values (handle Portuguese decimal comma)
    const parseNum = (s: string): number => {
      const cleaned = s.replace(/[€\s]/g, "").replace(",", ".");
      return parseFloat(cleaned) || 0;
    };

    rows.push({
      code: cols[0],
      description: cols[1],
      unit: cols[2],
      unitCost: parseNum(cols[3]),
      materials: cols.length > 4 ? parseNum(cols[4]) : 0,
      labor: cols.length > 5 ? parseNum(cols[5]) : 0,
      machinery: cols.length > 6 ? parseNum(cols[6]) : 0,
      source: "price-import",
    });
  }

  return rows;
}

// ============================================================
// Parametric Models
// ============================================================

// ─── ALUMINUM WINDOWS ─────────────────────────────────────────

const WINDOW_OPENING_TYPES = [
  { value: "fixa", label: "Fixa" },
  { value: "batente", label: "Batente (abrir)" },
  { value: "oscilo-batente", label: "Oscilo-batente" },
  { value: "correr", label: "Correr" },
  { value: "pivotante", label: "Pivotante" },
  { value: "basculante", label: "Basculante" },
  { value: "guilhotina", label: "Guilhotina" },
];

const WINDOW_GLASS_TYPES = [
  { value: "duplo", label: "Vidro duplo (4+16+4)" },
  { value: "duplo_baixoe", label: "Vidro duplo baixo-e (4+16+4 low-e)" },
  { value: "triplo", label: "Vidro triplo (4+12+4+12+4)" },
  { value: "triplo_baixoe", label: "Vidro triplo baixo-e" },
  { value: "acustico", label: "Vidro acústico (6+12+44.1)" },
  { value: "seguranca", label: "Vidro laminado de segurança" },
];

const WINDOW_FRAME_FINISH = [
  { value: "lacado_standard", label: "Lacado cor standard (branco/cinza)" },
  { value: "lacado_especial", label: "Lacado cor especial (RAL)" },
  { value: "anodizado", label: "Anodizado natural" },
  { value: "anodizado_cor", label: "Anodizado cor (bronze/inox)" },
  { value: "bicolor", label: "Bicolor (interior/exterior diferente)" },
];

/** Price multipliers for window opening types relative to fixed frame */
const OPENING_MULTIPLIER: Record<string, number> = {
  fixa: 0.65,
  batente: 1.0,
  "oscilo-batente": 1.15,
  correr: 1.10,
  pivotante: 1.20,
  basculante: 0.90,
  guilhotina: 1.25,
};

/** Price multipliers for glass type relative to standard double */
const GLASS_MULTIPLIER: Record<string, number> = {
  duplo: 1.0,
  duplo_baixoe: 1.15,
  triplo: 1.35,
  triplo_baixoe: 1.55,
  acustico: 1.30,
  seguranca: 1.20,
};

/** Price multipliers for finish */
const FINISH_MULTIPLIER: Record<string, number> = {
  lacado_standard: 1.0,
  lacado_especial: 1.08,
  anodizado: 1.12,
  anodizado_cor: 1.18,
  bicolor: 1.25,
};

function calculateWindowPrice(params: Record<string, string | number>): PriceResult {
  // Check for imported price first
  const imported = getImportedPrice("CXA010");
  if (imported) {
    return {
      unitCost: imported.unitCost,
      unit: imported.unit,
      breakdown: { materials: imported.materials, labor: imported.labor, machinery: imported.machinery },
      variantCode: imported.code,
      fullDescription: imported.description,
      source: "imported",
      notes: ["Preço importado de CYPE Gerador de Preços"],
    };
  }

  const opening = String(params.opening ?? "oscilo-batente");
  const glass = String(params.glass ?? "duplo_baixoe");
  const finish = String(params.finish ?? "lacado_standard");
  const rpt = String(params.rpt ?? "true") !== "false";
  const area = Number(params.area ?? 1.5);
  const height = Number(params.height ?? 1.4);
  const width = Number(params.width ?? 1.2);

  // Base price per m² for standard aluminum window with RPT + double glazing
  const BASE_PRICE = 310; // EUR/m² (series média-alta, 2024 Portuguese market)

  let price = BASE_PRICE;

  // Opening type multiplier
  price *= OPENING_MULTIPLIER[opening] ?? 1.0;

  // Glass type multiplier
  price *= GLASS_MULTIPLIER[glass] ?? 1.0;

  // Finish multiplier
  price *= FINISH_MULTIPLIER[finish] ?? 1.0;

  // RPT (ruptura de ponte térmica) - baseline includes RPT, remove if not
  if (!rpt) price *= 0.75;

  // Size adjustment: smaller windows cost more per m² (fixed costs dominate)
  // Larger windows need heavier profiles
  const windowArea = width * height;
  if (windowArea < 0.8) price *= 1.25;
  else if (windowArea < 1.2) price *= 1.10;
  else if (windowArea > 3.0) price *= 1.08; // Heavier profiles needed
  else if (windowArea > 5.0) price *= 1.15;

  // Breakdown (typical Portuguese market split for aluminum windows)
  const materials = price * 0.72;
  const labor = price * 0.22;
  const machinery = price * 0.06;

  const notes: string[] = [];
  notes.push(`Abertura: ${opening} (×${(OPENING_MULTIPLIER[opening] ?? 1).toFixed(2)})`);
  notes.push(`Vidro: ${glass} (×${(GLASS_MULTIPLIER[glass] ?? 1).toFixed(2)})`);
  notes.push(`Acabamento: ${finish} (×${(FINISH_MULTIPLIER[finish] ?? 1).toFixed(2)})`);
  if (!rpt) notes.push("Sem RPT (×0.75)");
  notes.push(`Área: ${windowArea.toFixed(2)} m²`);

  const openLabel = WINDOW_OPENING_TYPES.find(o => o.value === opening)?.label ?? opening;
  const glassLabel = WINDOW_GLASS_TYPES.find(g => g.value === glass)?.label ?? glass;

  return {
    unitCost: Math.round(price * 100) / 100,
    unit: "m2",
    breakdown: {
      materials: Math.round(materials * 100) / 100,
      labor: Math.round(labor * 100) / 100,
      machinery: Math.round(machinery * 100) / 100,
    },
    variantCode: `CXA010.${opening}.${glass}${rpt ? ".rpt" : ""}`,
    fullDescription: `Caixilharia de alumínio ${rpt ? "com RPT" : "sem RPT"}, ${openLabel}, ${glassLabel}, ${finish}`,
    source: "parametric",
    notes,
  };
}

// ─── PVC WINDOWS ──────────────────────────────────────────────

function calculatePvcWindowPrice(params: Record<string, string | number>): PriceResult {
  const imported = getImportedPrice("CXP010");
  if (imported) {
    return {
      unitCost: imported.unitCost, unit: imported.unit,
      breakdown: { materials: imported.materials, labor: imported.labor, machinery: imported.machinery },
      variantCode: imported.code, fullDescription: imported.description,
      source: "imported", notes: ["Preço importado de CYPE"],
    };
  }

  const opening = String(params.opening ?? "oscilo-batente");
  const glass = String(params.glass ?? "duplo_baixoe");
  const BASE_PRICE = 265;

  let price = BASE_PRICE;
  price *= OPENING_MULTIPLIER[opening] ?? 1.0;
  price *= GLASS_MULTIPLIER[String(params.glass ?? "duplo_baixoe")] ?? 1.0;

  const windowArea = Number(params.width ?? 1.2) * Number(params.height ?? 1.4);
  if (windowArea < 0.8) price *= 1.20;
  else if (windowArea > 3.0) price *= 1.10;

  return {
    unitCost: Math.round(price * 100) / 100,
    unit: "m2",
    breakdown: { materials: Math.round(price * 0.70), labor: Math.round(price * 0.24), machinery: Math.round(price * 0.06) },
    variantCode: `CXP010.${opening}.${glass}`,
    fullDescription: `Caixilharia PVC, ${opening}, ${glass}`,
    source: "parametric",
    notes: [`Base PVC: €${BASE_PRICE}/m²`, `Abertura: ${opening}`, `Vidro: ${glass}`],
  };
}

// ─── CONCRETE ─────────────────────────────────────────────────

const CONCRETE_CLASSES = [
  { value: "C16/20", label: "C16/20 (limpeza)" },
  { value: "C20/25", label: "C20/25" },
  { value: "C25/30", label: "C25/30 (corrente)" },
  { value: "C30/37", label: "C30/37" },
  { value: "C35/45", label: "C35/45" },
  { value: "C40/50", label: "C40/50 (especial)" },
];

const CONCRETE_BASE_PRICE: Record<string, number> = {
  "C16/20": 85, "C20/25": 92, "C25/30": 100, "C30/37": 112, "C35/45": 128, "C40/50": 150,
};

const STEEL_RATE: Record<string, number> = {
  light: 80,    // kg/m³ (foundations, walls)
  medium: 110,  // kg/m³ (slabs, beams)
  heavy: 150,   // kg/m³ (columns, seismic zones)
};

function calculateConcretePrice(params: Record<string, string | number>): PriceResult {
  const concreteClass = String(params.class ?? "C25/30");
  const element = String(params.element ?? "slab");
  const steelDensity = String(params.steel ?? "medium");
  const pumped = String(params.pumped ?? "true") !== "false";
  const formwork = String(params.formwork ?? "true") !== "false";

  // Concrete cost per m³
  const concreteCost = CONCRETE_BASE_PRICE[concreteClass] ?? 100;

  // Steel cost: rate (kg/m³) × price per kg installed
  const steelKg = STEEL_RATE[steelDensity] ?? 110;
  const steelPricePerKg = 1.45; // EUR/kg installed (cut, bend, place, tie)
  const steelCost = steelKg * steelPricePerKg;

  // Formwork cost per m³ (varies by element type)
  const formworkCosts: Record<string, number> = {
    footing: 35, wall: 85, slab: 25, beam: 95, column: 110, stair: 130,
  };
  const formworkCost = formwork ? (formworkCosts[element] ?? 60) : 0;

  // Pumping
  const pumpCost = pumped ? 12 : 0;

  // Labor
  const laborCosts: Record<string, number> = {
    footing: 45, wall: 65, slab: 40, beam: 70, column: 80, stair: 100,
  };
  const laborCost = laborCosts[element] ?? 55;

  const total = concreteCost + steelCost + formworkCost + pumpCost + laborCost;
  const materialsPct = (concreteCost + steelCost + formworkCost * 0.6) / total;
  const laborPct = (laborCost + formworkCost * 0.4) / total;
  const machineryPct = pumpCost / total;

  const elementLabels: Record<string, string> = {
    footing: "Sapata", wall: "Muro/Parede", slab: "Laje", beam: "Viga", column: "Pilar", stair: "Escada",
  };

  return {
    unitCost: Math.round(total * 100) / 100,
    unit: "m3",
    breakdown: {
      materials: Math.round(total * materialsPct * 100) / 100,
      labor: Math.round(total * laborPct * 100) / 100,
      machinery: Math.round(total * machineryPct * 100) / 100,
    },
    variantCode: `SB.${element}.${concreteClass.replace("/", "")}`,
    fullDescription: `${elementLabels[element] ?? element} de betão armado ${concreteClass}, aço A500NR (${steelDensity}: ~${steelKg} kg/m³)${pumped ? ", betão bombeado" : ""}`,
    source: "parametric",
    notes: [
      `Betão ${concreteClass}: €${concreteCost}/m³`,
      `Aço A500NR (~${steelKg} kg/m³ × €${steelPricePerKg}/kg): €${Math.round(steelCost)}/m³`,
      formwork ? `Cofragem ${element}: €${formworkCost}/m³` : "Sem cofragem",
      pumped ? `Bombagem: €${pumpCost}/m³` : "Sem bombagem",
      `Mão de obra: €${laborCost}/m³`,
    ],
  };
}

// ─── MASONRY ──────────────────────────────────────────────────

function calculateMasonryPrice(params: Record<string, string | number>): PriceResult {
  const thickness = Number(params.thickness ?? 15);
  const brickType = String(params.brick_type ?? "furado");
  const external = String(params.external ?? "true") !== "false";
  const height = Number(params.height ?? 2.8);

  const BASE_PRICES: Record<number, number> = { 7: 12, 9: 14, 11: 18, 15: 22, 20: 26, 25: 32 };
  let price = BASE_PRICES[thickness] ?? 22;

  // Brick type adjustments
  const brickMultiplier: Record<string, number> = {
    furado: 1.0,
    maciço: 1.35,
    termico: 1.45, // Tijolo térmico (e.g., Preceram)
    bloco_betao: 1.10,
  };
  price *= brickMultiplier[brickType] ?? 1.0;

  // Height adjustment (>3m requires scaffolding)
  if (height > 3.0) price *= 1.12;
  if (height > 4.5) price *= 1.08;

  // External walls get extra care (prumo, alinhamento)
  if (external) price *= 1.05;

  const thickLabel = `e=${thickness}cm`;
  const typeLabel: Record<string, string> = {
    furado: "tijolo cerâmico furado", maciço: "tijolo maciço",
    termico: "tijolo térmico", bloco_betao: "bloco de betão",
  };

  return {
    unitCost: Math.round(price * 100) / 100,
    unit: "m2",
    breakdown: {
      materials: Math.round(price * 0.55 * 100) / 100,
      labor: Math.round(price * 0.42 * 100) / 100,
      machinery: Math.round(price * 0.03 * 100) / 100,
    },
    variantCode: `AB.${brickType}.${thickness}`,
    fullDescription: `Alvenaria de ${typeLabel[brickType] ?? brickType} (${thickLabel}), ${external ? "exterior" : "interior"}`,
    source: "parametric",
    notes: [
      `Espessura: ${thickness}cm`,
      `Tipo: ${typeLabel[brickType] ?? brickType} (×${(brickMultiplier[brickType] ?? 1).toFixed(2)})`,
      height > 3.0 ? `Altura ${height}m (necessita andaime)` : `Altura ${height}m`,
    ],
  };
}

// ─── ETICS / CAPOTO ───────────────────────────────────────────

function calculateEticsPrice(params: Record<string, string | number>): PriceResult {
  const insulationType = String(params.insulation ?? "eps");
  const thickness = Number(params.thickness ?? 60);
  const finish = String(params.finish ?? "acrilico");

  const BASE_PRICES: Record<string, number> = { eps: 38, xps: 44, mineral_wool: 52, cork: 58 };
  let price = BASE_PRICES[insulationType] ?? 38;

  // Thickness adjustment (per 10mm above 40mm base)
  const extraThickness = Math.max(0, thickness - 40);
  price += (extraThickness / 10) * 3.5;

  // Finish adjustment
  const finishAdj: Record<string, number> = { acrilico: 0, silicato: 4, silicone: 6, mineral: 8 };
  price += finishAdj[finish] ?? 0;

  const insulationLabels: Record<string, string> = {
    eps: "EPS (poliestireno expandido)", xps: "XPS (poliestireno extrudido)",
    mineral_wool: "lã mineral", cork: "aglomerado de cortiça expandida (ICB)",
  };

  return {
    unitCost: Math.round(price * 100) / 100,
    unit: "m2",
    breakdown: {
      materials: Math.round(price * 0.62 * 100) / 100,
      labor: Math.round(price * 0.34 * 100) / 100,
      machinery: Math.round(price * 0.04 * 100) / 100,
    },
    variantCode: `ZFF.${insulationType}.${thickness}`,
    fullDescription: `Sistema ETICS com ${insulationLabels[insulationType] ?? insulationType} ${thickness}mm, acabamento ${finish}`,
    source: "parametric",
    notes: [
      `Isolante: ${insulationLabels[insulationType] ?? insulationType}`,
      `Espessura: ${thickness}mm`,
      `Acabamento: ${finish}`,
    ],
  };
}

// ─── FLOORING ─────────────────────────────────────────────────

function calculateFlooringPrice(params: Record<string, string | number>): PriceResult {
  const floorType = String(params.type ?? "ceramic");
  const quality = String(params.quality ?? "medium");

  const PRICES: Record<string, Record<string, number>> = {
    ceramic:  { budget: 28, medium: 42, premium: 65, luxury: 95 },
    wood:     { budget: 25, medium: 38, premium: 55, luxury: 85 },
    vinyl:    { budget: 18, medium: 28, premium: 42, luxury: 0 },
    stone:    { budget: 55, medium: 80, premium: 120, luxury: 180 },
    epoxy:    { budget: 25, medium: 35, premium: 50, luxury: 0 },
    microcement: { budget: 45, medium: 65, premium: 90, luxury: 0 },
  };

  const price = PRICES[floorType]?.[quality] ?? 42;

  const typeLabels: Record<string, string> = {
    ceramic: "Pavimento cerâmico", wood: "Pavimento flutuante madeira/laminado",
    vinyl: "Pavimento vinílico LVT", stone: "Pavimento em pedra natural",
    epoxy: "Pavimento em resina epóxi", microcement: "Microcimento",
  };

  return {
    unitCost: price,
    unit: "m2",
    breakdown: {
      materials: Math.round(price * 0.65 * 100) / 100,
      labor: Math.round(price * 0.30 * 100) / 100,
      machinery: Math.round(price * 0.05 * 100) / 100,
    },
    variantCode: `PA.${floorType}.${quality}`,
    fullDescription: `${typeLabels[floorType] ?? floorType} (gama ${quality}), incluindo preparação de base`,
    source: "parametric",
    notes: [`Tipo: ${typeLabels[floorType] ?? floorType}`, `Gama: ${quality}`],
  };
}

// ─── INTERIOR DOORS ───────────────────────────────────────────

function calculateDoorPrice(params: Record<string, string | number>): PriceResult {
  const material = String(params.material ?? "favo");
  const finish = String(params.finish ?? "lacado");
  const width = Number(params.width ?? 0.80);
  const height = Number(params.height ?? 2.10);
  const type = String(params.type ?? "batente");

  const BASE_PRICES: Record<string, number> = {
    favo: 180, aglomerado: 220, macica: 380, vidro: 450,
  };
  let price = BASE_PRICES[material] ?? 220;

  const finishAdj: Record<string, number> = { folheado: 0, lacado: 40, lacado_ral: 80, verniz: 30 };
  price += finishAdj[finish] ?? 0;

  // Width adjustment (wider doors cost more due to aro and folha)
  if (width >= 0.90) price *= 1.10;
  if (width >= 1.00) price *= 1.10;

  // Type: sliding doors cost more
  const typeAdj: Record<string, number> = { batente: 1.0, correr_exterior: 1.35, correr_interior: 1.80, pivotante: 1.50 };
  price *= typeAdj[type] ?? 1.0;

  // Includes hardware (ferragens)
  price += 35; // Standard handle + hinges

  return {
    unitCost: Math.round(price),
    unit: "Ud",
    breakdown: {
      materials: Math.round(price * 0.72), labor: Math.round(price * 0.25), machinery: Math.round(price * 0.03),
    },
    variantCode: `CP.${material}.${type}.${Math.round(width * 100)}`,
    fullDescription: `Porta interior ${material}, ${finish}, ${type} (${width}×${height}m), incluindo aro e ferragens`,
    source: "parametric",
    notes: [`Material: ${material}`, `Acabamento: ${finish}`, `Tipo: ${type}`, `Dimensão: ${width}×${height}m`],
  };
}

// ─── PAINTING ─────────────────────────────────────────────────

function calculatePaintingPrice(params: Record<string, string | number>): PriceResult {
  const paintType = String(params.paint_type ?? "plastica");
  const coats = Number(params.coats ?? 2);
  const surface = String(params.surface ?? "interior_wall");
  const primer = String(params.primer ?? "false") !== "false";

  const BASE_PRICES: Record<string, number> = {
    plastica: 2.80, acrilica: 3.20, esmalte: 4.50, epoxy: 8.00, silicato: 5.50,
  };
  const pricePerCoat = BASE_PRICES[paintType] ?? 2.80;

  let price = pricePerCoat * coats;
  if (primer) price += 2.50;

  // Surface type affects labor cost
  const surfaceAdj: Record<string, number> = {
    interior_wall: 1.0, exterior_wall: 1.30, ceiling: 1.25, woodwork: 1.60, metalwork: 1.40,
  };
  price *= surfaceAdj[surface] ?? 1.0;

  return {
    unitCost: Math.round(price * 100) / 100,
    unit: "m2",
    breakdown: {
      materials: Math.round(price * 0.40 * 100) / 100,
      labor: Math.round(price * 0.55 * 100) / 100,
      machinery: Math.round(price * 0.05 * 100) / 100,
    },
    variantCode: `PP.${paintType}.${coats}x.${surface}`,
    fullDescription: `Pintura ${paintType}, ${coats} demãos${primer ? " + primário" : ""}, ${surface.replace(/_/g, " ")}`,
    source: "parametric",
    notes: [`Tinta: ${paintType}`, `Demãos: ${coats}`, primer ? "Com primário" : "Sem primário"],
  };
}

// ─── ROOFING ──────────────────────────────────────────────────

function calculateRoofingPrice(params: Record<string, string | number>): PriceResult {
  const roofType = String(params.type ?? "telha_ceramica");
  const insulation = String(params.insulation ?? "xps_60");
  const waterproofing = String(params.waterproofing ?? "true") !== "false";

  const BASE_PRICES: Record<string, number> = {
    telha_ceramica: 32, telha_betao: 28, panel_sandwich: 28,
    cobertura_plana: 22, cobertura_verde: 85, zinc: 65,
  };
  let price = BASE_PRICES[roofType] ?? 32;

  // Insulation
  const insulationCost: Record<string, number> = {
    none: 0, xps_40: 8, xps_60: 12, xps_80: 16, mineral_60: 14, mineral_80: 18,
  };
  price += insulationCost[insulation] ?? 12;

  // Waterproofing membrane
  if (waterproofing) price += 14;

  // Inclined roofs need structure (ripado, varas, madres)
  if (["telha_ceramica", "telha_betao"].includes(roofType)) price += 18;

  const labels: Record<string, string> = {
    telha_ceramica: "telha cerâmica (Marselha)", telha_betao: "telha de betão",
    panel_sandwich: "painel sandwich", cobertura_plana: "cobertura plana invertida",
    cobertura_verde: "cobertura verde extensiva", zinc: "zinco (junta agrafada)",
  };

  return {
    unitCost: Math.round(price * 100) / 100,
    unit: "m2",
    breakdown: {
      materials: Math.round(price * 0.60 * 100) / 100,
      labor: Math.round(price * 0.32 * 100) / 100,
      machinery: Math.round(price * 0.08 * 100) / 100,
    },
    variantCode: `CT.${roofType}.${insulation}`,
    fullDescription: `Cobertura em ${labels[roofType] ?? roofType}, isolamento ${insulation}${waterproofing ? ", com membrana impermeabilizante" : ""}`,
    source: "parametric",
    notes: [`Tipo: ${labels[roofType] ?? roofType}`, `Isolamento: ${insulation}`, waterproofing ? "Com impermeabilização" : "Sem impermeabilização"],
  };
}

// ─── ELECTRICAL INSTALLATION ──────────────────────────────────

function calculateElectricalPrice(params: Record<string, string | number>): PriceResult {
  const typology = String(params.typology ?? "T3");
  const quality = String(params.quality ?? "standard");
  const evCharging = String(params.ev_charging ?? "true") !== "false";
  const solar = String(params.solar ?? "false") !== "false";

  // Base price by typology (complete electrical installation)
  const BASE: Record<string, number> = {
    T0: 2800, T1: 3500, T2: 4200, T3: 4800, T4: 5600, T5: 6500,
  };
  let price = BASE[typology] ?? 4800;

  const qualityAdj: Record<string, number> = { budget: 0.80, standard: 1.0, premium: 1.35 };
  price *= qualityAdj[quality] ?? 1.0;

  if (evCharging) price += 1450;
  if (solar) price += 5200;

  return {
    unitCost: Math.round(price),
    unit: "Ud",
    breakdown: {
      materials: Math.round(price * 0.62), labor: Math.round(price * 0.33), machinery: Math.round(price * 0.05),
    },
    variantCode: `IE.${typology}.${quality}`,
    fullDescription: `Instalação elétrica completa ${typology}, gama ${quality}${evCharging ? " + wallbox VE" : ""}${solar ? " + solar PV 3.68kWp" : ""}`,
    source: "parametric",
    notes: [`Tipologia: ${typology}`, `Gama: ${quality}`, evCharging ? "Inclui wallbox VE" : "", solar ? "Inclui solar PV" : ""].filter(Boolean),
  };
}

// ─── PLUMBING ─────────────────────────────────────────────────

function calculatePlumbingPrice(params: Record<string, string | number>): PriceResult {
  const typology = String(params.typology ?? "T3");
  const pipeMaterial = String(params.pipe ?? "ppr");
  const quality = String(params.quality ?? "standard");

  const BASE: Record<string, number> = { T0: 1500, T1: 1800, T2: 2200, T3: 2600, T4: 3200, T5: 3800 };
  let price = BASE[typology] ?? 2600;

  const pipeAdj: Record<string, number> = { ppr: 1.0, multicamada: 1.15, cobre: 1.45 };
  price *= pipeAdj[pipeMaterial] ?? 1.0;

  const qualityAdj: Record<string, number> = { budget: 0.80, standard: 1.0, premium: 1.40 };
  price *= qualityAdj[quality] ?? 1.0;

  return {
    unitCost: Math.round(price),
    unit: "Ud",
    breakdown: {
      materials: Math.round(price * 0.55), labor: Math.round(price * 0.40), machinery: Math.round(price * 0.05),
    },
    variantCode: `IF.${typology}.${pipeMaterial}`,
    fullDescription: `Rede de abastecimento de água ${typology}, tubagem ${pipeMaterial}, gama ${quality}`,
    source: "parametric",
    notes: [`Tipologia: ${typology}`, `Tubagem: ${pipeMaterial}`, `Gama: ${quality}`],
  };
}

// ============================================================
// Registry of All Parametric Items
// ============================================================

export const PARAMETRIC_ITEMS: ParametricItem[] = [
  {
    code: "CXA010",
    description: "Caixilharia de alumínio",
    chapter: "Caixilharias > Alumínio",
    parameters: [
      { key: "opening", label: "Tipo de abertura", type: "select", options: WINDOW_OPENING_TYPES },
      { key: "glass", label: "Tipo de vidro", type: "select", options: WINDOW_GLASS_TYPES },
      { key: "finish", label: "Acabamento", type: "select", options: WINDOW_FRAME_FINISH },
      { key: "rpt", label: "RPT (ruptura ponte térmica)", type: "boolean" },
      { key: "width", label: "Largura", type: "number", min: 0.3, max: 6.0, unit: "m" },
      { key: "height", label: "Altura", type: "number", min: 0.3, max: 3.5, unit: "m" },
    ],
    calculatePrice: calculateWindowPrice,
    defaults: { opening: "oscilo-batente", glass: "duplo_baixoe", finish: "lacado_standard", rpt: "true", width: 1.2, height: 1.4 },
  },
  {
    code: "CXP010",
    description: "Caixilharia de PVC",
    chapter: "Caixilharias > PVC",
    parameters: [
      { key: "opening", label: "Tipo de abertura", type: "select", options: WINDOW_OPENING_TYPES },
      { key: "glass", label: "Tipo de vidro", type: "select", options: WINDOW_GLASS_TYPES },
      { key: "width", label: "Largura", type: "number", min: 0.3, max: 4.0, unit: "m" },
      { key: "height", label: "Altura", type: "number", min: 0.3, max: 3.0, unit: "m" },
    ],
    calculatePrice: calculatePvcWindowPrice,
    defaults: { opening: "oscilo-batente", glass: "duplo_baixoe", width: 1.2, height: 1.4 },
  },
  {
    code: "SB",
    description: "Betão armado",
    chapter: "Estruturas > Betão armado",
    parameters: [
      { key: "class", label: "Classe de betão", type: "select", options: CONCRETE_CLASSES.map(c => ({ value: c.value, label: c.label })) },
      { key: "element", label: "Elemento", type: "select", options: [
        { value: "footing", label: "Sapata" }, { value: "wall", label: "Muro/Parede" },
        { value: "slab", label: "Laje" }, { value: "beam", label: "Viga" },
        { value: "column", label: "Pilar" }, { value: "stair", label: "Escada" },
      ]},
      { key: "steel", label: "Taxa de armadura", type: "select", options: [
        { value: "light", label: "Leve (~80 kg/m³)" }, { value: "medium", label: "Média (~110 kg/m³)" },
        { value: "heavy", label: "Pesada (~150 kg/m³)" },
      ]},
      { key: "pumped", label: "Betão bombeado", type: "boolean" },
      { key: "formwork", label: "Incluir cofragem", type: "boolean" },
    ],
    calculatePrice: calculateConcretePrice,
    defaults: { class: "C25/30", element: "slab", steel: "medium", pumped: "true", formwork: "true" },
  },
  {
    code: "AB",
    description: "Alvenaria",
    chapter: "Alvenarias",
    parameters: [
      { key: "thickness", label: "Espessura", type: "select", options: [
        { value: "7", label: "7 cm" }, { value: "9", label: "9 cm" }, { value: "11", label: "11 cm" },
        { value: "15", label: "15 cm" }, { value: "20", label: "20 cm" }, { value: "25", label: "25 cm" },
      ]},
      { key: "brick_type", label: "Tipo de tijolo", type: "select", options: [
        { value: "furado", label: "Cerâmico furado" }, { value: "maciço", label: "Cerâmico maciço" },
        { value: "termico", label: "Tijolo térmico (Preceram)" }, { value: "bloco_betao", label: "Bloco de betão" },
      ]},
      { key: "external", label: "Parede exterior", type: "boolean" },
      { key: "height", label: "Altura piso", type: "number", min: 2.0, max: 8.0, unit: "m" },
    ],
    calculatePrice: calculateMasonryPrice,
    defaults: { thickness: 15, brick_type: "furado", external: "true", height: 2.8 },
  },
  {
    code: "ZFF",
    description: "Sistema ETICS (capoto)",
    chapter: "Reabilitação energética > ETICS",
    parameters: [
      { key: "insulation", label: "Tipo de isolante", type: "select", options: [
        { value: "eps", label: "EPS" }, { value: "xps", label: "XPS" },
        { value: "mineral_wool", label: "Lã mineral" }, { value: "cork", label: "Aglomerado de cortiça (ICB)" },
      ]},
      { key: "thickness", label: "Espessura", type: "number", min: 30, max: 200, unit: "mm" },
      { key: "finish", label: "Acabamento", type: "select", options: [
        { value: "acrilico", label: "Acrílico" }, { value: "silicato", label: "Silicato" },
        { value: "silicone", label: "Silicone" }, { value: "mineral", label: "Mineral" },
      ]},
    ],
    calculatePrice: calculateEticsPrice,
    defaults: { insulation: "eps", thickness: 60, finish: "acrilico" },
  },
  {
    code: "PA",
    description: "Pavimentos",
    chapter: "Pavimentos",
    parameters: [
      { key: "type", label: "Tipo", type: "select", options: [
        { value: "ceramic", label: "Cerâmico" }, { value: "wood", label: "Madeira/Laminado" },
        { value: "vinyl", label: "Vinílico LVT" }, { value: "stone", label: "Pedra natural" },
        { value: "epoxy", label: "Resina epóxi" }, { value: "microcement", label: "Microcimento" },
      ]},
      { key: "quality", label: "Gama", type: "select", options: [
        { value: "budget", label: "Económica" }, { value: "medium", label: "Média" },
        { value: "premium", label: "Premium" }, { value: "luxury", label: "Luxo" },
      ]},
    ],
    calculatePrice: calculateFlooringPrice,
    defaults: { type: "ceramic", quality: "medium" },
  },
  {
    code: "CP",
    description: "Portas interiores",
    chapter: "Carpintarias > Portas",
    parameters: [
      { key: "material", label: "Material", type: "select", options: [
        { value: "favo", label: "Estrutura favo (económica)" }, { value: "aglomerado", label: "Aglomerado" },
        { value: "macica", label: "Madeira maciça" }, { value: "vidro", label: "Vidro temperado" },
      ]},
      { key: "finish", label: "Acabamento", type: "select", options: [
        { value: "folheado", label: "Folheado" }, { value: "lacado", label: "Lacado branco" },
        { value: "lacado_ral", label: "Lacado RAL" }, { value: "verniz", label: "Verniz natural" },
      ]},
      { key: "type", label: "Tipo", type: "select", options: [
        { value: "batente", label: "Batente (abrir)" }, { value: "correr_exterior", label: "Correr exterior" },
        { value: "correr_interior", label: "Correr interior (embutida)" }, { value: "pivotante", label: "Pivotante" },
      ]},
      { key: "width", label: "Largura", type: "number", min: 0.60, max: 1.40, unit: "m" },
      { key: "height", label: "Altura", type: "number", min: 2.00, max: 2.70, unit: "m" },
    ],
    calculatePrice: calculateDoorPrice,
    defaults: { material: "favo", finish: "lacado", type: "batente", width: 0.80, height: 2.10 },
  },
  {
    code: "PP",
    description: "Pintura",
    chapter: "Pinturas",
    parameters: [
      { key: "paint_type", label: "Tipo de tinta", type: "select", options: [
        { value: "plastica", label: "Tinta plástica" }, { value: "acrilica", label: "Tinta acrílica (exterior)" },
        { value: "esmalte", label: "Esmalte (madeiras/metais)" }, { value: "epoxy", label: "Epóxi" },
        { value: "silicato", label: "Silicato (fachadas)" },
      ]},
      { key: "coats", label: "Nº demãos", type: "number", min: 1, max: 4, unit: "" },
      { key: "surface", label: "Superfície", type: "select", options: [
        { value: "interior_wall", label: "Parede interior" }, { value: "exterior_wall", label: "Fachada" },
        { value: "ceiling", label: "Teto" }, { value: "woodwork", label: "Madeira" },
        { value: "metalwork", label: "Metal" },
      ]},
      { key: "primer", label: "Primário", type: "boolean" },
    ],
    calculatePrice: calculatePaintingPrice,
    defaults: { paint_type: "plastica", coats: 2, surface: "interior_wall", primer: "false" },
  },
  {
    code: "CT",
    description: "Coberturas",
    chapter: "Coberturas",
    parameters: [
      { key: "type", label: "Tipo de cobertura", type: "select", options: [
        { value: "telha_ceramica", label: "Telha cerâmica (Marselha)" }, { value: "telha_betao", label: "Telha de betão" },
        { value: "panel_sandwich", label: "Painel sandwich" }, { value: "cobertura_plana", label: "Cobertura plana invertida" },
        { value: "cobertura_verde", label: "Cobertura verde" }, { value: "zinc", label: "Zinco (junta agrafada)" },
      ]},
      { key: "insulation", label: "Isolamento", type: "select", options: [
        { value: "none", label: "Sem isolamento" }, { value: "xps_40", label: "XPS 40mm" },
        { value: "xps_60", label: "XPS 60mm" }, { value: "xps_80", label: "XPS 80mm" },
        { value: "mineral_60", label: "Lã mineral 60mm" }, { value: "mineral_80", label: "Lã mineral 80mm" },
      ]},
      { key: "waterproofing", label: "Impermeabilização", type: "boolean" },
    ],
    calculatePrice: calculateRoofingPrice,
    defaults: { type: "telha_ceramica", insulation: "xps_60", waterproofing: "true" },
  },
  {
    code: "IE",
    description: "Instalação elétrica completa",
    chapter: "Instalações > Elétricas",
    parameters: [
      { key: "typology", label: "Tipologia", type: "select", options: [
        { value: "T0", label: "T0" }, { value: "T1", label: "T1" }, { value: "T2", label: "T2" },
        { value: "T3", label: "T3" }, { value: "T4", label: "T4" }, { value: "T5", label: "T5" },
      ]},
      { key: "quality", label: "Gama", type: "select", options: [
        { value: "budget", label: "Económica" }, { value: "standard", label: "Standard" }, { value: "premium", label: "Premium" },
      ]},
      { key: "ev_charging", label: "Wallbox VE", type: "boolean" },
      { key: "solar", label: "Solar fotovoltaico 3.68kWp", type: "boolean" },
    ],
    calculatePrice: calculateElectricalPrice,
    defaults: { typology: "T3", quality: "standard", ev_charging: "true", solar: "false" },
  },
  {
    code: "IF",
    description: "Rede de abastecimento de água",
    chapter: "Instalações > Águas",
    parameters: [
      { key: "typology", label: "Tipologia", type: "select", options: [
        { value: "T0", label: "T0" }, { value: "T1", label: "T1" }, { value: "T2", label: "T2" },
        { value: "T3", label: "T3" }, { value: "T4", label: "T4" }, { value: "T5", label: "T5" },
      ]},
      { key: "pipe", label: "Material tubagem", type: "select", options: [
        { value: "ppr", label: "PPR" }, { value: "multicamada", label: "Multicamada" }, { value: "cobre", label: "Cobre" },
      ]},
      { key: "quality", label: "Gama", type: "select", options: [
        { value: "budget", label: "Económica" }, { value: "standard", label: "Standard" }, { value: "premium", label: "Premium" },
      ]},
    ],
    calculatePrice: calculatePlumbingPrice,
    defaults: { typology: "T3", pipe: "ppr", quality: "standard" },
  },
];

// ============================================================
// Public API
// ============================================================

/**
 * Get a parametric item by CYPE code prefix.
 */
export function getParametricItem(code: string): ParametricItem | undefined {
  return PARAMETRIC_ITEMS.find(item =>
    code.startsWith(item.code) || item.code.startsWith(code)
  );
}

/**
 * Calculate a parametric price, falling back to imported prices if available.
 */
export function calculateParametricPrice(
  code: string,
  params: Record<string, string | number> = {},
): PriceResult | null {
  // First check for direct imported price
  const imported = getImportedPrice(code);
  if (imported) {
    return {
      unitCost: imported.unitCost,
      unit: imported.unit,
      breakdown: { materials: imported.materials, labor: imported.labor, machinery: imported.machinery },
      variantCode: imported.code,
      fullDescription: imported.description,
      source: "imported",
      notes: [`Preço importado: ${imported.source}`],
    };
  }

  // Find parametric model
  const item = getParametricItem(code);
  if (!item) return null;

  // Merge defaults with provided params
  const mergedParams = { ...item.defaults, ...params };
  return item.calculatePrice(mergedParams);
}

/**
 * Get all available parametric items for the configurator UI.
 */
export function getAllParametricItems(): ParametricItem[] {
  return PARAMETRIC_ITEMS;
}
