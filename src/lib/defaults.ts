import type { BuildingProject } from "./types";

export const DEFAULT_PROJECT: BuildingProject = {
  name: "",
  buildingType: "residential",
  location: {
    municipality: "Lisboa",
    district: "Lisboa",
    altitude: 50,
    distanceToCoast: 15,
    climateZoneWinter: "I1",
    climateZoneSummer: "V2",
  },
  isRehabilitation: false,
  grossFloorArea: 150,
  usableFloorArea: 120,
  numberOfFloors: 2,
  buildingHeight: 6,
  numberOfDwellings: 1,

  // 1. Architecture
  architecture: {
    hasCivilCodeCompliance: false,
    hasRainwaterDrainage: false,
    isHorizontalProperty: false,
    respectsCommonParts: true,
    hasBuildingPermitDesign: false,
    meetsRGEU: false,
    hasNaturalLight: true,
    hasCrossVentilation: false,
  },

  // 2. Structural
  structural: {
    structuralSystem: "reinforced_concrete",
    seismicZone: "1.3",
    soilType: "B",
    importanceClass: "II",
    hasStructuralProject: false,
    hasGeotechnicalStudy: false,
    foundationType: "shallow",
    hasSeismicDesign: false,
    ductilityClass: "DCM",
  },

  // 3. Fire Safety
  fireSafety: {
    utilizationType: "I",
    riskCategory: "1",
    hasFireDetection: false,
    hasFireAlarm: true,
    hasSprinklers: false,
    hasEmergencyLighting: true,
    hasFireExtinguishers: true,
    evacuationRouteWidth: 1.0,
    numberOfExits: 1,
    maxEvacuationDistance: 10,
    fireResistanceOfStructure: 30,
  },

  // 4. AVAC
  avac: {
    hasHVACProject: false,
    hasVentilationSystem: false,
    ventilationType: "natural",
    hasKitchenExtraction: true,
    hasBathroomExtraction: false,
    hasDuctwork: false,
    hasAirQualityControl: false,
    hasMaintenancePlan: false,
    hasFGasCompliance: false,
    hasRadonProtection: false,
  },

  // 5. Water & Drainage
  waterDrainage: {
    hasPublicWaterConnection: true,
    waterPipeMaterial: "ppr",
    hasWaterMeter: true,
    hasCheckValve: false,
    hasPressureReducer: false,
    hotWaterRecirculation: false,
    hasSeparateDrainageSystem: false,
    hasVentilatedDrainage: false,
    hasDrainageSiphons: true,
    hasGreaseTrap: false,
    hasStormwaterManagement: false,
    hasWaterReuse: false,
    hasBackflowPrevention: false,
  },

  // 6. Gas
  gas: {
    hasGasInstallation: false,
    gasType: "none",
    hasGasProject: false,
    hasGasDetector: false,
    hasEmergencyValve: false,
    hasVentilation: false,
    hasFlueSystem: false,
    pipesMaterial: "none",
    hasPressureTest: false,
    hasGasCertification: false,
  },

  // 7. Electrical
  electrical: {
    supplyType: "single_phase",
    contractedPower: 6.9,
    hasProjectApproval: false,
    hasMainCircuitBreaker: true,
    hasResidualCurrentDevice: true,
    rcdSensitivity: 30,
    hasIndividualCircuitProtection: true,
    hasSurgeProtection: false,
    hasEarthingSystem: true,
    earthingResistance: 20,
    hasEquipotentialBonding: false,
    wiringType: "embedded",
    cableType: "h07v",
    hasCorrectCableSizing: true,
    numberOfCircuits: 4,
    hasSeparateLightingCircuits: true,
    hasSeparateSocketCircuits: true,
    hasDedicatedApplianceCircuits: false,
    hasBathroomZoneCompliance: false,
    hasOutdoorIPProtection: false,
    hasEVCharging: false,
    hasEmergencyCircuit: false,
    hasDistributionBoardLabelling: false,
    hasSchematicDiagram: false,
  },

  // 8. Telecommunications
  telecommunications: {
    itedEdition: "4",
    hasATE: false,
    hasATI: false,
    numberOfATI: 1,
    hasCopperCabling: true,
    copperCableCategory: "5e",
    hasFiberOptic: false,
    fiberType: "none",
    hasCoaxialCabling: false,
    hasFoorDistribution: false,
    hasRiserCableway: false,
    hasIndividualDucts: false,
    rj45OutletsPerDwelling: 2,
    coaxialOutletsPerDwelling: 1,
    fiberOutletsPerDwelling: 0,
    isUrbanization: false,
    hasITURProject: false,
    hasUndergroundDucts: false,
    hasCEE: false,
    hasITEDCertification: false,
    installerITEDLicense: false,
  },

  // 9-10. Envelope & Systems
  envelope: {
    externalWallUValue: 0.60,
    externalWallArea: 200,
    roofUValue: 0.50,
    roofArea: 75,
    floorUValue: 0.50,
    floorArea: 75,
    windowUValue: 3.10,
    windowArea: 20,
    windowSolarFactor: 0.50,
    windowFrameType: "aluminum_no_break",
    linearThermalBridges: 0.50,
    airChangesPerHour: 0.5,
    hasHRV: false,
  },

  systems: {
    heatingSystem: "electric_radiator",
    coolingSystem: "none",
    dhwSystem: "gas_boiler",
    hasSolarPV: false,
    hasSolarThermal: false,
  },

  // 11. Acoustic
  acoustic: {
    buildingLocation: "mixed",
    hasAirborneInsulation: false,
    hasImpactInsulation: false,
    hasFacadeInsulation: false,
    hasEquipmentNoiseControl: false,
    hasAcousticProject: false,
  },

  // 12. Accessibility
  accessibility: {
    hasAccessibleEntrance: true,
    hasElevator: false,
    doorWidths: 0.80,
    corridorWidths: 1.10,
    hasAccessibleWC: false,
    hasAccessibleParking: false,
  },

  // 13. Elevators
  elevators: {
    hasElevator: false,
    numberOfElevators: 0,
    elevatorType: "none",
    hasCEMarking: false,
    hasMaintenanceContract: false,
    hasPeriodicInspection: false,
    hasEmergencyCommunication: false,
    hasPitAndHeadroom: false,
    hasAccessibleElevator: false,
  },

  // 14. Licensing
  licensing: {
    projectPhase: "licensing",
    hasArchitecturalProject: false,
    hasSpecialtyProjects: false,
    hasTermoDeResponsabilidade: false,
    hasMunicipalApproval: false,
    hasConstructionLicense: false,
    hasUtilizationLicense: false,
    hasTechnicalDirector: false,
    isInARU: false,
    isProtectedArea: false,
  },

  // 15. Waste
  waste: {
    hasWasteManagementPlan: false,
    hasSortingOnSite: false,
    hasLicensedTransporter: false,
    hasLicensedDestination: false,
    hasWasteRegistration: false,
    hasDemolitionAudit: false,
    recyclingPercentageTarget: 70,
  },

  // 16. Local Regulations
  localRegulations: {
    municipality: "Lisboa",
    documents: [],
    notes: "",
    waterUtilityDocs: [],
    consultedEntities: [],
  },

  // 17. Drawing Quality
  drawingQuality: {
    hasCorrectScaleForPrint: false,
    hasConsistentFonts: false,
    hasReadableTextAtScale: false,
    hasStandardSymbols: false,
    hasLegendOnEverySheet: false,
    hasNorthArrow: false,
    hasScaleBar: false,
    hasConsistentLineWeights: false,
    hasDimensioning: false,
    hasSheetTitleBlock: false,
  },

  // 18. Project Context
  projectContext: {
    description: "",
    questions: [],
    specificConcerns: "",
  },
};
