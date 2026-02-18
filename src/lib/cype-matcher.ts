/**
 * CYPE Fuzzy Matcher
 *
 * Matches WBS articles (with keynotes from BIM models) against the
 * CYPE database from cost-estimation.ts. Uses a multi-strategy approach:
 *   1. Exact CYPE code match (from user override or keynote)
 *   2. Keynote-based mapping (common BIM keynote conventions)
 *   3. Description similarity (token overlap + n-gram matching)
 *   4. Category/chapter matching as fallback
 *
 * Returns confidence scores so users can review low-confidence matches.
 */

import type {
  WbsProject,
  WbsArticle,
  WbsChapter,
  CypeMatch,
  MatchReport,
} from "./wbs-types";
import type { CypeWorkItem, CostComponent } from "./cost-estimation";
import { getCypeMatcherDatabase } from "./cype-matcher-db-loader";

// ============================================================
// Re-export CYPE database for matching
// ============================================================

import type { RegulationArea } from "./types";

/**
 * Cached CYPE database loaded from scraper output.
 * Auto-populated on first access using getCypeMatcherDatabase().
 */
let CYPE_CONSTRUCTION_DB: CypeWorkItem[] | null = null;

/**
 * Get or load the CYPE construction database
 */
function getDatabase(): CypeWorkItem[] {
  if (!CYPE_CONSTRUCTION_DB) {
    CYPE_CONSTRUCTION_DB = getCypeMatcherDatabase();
  }
  return CYPE_CONSTRUCTION_DB;
}

/**
 * FALLBACK: Hardcoded essential items (deprecated - kept for backwards compatibility).
 * Replaced by dynamic scraper data. This array is now only used if scraper data is unavailable.
 */
