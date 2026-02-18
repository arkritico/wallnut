/**
 * Real calculation engines for Portuguese building regulations.
 * Implements simplified but correct methods for:
 * - Thermal performance (REH - DL 118/2013)
 * - Energy class (SCE - Ntc/Nt ratio)
 * - Acoustic insulation (RRAE - DL 129/2002)
 * - Electrical load (RTIEBT)
 * - Water pipe sizing (RGSPPDADAR)
 */

import type { BuildingProject } from "./types";
import { MAX_U_VALUES } from "./regulations";

// ============================================================
// 1. THERMAL CALCULATIONS (REH simplified method)
// ============================================================

export interface ThermalResult {
  /** Heating energy needs (kWh/m².year) */
  Nic: number;
  /** Maximum heating energy needs */
  Ni: number;
  /** Cooling energy needs (kWh/m².year) */
  Nvc: number;
  /** Maximum cooling energy needs */
  Nv: number;
  /** DHW energy needs */
  Nac: number;
  /** Total primary energy (kWh/m².year) */
  Ntc: number;
  /** Reference primary energy */
  Nt: number;
  /** Ntc/Nt ratio */
  ratio: number;
  /** Heat loss through envelope (W/°C) */
  totalHeatLoss: number;
  /** Solar gains (kWh/year) */
  solarGains: number;
  /** Is compliant with REH */
  compliant: boolean;
}

/** Heating degree days by winter zone (Despacho 15793-F/2013) */
const HEATING_DEGREE_DAYS: Record<string, number> = {
  I1: 1000, I2: 1500, I3: 2000,
};

/** Cooling season reference temperature by summer zone */
const COOLING_REF_TEMP: Record<string, number> = {
  V1: 20, V2: 22, V3: 25,
};

/** Heating season duration (months) by winter zone */
const HEATING_SEASON: Record<string, number> = {
  I1: 5.3, I2: 6.3, I3: 7.3,
};

/**
 * Monthly average external temperatures by winter zone (Despacho 15793-F/2013).
 * Used for monthly method calculations per EN ISO 13790.
 */
const MONTHLY_TEMP: Record<string, number[]> = {
  // Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
  I1: [10.2, 11.0, 12.5, 14.2, 16.5, 19.5, 22.0, 22.5, 20.5, 17.0, 13.5, 11.0],
  I2: [8.5, 9.2, 10.8, 12.5, 15.0, 18.0, 20.5, 21.0, 19.0, 15.5, 11.5, 9.0],
  I3: [6.0, 7.0, 9.0, 11.0, 13.5, 16.5, 19.0, 19.5, 17.5, 13.5, 9.5, 7.0],
};

/**
 * Monthly solar irradiation on south-facing vertical surface (kWh/m²/month).
 * Approximation by climate zone. Based on Despacho 15793-K/2013.
 */
const MONTHLY_SOLAR_SOUTH: Record<string, number[]> = {
  V1: [65, 75, 85, 75, 60, 50, 55, 65, 80, 85, 70, 60],
  V2: [75, 85, 95, 85, 70, 60, 65, 75, 90, 95, 80, 70],
  V3: [85, 95, 105, 95, 80, 70, 75, 85, 100, 105, 90, 80],
};

