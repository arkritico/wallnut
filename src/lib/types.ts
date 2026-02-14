export type BuildingType = "residential" | "commercial" | "mixed" | "industrial";

export type ClimateZone = "I1" | "I2" | "I3" | "V1" | "V2" | "V3";

export type EnergyClass = "A+" | "A" | "B" | "B-" | "C" | "D" | "E" | "F";

export type Severity = "critical" | "warning" | "info" | "pass";

export type RegulationArea =
  | "thermal"
  | "acoustic"
  | "fire_safety"
  | "accessibility"
  | "energy"
  | "electrical"
  | "ited_itur"
  | "general"
  | "urbanistic";

export interface BuildingProject {
  // General info
  name: string;
  buildingType: BuildingType;
  location: PortugalLocation;
  yearBuilt?: number;
  isRehabilitation: boolean;

  // Dimensions
  grossFloorArea: number; // m²
  usableFloorArea: number; // m²
  numberOfFloors: number;
  buildingHeight: number; // meters
  numberOfDwellings?: number;

  // Envelope
  envelope: BuildingEnvelope;

  // Systems
  systems: BuildingSystems;

  // Accessibility
  accessibility: AccessibilityInfo;

  // Fire safety
  fireSafety: FireSafetyInfo;

  // Electrical installations
  electrical: ElectricalInfo;

  // Telecommunications (ITED/ITUR)
  telecommunications: TelecomInfo;
}

export interface PortugalLocation {
  municipality: string;
  district: string;
  altitude: number; // meters above sea level
  distanceToCoast: number; // km
  climateZoneWinter: "I1" | "I2" | "I3";
  climateZoneSummer: "V1" | "V2" | "V3";
}

export interface BuildingEnvelope {
  // Walls
  externalWallUValue: number; // W/(m².K)
  externalWallArea: number; // m²

  // Roof
  roofUValue: number; // W/(m².K)
  roofArea: number; // m²

  // Floor
  floorUValue: number; // W/(m².K)
  floorArea: number; // m²

  // Windows
  windowUValue: number; // W/(m².K)
  windowArea: number; // m²
  windowSolarFactor: number; // g-value (0-1)
  windowFrameType: "aluminum_no_break" | "aluminum_thermal_break" | "pvc" | "wood";

  // Thermal bridges
  linearThermalBridges: number; // W/(m.K) average

  // Ventilation
  airChangesPerHour: number; // h⁻¹
  hasHRV: boolean; // Heat Recovery Ventilation
  hrvEfficiency?: number; // percentage
}

export interface BuildingSystems {
  // Heating
  heatingSystem: "heat_pump" | "gas_boiler" | "electric_radiator" | "biomass" | "none";
  heatingEfficiency?: number; // COP or percentage

  // Cooling
  coolingSystem: "heat_pump" | "split_ac" | "central_ac" | "none";
  coolingEfficiency?: number; // EER

  // DHW (Domestic Hot Water)
  dhwSystem: "heat_pump" | "gas_boiler" | "electric" | "solar_thermal" | "thermodynamic";
  dhwEfficiency?: number;

  // Renewables
  hasSolarPV: boolean;
  solarPVCapacity?: number; // kWp
  hasSolarThermal: boolean;
  solarThermalArea?: number; // m²
  solarThermalOrientation?: number; // degrees from south

  // Lighting (commercial)
  lightingPowerDensity?: number; // W/m²
}

export interface AccessibilityInfo {
  hasAccessibleEntrance: boolean;
  hasElevator: boolean;
  elevatorMinWidth?: number; // meters
  elevatorMinDepth?: number; // meters
  doorWidths: number; // minimum door width in meters
  corridorWidths: number; // minimum corridor width in meters
  hasAccessibleWC: boolean;
  hasAccessibleParking: boolean;
  rampGradient?: number; // percentage
}

export interface FireSafetyInfo {
  utilizationType: "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII" | "IX" | "X" | "XI" | "XII";
  riskCategory: "1" | "2" | "3" | "4";
  hasFireDetection: boolean;
  hasFireAlarm: boolean;
  hasSprinklers: boolean;
  hasEmergencyLighting: boolean;
  hasFireExtinguishers: boolean;
  evacuationRouteWidth: number; // meters
  numberOfExits: number;
  maxEvacuationDistance: number; // meters
  fireResistanceOfStructure: number; // minutes (REI)
}

