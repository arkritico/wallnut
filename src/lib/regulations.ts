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
 * - RTIEBT (Regras Técnicas das Instalações Elétricas de Baixa Tensão) - Electrical
 * - ITED / ITUR - Telecommunications in buildings and urbanizations
 * - DL 521/99 - Gas installations
 * - DL 23/95 (RGSPPDADAR) - Water supply and drainage
 * - Eurocodes (EC0-EC8) - Structural / Seismic
 * - DL 320/2002 - Elevators
 * - RJUE (DL 555/99) - Licensing
 * - DL 46/2008 - Construction waste management
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
// ELECTRICAL INSTALLATIONS (RTIEBT) - Regras Técnicas das
// Instalações Elétricas de Baixa Tensão
// ============================================================

/** RTIEBT - Protection requirements */
export const ELECTRICAL_REQUIREMENTS = {
  /** Maximum earthing resistance (Ohms) - RTIEBT 542 */
  maxEarthingResistance: {
    tn: 20, // TN system
    tt_30mA: 1667, // TT with 30mA RCD (Vl/Ia = 50/0.03)
    tt_300mA: 167, // TT with 300mA RCD
    recommended: 20, // Best practice
  },
  /** RCD (diferencial) requirements - RTIEBT 531.2 */
  rcd: {
    /** 30mA for socket circuits and wet areas */
    highSensitivity: 30, // mA
    /** 300mA for other circuits */
    mediumSensitivity: 300, // mA
  },
  /** Bathroom zones - RTIEBT 701 */
  bathroomZones: {
    zone0: { ipRating: "IPX7", maxVoltage: 12 }, // Inside bath/shower
    zone1: { ipRating: "IPX5", maxVoltage: 12 }, // Above bath up to 2.25m
    zone2: { ipRating: "IPX4", allowedEquipment: "Class II" }, // 0.6m from zone 1
    zone3: { ipRating: "IPX1", allowedEquipment: "RCD protected" }, // Beyond zone 2
  },
  /** Minimum number of circuits per dwelling - RTIEBT 801 */
  minCircuits: {
    t0t1: 3, // T0-T1: illumination, sockets, dedicated
    t2t3: 5, // T2-T3: illumination, sockets, kitchen, dedicated, washing
    t4plus: 7, // T4+: + additional dedicated circuits
  },
  /** Minimum socket outlets per room - RTIEBT 801.5 */
  minSockets: {
    livingRoom: 5,
    bedroom: 3,
    kitchen: 4, // + dedicated for appliances
    bathroom: 1, // zone 3 only
    hallway: 1,
  },
  /** Cable sizing minimum cross-sections (mm²) - RTIEBT 524 */
  minCableSections: {
    lighting: 1.5,
    sockets: 2.5,
    dedicatedAppliances: 4.0, // hob, oven, etc.
    mainSupply_singlePhase: 6.0,
    mainSupply_threePhase: 4.0,
  },
  /** Contracted power thresholds (kVA) requiring 3-phase */
  threePhaseThreshold: 13.8, // Above 13.8 kVA requires 3-phase
  /** Surge protection (SPD) required for new buildings - RTIEBT 534 */
  surgeProtectionRequired: true,
  /** EV charging pre-installation requirements (DL 39/2010) */
  evCharging: {
    requiredInNewBuildings: true, // New residential with parking
    minPowerPerSpot: 3.7, // kW (single-phase 16A)
  },
} as const;

// ============================================================
// ITED - Infraestruturas de Telecomunicações em Edifícios
// (DL 123/2009, Portaria 264/2023 - 4ª edição ITED)
// ============================================================

export const ITED_REQUIREMENTS = {
  /** Current edition */
  currentEdition: 4,
  /** ATE (Armário de Telecomunicações de Edifício) requirements */
  ate: {
    requiredAbove: 1, // Required for buildings with > 1 dwelling
    minDimensions: { width: 0.40, height: 0.60, depth: 0.20 }, // meters, small buildings
  },
  /** ATI (Armário de Telecomunicações Individual) per dwelling */
  ati: {
    required: true,
    minDimensions: { width: 0.30, height: 0.50, depth: 0.12 }, // meters
  },
  /** Minimum cabling requirements per dwelling (4th edition) */
  cabling: {
    /** Minimum Category 6 UTP for new installations */
    minCopperCategory: "6" as const,
    /** Fiber optic is mandatory in new buildings (4th edition) */
    fiberRequired: true,
    fiberType: "single_mode" as const,
    /** Coaxial still required for TV distribution */
    coaxialRequired: true,
  },
  /** Minimum outlets per dwelling - ITED 4th edition */
  outlets: {
    /** Minimum RJ45 outlets */
    rj45: {
      t0t1: 2, // T0-T1: minimum 2
      t2: 3, // T2: minimum 3
      t3: 4, // T3: minimum 4
      t4plus: 5, // T4+: minimum 5
    },
    /** Minimum coaxial outlets */
    coaxial: {
      t0t1: 1,
      t2: 2,
      t3: 2,
      t4plus: 3,
    },
    /** Fiber optic outlets (4th edition) */
    fiber: {
      minimum: 1, // At least 1 FO outlet per dwelling
    },
  },
  /** Tubagem (ducting) requirements */
  ducting: {
    minDiameterIndividual: 25, // mm - tube to dwelling
    minDiameterRiser: 40, // mm - column/riser
    minDiameterEntry: 63, // mm - building entry
  },
  /** Certification */
  certification: {
    required: true,
    installerLicenseRequired: true, // ANACOM credentialed installer
    certificationEntity: "ANACOM",
  },
} as const;