const CYPE_CONSTRUCTION_DB_FALLBACK: CypeWorkItem[] = [
  // ─── SITE SETUP (E) ─────────────────────────────────────────
  {
    code: "EES010", description: "Montagem e desmontagem de estaleiro de obra",
    chapter: "Estaleiro > Instalações provisórias",
    unit: "Ud", unitCost: 8500, breakdown: { materials: 4500, labor: 3200, machinery: 800 },
    isRehab: false, areas: ["general" as RegulationArea],
    patterns: [/estaleiro|site.*setup|instalações.*provisórias/i],
  },
  {
    code: "EES020", description: "Vedação perimetral de obra (chapas metálicas h=2m)",
    chapter: "Estaleiro > Vedações",
    unit: "m", unitCost: 32, breakdown: { materials: 20, labor: 10, machinery: 2 },
    isRehab: false, areas: ["general" as RegulationArea],
    patterns: [/vedação.*obra|tapume|hoarding/i],
  },

  // ─── DEMOLITIONS (D) ────────────────────────────────────────
  {
    code: "DDA010", description: "Demolição de alvenaria de tijolo (e=15cm)",
    chapter: "Demolições > Alvenarias",
    unit: "m2", unitCost: 12, breakdown: { materials: 0, labor: 8, machinery: 4 },
    isRehab: true, areas: ["architecture" as RegulationArea],
    patterns: [/demolição.*alvenaria|demolição.*parede|wall.*demolition/i],
  },
  {
    code: "DDC010", description: "Demolição de cobertura (telha + estrutura)",
    chapter: "Demolições > Coberturas",
    unit: "m2", unitCost: 18, breakdown: { materials: 0, labor: 12, machinery: 6 },
    isRehab: true, areas: ["architecture" as RegulationArea],
    patterns: [/demolição.*cobertura|demolição.*telhado|roof.*demolition/i],
  },
  {
    code: "DDP010", description: "Demolição de pavimento (incluindo sub-base)",
    chapter: "Demolições > Pavimentos",
    unit: "m2", unitCost: 15, breakdown: { materials: 0, labor: 9, machinery: 6 },
    isRehab: true, areas: ["architecture" as RegulationArea],
    patterns: [/demolição.*pavimento|demolição.*piso|floor.*demolition/i],
  },

  // ─── EARTHWORKS (M) ─────────────────────────────────────────
  {
    code: "MTT010", description: "Escavação geral a céu aberto (terreno tipo II)",
    chapter: "Movimento de terras > Escavação",
    unit: "m3", unitCost: 8, breakdown: { materials: 0, labor: 2, machinery: 6 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/escavação.*geral|escavação.*céu.*aberto|general.*excavation/i],
  },
  {
    code: "MTT020", description: "Escavação de valas para fundações",
    chapter: "Movimento de terras > Escavação",
    unit: "m3", unitCost: 18, breakdown: { materials: 0, labor: 6, machinery: 12 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/escavação.*vala|escavação.*fundaç|trench.*excavation/i],
  },
  {
    code: "MTR010", description: "Aterro e compactação com materiais selecionados",
    chapter: "Movimento de terras > Aterro",
    unit: "m3", unitCost: 14, breakdown: { materials: 6, labor: 3, machinery: 5 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/aterro|compactação|backfill|compaction/i],
  },

  // ─── FOUNDATIONS (F) ─────────────────────────────────────────
  {
    code: "FSS010", description: "Sapata isolada de betão armado C25/30",
    chapter: "Fundações > Sapatas",
    unit: "m3", unitCost: 280, breakdown: { materials: 180, labor: 80, machinery: 20 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/sapata.*isolada|isolated.*footing|fundação.*directa/i],
  },
  {
    code: "FSS020", description: "Sapata contínua de betão armado C25/30",
    chapter: "Fundações > Sapatas",
    unit: "m3", unitCost: 260, breakdown: { materials: 170, labor: 72, machinery: 18 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/sapata.*contínua|sapata.*corrida|strip.*footing/i],
  },
  {
    code: "FLE010", description: "Laje de ensoleiramento geral C25/30 (e=30cm)",
    chapter: "Fundações > Ensoleiramento",
    unit: "m2", unitCost: 95, breakdown: { materials: 62, labor: 28, machinery: 5 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/ensoleiramento|raft.*foundation|laje.*fundação/i],
  },
  {
    code: "FPC010", description: "Estaca moldada in situ (Ø600mm)",
    chapter: "Fundações > Estacas",
    unit: "m", unitCost: 180, breakdown: { materials: 85, labor: 45, machinery: 50 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/estaca|pile.*foundation|fundação.*profunda/i],
  },

  // ─── CONCRETE STRUCTURE (S) ─────────────────────────────────
  {
    code: "SBP010", description: "Pilar de betão armado C25/30 (secção rectangular)",
    chapter: "Estruturas > Betão armado > Pilares",
    unit: "m3", unitCost: 420, breakdown: { materials: 250, labor: 140, machinery: 30 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/pilar.*betão|concrete.*column|pilar.*armado/i],
  },
  {
    code: "SBV010", description: "Viga de betão armado C25/30",
    chapter: "Estruturas > Betão armado > Vigas",
    unit: "m3", unitCost: 380, breakdown: { materials: 230, labor: 120, machinery: 30 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/viga.*betão|concrete.*beam|viga.*armad/i],
  },
  {
    code: "SBL010", description: "Laje maciça de betão armado C25/30 (e=20cm)",
    chapter: "Estruturas > Betão armado > Lajes",
    unit: "m2", unitCost: 85, breakdown: { materials: 52, labor: 28, machinery: 5 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/laje.*maciça|laje.*betão|solid.*slab|concrete.*slab/i],
  },
  {
    code: "SBL020", description: "Laje aligeirada com vigotas pré-esforçadas e abobadilhas",
    chapter: "Estruturas > Betão armado > Lajes",
    unit: "m2", unitCost: 55, breakdown: { materials: 35, labor: 17, machinery: 3 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/laje.*aligeirada|laje.*vigotas|precast.*slab|hollow.*core/i],
  },
  {
    code: "SBE010", description: "Escada de betão armado C25/30 (lanço recto)",
    chapter: "Estruturas > Betão armado > Escadas",
    unit: "m2", unitCost: 180, breakdown: { materials: 100, labor: 65, machinery: 15 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/escada.*betão|concrete.*stair/i],
  },
  {
    code: "SBM010", description: "Muro de betão armado C25/30 (e=25cm)",
    chapter: "Estruturas > Betão armado > Muros",
    unit: "m2", unitCost: 120, breakdown: { materials: 75, labor: 38, machinery: 7 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/muro.*betão|muro.*suporte|retaining.*wall|muro.*contenção/i],
  },

  // ─── STEEL STRUCTURE ────────────────────────────────────────
  {
    code: "SMA010", description: "Estrutura metálica em aço S275 (perfis laminados)",
    chapter: "Estruturas > Metálicas",
    unit: "kg", unitCost: 3.2, breakdown: { materials: 1.8, labor: 1.1, machinery: 0.3 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/estrutura.*metálica|steel.*structure|perfil.*laminado|aço.*S275/i],
  },

  // ─── MASONRY (A) ────────────────────────────────────────────
  {
    code: "ABT010", description: "Alvenaria de tijolo cerâmico furado (e=15cm)",
    chapter: "Alvenarias > Tijolo cerâmico",
    unit: "m2", unitCost: 22, breakdown: { materials: 12, labor: 9, machinery: 1 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/alvenaria.*tijolo.*15|alvenaria.*exterior|brick.*wall.*15/i],
  },
  {
    code: "ABT020", description: "Alvenaria de tijolo cerâmico furado (e=11cm)",
    chapter: "Alvenarias > Tijolo cerâmico",
    unit: "m2", unitCost: 18, breakdown: { materials: 10, labor: 7, machinery: 1 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/alvenaria.*tijolo.*11|alvenaria.*interior|alvenaria.*divisória|brick.*wall.*11|partition/i],
  },
  {
    code: "ABB010", description: "Alvenaria de bloco de betão (e=20cm)",
    chapter: "Alvenarias > Bloco de betão",
    unit: "m2", unitCost: 25, breakdown: { materials: 15, labor: 9, machinery: 1 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/alvenaria.*bloco.*betão|block.*wall|bloco.*cimento/i],
  },

  // ─── ROOFING (C) ────────────────────────────────────────────
  {
    code: "CTM010", description: "Cobertura em telha cerâmica (Marselha) sobre ripado",
    chapter: "Coberturas > Telha cerâmica",
    unit: "m2", unitCost: 42, breakdown: { materials: 28, labor: 12, machinery: 2 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/cobertura.*telha|telha.*cerâmica|ceramic.*tile.*roof/i],
  },
  {
    code: "CTP010", description: "Cobertura plana invertida com XPS e gravilha",
    chapter: "Coberturas > Cobertura plana",
    unit: "m2", unitCost: 65, breakdown: { materials: 45, labor: 17, machinery: 3 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/cobertura.*plana|flat.*roof|terraço.*acessível/i],
  },
  {
    code: "CTZ010", description: "Cobertura em painel sandwich (e=50mm)",
    chapter: "Coberturas > Painel sandwich",
    unit: "m2", unitCost: 38, breakdown: { materials: 28, labor: 8, machinery: 2 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/painel.*sandwich|sandwich.*panel/i],
  },

  // ─── WATERPROOFING (I) ──────────────────────────────────────
  {
    code: "IMP010", description: "Impermeabilização de cobertura com tela asfáltica",
    chapter: "Impermeabilizações > Coberturas",
    unit: "m2", unitCost: 18, breakdown: { materials: 12, labor: 5, machinery: 1 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/impermeabilização.*cobertura|tela.*asfáltica|waterproofing.*roof/i],
  },
  {
    code: "IMP020", description: "Impermeabilização de fundações com emulsão betuminosa",
    chapter: "Impermeabilizações > Fundações",
    unit: "m2", unitCost: 12, breakdown: { materials: 7, labor: 4, machinery: 1 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/impermeabilização.*fundaç|waterproofing.*foundation|emulsão.*betuminosa/i],
  },

  // ─── EXTERNAL FINISHES (R) ──────────────────────────────────
  {
    code: "REE010", description: "Reboco projetado armado com rede fibra de vidro",
    chapter: "Revestimentos exteriores > Reboco",
    unit: "m2", unitCost: 16, breakdown: { materials: 8, labor: 7, machinery: 1 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/reboco.*exterior|external.*render|reboco.*projetado/i],
  },
  {
    code: "REP010", description: "Revestimento cerâmico de fachada (pastilha/azulejo)",
    chapter: "Revestimentos exteriores > Cerâmico",
    unit: "m2", unitCost: 55, breakdown: { materials: 35, labor: 18, machinery: 2 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/revestimento.*cerâmico.*exterior|azulejo.*fachada|ceramic.*facade/i],
  },
  {
    code: "REP020", description: "Revestimento de fachada em pedra natural (granito/calcário)",
    chapter: "Revestimentos exteriores > Pedra natural",
    unit: "m2", unitCost: 120, breakdown: { materials: 85, labor: 30, machinery: 5 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/pedra.*natural.*fachada|granito.*fachada|stone.*cladding/i],
  },

  // ─── INTERNAL FINISHES ──────────────────────────────────────
  {
    code: "RIE010", description: "Estuque projetado em paredes interiores",
    chapter: "Revestimentos interiores > Estuque",
    unit: "m2", unitCost: 10, breakdown: { materials: 4, labor: 5, machinery: 1 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/estuque.*interior|estuque.*projetado|interior.*plaster/i],
  },
  {
    code: "RIC010", description: "Revestimento cerâmico em parede (WC/cozinha)",
    chapter: "Revestimentos interiores > Cerâmico",
    unit: "m2", unitCost: 35, breakdown: { materials: 22, labor: 12, machinery: 1 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/revestimento.*cerâmico.*interior|azulejo.*WC|azulejo.*cozinha|wall.*tile/i],
  },
  {
    code: "RIG010", description: "Paredes em gesso cartonado (estrutura metálica + 2 placas)",
    chapter: "Revestimentos interiores > Gesso cartonado",
    unit: "m2", unitCost: 32, breakdown: { materials: 20, labor: 10, machinery: 2 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/gesso.*cartonado|drywall|plasterboard/i],
  },

  // ─── FLOORING ───────────────────────────────────────────────
  {
    code: "PAC010", description: "Pavimento cerâmico (incluindo betonilha e cola)",
    chapter: "Pavimentos > Cerâmico",
    unit: "m2", unitCost: 42, breakdown: { materials: 28, labor: 12, machinery: 2 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/pavimento.*cerâmico|ceramic.*floor|cerâmica.*pavimento|mosaico/i],
  },
  {
    code: "PAM010", description: "Pavimento flutuante em madeira (soalho ou laminado)",
    chapter: "Pavimentos > Madeira",
    unit: "m2", unitCost: 35, breakdown: { materials: 24, labor: 9, machinery: 2 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/pavimento.*madeira|soalho|parquet|laminate.*floor|flutuante/i],
  },
  {
    code: "PAV010", description: "Pavimento vinílico (tipo LVT)",
    chapter: "Pavimentos > Vinílico",
    unit: "m2", unitCost: 28, breakdown: { materials: 18, labor: 8, machinery: 2 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/pavimento.*vinílico|vinyl.*floor|LVT/i],
  },
  {
    code: "PAB010", description: "Betonilha de regularização (e=5cm)",
    chapter: "Pavimentos > Betonilha",
    unit: "m2", unitCost: 12, breakdown: { materials: 7, labor: 4, machinery: 1 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/betonilha|screed|argamassa.*regularização/i],
  },

  // ─── CEILINGS ───────────────────────────────────────────────
  {
    code: "TFG010", description: "Teto falso em gesso cartonado (estrutura suspensa)",
    chapter: "Tetos > Gesso cartonado",
    unit: "m2", unitCost: 28, breakdown: { materials: 17, labor: 9, machinery: 2 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/teto.*falso|tecto.*falso|false.*ceiling|suspended.*ceiling/i],
  },

  // ─── WINDOWS & EXTERNAL DOORS ───────────────────────────────
  {
    code: "CXA010", description: "Caixilharia de alumínio com RPT e vidro duplo",
    chapter: "Caixilharias > Alumínio",
    unit: "m2", unitCost: 350, breakdown: { materials: 270, labor: 65, machinery: 15 },
    isRehab: false, areas: ["architecture" as RegulationArea, "thermal" as RegulationArea],
    patterns: [/caixilharia.*alumínio|aluminium.*window|janela.*alumínio/i],
  },
  {
    code: "CXP010", description: "Caixilharia de PVC com vidro duplo",
    chapter: "Caixilharias > PVC",
    unit: "m2", unitCost: 300, breakdown: { materials: 230, labor: 55, machinery: 15 },
    isRehab: false, areas: ["architecture" as RegulationArea, "thermal" as RegulationArea],
    patterns: [/caixilharia.*PVC|PVC.*window|janela.*PVC/i],
  },
  {
    code: "PEX010", description: "Porta exterior em madeira maciça (com ferragens)",
    chapter: "Caixilharias > Portas exteriores",
    unit: "Ud", unitCost: 850, breakdown: { materials: 650, labor: 170, machinery: 30 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/porta.*exterior.*madeira|exterior.*door.*wood/i],
  },

  // ─── METALWORK ──────────────────────────────────────────────
  {
    code: "SMG010", description: "Guarda metálica de escada/varanda (h=1.10m)",
    chapter: "Serralharias > Guardas",
    unit: "m", unitCost: 180, breakdown: { materials: 120, labor: 50, machinery: 10 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/guarda.*metálica|guarda.*escada|guarda.*varanda|metal.*railing/i],
  },

  // ─── CARPENTRY ──────────────────────────────────────────────
  {
    code: "CPI010", description: "Porta interior de madeira com aro e ferragens",
    chapter: "Carpintarias > Portas interiores",
    unit: "Ud", unitCost: 280, breakdown: { materials: 200, labor: 70, machinery: 10 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/porta.*interior|interior.*door|porta.*madeira.*interior/i],
  },
  {
    code: "CPA010", description: "Armário roupeiro embutido (módulo 1.20m)",
    chapter: "Carpintarias > Armários",
    unit: "Ud", unitCost: 650, breakdown: { materials: 450, labor: 180, machinery: 20 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/armário.*roupeiro|built.*in.*wardrobe|closet/i],
  },

  // ─── PAINTING ───────────────────────────────────────────────
  {
    code: "PPI010", description: "Pintura de paredes interiores (tinta plástica, 2 demãos)",
    chapter: "Pinturas > Interiores",
    unit: "m2", unitCost: 6, breakdown: { materials: 2.5, labor: 3.2, machinery: 0.3 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/pintura.*interior|pintura.*parede|interior.*paint|tinta.*plástica/i],
  },
  {
    code: "PPE010", description: "Pintura de fachada (tinta acrílica, 2 demãos)",
    chapter: "Pinturas > Exteriores",
    unit: "m2", unitCost: 8, breakdown: { materials: 3, labor: 4.5, machinery: 0.5 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/pintura.*exterior|pintura.*fachada|exterior.*paint|tinta.*acrílica/i],
  },
  {
    code: "PPT010", description: "Pintura de teto (tinta plástica, 2 demãos)",
    chapter: "Pinturas > Tetos",
    unit: "m2", unitCost: 7, breakdown: { materials: 2.5, labor: 4, machinery: 0.5 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/pintura.*teto|pintura.*tecto|ceiling.*paint/i],
  },

  // ─── SANITARY WARE ──────────────────────────────────────────
  {
    code: "LSB010", description: "Banheira acrílica (incluindo torneira misturadora e sifão)",
    chapter: "Loiças sanitárias > Banheira",
    unit: "Ud", unitCost: 550, breakdown: { materials: 400, labor: 130, machinery: 20 },
    isRehab: false, areas: ["water_drainage" as RegulationArea],
    patterns: [/banheira|bathtub/i],
  },
  {
    code: "LSC010", description: "Base de duche com resguardo e misturadora",
    chapter: "Loiças sanitárias > Duche",
    unit: "Ud", unitCost: 480, breakdown: { materials: 350, labor: 110, machinery: 20 },
    isRehab: false, areas: ["water_drainage" as RegulationArea],
    patterns: [/duche|shower/i],
  },
  {
    code: "LSS010", description: "Sanita com autoclismo e tampo (suspensa)",
    chapter: "Loiças sanitárias > Sanita",
    unit: "Ud", unitCost: 420, breakdown: { materials: 320, labor: 85, machinery: 15 },
    isRehab: false, areas: ["water_drainage" as RegulationArea],
    patterns: [/sanita|toilet|WC.*completo/i],
  },
  {
    code: "LSL010", description: "Lavatório de pousar com torneira e sifão",
    chapter: "Loiças sanitárias > Lavatório",
    unit: "Ud", unitCost: 280, breakdown: { materials: 200, labor: 65, machinery: 15 },
    isRehab: false, areas: ["water_drainage" as RegulationArea],
    patterns: [/lavatório|lavabo|washbasin|basin/i],
  },
  {
    code: "LCZ010", description: "Bancada de cozinha com lava-loiça inox (2.40m)",
    chapter: "Loiças sanitárias > Cozinha",
    unit: "Ud", unitCost: 750, breakdown: { materials: 550, labor: 170, machinery: 30 },
    isRehab: false, areas: ["water_drainage" as RegulationArea],
    patterns: [/bancada.*cozinha|lava.*loiça|kitchen.*sink|worktop/i],
  },

  // ─── EXTERNAL WORKS ─────────────────────────────────────────
  {
    code: "AEP010", description: "Pavimento exterior em betão (caminhos pedonais)",
    chapter: "Arranjos exteriores > Pavimentos",
    unit: "m2", unitCost: 35, breakdown: { materials: 22, labor: 10, machinery: 3 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/pavimento.*exterior|betão.*exterior|pathway|caminho.*pedonal/i],
  },
  {
    code: "AEM010", description: "Murete de vedação (bloco + reboco + pintura, h=1.5m)",
    chapter: "Arranjos exteriores > Vedações",
    unit: "m", unitCost: 85, breakdown: { materials: 50, labor: 30, machinery: 5 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/murete.*vedação|muro.*jardim|boundary.*wall/i],
  },

  // ─── FIRE SAFETY (from cost-estimation.ts) ──────────────────
  {
    code: "IOD010", description: "Central de deteção de incêndio analógica",
    chapter: "Instalações > Contra incêndios > Deteção e alarme",
    unit: "Ud", unitCost: 1850, breakdown: { materials: 1400, labor: 380, machinery: 70 },
    isRehab: false, areas: ["fire_safety" as RegulationArea],
    patterns: [/central.*deteção|SADI|fire.*detection.*panel/i],
  },
  {
    code: "IOD102", description: "Detetor ótico de fumos analógico",
    chapter: "Instalações > Contra incêndios > Deteção e alarme",
    unit: "Ud", unitCost: 85, breakdown: { materials: 62, labor: 20, machinery: 3 },
    isRehab: false, areas: ["fire_safety" as RegulationArea],
    patterns: [/detetor.*fumo|smoke.*detector|deteção.*automática/i],
  },
  {
    code: "IOA010", description: "Bloco autónomo de iluminação de emergência",
    chapter: "Instalações > Contra incêndios > Iluminação de emergência",
    unit: "Ud", unitCost: 65, breakdown: { materials: 48, labor: 15, machinery: 2 },
    isRehab: false, areas: ["fire_safety" as RegulationArea],
    patterns: [/iluminação.*emergência|emergency.*lighting|bloco.*autónomo/i],
  },
  {
    code: "IOX010", description: "Extintor portátil ABC 6 kg",
    chapter: "Instalações > Contra incêndios > Extintores",
    unit: "Ud", unitCost: 52, breakdown: { materials: 40, labor: 10, machinery: 2 },
    isRehab: false, areas: ["fire_safety" as RegulationArea],
    patterns: [/extintor/i],
  },
  {
    code: "IOB010", description: "Boca-de-incêndio armada tipo carretel (Ø25)",
    chapter: "Instalações > Contra incêndios > Redes de incêndio",
    unit: "Ud", unitCost: 680, breakdown: { materials: 520, labor: 140, machinery: 20 },
    isRehab: false, areas: ["fire_safety" as RegulationArea],
    patterns: [/boca.*incêndio|carretel|rede.*incêndio.*armada/i],
  },

  // ─── THERMAL / ENERGY (from cost-estimation.ts) ─────────────
  {
    code: "ZFF120", description: "Sistema ETICS (capoto) com EPS 60mm",
    chapter: "Reabilitação energética > Isolamento térmico fachadas",
    unit: "m2", unitCost: 48, breakdown: { materials: 30, labor: 16, machinery: 2 },
    isRehab: true, areas: ["thermal" as RegulationArea],
    patterns: [/ETICS|capoto|isolamento.*exterior.*parede/i],
  },
  {
    code: "ZBL010", description: "Substituição de janela por caixilharia alumínio RPT com vidro duplo",
    chapter: "Reabilitação energética > Substituição de aberturas",
    unit: "m2", unitCost: 420, breakdown: { materials: 320, labor: 85, machinery: 15 },
    isRehab: true, areas: ["thermal" as RegulationArea],
    patterns: [/envidraçado|window.*U|substituição.*janela/i],
  },
  {
    code: "ZHT010", description: "Isolamento térmico de cobertura com XPS 60mm",
    chapter: "Reabilitação energética > Isolamento térmico horizontal",
    unit: "m2", unitCost: 28, breakdown: { materials: 18, labor: 8, machinery: 2 },
    isRehab: true, areas: ["thermal" as RegulationArea],
    patterns: [/isolamento.*cobertura|roof.*insulation/i],
  },

  // ─── ELECTRICAL (from cost-estimation.ts) ───────────────────
  {
    code: "IEI015", description: "Rede de distribuição interior em habitação (T3)",
    chapter: "Instalações > Elétricas > Instalações interiores",
    unit: "Ud", unitCost: 4500, breakdown: { materials: 2800, labor: 1500, machinery: 200 },
    isRehab: false, areas: ["electrical" as RegulationArea],
    patterns: [/instalação.*elétrica.*completa|rede.*distribuição.*interior/i],
  },
  {
    code: "IEP010", description: "Quadro elétrico de habitação (12 módulos)",
    chapter: "Instalações > Elétricas > Quadros e proteções",
    unit: "Ud", unitCost: 680, breakdown: { materials: 480, labor: 170, machinery: 30 },
    isRehab: false, areas: ["electrical" as RegulationArea],
    patterns: [/quadro.*elétrico|distribution.*board/i],
  },
  {
    code: "IEV010", description: "Ponto de carregamento de veículo elétrico (wallbox 7.4 kW)",
    chapter: "Instalações > Elétricas > Mobilidade elétrica",
    unit: "Ud", unitCost: 1450, breakdown: { materials: 1100, labor: 300, machinery: 50 },
    isRehab: false, areas: ["electrical" as RegulationArea],
    patterns: [/VE.*carregamento|EV.*charging|wallbox|veículo.*elétrico/i],
  },

  // ─── TELECOMMUNICATIONS (from cost-estimation.ts) ───────────
  {
    code: "ILA010", description: "Armário de Telecomunicações de Edifício (ATE)",
    chapter: "Instalações > Telecomunicações > ITED",
    unit: "Ud", unitCost: 2200, breakdown: { materials: 1700, labor: 420, machinery: 80 },
    isRehab: false, areas: ["ited_itur" as RegulationArea],
    patterns: [/ATE|armário.*telecomunicações.*edifício/i],
  },
  {
    code: "ILA020", description: "Armário de Telecomunicações Individual (ATI)",
    chapter: "Instalações > Telecomunicações > ITED",
    unit: "Ud", unitCost: 450, breakdown: { materials: 320, labor: 110, machinery: 20 },
    isRehab: false, areas: ["ited_itur" as RegulationArea],
    patterns: [/ATI|armário.*telecomunicações.*individual/i],
  },

  // ─── WATER & DRAINAGE (from cost-estimation.ts) ─────────────
  {
    code: "IFA010", description: "Rede de abastecimento de água fria em habitação (PPR)",
    chapter: "Instalações > Abastecimento de água",
    unit: "Ud", unitCost: 2200, breakdown: { materials: 1400, labor: 700, machinery: 100 },
    isRehab: false, areas: ["water_drainage" as RegulationArea],
    patterns: [/rede.*abastecimento|rede.*água.*fria/i],
  },
  {
    code: "ISS010", description: "Separação de redes de drenagem (residual + pluvial)",
    chapter: "Instalações > Drenagem > Separação de redes",
    unit: "Ud", unitCost: 4500, breakdown: { materials: 2500, labor: 1700, machinery: 300 },
    isRehab: true, areas: ["water_drainage" as RegulationArea],
    patterns: [/separação.*drenagem|drenagem.*separativa/i],
  },

  // ─── GAS (from cost-estimation.ts) ──────────────────────────
  {
    code: "IGI010", description: "Detetor de gás com electroválvula de corte",
    chapter: "Instalações > Gases combustíveis > Deteção",
    unit: "Ud", unitCost: 280, breakdown: { materials: 220, labor: 50, machinery: 10 },
    isRehab: false, areas: ["gas" as RegulationArea],
    patterns: [/detetor.*gás|gas.*detector/i],
  },

  // ─── ACCESSIBILITY (from cost-estimation.ts) ────────────────
  {
    code: "HAR010", description: "Rampa acessível com corrimão duplo (DL 163/2006)",
    chapter: "Remates e trabalhos auxiliares > Acessibilidade",
    unit: "m", unitCost: 450, breakdown: { materials: 280, labor: 150, machinery: 20 },
    isRehab: true, areas: ["accessibility" as RegulationArea],
    patterns: [/rampa.*acessível|accessible.*ramp/i],
  },
  {
    code: "SAE010", description: "Ascensor elétrico sem casa de máquinas (4 paragens)",
    chapter: "Equipamentos fixos > Ascensores",
    unit: "Ud", unitCost: 42000, breakdown: { materials: 35000, labor: 5500, machinery: 1500 },
    isRehab: false, areas: ["accessibility" as RegulationArea, "elevators" as RegulationArea],
    patterns: [/ascensor|elevador/i],
  },

  // ─── VENTILATION (from cost-estimation.ts) ──────────────────
  {
    code: "IVC010", description: "Unidade de ventilação mecânica com recuperação de calor (VMC)",
    chapter: "Instalações > Ventilação > VMC",
    unit: "Ud", unitCost: 3800, breakdown: { materials: 2900, labor: 750, machinery: 150 },
    isRehab: true, areas: ["avac" as RegulationArea, "thermal" as RegulationArea],
    patterns: [/VMC|recuperação.*calor|ventilação.*mecânica/i],
  },

  // ─── ACOUSTIC (from cost-estimation.ts) ─────────────────────
  {
    code: "NBB010", description: "Isolamento acústico de parede com lã mineral 50mm + gesso cartonado duplo",
    chapter: "Isolamentos > Isolamentos sonoros",
    unit: "m2", unitCost: 45, breakdown: { materials: 28, labor: 15, machinery: 2 },
    isRehab: false, areas: ["acoustic" as RegulationArea],
    patterns: [/isolamento.*acústico|acoustic.*insulation/i],
  },
  {
    code: "NBB020", description: "Pavimento flutuante com membrana resiliente para sons de percussão",
    chapter: "Isolamentos > Isolamentos sonoros",
    unit: "m2", unitCost: 32, breakdown: { materials: 20, labor: 10, machinery: 2 },
    isRehab: false, areas: ["acoustic" as RegulationArea],
    patterns: [/sons.*percussão|impact.*insulation|pavimento.*flutuante/i],
  },

  // ─── WASTE (from cost-estimation.ts) ────────────────────────
  {
    code: "GRA010", description: "Plano de Prevenção e Gestão de RCD",
    chapter: "Gestão de resíduos > Plano de gestão",
    unit: "projeto", unitCost: 800, breakdown: { materials: 0, labor: 800, machinery: 0 },
    isRehab: false, areas: ["waste" as RegulationArea],
    patterns: [/plano.*gestão.*resíduos|waste.*management.*plan|PPG|RCD/i],
  },

  // ─── TESTING & CERTIFICATION ────────────────────────────────
  {
    code: "XRA010", description: "Ensaio acústico in situ (D'nT,w + L'nT,w + D2m,nT,w)",
    chapter: "Controlo de qualidade > Ensaios acústicos",
    unit: "ensaio", unitCost: 1800, breakdown: { materials: 0, labor: 1800, machinery: 0 },
    isRehab: false, areas: ["acoustic" as RegulationArea],
    patterns: [/ensaio.*acústico|acoustic.*test/i],
  },
  {
    code: "XEE010", description: "Ensaio de estanquidade de cobertura",
    chapter: "Controlo de qualidade > Ensaios",
    unit: "ensaio", unitCost: 600, breakdown: { materials: 50, labor: 500, machinery: 50 },
    isRehab: false, areas: ["architecture" as RegulationArea],
    patterns: [/ensaio.*estanquidade.*cobertura|leak.*test.*roof/i],
  },
  {
    code: "XEC010", description: "Ensaio de resistência do betão (carotes)",
    chapter: "Controlo de qualidade > Ensaios",
    unit: "ensaio", unitCost: 350, breakdown: { materials: 0, labor: 300, machinery: 50 },
    isRehab: false, areas: ["structural" as RegulationArea],
    patterns: [/ensaio.*betão|carote|concrete.*test|core.*test/i],
  },
];

