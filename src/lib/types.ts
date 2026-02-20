export type BuildingType = "residential" | "commercial" | "mixed" | "industrial";

export type ClimateZone = "I1" | "I2" | "I3" | "V1" | "V2" | "V3";

export type EnergyClass = "A+" | "A" | "B" | "B-" | "C" | "D" | "E" | "F";

export type Severity = "critical" | "warning" | "info" | "pass";

export type RegulationArea =
  | "architecture"
  | "structural"
  | "fire_safety"
  | "hvac"
  | "water_drainage"
  | "gas"
  | "electrical"
  | "telecommunications"
  | "thermal"
  | "acoustic"
  | "accessibility"
  | "energy"
  | "elevators"
  | "licensing"
  | "waste"
  | "municipal"
  | "drawings"
  | "general";

export interface BuildingProject {
  // General info
  name: string;
  buildingType: BuildingType;
  location: PortugalLocation;
  yearBuilt?: number;
  isRehabilitation: boolean;
  isMajorRehabilitation?: boolean;
  isDemolition?: boolean;
  hasUndergroundFloors?: boolean;

  // Dimensions
  grossFloorArea: number; // m²
  usableFloorArea: number; // m²
  numberOfFloors: number;
  buildingHeight: number; // meters
  numberOfDwellings?: number;

  // --- Organized by project specialty hierarchy ---

  // 1. Architecture (base project + Civil Code)
  architecture: ArchitectureInfo;

  // 2. Structural / Seismic
  structural: StructuralInfo;

  // 3. Fire Safety (SCIE + Notas Técnicas)
  fireSafety: FireSafetyInfo;

  // 4. AVAC (HVAC)
  avac: AVACInfo;

  // 5. Water and drainage (gravity systems)
  waterDrainage: WaterDrainageInfo;

  // 6. Gas installations
  gas: GasInfo;

  // 7. Electrical installations
  electrical: ElectricalInfo;

  // 8. Telecommunications (ITED/ITUR)
  telecommunications: TelecomInfo;

  // 9. Envelope (thermal)
  envelope: BuildingEnvelope;

  // 10. Systems (energy)
  systems: BuildingSystems;

  // 11. Acoustic
  acoustic: AcousticInfo;

  // 12. Accessibility
  accessibility: AccessibilityInfo;

  // 13. Elevators
  elevators: ElevatorInfo;

  // 14. Licensing (RJUE)
  licensing: LicensingInfo;

  // 15. Construction waste
  waste: WasteInfo;

  // 16. Local municipal regulations
  localRegulations: LocalRegulationsInfo;

  // 17. Drawing quality
  drawingQuality: DrawingQualityInfo;

  // 18. Project context
  projectContext: ProjectContext;

  // 19. Energy certification (SCE)
  energy?: EnergyInfo;

  // Allow dynamic fields from context builder (aliases, virtual namespaces)
  [key: string]: unknown;
}

export interface PortugalLocation {
  municipality: string;
  district: string;
  altitude: number; // meters above sea level
  distanceToCoast: number; // km
  climateZoneWinter: "I1" | "I2" | "I3";
  climateZoneSummer: "V1" | "V2" | "V3";
  latitude?: number;
  longitude?: number;
  parish?: string; // Freguesia
}

export interface ArchitectureInfo {
  hasCivilCodeCompliance: boolean; // Conformidade com Código Civil
  windowDistanceToNeighbor?: number; // Art. 1360.º - min 1.5m
  hasRainwaterDrainage: boolean; // Art. 1362.º - estilicídio
  isHorizontalProperty: boolean; // Propriedade horizontal
  respectsCommonParts: boolean; // Art. 1421.º/1422.º
  hasBuildingPermitDesign: boolean; // Projeto de arquitetura aprovado
  meetsRGEU: boolean; // Conformidade RGEU (dimensões, alturas, luz natural)
  ceilingHeight?: number; // Pé-direito (m)
  hasNaturalLight: boolean; // Iluminação natural nos compartimentos principais
  hasCrossVentilation: boolean; // Ventilação cruzada
  // Extended fields for rule evaluation
  hasWaterproofing?: boolean;
  hasThermalInsulation?: boolean;
  hasAcousticInsulation?: boolean;
  windowToFloorRatio?: number;
  hasCompliantFireEscape?: boolean;
  facadeArea?: number; // m²
  [key: string]: unknown;
}

