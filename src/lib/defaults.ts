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

  accessibility: {
    hasAccessibleEntrance: true,
    hasElevator: false,
    doorWidths: 0.80,
    corridorWidths: 1.10,
    hasAccessibleWC: false,
    hasAccessibleParking: false,
  },

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
};