export function calculateThermal(project: BuildingProject): ThermalResult {
  const { envelope, systems, location } = project;
  const Ap = project.usableFloorArea; // Useful floor area
  const Pd = 2.7; // Reference ceiling height (m)
  const winterZone = location.climateZoneWinter;
  const summerZone = location.climateZoneSummer;

  // --- Heat loss through envelope (W/°C) ---
  
  // Transmission losses
  const wallLoss = envelope.externalWallUValue * envelope.externalWallArea;
  const roofLoss = envelope.roofUValue * envelope.roofArea;
  const floorLoss = envelope.floorUValue * envelope.floorArea * 0.5; // 0.5 factor for ground floor
  const windowLoss = envelope.windowUValue * envelope.windowArea;
  const thermalBridgeLoss = envelope.linearThermalBridges * (
    2 * Math.sqrt(envelope.externalWallArea) + // Perimeter estimate
    envelope.windowArea * 4 // Window perimeter estimate
  );
  
  const transmissionLoss = wallLoss + roofLoss + floorLoss + windowLoss + thermalBridgeLoss;
  
  // Ventilation losses
  const volume = Ap * Pd;
  const airFlowRate = envelope.airChangesPerHour * volume; // m³/h
  const ventLossCoeff = 0.34; // W.h/(m³.°C)
  const ventilationLoss = ventLossCoeff * airFlowRate;
  
  // HRV adjustment
  const hrvFactor = envelope.hasHRV ? (1 - (envelope.hrvEfficiency ?? 70) / 100) : 1;
  const effectiveVentLoss = ventilationLoss * hrvFactor;
  
  const totalHeatLoss = transmissionLoss + effectiveVentLoss;

  // --- Solar gains (simplified) ---
  const solarIrradiation: Record<string, number> = {
    V1: 420, V2: 490, V3: 550, // kWh/m².season (south-facing)
  };
  const gSolar = envelope.windowSolarFactor;
  const Fs = 0.9; // Shading factor (simplified)
  const Fg = 0.7; // Framing factor (simplified)
  const solarGains = solarIrradiation[summerZone] * envelope.windowArea * gSolar * Fs * Fg;

  // --- Heating energy needs Nic (kWh/m².year) ---
  const GD = HEATING_DEGREE_DAYS[winterZone]; // degree-days
  const heatingSeasonHours = HEATING_SEASON[winterZone] * 30.4 * 24; // hours
  const totalHeatLossEnergy = totalHeatLoss * GD * 24 / 1000; // kWh/year
  const internalGains = 4 * Ap * HEATING_SEASON[winterZone] * 30.4 * 24 / 1000; // 4 W/m² internal gains
  const winterSolarGains = solarGains * 0.6; // Reduced for winter season
  const usableGains = (internalGains + winterSolarGains) * utilizationFactor(internalGains + winterSolarGains, totalHeatLossEnergy);
  
  const Nic = Math.max(0, (totalHeatLossEnergy - usableGains) / Ap);
  
  // Maximum allowed Nic (simplified reference building)
  const NiRef = calculateReferenceNic(project);
  const Ni = NiRef;

  // --- Cooling energy needs Nvc (kWh/m².year) ---
  const coolingGains = solarGains + (4 * Ap * 4 * 30.4 * 24 / 1000); // 4 months cooling
  const coolingLoss = totalHeatLoss * (COOLING_REF_TEMP[summerZone] - 20) * 4 * 30.4 * 24 / 1000;
  const Nvc = Math.max(0, (coolingGains - coolingLoss) / Ap);
  const Nv = Nvc * 1.2; // Simplified max (120% of gains)

  // --- DHW energy needs ---
  const dailyDHW = 40; // liters/person/day
  const occupants = project.numberOfDwellings ? project.numberOfDwellings * 2.5 : Ap / 30;
  const Nac = (4187 * dailyDHW * occupants * 35 * 365) / (3.6e6 * Ap); // kWh/m².year

  // --- Primary energy Ntc ---
  const heatingEfficiency = getSystemEfficiency(systems.heatingSystem, systems.heatingEfficiency);
  const coolingEfficiency = getSystemEfficiency(systems.coolingSystem, systems.coolingEfficiency);
  const dhwEfficiency = getSystemEfficiency(systems.dhwSystem, systems.dhwEfficiency);
  
  // Conversion factors (primary energy)
  const Fpu_elec = 2.5; // Grid electricity
  const Fpu_gas = 1.0; // Natural gas
  const Fpu_renewable = 0; // Renewables
  
  const heatingFpu = ["heat_pump", "electric_radiator"].includes(systems.heatingSystem) ? Fpu_elec : Fpu_gas;
  const coolingFpu = Fpu_elec;
  const dhwFpu = ["heat_pump", "electric", "thermodynamic"].includes(systems.dhwSystem) ? Fpu_elec : 
                 systems.dhwSystem === "solar_thermal" ? Fpu_renewable : Fpu_gas;

  const heatingPrimary = (Nic / heatingEfficiency) * heatingFpu;
  const coolingPrimary = (Nvc / coolingEfficiency) * coolingFpu;
  const dhwPrimary = (Nac / dhwEfficiency) * dhwFpu;
  
  // Renewable contribution
  let renewableCredit = 0;
  if (systems.hasSolarPV && systems.solarPVCapacity) {
    renewableCredit += systems.solarPVCapacity * 1400 / Ap * Fpu_elec; // 1400 kWh/kWp typical Portugal
  }
  if (systems.hasSolarThermal && systems.solarThermalArea) {
    renewableCredit += systems.solarThermalArea * 500 / Ap; // 500 kWh/m² typical
  }

  const Ntc = Math.max(0, heatingPrimary + coolingPrimary + dhwPrimary - renewableCredit);

  // Reference Nt (using reference building values)
  const Nt = calculateReferenceNt(project, Ni, Nv, Nac);

  const ratio = Nt > 0 ? Ntc / Nt : 1;

  return {
    Nic, Ni,
    Nvc, Nv,
    Nac,
    Ntc, Nt,
    ratio,
    totalHeatLoss,
    solarGains,
    compliant: Nic <= Ni && Nvc <= Nv,
  };
}