export interface AVACInfo {
  hasHVACProject: boolean; // Projeto AVAC
  hasVentilationSystem: boolean; // Sistema de ventilação mecânica
  ventilationType: "natural" | "mechanical_extract" | "mechanical_supply_extract" | "mixed";
  hasKitchenExtraction: boolean; // Extração cozinha
  hasBathroomExtraction: boolean; // Extração WC
  hasDuctwork: boolean;
  hasAirQualityControl: boolean; // Controlo QAI (RECS)
  hasMaintenancePlan: boolean; // Plano de manutenção AVAC
  installedHVACPower?: number; // kW total
  hasFGasCompliance: boolean; // Conformidade com regulamento F-Gas
  hasRadonProtection: boolean; // Proteção contra radão (DL 108/2018)
  // Extended HVAC fields
  hasEnergyRecovery?: boolean;
  hasIAQMonitoring?: boolean; // Monitorização QAI
  co2Concentration?: number; // ppm
  hasLegionellaPrevention?: boolean;
  hasBMSIntegration?: boolean; // Building Management System
  [key: string]: unknown;
}

/** Local municipal regulations - user uploads */
export interface LocalRegulationDoc {
  id: string;
  name: string;
  municipality: string;
  description: string;
  fileName: string;
  uploadedAt: string; // ISO date
}

export interface LocalRegulationsInfo {
  municipality: string;
  documents: LocalRegulationDoc[];
  notes: string;
  // Municipal utility providers
  waterUtilityProvider?: string; // SIMAS, EPAL, SIMAR, CARTAGUAS, etc.
  waterUtilityDocs: LocalRegulationDoc[];
  // PDM and urban management
  pdmZoning?: string; // Classificação PDM
  pdmNotes?: string;
  // Entity consultation
  consultedEntities: ConsultedEntity[];
  [key: string]: unknown;
}

export interface ConsultedEntity {
  id: string;
  name: string;
  type: "municipality" | "water_utility" | "fire_authority" | "heritage" | "environment" | "transport" | "energy" | "telecom" | "other";
  consultationRequired: boolean;
  consultationDate?: string;
  responseDate?: string;
  responseStatus?: "pending" | "approved" | "approved_conditions" | "rejected" | "no_response";
  notes?: string;
}

export interface DrawingQualityInfo {
  // Scales
  architectureScale?: string; // e.g. "1:100", "1:50"
  detailScale?: string; // e.g. "1:20", "1:10"
  locationPlanScale?: string; // e.g. "1:1000", "1:2000"
  hasCorrectScaleForPrint: boolean;
  // Fonts and text
  hasConsistentFonts: boolean;
  minimumFontSize?: number; // mm when printed
  hasReadableTextAtScale: boolean;
  // Symbols and legends
  hasStandardSymbols: boolean; // EN ISO 7010, NP/EN standards
  hasLegendOnEverySheet: boolean;
  hasNorthArrow: boolean;
  hasScaleBar: boolean;
  // General quality
  hasConsistentLineWeights: boolean;
  hasDimensioning: boolean;
  hasSheetTitleBlock: boolean; // Carimbo/legendas nas folhas
  numberOfSheets?: number;
  [key: string]: unknown;
}

export interface ProjectContext {
  description: string; // Free-text project description
  questions: string[]; // User questions about the project
  specificConcerns: string; // Specific regulatory concerns
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
  [key: string]: unknown;
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
  [key: string]: unknown;
}