export interface ElectricalInfo {
  // Supply
  supplyType: "single_phase" | "three_phase";
  contractedPower: number; // kVA
  hasProjectApproval: boolean; // Projeto aprovado pela DGEG/ERSE

  // Protection
  hasMainCircuitBreaker: boolean;
  hasResidualCurrentDevice: boolean; // Diferencial (RCD)
  rcdSensitivity: 30 | 100 | 300; // mA
  hasIndividualCircuitProtection: boolean;
  hasSurgeProtection: boolean; // Descarregador de sobretensões (SPD)

  // Earthing
  hasEarthingSystem: boolean;
  earthingResistance?: number; // Ohms
  hasEquipotentialBonding: boolean; // Ligações equipotenciais

  // Wiring
  wiringType: "embedded" | "surface" | "cable_tray";
  cableType: "h07v" | "xv" | "vav" | "other";
  hasCorrectCableSizing: boolean;

  // Circuits
  numberOfCircuits: number;
  hasSeparateLightingCircuits: boolean;
  hasSeparateSocketCircuits: boolean;
  hasDedicatedApplianceCircuits: boolean; // Máquina lavar, forno, etc.

  // Special areas
  hasBathroomZoneCompliance: boolean; // Zonas 0-3 casas de banho
  hasOutdoorIPProtection: boolean; // IP adequado exterior
  hasEVCharging: boolean; // Carregamento veículo elétrico
  hasEmergencyCircuit: boolean; // Circuito de emergência (comercial)

  // Labelling
  hasDistributionBoardLabelling: boolean;
  hasSchematicDiagram: boolean; // Esquema unifilar
}

export interface TelecomInfo {
  // ITED - Building infrastructure
  itedEdition: "4" | "3" | "2" | "1"; // Current is 4th edition
  hasATE: boolean; // Armário de Telecomunicações de Edifício
  hasATI: boolean; // Armário de Telecomunicações Individual (per dwelling)
  numberOfATI: number;

  // Cabling
  hasCopperCabling: boolean; // Par de cobre (PC)
  copperCableCategory: "5e" | "6" | "6a" | "7" | "none";
  hasFiberOptic: boolean; // Fibra óptica (FO)
  fiberType: "single_mode" | "multi_mode" | "none";
  hasCoaxialCabling: boolean; // Cabo coaxial (CC)

  // Distribution
  hasRiserCableway: boolean; // Coluna montante / caminhos de cabos verticais
  hasFoorDistribution: boolean; // Distribuição por piso
  hasIndividualDucts: boolean; // Tubagem individual até frações

  // Outlets per dwelling
  rj45OutletsPerDwelling: number; // Tomadas RJ45
  coaxialOutletsPerDwelling: number; // Tomadas coaxiais
  fiberOutletsPerDwelling: number; // Tomadas FO

  // ITUR - Urbanization infrastructure
  isUrbanization: boolean; // Is this a loteamento/urbanização?
  hasITURProject: boolean;
  hasUndergroundDucts: boolean; // Infraestrutura subterrânea
  hasCEE: boolean; // Câmaras de entrada de edifício
  numberOfLots?: number;

  // Certification
  hasITEDCertification: boolean; // Certificação ITED por instalador
  installerITEDLicense: boolean; // Instalador com credenciação ANACOM
}

export interface AnalysisResult {
  projectName: string;
  overallScore: number; // 0-100
  energyClass: EnergyClass;
  findings: Finding[];
  recommendations: Recommendation[];
  regulationSummary: RegulationSummary[];
}

export interface Finding {
  id: string;
  area: RegulationArea;
  regulation: string;
  article: string;
  description: string;
  severity: Severity;
  currentValue?: string;
  requiredValue?: string;
}

export interface Recommendation {
  id: string;
  area: RegulationArea;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  estimatedSavings?: string;
  regulatoryBasis?: string;
}

export interface RegulationSummary {
  area: RegulationArea;
  name: string;
  status: "compliant" | "non_compliant" | "partially_compliant";
  findingsCount: number;
  score: number;
}