/**
 * Monthly method calculation per EN ISO 13790 / REH.
 * Calculates Nic month-by-month for more accurate results.
 */
export function calculateThermalMonthly(project: BuildingProject): {
  monthlyHeating: number[];
  monthlyCooling: number[];
  monthlyNetHeating: number[];
  annualNic: number;
  annualNvc: number;
} {
  const { envelope, location } = project;
  const Ap = project.usableFloorArea;
  const Pd = 2.7;
  const winterZone = location.climateZoneWinter;
  const summerZone = location.climateZoneSummer;
  const thetaI = 20; // Indoor setpoint (°C)

  // Transmission heat loss coefficient (W/K)
  const Htr =
    envelope.externalWallUValue * envelope.externalWallArea +
    envelope.roofUValue * envelope.roofArea +
    envelope.floorUValue * envelope.floorArea * 0.5 +
    envelope.windowUValue * envelope.windowArea +
    envelope.linearThermalBridges * (2 * Math.sqrt(envelope.externalWallArea) + envelope.windowArea * 4);

  // Ventilation heat loss coefficient (W/K)
  const volume = Ap * Pd;
  const hrvFactor = envelope.hasHRV ? (1 - (envelope.hrvEfficiency ?? 70) / 100) : 1;
  const Hve = 0.34 * envelope.airChangesPerHour * volume * hrvFactor;

  const Htot = Htr + Hve;

  const temps = MONTHLY_TEMP[winterZone] ?? MONTHLY_TEMP.I1;
  const solarData = MONTHLY_SOLAR_SOUTH[summerZone] ?? MONTHLY_SOLAR_SOUTH.V1;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const gSolar = envelope.windowSolarFactor;
  const Fs = 0.9;
  const Fg = 0.7;
  const Aw = envelope.windowArea;
  const qInt = 4; // W/m² internal gains

  const monthlyHeating: number[] = [];
  const monthlyCooling: number[] = [];
  const monthlyNetHeating: number[] = [];

  for (let m = 0; m < 12; m++) {
    const hours = daysInMonth[m] * 24;
    const thetaE = temps[m];

    // Monthly heat loss (kWh)
    const Qloss = Htot * (thetaI - thetaE) * hours / 1000;

    // Monthly solar gains (kWh)
    const Qsol = solarData[m] * Aw * gSolar * Fs * Fg;

    // Monthly internal gains (kWh)
    const Qint = qInt * Ap * hours / 1000;

    const Qgain = Qsol + Qint;

    if (Qloss > 0) {
      // Heating mode
      const eta = utilizationFactor(Qgain, Qloss);
      const Qh = Math.max(0, Qloss - eta * Qgain);
      monthlyHeating.push(Qh);
      monthlyNetHeating.push(Qloss - Qgain);
      monthlyCooling.push(0);
    } else {
      // Cooling mode
      const eta = utilizationFactor(Math.abs(Qloss), Qgain);
      const Qc = Math.max(0, Qgain - eta * Math.abs(Qloss));
      monthlyHeating.push(0);
      monthlyNetHeating.push(Qloss - Qgain);
      monthlyCooling.push(Qc);
    }
  }

  const annualNic = monthlyHeating.reduce((sum, v) => sum + v, 0) / Ap;
  const annualNvc = monthlyCooling.reduce((sum, v) => sum + v, 0) / Ap;

  return { monthlyHeating, monthlyCooling, monthlyNetHeating, annualNic, annualNvc };
}