export interface AccessibilityInfo {
  // General
  hasAccessibleEntrance: boolean;
  hasElevator: boolean;
  hasAccessibleWC: boolean;
  hasAccessibleParking: boolean;
  hasExteriorPaths?: boolean;

  // Paths & exterior
  pathWidth?: number; // m
  pathClearHeight?: number; // m
  pathCrossSlope?: number; // %
  pathTurningWidth?: number; // m
  pathSurfaceCompliant?: boolean;
  pathFrictionCoefficient?: number;
  hasDirectionalTactilePaving?: boolean;
  hasTactileWarningPaving?: boolean;

  // Doors & openings
  doorWidths: number; // minimum door width in meters
  doorWidthGeneral?: number; // m
  doorHeight?: number; // m
  doorOpeningForce?: number; // N
  doorClearance?: number; // m
  doorHandleHeight?: number; // m
  doorRecessDepth?: number; // m
  doorAutoOpenTime?: number; // s

  // Corridors
  corridorWidths: number; // minimum corridor width in meters
  corridorTurningWidth?: number; // m
  lobbyMinDimension?: number; // m

  // Ramps
  rampGradient?: number; // percentage
  rampWidth?: number; // m
  rampLength?: number; // m
  rampHasHandrails?: boolean;
  rampHandrailExtension?: number; // m
  rampEdgeHeight?: number; // m
  rampCrossSlope?: number; // %
  rampRestingInterval?: number; // m
  rampGuardHeight?: number; // m
  rampLevelDifference?: number; // m

  // Stairs
  stairWidth?: number; // m
  stairRiserHeight?: number; // m
  stairTreadDepth?: number; // m
  stairBlondelValue?: number; // 2R + G
  stairLandingLength?: number; // m
  stairHasNonSlipStrips?: boolean;
  stairHasSecondHandrail?: boolean;
  stairHandrailExtension?: number; // m
  stairRisersClosed?: boolean;

  // Elevators
  elevatorMinWidth?: number; // meters
  elevatorMinDepth?: number; // meters
  elevatorCabinWidth?: number; // m
  elevatorCabinDepth?: number; // m
  elevatorDoorWidth?: number; // m
  elevatorDoorOpenTime?: number; // s
  elevatorCallButtonHeight?: number; // m
  elevatorHasArrivalChime?: boolean;
  elevatorHasFloorIndicator?: boolean;
  elevatorHasRearMirror?: boolean;
  elevatorButtonsBraille?: boolean;
  elevatorLandingWidth?: number; // m

  // WC / sanitary
  wcArea?: number; // m²
  wcTurningDiameter?: number; // m
  wcDoorWidth?: number; // m
  wcDoorOpensOutward?: boolean;
  wcDoorUnlockableFromOutside?: boolean;
  toiletSeatHeight?: number; // m
  toiletWallDistance?: number; // m
  grabBarHeight?: number; // m
  grabBarLength?: number; // m
  washbasinHeight?: number; // m
  washbasinClearanceHeight?: number; // m
  washbasinClearanceDepth?: number; // m
  wcAccessoryHeight?: number; // m
  mirrorBaseHeight?: number; // m

  // Parking
  accessibleParkingCount?: number;
  parkingSpaceWidth?: number; // m
  parkingSpaceLength?: number; // m
  parkingAislWidth?: number; // m
  parkingHasSignage?: boolean;

  // Signage & tactile
  hasVisualTactileSignage?: boolean;
  hasBrailleOnDoorsAndButtons?: boolean;
  hasAccessibilitySymbol?: boolean;
  hasGuidingStrips?: boolean;
  hasLevelChangeTactileContrast?: boolean;
  tactileAlertWidth?: number; // m
  hasProtrudingObjects?: boolean;
  protrudingObjectLow?: number; // m