// ============================================================
// ITUR - Infraestruturas de Telecomunicações em Urbanizações
// (DL 123/2009, Manual ITUR - 3ª edição)
// ============================================================

export const ITUR_REQUIREMENTS = {
  /** Current edition */
  currentEdition: 3,
  /** Underground duct requirements */
  undergroundDucts: {
    required: true,
    minDuctDiameter: 110, // mm - PEAD tubes
    minNumberOfDucts: 2, // minimum tubes per path
    minDepth: 0.60, // meters - minimum burial depth
  },
  /** CEE (Câmara de Entrada de Edifício) */
  cee: {
    required: true,
    minDimensions: { width: 0.60, height: 0.60, depth: 0.60 }, // meters
  },
  /** CVM (Câmara de Visita Multi-operador) */
  cvm: {
    requiredAtIntersections: true,
    maxDistanceBetween: 80, // meters
  },
  /** Fiber optic in urbanizations */
  fiber: {
    required: true,
    type: "single_mode" as const,
    minFibersPerLot: 2,
  },
  /** Certification requirements */
  certification: {
    required: true,
    projectRequired: true, // ITUR project mandatory
    installerLicenseRequired: true,
  },
} as const;

// ============================================================
// GAS INSTALLATIONS (DL 521/99, Portaria 361/98)
// ============================================================

export const GAS_REQUIREMENTS = {
  /** Gas detector requirements */
  detector: {
    requiredForNaturalGas: true, // Indoor installations
    requiredForLPG: true,
  },
  /** Ventilation of rooms with gas appliances */
  ventilation: {
    minOpeningArea: 150, // cm² per appliance
    requiredForAllEnclosedAppliances: true,
  },
  /** Flue/exhaust system */
  flue: {
    requiredForTypeB: true, // Type B appliances (open flue)
    requiredForTypeC: true, // Type C appliances (sealed)
    minDiameter: 80, // mm
  },
  /** Pipe materials allowed */
  allowedPipeMaterials: ["copper", "steel", "polyethylene", "multilayer"] as const,
  /** Pressure testing */
  pressureTest: {
    required: true,
    testPressure: 150, // mbar for low pressure
    duration: 15, // minutes
  },
  /** Emergency valve */
  emergencyValve: {
    required: true, // At building entrance
    accessibleLocation: true,
  },
  /** Certification */
  certification: {
    required: true,
    installerCredentialRequired: true,
    entity: "DGEG",
  },
  /** Inspection intervals (years) */
  inspectionInterval: {
    residential: 10,
    commercial: 5,
  },
} as const;

// ============================================================
// WATER SUPPLY & DRAINAGE (DL 23/95 - RGSPPDADAR)
// ============================================================

export const WATER_DRAINAGE_REQUIREMENTS = {
  /** Water supply - pressure */
  waterSupply: {
    minPressure: 100, // kPa (1 bar) at highest fixture
    maxPressure: 600, // kPa (6 bar)
    requiresCheckValve: true,
    requiresPressureReducerAbove: 400, // kPa
  },
  /** Pipe materials - minimum requirements */
  pipeMaterials: {
    coldWater: ["ppr", "pex", "copper", "multicamada"] as const,
    hotWater: ["ppr", "pex", "copper", "multicamada"] as const,
    deprecatedMaterials: ["galvanized"] as const,
  },
  /** Drainage system */
  drainage: {
    requiresSeparateSystem: true, // Separate rainwater/sewage
    requiresVentilation: true, // Ventilation columns
    requiresSiphons: true, // All fixtures must have siphons
    minSiphonHeight: 50, // mm water seal
    minDrainSlope: 1, // % minimum slope
  },
  /** Grease trap */
  greaseTrap: {
    requiredForCommercial: true,
    requiredForResidentialKitchens: false,
  },
  /** Rainwater management */
  stormwater: {
    requiresRetention: true, // For new developments
    requiresInfiltration: false, // Depends on municipality
  },
  /** Water meter */
  waterMeter: {
    required: true,
    individualMeteringForMultiDwelling: true,
  },
} as const;

// ============================================================
// STRUCTURAL / SEISMIC (Eurocodes, particularly EC8 - NP EN 1998-1)
// ============================================================

