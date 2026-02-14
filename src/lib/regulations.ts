/**
 * Portuguese Building Regulations Knowledge Base
 *
 * Key regulations covered:
 * - REH (Regulamento de Desempenho Energético de Edifícios de Habitação) - Residential energy performance
 * - RECS (Regulamento de Desempenho Energético de Edifícios de Comércio e Serviços) - Commercial energy
 * - RRAE (Regulamento dos Requisitos Acústicos dos Edifícios) - Acoustic requirements
 * - SCIE (Segurança Contra Incêndio em Edifícios) - Fire safety
 * - DL 163/2006 - Accessibility
 * - RGEU (Regulamento Geral das Edificações Urbanas) - General urban building rules
 * - SCE (Sistema de Certificação Energética dos Edifícios) - Energy certification
 */

// ============================================================
// THERMAL REGULATIONS (REH / RECS) - Portaria 349-B/2013 & updates
// ============================================================

/** Maximum U-values by climate zone (W/(m².K)) - REH reference values */
export const MAX_U_VALUES = {
  walls: {
    I1: 0.50,
    I2: 0.40,
    I3: 0.35,
  },
  roofs: {
    I1: 0.40,
    I2: 0.35,
    I3: 0.30,
  },
  floors: {
    I1: 0.50,
    I2: 0.40,
    I3: 0.35,
  },
  windows: {
    I1: 2.80,
    I2: 2.40,
    I3: 2.20,
  },
} as const;

/** Maximum solar factor (g-value) for glazing by summer climate zone */
export const MAX_SOLAR_FACTOR = {
  V1: 0.56,
  V2: 0.56,
  V3: 0.50,
} as const;

/** Reference ventilation rates (h⁻¹) */
export const REFERENCE_VENTILATION = {
  residential: {
    minimum: 0.4, // REH minimum
    recommended: 0.6,
  },
  commercial: {
    minimum: 0.6, // RECS minimum
    recommended: 1.0,
  },
} as const;

/** Maximum linear thermal bridge coefficient (W/(m.K)) */
export const MAX_LINEAR_THERMAL_BRIDGE = 0.50;

/** Renewable energy contribution requirements */
export const RENEWABLE_REQUIREMENTS = {
  /** Minimum solar thermal collector area per dwelling (m²) - if applicable */
  minSolarThermalPerDwelling: 1.0,
  /** Minimum renewable contribution for new buildings (since 2021) - fraction */
  minRenewableContribution: 0.50,
  /** NZEB requirements for new buildings (from 2021) */
  nzeb: {
    maxPrimaryEnergy: 50, // kWh/(m².year) for residential
    minRenewableFraction: 0.50,
  },
} as const;

// ============================================================
// ACOUSTIC REGULATIONS (RRAE) - DL 129/2002 & DL 96/2008
// ============================================================

export const ACOUSTIC_REQUIREMENTS = {
  /** Sound insulation between dwellings - D'nT,w (dB) */
  airborne: {
    betweenDwellings: 50,
    fromCommonAreas: 48,
    fromCommercial: 58,
  },
  /** Impact sound insulation - L'nT,w (dB) - maximum */
  impact: {
    betweenDwellings: 60,
    fromCommonAreas: 60,
    fromCommercial: 50,
  },
  /** Facade sound insulation - D2m,nT,w (dB) minimum */
  facade: {
    quietZone: 28, // Zone sensível
    mixedZone: 33, // Zone mista
  },
} as const;

// ============================================================
// FIRE SAFETY (SCIE) - DL 224/2015, Portaria 1532/2008
// ============================================================

/** Fire resistance requirements (REI minutes) by utilization type and risk category */
export const FIRE_RESISTANCE = {
  residential: {
    "1": 30,
    "2": 60,
    "3": 90,
    "4": 120,
  },
  commercial: {
    "1": 30,
    "2": 60,
    "3": 90,
    "4": 120,
  },
} as const;

/** Maximum evacuation distances (meters) */
export const MAX_EVACUATION_DISTANCE = {
  singleDirection: 15, // impasse
  multipleDirections: 30,
} as const;

/** Minimum exit/route widths (meters) based on number of users */
export const MIN_EXIT_WIDTHS = {
  /** Minimum unit of passage (UP) = 0.9m for ≤50 people */
  unitOfPassage: 0.90,
  /** Two UPs for >50 people */
  twoUnitOfPassage: 1.40,
  /** Minimum number of exits by occupancy */
  minExits: {
    upTo50: 1,
    upTo500: 2,
    upTo1500: 3,
    above1500: 4,
  },
} as const;

/** Fire detection/alarm requirements by risk category */
export const FIRE_DETECTION_REQUIREMENTS = {
  residential: {
    "1": { detection: false, alarm: true, sprinklers: false },
    "2": { detection: true, alarm: true, sprinklers: false },
    "3": { detection: true, alarm: true, sprinklers: true },
    "4": { detection: true, alarm: true, sprinklers: true },
  },
  commercial: {
    "1": { detection: false, alarm: true, sprinklers: false },
    "2": { detection: true, alarm: true, sprinklers: false },
    "3": { detection: true, alarm: true, sprinklers: true },
    "4": { detection: true, alarm: true, sprinklers: true },
  },
} as const;