  // Lifts
  liftPlatformWidth?: number; // m
  liftPlatformDepth?: number; // m
  liftSpeed?: number; // m/s
  inclinedLiftWidth?: number; // m
  inclinedLiftSpeed?: number; // m/s

  // Furniture & seating
  counterHeight?: number; // m
  counterHasKneeSpace?: boolean;
  counterAccessibleLength?: number; // m
  tableHeight?: number; // m
  tableKneeSpace?: number; // m
  reservedSeats?: number;
  reservedSeatWidth?: number; // m
  reservedSeatDepth?: number; // m
  venueCapacity?: number;

  // Dynamic fields
  [key: string]: unknown;
}

export interface FireSafetyInfo {
  // Classification
  utilizationType: "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII" | "IX" | "X" | "XI" | "XII";
  riskCategory: "1" | "2" | "3" | "4";
  buildingHeight?: number; // m (fire safety specific height)

  // Structure & compartmentation
  fireResistanceOfStructure: number; // minutes (REI)
  structuralFireResistance?: number; // minutes
  compartmentArea?: number; // m²
  compartmentWallRating?: number; // minutes
  compartmentMinRating?: number; // minutes
  floorFireResistance?: number; // minutes
  wallReactionClass?: string; // Euroclass (A1, A2, B, C, D, E, F)
  floorReactionClass?: string; // CFL-s1, CFL-s2, etc.
  roofFireRating?: number; // minutes
  empenaFireRating?: number; // minutes
  fireDoorsRating?: number; // minutes
  fireDoorsHaveCloser?: boolean;
  elevatorShaftRating?: number; // minutes
  hasFireStoppedPenetrations?: boolean;
  hasFireDampers?: boolean;
  hasMixedUseIsolation?: boolean;
  isMixedUseBuilding?: boolean;

  // Detection & alarm
  hasFireDetection: boolean;
  hasFireAlarm: boolean;
  hasFalseCeilingDetection?: boolean;
  hasTechnicalZoneDetection?: boolean;
  hasMonitoredFirePanel?: boolean;
  hasCentralizedFireManagement?: boolean;
  hasFireBrigadeAlert?: boolean;
  detectorSpacing?: number; // m
  manualCallPointSpacing?: number; // m
  alarmConfigType?: string;

  // Evacuation
  evacuationRouteWidth: number; // meters
  numberOfExits: number;
  maxEvacuationDistance: number; // meters
  deadEndDistance?: number; // m
  horizontalRouteLength?: number; // m
  evacuationPathWidth?: number; // m
  verticalEvacWidth?: number; // m
  residentialEvacWidth?: number; // m
  evacuationUP?: number; // unidades de passagem
  occupantLoad?: number;
  occupancyIndex?: number;
  exitDoorsOpenOutward?: boolean;
  exitsInDistinctDirections?: boolean;
  hasProtectedStairs?: boolean;
  hasFireLobby?: boolean;
  hasRefugeSpaces?: boolean;
  stepsPerFlight?: number;

  // Emergency lighting
  hasEmergencyLighting: boolean;
  emergencyLightingLevel?: number; // lux
  emergencyLightingAutonomy?: number; // minutes
  emergencyLightingActivationTime?: number; // seconds
  hasBackupPower?: boolean;
  emergencyPowerStartup?: number; // seconds

  // Extinguishers & first intervention
  hasFireExtinguishers: boolean;
  extinguisherMaxDistance?: number; // m
  extinguisherDensity?: number; // per area
  extinguisherHeight?: number; // m
  extinguisherTotalCharge?: number; // kg
  hasRIA?: boolean; // Rede de Incêndio Armada
  riaMaxSpacing?: number; // m
  riaMinPressure?: number; // bar
  riaHoseLength?: number; // m
  riaSimultaneousFlow?: number; // L/min