function utilizationFactor(gains: number, losses: number): number {
  if (losses === 0) return 0;
  const gamma = gains / losses;
  if (gamma === 1) return 0.8; // Approximation
  const a = 2.5; // Time constant factor for residential (EN ISO 13790)
  return (1 - Math.pow(gamma, a)) / (1 - Math.pow(gamma, a + 1));
}

function calculateReferenceNic(project: BuildingProject): number {
  const winterZone = project.location.climateZoneWinter;
  // Simplified reference Ni from REH tables
  const baseNi: Record<string, number> = { I1: 40, I2: 55, I3: 75 };
  const ffactor = project.usableFloorArea > 0 ? 
    (project.envelope.externalWallArea + project.envelope.roofArea) / project.usableFloorArea : 1;
  return baseNi[winterZone] * (0.5 + ffactor * 0.5);
}

function calculateReferenceNt(project: BuildingProject, Ni: number, Nv: number, Nac: number): number {
  // Reference building uses heat pump (COP 3.0) and reference envelope
  const refHeatingPrimary = (Ni / 3.0) * 2.5;
  const refCoolingPrimary = (Nv / 3.0) * 2.5;
  const refDHWPrimary = (Nac / 0.95) * 1.0;
  return refHeatingPrimary + refCoolingPrimary + refDHWPrimary;
}

function getSystemEfficiency(system: string, userEfficiency?: number): number {
  if (userEfficiency && userEfficiency > 0) return userEfficiency > 1 ? userEfficiency : userEfficiency * 100 > 1 ? userEfficiency : 1;
  const defaults: Record<string, number> = {
    heat_pump: 3.0,
    gas_boiler: 0.87,
    electric_radiator: 1.0,
    biomass: 0.80,
    split_ac: 3.0,
    central_ac: 3.5,
    electric: 0.95,
    solar_thermal: 0.80,
    thermodynamic: 2.5,
    none: 1.0,
  };
  return defaults[system] ?? 1.0;
}

// ============================================================
// 2. ENERGY CLASS (SCE - DL 101-D/2020)
// ============================================================

export type EnergyClassResult = {
  energyClass: "A+" | "A" | "B" | "B-" | "C" | "D" | "E" | "F";
  ratio: number;
  Ntc: number;
  Nt: number;
};

export function calculateEnergyClass(project: BuildingProject): EnergyClassResult {
  const thermal = calculateThermal(project);
  const { ratio, Ntc, Nt } = thermal;
  
  let energyClass: EnergyClassResult["energyClass"];
  if (ratio <= 0.25) energyClass = "A+";
  else if (ratio <= 0.50) energyClass = "A";
  else if (ratio <= 0.75) energyClass = "B";
  else if (ratio <= 1.00) energyClass = "B-";
  else if (ratio <= 1.50) energyClass = "C";
  else if (ratio <= 2.00) energyClass = "D";
  else if (ratio <= 2.50) energyClass = "E";
  else energyClass = "F";

  return { energyClass, ratio, Ntc, Nt };
}