// ============================================================
// Portuguese Text Normalization
// ============================================================

/** Common Portuguese stopwords to ignore in matching */
const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "com", "por", "para", "ao", "aos", "um", "uma", "uns", "umas",
  "e", "ou", "o", "a", "os", "as", "que", "se", "é", "são",
  "tipo", "incluindo", "conforme", "segundo", "of", "with", "in",
  "the", "and", "for", "including", "according",
]);

/** Simple Portuguese suffix stripping for matching */
function stemPT(word: string): string {
  let s = word.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents
  // Common suffixes
  if (s.endsWith("ções")) s = s.slice(0, -4);
  else if (s.endsWith("ção")) s = s.slice(0, -3);
  else if (s.endsWith("mente")) s = s.slice(0, -5);
  else if (s.endsWith("amento")) s = s.slice(0, -6);
  else if (s.endsWith("imento")) s = s.slice(0, -6);
  else if (s.endsWith("idade")) s = s.slice(0, -5);
  else if (s.endsWith("ável")) s = s.slice(0, -4);
  else if (s.endsWith("ível")) s = s.slice(0, -4);
  else if (s.endsWith("ores")) s = s.slice(0, -4);
  else if (s.endsWith("ador")) s = s.slice(0, -4);
  else if (s.endsWith("eira")) s = s.slice(0, -4);
  else if (s.endsWith("eiro")) s = s.slice(0, -4);
  else if (s.endsWith("ica")) s = s.slice(0, -3);
  else if (s.endsWith("ico")) s = s.slice(0, -3);
  else if (s.endsWith("ado")) s = s.slice(0, -3);
  else if (s.endsWith("ido")) s = s.slice(0, -3);
  else if (s.endsWith("ão")) s = s.slice(0, -2);
  else if (s.endsWith("ar")) s = s.slice(0, -2);
  else if (s.endsWith("er")) s = s.slice(0, -2);
  else if (s.endsWith("ir")) s = s.slice(0, -2);
  else if (s.endsWith("os")) s = s.slice(0, -1);
  else if (s.endsWith("as")) s = s.slice(0, -1);
  else if (s.endsWith("es")) s = s.slice(0, -1);
  return s.length >= 2 ? s : word.toLowerCase();
}