  // Water supply (dry/wet risers, hydrants, reservoirs)
  hasDryRiser?: boolean;
  dryRiserDiameter?: number; // mm
  dryRiserFlowRate?: number; // L/min
  dryRiserMinPressure?: number; // bar
  hasWetRiser?: boolean;
  hasSiameseConnection?: boolean;
  hasFireWaterReservoir?: boolean;
  fireWaterReserveVolume?: number; // m³
  hydrantDistance?: number; // m
  nearestHydrantDistance?: number; // m
  hydrantAutonomy?: number; // min
  firstInterventionFlow?: number; // L/min
  firstInterventionAutonomy?: number; // min
  secondInterventionFlow?: number; // L/min
  secondInterventionAutonomy?: number; // min

  // Sprinklers
  hasSprinklers: boolean;
  sprinklerDensity?: number; // mm/min
  sprinklerMaxSpacing?: number; // m
  sprinklerActivationTemp?: number; // °C
  sprinklerWaterSupplyAutonomy?: number; // min
  sprinklerCoverageArea?: number; // m²

  // Smoke control
  hasSmokeControl?: boolean;
  smokeVentArea?: number; // m²
  smokeControlAirVelocity?: number; // m/s
  smokeExtractionRatePerUP?: number; // m³/s per UP

  // Gas suppression
  hasGasSuppression?: boolean;
  co2DischargeDuration?: number; // seconds
  fm200Concentration?: number; // %
  novecConcentration?: number; // %
  gasAgentDischargeDelay?: number; // seconds

  // Signage
  hasFireSignage?: boolean;
  signageHeight?: number; // m
  signageLuminance?: number; // cd/m²

  // Access roads
  accessRoadWidth?: number; // m
  accessRoadHeight?: number; // m
  accessRoadCurveRadius?: number; // m
  distanceToFireStation?: number; // km
  responseTime?: number; // min

  // Management & operations
  hasSecurityDelegate?: boolean;
  hasSecurityPost?: boolean;
  hasSecurityPlan?: boolean;
  hasEmergencyPlan?: boolean;
  hasMaintenanceProgram?: boolean;
  hasFireTraining?: boolean;
  hasAnnualDrill?: boolean;
  hasSecurityRecords?: boolean;

  // Dynamic fields from context builder
  [key: string]: unknown;
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

  // Extended electrical fields
  hasSelectiveProtection?: boolean;
  hasTNSEarthing?: boolean;
  hasFireAlarmCircuit?: boolean;
  installedPower?: number; // kVA
  simultaneityFactor?: number;
  [key: string]: unknown;
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
  [key: string]: unknown;
}

export interface AcousticInfo {
  buildingLocation: "quiet" | "mixed" | "noisy"; // Zona sensível, mista, ruidosa
  hasAirborneInsulation: boolean; // Isolamento a sons aéreos entre frações
  airborneInsulationValue?: number; // D'nT,w (dB)
  hasImpactInsulation: boolean; // Isolamento a sons de percussão
  impactInsulationValue?: number; // L'nT,w (dB)
  hasFacadeInsulation: boolean; // Isolamento de fachada
  facadeInsulationValue?: number; // D2m,nT,w (dB)
  hasEquipmentNoiseControl: boolean; // Controlo de ruído de equipamentos
  hasAcousticProject: boolean; // Projeto de condicionamento acústico
  [key: string]: unknown;
}

export interface GasInfo {
  hasGasInstallation: boolean;
  gasType: "natural_gas" | "lpg_piped" | "lpg_bottle" | "none";
  hasGasProject: boolean; // Projeto aprovado
  hasGasDetector: boolean;
  hasEmergencyValve: boolean; // Válvula de corte de emergência
  hasVentilation: boolean; // Ventilação dos locais com aparelhos a gás
  hasFlueSystem: boolean; // Sistema de exaustão/chaminé
  pipesMaterial: "copper" | "steel" | "polyethylene" | "multilayer" | "none";
  hasPressureTest: boolean; // Ensaio de estanquidade
  hasGasCertification: boolean; // Certificação por instalador credenciado
  installationAge?: number; // Years
  [key: string]: unknown;
}