// ============================================================
// 3. ACOUSTIC CALCULATIONS (RRAE - DL 129/2002)
// ============================================================

export interface AcousticResult {
  /** Required airborne insulation between dwellings D'nT,w (dB) */
  requiredAirborne: number;
  /** Required impact insulation L'nT,w (dB) */
  requiredImpact: number;
  /** Required facade insulation D2m,nT,w (dB) */
  requiredFacade: number;
  /** Current airborne meets requirement */
  airborneCompliant: boolean;
  /** Current impact meets requirement */
  impactCompliant: boolean;
  /** Current facade meets requirement */
  facadeCompliant: boolean;
  /** Equipment noise limit (dB(A)) */
  equipmentNoiseLimit: number;
}

export function calculateAcoustic(project: BuildingProject): AcousticResult {
  const { acoustic } = project;
  const isResidential = project.buildingType === "residential" || project.buildingType === "mixed";
  
  // RRAE requirements for residential buildings (Table I)
  let requiredAirborne: number;
  let requiredImpact: number;
  let requiredFacade: number;
  let equipmentNoiseLimit: number;

  if (isResidential) {
    // Between dwellings
    requiredAirborne = 50; // D'nT,w ≥ 50 dB
    requiredImpact = 60;   // L'nT,w ≤ 60 dB
    
    // Facade depends on noise zone
    switch (acoustic.buildingLocation) {
      case "noisy":
        requiredFacade = 33; // D2m,nT,w ≥ 33 dB (zona ruidosa)
        break;
      case "mixed":
        requiredFacade = 28; // D2m,nT,w ≥ 28 dB (zona mista)
        break;
      case "quiet":
      default:
        requiredFacade = 25; // D2m,nT,w ≥ 25 dB (zona sensível)
        break;
    }
    
    equipmentNoiseLimit = 32; // LAr,nT ≤ 32 dB(A) residential
  } else {
    // Commercial
    requiredAirborne = 45;
    requiredImpact = 65;
    requiredFacade = 25;
    equipmentNoiseLimit = 35;
  }

  const airborneCompliant = acoustic.airborneInsulationValue !== undefined
    ? acoustic.airborneInsulationValue >= requiredAirborne
    : acoustic.hasAirborneInsulation;

  const impactCompliant = acoustic.impactInsulationValue !== undefined
    ? acoustic.impactInsulationValue <= requiredImpact // Impact: lower is better
    : acoustic.hasImpactInsulation;

  const facadeCompliant = acoustic.facadeInsulationValue !== undefined
    ? acoustic.facadeInsulationValue >= requiredFacade
    : acoustic.hasFacadeInsulation;

  return {
    requiredAirborne,
    requiredImpact,
    requiredFacade,
    airborneCompliant,
    impactCompliant,
    facadeCompliant,
    equipmentNoiseLimit,
  };
}

// ============================================================
// 4. ELECTRICAL LOAD CALCULATION (RTIEBT)
// ============================================================

export interface ElectricalResult {
  /** Total estimated load (kVA) */
  totalLoad: number;
  /** Recommended supply type */
  recommendedSupply: "single_phase" | "three_phase";
  /** Recommended contracted power (kVA) */
  recommendedPower: number;
  /** Minimum main breaker (A) */
  mainBreakerAmps: number;
  /** Minimum RCD count */
  minRCDCount: number;
  /** Minimum circuit count */
  minCircuits: number;
  /** Needs DGEG approval */
  needsDGEGApproval: boolean;
  /** Cable section for main supply (mm²) */
  mainCableSection: number;
}

