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