export interface WaterDrainageInfo {
  // Water supply
  hasPublicWaterConnection: boolean;
  waterPipeMaterial: "ppr" | "pex" | "copper" | "multicamada" | "galvanized" | "other";
  hasWaterMeter: boolean;
  hasCheckValve: boolean; // Válvula anti-retorno
  hasPressureReducer: boolean; // Redutor de pressão
  hotWaterRecirculation: boolean;
  // Drainage
  hasSeparateDrainageSystem: boolean; // Separação pluvial/residual
  hasVentilatedDrainage: boolean; // Ventilação da rede de drenagem
  hasDrainageSiphons: boolean; // Sifões nos aparelhos
  hasGreaseTrap: boolean; // Caixa de gorduras (commercial)
  hasStormwaterManagement: boolean; // Gestão de águas pluviais
  hasWaterReuse: boolean; // Reutilização de águas cinzentas/pluviais
  hasBackflowPrevention: boolean; // Prevenção de refluxo
  [key: string]: unknown;
}

export interface StructuralInfo {
  structuralSystem: "reinforced_concrete" | "steel" | "masonry" | "wood" | "mixed";
  seismicZone: "1.1" | "1.2" | "1.3" | "1.4" | "1.5" | "1.6" | "2.1" | "2.2" | "2.3" | "2.4" | "2.5";
  soilType: "A" | "B" | "C" | "D" | "E";
  importanceClass: "I" | "II" | "III" | "IV"; // I=low, IV=essential
  hasStructuralProject: boolean;
  hasGeotechnicalStudy: boolean;
  foundationType: "shallow" | "deep" | "mixed";
  hasSeismicDesign: boolean; // Projetado para ação sísmica
  ductilityClass: "DCL" | "DCM" | "DCH"; // Classe de ductilidade (Low/Medium/High)
  // Extended structural fields
  behaviourFactor?: number; // q factor
  hasProgressiveCollapseDesign?: boolean;
  concreteClass?: string; // C25/30, C30/37, etc.
  steelGrade?: string; // S235, S275, S355, etc.
  hasFireResistanceDesign?: boolean;
  [key: string]: unknown;
}

export interface ElevatorInfo {
  hasElevator: boolean;
  numberOfElevators: number;
  elevatorType: "passenger" | "passenger_freight" | "freight" | "none";
  hasCEMarking: boolean; // Marcação CE
  hasMaintenanceContract: boolean; // Contrato de manutenção
  hasPeriodicInspection: boolean; // Inspeção periódica (IPQ)
  hasEmergencyCommunication: boolean; // Comunicação bidirecional
  hasPitAndHeadroom: boolean; // Fosso e altura livre adequados
  hasAccessibleElevator: boolean; // Ascensor acessível (DL 163/2006)
  elevatorAge?: number;
  [key: string]: unknown;
}

export interface LicensingInfo {
  projectPhase: "prior_info" | "pip" | "licensing" | "communication" | "utilization" | "none";
  hasArchitecturalProject: boolean;
  hasSpecialtyProjects: boolean; // Projetos de especialidades
  hasTermoDeResponsabilidade: boolean; // Termo de responsabilidade do técnico
  hasMunicipalApproval: boolean; // Aprovação camarária
  hasConstructionLicense: boolean; // Alvará de construção
  hasUtilizationLicense: boolean; // Licença de utilização
  hasTechnicalDirector: boolean; // Diretor de obra/fiscalização
  isInARU: boolean; // Área de Reabilitação Urbana
  isProtectedArea: boolean; // Área protegida / património
  processType?: "pip" | "licensing" | "communication_prior" | "special_authorization" | "utilization_license";
  submissionDate?: string; // ISO date
  hasPIPResponse?: boolean; // PIP ou direito à informação já respondido
  pipResponseSummary?: string;
  [key: string]: unknown;
}