/** Tokenize and stem a Portuguese text, removing stopwords */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-záàâãéêíóôõúüç0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w))
    .map(stemPT);
}

/** Generate character n-grams from a string */
function ngrams(text: string, n: number): Set<string> {
  const normalized = text.toLowerCase().replace(/[^a-záàâãéêíóôõúüç0-9]/gi, "");
  const result = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i++) {
    result.add(normalized.substring(i, i + n));
  }
  return result;
}

/** Jaccard similarity between two sets */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

// ============================================================
// Unit Compatibility
// ============================================================

const UNIT_ALIASES: Record<string, string> = {
  "m2": "m2", "m²": "m2", "m 2": "m2",
  "m3": "m3", "m³": "m3", "m 3": "m3",
  "m": "m", "ml": "m",
  "ud": "Ud", "un": "Ud", "unit": "Ud", "unid": "Ud", "unidade": "Ud",
  "kg": "kg",
  "vg": "Ud", "cj": "Ud", "conjunto": "Ud",
  "sistema": "sistema",
  "projeto": "projeto", "projecto": "projeto",
  "ensaio": "ensaio",
};

function normalizeUnit(unit: string): string {
  return UNIT_ALIASES[unit.toLowerCase().trim()] ?? unit.toLowerCase().trim();
}