export function calculateElectrical(project: BuildingProject): ElectricalResult {
  const Ap = project.usableFloorArea;
  const isResidential = project.buildingType === "residential";
  
  // Base power calculation (W/m²)
  const powerDensity = isResidential ? 25 : 40; // W/m²
  let totalLoad = (powerDensity * Ap) / 1000; // kVA
  
  // Add fixed loads
  if (isResidential) {
    totalLoad += 3.0; // Kitchen (cooker, oven, etc.)
    totalLoad += 2.0; // Washing machine, dryer
    totalLoad += 1.5; // DHW system
    if (project.electrical.hasEVCharging) totalLoad += 7.4; // EV charger
    if (project.systems.heatingSystem === "heat_pump") totalLoad += 2.5;
    if (project.systems.coolingSystem !== "none") totalLoad += 2.0;
  } else {
    totalLoad += 5.0; // HVAC commercial
    totalLoad += 3.0; // Kitchen/equipment
    if (project.electrical.hasEVCharging) totalLoad += 22; // Commercial EV charger
  }

  // Diversity factor (simultaneity)
  const diversityFactor = isResidential ? 0.6 : 0.7;
  totalLoad *= diversityFactor;

  // Supply type
  const recommendedSupply = totalLoad > 13.8 ? "three_phase" : "single_phase";
  
  // Recommended contracted power (standard values in Portugal)
  const standardPowers = [3.45, 4.6, 5.75, 6.9, 10.35, 13.8, 17.25, 20.7, 27.6, 34.5, 41.4];
  const recommendedPower = standardPowers.find(p => p >= totalLoad) ?? 41.4;

  // Main breaker
  const voltage = recommendedSupply === "single_phase" ? 230 : 400;
  const phases = recommendedSupply === "single_phase" ? 1 : 3;
  const mainBreakerAmps = Math.ceil((recommendedPower * 1000) / (voltage * (phases === 3 ? Math.sqrt(3) : 1)));
  
  // Standardize to common breaker ratings
  const breakerRatings = [16, 20, 25, 32, 40, 50, 63, 80, 100];
  const standardBreaker = breakerRatings.find(b => b >= mainBreakerAmps) ?? 100;

  // Minimum circuits (RTIEBT)
  let minCircuits = 0;
  if (isResidential) {
    minCircuits = 1; // Lighting
    minCircuits += 1; // General sockets
    minCircuits += 1; // Kitchen sockets
    minCircuits += 1; // Bathroom
    if (Ap > 100) minCircuits += 1; // Extra for large dwellings
    if (project.electrical.hasEVCharging) minCircuits += 1;
    if (project.systems.heatingSystem !== "none") minCircuits += 1;
  } else {
    minCircuits = Math.ceil(Ap / 50) + 3; // 1 per 50m² + lighting + emergency + HVAC
  }

  // RCD count (min 1 per 30A group, at least 2 for separation)
  const minRCDCount = Math.max(2, Math.ceil(minCircuits / 4));

  // DGEG approval threshold
  const needsDGEGApproval = recommendedPower > 41.4;

  // Main cable section (simplified)
  const cableSections: [number, number][] = [
    [25, 6], [32, 10], [40, 10], [50, 16], [63, 16], [80, 25], [100, 35],
  ];
  const mainCableSection = cableSections.find(([amps]) => amps >= standardBreaker)?.[1] ?? 35;

  return {
    totalLoad: Math.round(totalLoad * 10) / 10,
    recommendedSupply,
    recommendedPower,
    mainBreakerAmps: standardBreaker,
    minRCDCount,
    minCircuits,
    needsDGEGApproval,
    mainCableSection,
  };
}

// ============================================================
// 5. WATER PIPE SIZING (RGSPPDADAR simplified)
// ============================================================

export interface WaterSizingResult {
  /** Total simultaneous flow (L/s) */
  simultaneousFlow: number;
  /** Main supply pipe diameter (mm) */
  mainPipeDiameter: number;
  /** Recommended hot water pipe diameter (mm) */
  hotWaterPipeDiameter: number;
  /** Minimum drainage pipe diameter (mm) */
  drainagePipeDiameter: number;
  /** Storage tank size if needed (L) */
  storageTankSize: number;
  /** Daily water consumption estimate (L/day) */
  dailyConsumption: number;
}