export interface WasteInfo {
  hasWasteManagementPlan: boolean; // Plano de Prevenção e Gestão (PPG)
  estimatedWasteVolume?: number; // m³
  hasSortingOnSite: boolean; // Triagem em obra
  hasLicensedTransporter: boolean; // Transportador licenciado
  hasLicensedDestination: boolean; // Destino final licenciado
  hasWasteRegistration: boolean; // Registo em plataforma eletrónica (e-GAR)
  hasDemolitionAudit: boolean; // Auditoria prévia (demolições)
  recyclingPercentageTarget: number; // % target
  [key: string]: unknown;
}

/** Energy certification (SCE) — DL 101-D/2020 */
export interface EnergyInfo {
  // Certification
  hasCertificate?: boolean;
  certificateValidity?: number; // years
  hasPreCertificate?: boolean;
  hasFinalCertificate?: boolean;
  hasCertifiedExpert?: boolean; // Perito qualificado
  transactionType?: "sale" | "rental" | "new_construction" | "renovation" | "none";
  advertisingIncludesClass?: boolean;
  // Energy performance ratios
  ntcNtRatio?: number; // Ntc/Nt (heating+cooling needs vs reference)
  primaryEnergyRatio?: number; // Nac/Na or Ntc/Nt
  ieeActual?: number; // IEE real (kWhEP/m².year)
  ieeReference?: number; // IEE reference
  ieeRenewable?: number; // IEE renewable contribution
  // Requirements
  hasMinimumRenewable?: boolean;
  renewableContribution?: number; // %
  hasNZEBCompliance?: boolean; // Nearly Zero Energy Building
  hasTechnicalBuildingSystems?: boolean;
  hasRegularInspection?: boolean;
  inspectionInterval?: number; // years
  // Dynamic fields
  [key: string]: unknown;
}

/** Per-specialty rule evaluation metrics — shows how many rules were actually evaluable */
export interface RuleEvaluationMetrics {
  pluginId: string;
  pluginName: string;
  area: RegulationArea;
  /** Total active rules in this plugin */
  totalRules: number;
  /** Rules successfully evaluated (conditions could be checked) */
  evaluatedRules: number;
  /** Rules skipped due to missing project fields */
  skippedRules: number;
  /** Rules that fired (produced findings) */
  firedRules: number;
  /** Coverage percentage: evaluatedRules / totalRules */
  coveragePercent: number;
  /** IDs of rules skipped (for audit trail) */
  skippedRuleIds?: string[];
}

export interface AnalysisResult {
  projectName: string;
  overallScore: number; // 0-100
  energyClass: EnergyClass;
  findings: Finding[];
  recommendations: Recommendation[];
  regulationSummary: RegulationSummary[];
  /** Per-specialty rule evaluation metrics */
  ruleEvaluation?: RuleEvaluationMetrics[];
  /** Which specialty areas were actually analyzed (had real IFC/form data) */
  analyzedAreas?: string[];
  /** Context builder coverage: how many rule fields are populated vs missing */
  contextCoverage?: {
    /** Total fields tracked by field mappings */
    total: number;
    /** Fields populated (from IFC, form, or defaults) */
    populated: number;
    /** Coverage percentage */
    percentage: number;
    /** Fields still missing (rules skipped) */
    missingFields: string[];
    /** Per-source breakdown */
    sources: {
      fromIfc: string[];
      fromForm: string[];
      fromDefaults: string[];
    };
    /** Namespace aliases applied */
    aliasesApplied: string[];
  };
}

export interface Finding {
  id: string;
  /** Declarative rule ID that produced this finding (e.g. "PF-001") */
  sourceRuleId?: string;
  area: RegulationArea;
  regulation: string;
  article: string;
  description: string;
  severity: Severity;
  currentValue?: string;
  requiredValue?: string;
  /** Remediation guidance: specific steps to resolve this finding */
  remediation?: string;
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