function unitsCompatible(articleUnit: string, cypeUnit: string): boolean {
  return normalizeUnit(articleUnit) === normalizeUnit(cypeUnit);
}

// ============================================================
// Keynote Mapping
// ============================================================

/**
 * Common BIM keynote prefixes and their CYPE chapter mapping.
 * Keynotes are typically structured as: XX.YY.ZZZ
 * where XX = Uniformat/OmniClass major group.
 */
const KEYNOTE_MAP: Record<string, string[]> = {
  // Uniformat-style
  "A10": ["MTT", "MTR"],           // Foundations > Earthwork
  "A20": ["FSS", "FLE", "FPC"],    // Foundations > Substructure
  "B10": ["SBP", "SBV", "SBL", "SBM", "SMA"], // Structure
  "B20": ["ABT", "ABB", "CXA", "CXP", "PEX"], // Exterior enclosure
  "B30": ["CTM", "CTP", "CTZ"],    // Roofing
  "C10": ["ABT020", "RIG"],        // Interior partitions
  "C20": ["CPI", "CPA"],           // Interior doors
  "C30": ["PAC", "PAM", "PAV"],    // Flooring
  "D10": ["IFA", "ISS", "ISV"],    // Plumbing
  "D20": ["IEI", "IEP"],           // Electrical
  "D30": ["IVC", "IVV"],           // HVAC
  "D50": ["IOD", "IOA", "IOX"],    // Fire protection
  "E10": ["SAE"],                   // Elevators
  // ProNIC-style (2-digit chapter)
  "01": ["EES"],
  "02": ["DDA", "DDC", "DDP"],
  "03": ["MTT", "MTR"],
  "04": ["FSS", "FLE", "FPC"],
  "06": ["SBP", "SBV", "SBL", "SBE", "SBM"],
  "07": ["SMA"],
  "08": ["ABT", "ABB"],
  "09": ["CTM", "CTP", "CTZ"],
  "10": ["IMP"],
  "11": ["REE", "REP"],
  "12": ["RIE", "RIC", "RIG"],
  "13": ["PAC", "PAM", "PAV", "PAB"],
  "14": ["TFG"],
  "15": ["CXA", "CXP"],
  "16": ["SMG"],
  "17": ["CPI", "CPA"],
  "19": ["PPI", "PPE", "PPT"],
  "20": ["IFA"],
  "21": ["ISS", "ISV"],
  "22": ["IGI"],
  "23": ["IEI", "IEP", "IEV"],
  "24": ["ILA"],
  "25": ["IVC", "IVV"],
  "26": ["SAE"],
  "27": ["IOD", "IOA", "IOX", "IOB"],
  "28": ["ZFF", "ZHT", "NBB"],
  "29": ["AEP", "AEM"],
  "30": ["XRA", "XEE", "XEC", "GRA"],
};