export const STRUCTURAL_REQUIREMENTS = {
  /** Seismic zones Portugal - Peak Ground Acceleration (m/s²) */
  seismicZones: {
    type1: { // Far-field (interplate)
      "1.1": 2.5, "1.2": 2.0, "1.3": 1.5, "1.4": 1.0, "1.5": 0.6, "1.6": 0.35,
    },
    type2: { // Near-field (intraplate)
      "2.1": 2.5, "2.2": 2.0, "2.3": 1.7, "2.4": 1.1, "2.5": 0.8,
    },
  },
  /** Soil amplification factors */
  soilFactors: {
    A: 1.0, B: 1.2, C: 1.15, D: 1.35, E: 1.4,
  },
  /** Importance classes (γI factor) */
  importanceFactors: {
    I: 0.65, // Low importance (temporary)
    II: 1.0, // Normal importance (residential, commercial)
    III: 1.45, // High importance (schools, hospitals)
    IV: 1.95, // Essential (emergency, civil protection)
  },
  /** Geotechnical study required thresholds */
  geotechnicalStudy: {
    requiredAboveFloors: 2,
    requiredForDeepFoundations: true,
    requiredInSeismicZones: true,
  },
  /** Structural project requirements */
  structuralProject: {
    required: true, // Always required for new buildings
    responsibleEngineer: true, // Must be signed by structural engineer
  },
} as const;

// ============================================================
// ELEVATORS (DL 320/2002, EN 81-20, EN 81-50)
// ============================================================

export const ELEVATOR_REQUIREMENTS = {
  /** CE marking mandatory since 1999 */
  ceMarkingRequired: true,
  /** Maintenance requirements */
  maintenance: {
    contractRequired: true,
    minInspectionsPerYear: 2, // Minimum 2 maintenance visits/year
  },
  /** Periodic inspection by IPQ-approved body */
  inspection: {
    required: true,
    intervalYears: 2, // Every 2 years
    entity: "IPQ / Organismo Notificado",
  },
  /** Emergency communication */
  emergencyCommunication: {
    required: true, // Bidirectional communication to rescue service
    available24h: true,
  },
  /** Pit and headroom */
  pit: {
    minDepth: 1.20, // meters (varies by speed)
    minHeadroom: 3.50, // meters above top landing
  },
  /** Accessible elevator dimensions (DL 163/2006) */
  accessible: {
    minCabinWidth: 1.10, // meters
    minCabinDepth: 1.40, // meters
    minDoorWidth: 0.90, // meters
    requiresBraille: true,
    requiresVoiceAnnouncement: true,
  },
  /** Number of elevators required */
  minElevators: {
    above4floors: 1,
    above8floors: 2,
    above12floors: 3,
  },
} as const;

// ============================================================
// LICENSING - RJUE (DL 555/99, alterado por DL 136/2014)
// ============================================================

export const LICENSING_REQUIREMENTS = {
  /** Operations requiring licensing (licença) */
  requiresLicensing: {
    newConstruction: true,
    reconstruction: true,
    expansion: true,
    significantAlteration: true,
    demolition: true,
  },
  /** Operations under prior communication (comunicação prévia) */
  priorCommunication: {
    minorAlterations: true,
    interiorWorks: true,
  },
  /** Required specialty projects */
  specialtyProjects: {
    stability: true, // Estabilidade / Estruturas
    waterAndDrainage: true, // Águas e esgotos
    electrical: true, // Eletricidade
    gas: true, // Gás (if applicable)
    telecommunications: true, // ITED
    thermal: true, // Térmica (REH/RECS)
    acoustic: true, // Acústica (RRAE)
    fireSafety: true, // SCIE
    accessibility: true, // Acessibilidade
  },
  /** Termo de responsabilidade required for */
  termoResponsabilidade: {
    architect: true,
    specialtyEngineers: true,
    constructionDirector: true,
  },
  /** Technical director requirements */
  technicalDirector: {
    required: true,
    qualifications: "Engenheiro ou Arquiteto inscrito na respetiva Ordem",
  },
  /** Key deadlines (days) */
  deadlines: {
    licensingDecision: 45, // Days for municipal decision
    priorCommunicationDecision: 20,
    utilizationLicenseDecision: 10,
  },
  /** Protected areas additional requirements */
  protectedAreas: {
    requiresCulturalHeritage: true, // DGPC / Câmara
    requiresEnvironmentalImpact: true, // APA / CCDR
  },
} as const;

// ============================================================
// CONSTRUCTION WASTE (DL 46/2008, alterado por DL 73/2011)
// ============================================================

export const WASTE_REQUIREMENTS = {
  /** PPG (Plano de Prevenção e Gestão) required */
  ppgRequired: {
    newConstruction: true,
    demolition: true,
    rehabilitationAbove: 0, // Always for rehabilitation
  },
  /** Minimum recycling target */
  recyclingTarget: 70, // % by 2020 target (EU Directive)
  /** Waste registration */
  registration: {
    eGAR: true, // Electronic waste tracking
    required: true,
  },
  /** Demolition audit */
  demolitionAudit: {
    requiredForDemolition: true,
    requiredForMajorRehab: true,
  },
  /** Licensed operators */
  operators: {
    transporterLicenseRequired: true,
    destinationLicenseRequired: true,
    licensingEntity: "APA",
  },
  /** Sorting requirements */
  sorting: {
    onSiteSortingRequired: true,
    minimumCategories: ["concrete", "metals", "wood", "plastics", "glass", "hazardous"] as const,
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