// ============================================================
// ACCESSIBILITY (DL 163/2006)
// ============================================================

export const ACCESSIBILITY_REQUIREMENTS = {
  /** Minimum door widths (meters) */
  doorWidth: {
    accessible: 0.87,
    minimum: 0.77,
  },
  /** Minimum corridor widths (meters) */
  corridorWidth: {
    accessible: 1.20,
    minimum: 1.10,
  },
  /** Elevator minimum dimensions (meters) */
  elevator: {
    minWidth: 1.10,
    minDepth: 1.40,
    doorWidth: 0.90,
  },
  /** Maximum ramp gradient (percentage) */
  rampGradient: {
    max6m: 6,   // for ramps up to 6m
    max2m: 8,   // for ramps up to 2m
  },
  /** Accessible WC dimensions (meters) */
  accessibleWC: {
    minWidth: 1.60,
    minDepth: 1.80,
  },
  /** Accessible parking space dimensions (meters) */
  parking: {
    minWidth: 3.50,
    minLength: 5.00,
  },
  /** Buildings requiring elevator */
  elevatorRequired: {
    newBuildings: 4, // floors (including ground floor)
    rehabilitation: 5,
  },
} as const;

// ============================================================
// RGEU - General Urban Building Regulations
// ============================================================

export const RGEU_REQUIREMENTS = {
  /** Minimum ceiling height (meters) - Art. 65º RGEU */
  ceilingHeight: {
    habitable: 2.70,
    nonHabitable: 2.40,
    commercial: 3.00,
  },
  /** Minimum room dimensions (m²) - Art. 66º RGEU */
  roomAreas: {
    livingRoom: 12.0,
    mainBedroom: 10.5,
    otherBedroom: 9.0,
    kitchen: 6.0,
    bathroom: 3.5,
  },
  /** Minimum natural lighting - window area as fraction of floor area */
  naturalLighting: {
    minWindowToFloorRatio: 0.10, // 10% of floor area
  },
  /** Minimum ventilation */
  naturalVentilation: {
    requiresCrossVentilation: true,
  },
} as const;

// ============================================================
// ENERGY CERTIFICATION (SCE) - Thresholds
// ============================================================

/** Energy class thresholds as ratio of actual to reference primary energy (RNt) */
export const ENERGY_CLASS_THRESHOLDS = {
  residential: {
    "A+": 0.25,
    A: 0.50,
    B: 0.75,
    "B-": 1.00,
    C: 1.50,
    D: 2.00,
    E: 2.50,
    F: Infinity,
  },
  commercial: {
    "A+": 0.25,
    A: 0.50,
    B: 0.75,
    "B-": 1.00,
    C: 1.50,
    D: 2.00,
    E: 2.50,
    F: Infinity,
  },
} as const;

// ============================================================
// CLIMATE DATA - Simplified by district
// ============================================================

export const CLIMATE_DATA: Record<string, { winter: "I1" | "I2" | "I3"; summer: "V1" | "V2" | "V3"; hdd: number }> = {
  Lisboa: { winter: "I1", summer: "V2", hdd: 1071 },
  Porto: { winter: "I2", summer: "V1", hdd: 1610 },
  Faro: { winter: "I1", summer: "V3", hdd: 987 },
  Coimbra: { winter: "I2", summer: "V2", hdd: 1460 },
  Braga: { winter: "I2", summer: "V2", hdd: 1653 },
  Évora: { winter: "I1", summer: "V3", hdd: 1237 },
  Setúbal: { winter: "I1", summer: "V3", hdd: 1045 },
  Leiria: { winter: "I2", summer: "V2", hdd: 1323 },
  Aveiro: { winter: "I2", summer: "V1", hdd: 1390 },
  Viseu: { winter: "I2", summer: "V2", hdd: 1940 },
  "Viana do Castelo": { winter: "I2", summer: "V1", hdd: 1557 },
  "Vila Real": { winter: "I3", summer: "V2", hdd: 2230 },
  Bragança: { winter: "I3", summer: "V2", hdd: 2720 },
  "Castelo Branco": { winter: "I2", summer: "V3", hdd: 1710 },
  Guarda: { winter: "I3", summer: "V2", hdd: 2700 },
  Santarém: { winter: "I1", summer: "V3", hdd: 1180 },
  Portalegre: { winter: "I2", summer: "V3", hdd: 1610 },
  Beja: { winter: "I1", summer: "V3", hdd: 1160 },
  "R.A. Açores": { winter: "I1", summer: "V1", hdd: 950 },
  "R.A. Madeira": { winter: "I1", summer: "V1", hdd: 725 },
};

export const PORTUGAL_DISTRICTS = Object.keys(CLIMATE_DATA);