// ============================================================
// Matching Engine
// ============================================================

interface ScoredMatch {
  item: CypeWorkItem;
  score: number;
  method: CypeMatch["matchMethod"];
  warnings: string[];
}

/**
 * Score a single CYPE item against a WBS article.
 */
function scoreMatch(article: WbsArticle, item: CypeWorkItem): ScoredMatch {
  let score = 0;
  let method: CypeMatch["matchMethod"] = "fallback";
  const warnings: string[] = [];

  // 1. Exact CYPE code override
  if (article.cypeCodeOverride && article.cypeCodeOverride === item.code) {
    return { item, score: 100, method: "exact_code", warnings: [] };
  }

  // 2. Keynote-based matching
  if (article.keynote) {
    const prefix2 = article.keynote.substring(0, 2);
    const prefix3 = article.keynote.substring(0, 3);
    const candidates = KEYNOTE_MAP[prefix3] ?? KEYNOTE_MAP[prefix2] ?? [];
    if (candidates.some(c => item.code.startsWith(c))) {
      score += 40;
      method = "keynote";
    }
  }

  // 3. Pattern matching (from CYPE patterns)
  const searchText = `${article.description} ${article.tags?.join(" ") ?? ""}`;
  const patternMatch = item.patterns.some(p => p.test(searchText));
  if (patternMatch) {
    score += 35;
    if (method === "fallback") method = "description";
  }

  // 4. Token-based similarity
  const articleTokens = new Set(tokenize(article.description + " " + (article.tags?.join(" ") ?? "")));
  const cypeTokens = new Set(tokenize(item.description + " " + item.chapter));
  const tokenSim = jaccard(articleTokens, cypeTokens);
  score += Math.round(tokenSim * 30);

  // 5. N-gram similarity (catches partial matches)
  const articleNgrams = ngrams(article.description, 3);
  const cypeNgrams = ngrams(item.description, 3);
  const ngramSim = jaccard(articleNgrams, cypeNgrams);
  score += Math.round(ngramSim * 15);

  // 6. Unit compatibility bonus/penalty
  if (article.unit) {
    if (unitsCompatible(article.unit, item.unit)) {
      score += 10;
    } else {
      score -= 10;
      warnings.push(`Unidade diferente: artigo=${article.unit}, CYPE=${item.unit}`);
    }
  }

  // 7. Tag bonus
  if (article.tags?.length) {
    const tagText = article.tags.join(" ").toLowerCase();
    if (item.patterns.some(p => p.test(tagText))) {
      score += 10;
    }
  }

  // Cap at 99 (100 reserved for exact match)
  score = Math.min(99, Math.max(0, score));

  if (score >= 50 && method === "fallback") method = "category";

  return { item, score, method, warnings };
}