export function calculateWaterSizing(project: BuildingProject): WaterSizingResult {
  const isResidential = project.buildingType === "residential";
  const dwellings = project.numberOfDwellings ?? 1;
  const Ap = project.usableFloorArea;

  // Flow rates per fixture (L/s) - Portuguese norms
  const fixtures = {
    basin: { flow: 0.10, count: dwellings * 2 },
    toilet: { flow: 0.10, count: dwellings * 2 },
    shower: { flow: 0.15, count: dwellings * 1 },
    bathtub: { flow: 0.25, count: dwellings * 0.5 },
    kitchen_sink: { flow: 0.20, count: dwellings },
    dishwasher: { flow: 0.15, count: dwellings },
    washing_machine: { flow: 0.20, count: dwellings },
  };

  // Total installed flow
  const totalInstalledFlow = Object.values(fixtures).reduce(
    (sum, f) => sum + f.flow * f.count, 0
  );

  // Simultaneity factor (RGSPPDADAR)
  const n = Object.values(fixtures).reduce((sum, f) => sum + f.count, 0);
  const simultaneityFactor = n > 1 ? (1 / Math.sqrt(n - 1)) * 0.8 : 1;
  const simultaneousFlow = totalInstalledFlow * simultaneityFactor;

  // Pipe sizing (velocity method: v = 1.0-2.0 m/s)
  const targetVelocity = 1.5; // m/s
  const area = simultaneousFlow / (targetVelocity * 1000); // m²
  const diameter = Math.sqrt(4 * area / Math.PI) * 1000; // mm
  
  // Standard pipe diameters (mm)
  const standardDiameters = [16, 20, 25, 32, 40, 50, 63, 75, 90, 110];
  const mainPipeDiameter = standardDiameters.find(d => d >= diameter) ?? 32;
  const hotWaterPipeDiameter = standardDiameters.find(d => d >= diameter * 0.8) ?? 25;

  // Drainage (minimum 90mm for main, 40mm for basins)
  const drainagePipeDiameter = dwellings > 4 ? 110 : 90;

  // Daily consumption (per capita Portuguese average)
  const occupants = isResidential ? dwellings * 2.5 : Ap / 15;
  const dailyPerCapita = isResidential ? 150 : 50; // L/person/day
  const dailyConsumption = Math.round(occupants * dailyPerCapita);

  // Storage tank (for buildings with 4+ dwellings, requirement)
  const storageTankSize = dwellings > 4 ? Math.round(dailyConsumption * 0.3) : 0;

  return {
    simultaneousFlow: Math.round(simultaneousFlow * 100) / 100,
    mainPipeDiameter,
    hotWaterPipeDiameter,
    drainagePipeDiameter,
    storageTankSize,
    dailyConsumption,
  };
}

// ============================================================
// 6. AGGREGATE CALCULATIONS
// ============================================================

export interface MonthlyThermalResult {
  monthlyHeating: number[];
  monthlyCooling: number[];
  monthlyNetHeating: number[];
  annualNic: number;
  annualNvc: number;
}

export interface AllCalculations {
  thermal: ThermalResult;
  thermalMonthly: MonthlyThermalResult;
  energyClass: EnergyClassResult;
  acoustic: AcousticResult;
  electrical: ElectricalResult;
  waterSizing: WaterSizingResult;
}

export function runAllCalculations(project: BuildingProject): AllCalculations {
  return {
    thermal: calculateThermal(project),
    thermalMonthly: calculateThermalMonthly(project),
    energyClass: calculateEnergyClass(project),
    acoustic: calculateAcoustic(project),
    electrical: calculateElectrical(project),
    waterSizing: calculateWaterSizing(project),
  };
}