/**
 * Match a single WBS article against the CYPE database.
 * Returns the best match or null.
 */
function matchArticle(article: WbsArticle): ScoredMatch | null {
  let best: ScoredMatch | null = null;
  const database = getDatabase();

  for (const item of database) {
    const scored = scoreMatch(article, item);
    if (scored.score > (best?.score ?? 0)) {
      best = scored;
    }
  }

  return best && best.score >= 15 ? best : null;
}

// ============================================================
// Public API
// ============================================================

/**
 * Match all WBS articles in a project against the CYPE database.
 * Returns a full report with matches, unmatched items, and statistics.
 */
export function matchWbsToCype(project: WbsProject): MatchReport {
  const matches: CypeMatch[] = [];
  const unmatched: MatchReport["unmatched"] = [];
  let totalArticles = 0;

  for (const chapter of project.chapters) {
    for (const sub of chapter.subChapters) {
      for (const article of sub.articles) {
        totalArticles++;
        const result = matchArticle(article);

        if (result) {
          const unitConversion = unitsCompatible(article.unit, result.item.unit) ? 1 : 1;
          const estimatedCost = result.item.unitCost * article.quantity * unitConversion;
          matches.push({
            articleCode: article.code,
            articleDescription: article.description,
            cypeCode: result.item.code,
            cypeDescription: result.item.description,
            cypeChapter: result.item.chapter,
            confidence: result.score,
            matchMethod: result.method,
            unitCost: result.item.unitCost,
            breakdown: { ...result.item.breakdown },
            cypeUnit: result.item.unit,
            unitConversion,
            warnings: result.warnings,
            articleQuantity: article.quantity,
            articleUnit: article.unit,
            estimatedCost: Math.round(estimatedCost * 100) / 100,
            fullBreakdown: result.item.detailedBreakdown, // Include detailed breakdown for resource aggregation
          });
        } else {
          // Generate search suggestion
          const tokens = tokenize(article.description).slice(0, 4);
          unmatched.push({
            articleCode: article.code,
            description: article.description,
            suggestedSearch: `geradordeprecos.info: ${tokens.join(" ")} ${article.unit}`,
          });
        }
      }
    }
  }

  // Statistics
  const matched = matches.length;
  const highConfidence = matches.filter(m => m.confidence >= 70).length;
  const mediumConfidence = matches.filter(m => m.confidence >= 40 && m.confidence < 70).length;
  const lowConfidence = matches.filter(m => m.confidence < 40).length;

  const totalEstimatedCost = matches.reduce((s, m) => s + (m.estimatedCost ?? 0), 0);

  return {
    matches,
    unmatched,
    stats: {
      totalArticles,
      matched,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      unmatched: unmatched.length,
      coveragePercent: totalArticles > 0 ? Math.round((matched / totalArticles) * 100) : 0,
      totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
    },
  };
}

/**
 * Get the full CYPE construction database for browsing/searching.
 * Data is loaded from scraper output (data/cype-full.json).
 */
export function getCypeDatabase(): CypeWorkItem[] {
  return getDatabase();
}

/**
 * Refresh the CYPE database from disk (call after scraping new data)
 */
export function refreshCypeDatabase(): void {
  CYPE_CONSTRUCTION_DB = null; // Clear cache
  CYPE_CONSTRUCTION_DB = getCypeMatcherDatabase(); // Reload
  console.log(`✅ CYPE database refreshed: ${CYPE_CONSTRUCTION_DB.length} items`);
}

/**
 * Search the CYPE database by text query.
 * Searches dynamically loaded scraper data.
 */
export function searchCype(query: string, limit = 10): { item: CypeWorkItem; score: number }[] {
  const queryTokens = new Set(tokenize(query));
  const queryNgrams = ngrams(query, 3);
  const database = getDatabase();

  return database
    .map(item => {
      const itemTokens = new Set(tokenize(item.description + " " + item.chapter));
      const itemNgrams = ngrams(item.description, 3);
      let score = jaccard(queryTokens, itemTokens) * 60;
      score += jaccard(queryNgrams, itemNgrams) * 30;
      if (item.patterns.some(p => p.test(query))) score += 40;
      if (item.code.toLowerCase().includes(query.toLowerCase())) score += 50;
      return { item, score };
    })
    .filter(r => r.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
