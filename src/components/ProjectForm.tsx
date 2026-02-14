"use client";

import { useState } from "react";
import type { BuildingProject, BuildingType } from "@/lib/types";
import { CLIMATE_DATA, PORTUGAL_DISTRICTS } from "@/lib/regulations";
import { DEFAULT_PROJECT } from "@/lib/defaults";

interface ProjectFormProps {
  onSubmit: (project: BuildingProject) => void;
  isLoading: boolean;
}

export default function ProjectForm({ onSubmit, isLoading }: ProjectFormProps) {
  const [project, setProject] = useState<BuildingProject>(DEFAULT_PROJECT);
  const [activeSection, setActiveSection] = useState<string>("general");

  function updateField<K extends keyof BuildingProject>(key: K, value: BuildingProject[K]) {
    setProject(prev => ({ ...prev, [key]: value }));
  }

  function updateLocation(field: string, value: string | number) {
    setProject(prev => {
      const newLocation = { ...prev.location, [field]: value };
      // Auto-update climate zones when district changes
      if (field === "district" && typeof value === "string" && CLIMATE_DATA[value]) {
        const climate = CLIMATE_DATA[value];
        newLocation.climateZoneWinter = climate.winter;
        newLocation.climateZoneSummer = climate.summer;
      }
      return { ...prev, location: newLocation };
    });
  }

  function updateEnvelope(field: string, value: number | string | boolean) {
    setProject(prev => ({
      ...prev,
      envelope: { ...prev.envelope, [field]: value },
    }));
  }

  function updateSystems(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      systems: { ...prev.systems, [field]: value },
    }));
  }

  function updateAccessibility(field: string, value: number | boolean) {
    setProject(prev => ({
      ...prev,
      accessibility: { ...prev.accessibility, [field]: value },
    }));
  }

  function updateFireSafety(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      fireSafety: { ...prev.fireSafety, [field]: value },
    }));
  }

  function updateElectrical(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      electrical: { ...prev.electrical, [field]: value },
    }));
  }

  function updateTelecom(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      telecommunications: { ...prev.telecommunications, [field]: value },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(project);
  }

  const sections = [
    { id: "general", label: "Geral" },
    { id: "envelope", label: "Envolvente" },
    { id: "systems", label: "Sistemas" },
    { id: "accessibility", label: "Acessibilidade" },
    { id: "fire", label: "Incêndio" },
    { id: "electrical", label: "Elétrico" },
    { id: "telecom", label: "ITED/ITUR" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {sections.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSection(s.id)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeSection === s.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* General Section */}
      {activeSection === "general" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Nome do Projeto</Label>
            <Input
              value={project.name}
              onChange={e => updateField("name", e.target.value)}
              placeholder="Ex: Moradia T3 em Lisboa"
              required
            />
          </div>

          <div>
            <Label>Tipo de Edifício</Label>
            <Select
              value={project.buildingType}
              onChange={e => updateField("buildingType", e.target.value as BuildingType)}
            >
              <option value="residential">Residencial</option>
              <option value="commercial">Comercial / Serviços</option>
              <option value="mixed">Misto</option>
              <option value="industrial">Industrial</option>
            </Select>
          </div>

          <div>
            <Label>Distrito</Label>
            <Select
              value={project.location.district}
              onChange={e => {
                updateLocation("district", e.target.value);
                updateLocation("municipality", e.target.value);
              }}
            >
              {PORTUGAL_DISTRICTS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Zona Climática Inverno</Label>
            <Input value={project.location.climateZoneWinter} disabled />
          </div>

          <div>
            <Label>Zona Climática Verão</Label>
            <Input value={project.location.climateZoneSummer} disabled />
          </div>

          <div>
            <Label>Altitude (m)</Label>
            <Input
              type="number"
              value={project.location.altitude}
              onChange={e => updateLocation("altitude", Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Distância à Costa (km)</Label>
            <Input
              type="number"
              value={project.location.distanceToCoast}
              onChange={e => updateLocation("distanceToCoast", Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Área Bruta (m²)</Label>
            <Input
              type="number"
              value={project.grossFloorArea}
              onChange={e => updateField("grossFloorArea", Number(e.target.value))}
              required
            />
          </div>

          <div>
            <Label>Área Útil (m²)</Label>
            <Input
              type="number"
              value={project.usableFloorArea}
              onChange={e => updateField("usableFloorArea", Number(e.target.value))}
              required
            />
          </div>

          <div>
            <Label>Número de Pisos</Label>
            <Input
              type="number"
              value={project.numberOfFloors}
              onChange={e => updateField("numberOfFloors", Number(e.target.value))}
              min={1}
              required
            />
          </div>

          <div>
            <Label>Altura do Edifício (m)</Label>
            <Input
              type="number"
              step="0.1"
              value={project.buildingHeight}
              onChange={e => updateField("buildingHeight", Number(e.target.value))}
              required
            />
          </div>

          <div>
            <Label>Número de Frações</Label>
            <Input
              type="number"
              value={project.numberOfDwellings ?? 1}
              onChange={e => updateField("numberOfDwellings", Number(e.target.value))}
              min={1}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isRehab"
              checked={project.isRehabilitation}
              onChange={e => updateField("isRehabilitation", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="isRehab" className="text-sm text-gray-700">
              Projeto de Reabilitação
            </label>
          </div>
        </div>
      )}

      {/* Envelope Section */}
      {activeSection === "envelope" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="md:col-span-2 font-semibold text-gray-800">Paredes Exteriores</h3>
          <div>
            <Label>Coeficiente U - Paredes (W/(m².K))</Label>
            <Input
              type="number"
              step="0.01"
              value={project.envelope.externalWallUValue}
              onChange={e => updateEnvelope("externalWallUValue", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Área de Paredes Exteriores (m²)</Label>
            <Input
              type="number"
              value={project.envelope.externalWallArea}
              onChange={e => updateEnvelope("externalWallArea", Number(e.target.value))}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Cobertura</h3>
          <div>
            <Label>Coeficiente U - Cobertura (W/(m².K))</Label>
            <Input
              type="number"
              step="0.01"
              value={project.envelope.roofUValue}
              onChange={e => updateEnvelope("roofUValue", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Área de Cobertura (m²)</Label>
            <Input
              type="number"
              value={project.envelope.roofArea}
              onChange={e => updateEnvelope("roofArea", Number(e.target.value))}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Pavimento</h3>
          <div>
            <Label>Coeficiente U - Pavimento (W/(m².K))</Label>
            <Input
              type="number"
              step="0.01"
              value={project.envelope.floorUValue}
              onChange={e => updateEnvelope("floorUValue", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Área de Pavimento (m²)</Label>
            <Input
              type="number"
              value={project.envelope.floorArea}
              onChange={e => updateEnvelope("floorArea", Number(e.target.value))}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Vãos Envidraçados</h3>
          <div>
            <Label>Coeficiente U - Janelas (W/(m².K))</Label>
            <Input
              type="number"
              step="0.01"
              value={project.envelope.windowUValue}
              onChange={e => updateEnvelope("windowUValue", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Área de Envidraçados (m²)</Label>
            <Input
              type="number"
              value={project.envelope.windowArea}
              onChange={e => updateEnvelope("windowArea", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Fator Solar (g-value)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={project.envelope.windowSolarFactor}
              onChange={e => updateEnvelope("windowSolarFactor", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Tipo de Caixilharia</Label>
            <Select
              value={project.envelope.windowFrameType}
              onChange={e => updateEnvelope("windowFrameType", e.target.value)}
            >
              <option value="aluminum_no_break">Alumínio sem Corte Térmico</option>
              <option value="aluminum_thermal_break">Alumínio com Corte Térmico</option>
              <option value="pvc">PVC</option>
              <option value="wood">Madeira</option>
            </Select>
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Ventilação e Pontes Térmicas</h3>
          <div>
            <Label>Pontes Térmicas Lineares (W/(m.K))</Label>
            <Input
              type="number"
              step="0.01"
              value={project.envelope.linearThermalBridges}
              onChange={e => updateEnvelope("linearThermalBridges", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Renovações de Ar por Hora (h⁻¹)</Label>
            <Input
              type="number"
              step="0.1"
              value={project.envelope.airChangesPerHour}
              onChange={e => updateEnvelope("airChangesPerHour", Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="hasHRV"
              checked={project.envelope.hasHRV}
              onChange={e => updateEnvelope("hasHRV", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="hasHRV" className="text-sm text-gray-700">
              Ventilação com Recuperação de Calor (VMC)
            </label>
          </div>
        </div>
      )}

      {/* Systems Section */}
      {activeSection === "systems" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="md:col-span-2 font-semibold text-gray-800">Aquecimento</h3>
          <div>
            <Label>Sistema de Aquecimento</Label>
            <Select
              value={project.systems.heatingSystem}
              onChange={e => updateSystems("heatingSystem", e.target.value)}
            >
              <option value="heat_pump">Bomba de Calor</option>
              <option value="gas_boiler">Caldeira a Gás</option>
              <option value="electric_radiator">Radiador Elétrico</option>
              <option value="biomass">Biomassa</option>
              <option value="none">Nenhum</option>
            </Select>
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Arrefecimento</h3>
          <div>
            <Label>Sistema de Arrefecimento</Label>
            <Select
              value={project.systems.coolingSystem}
              onChange={e => updateSystems("coolingSystem", e.target.value)}
            >
              <option value="heat_pump">Bomba de Calor</option>
              <option value="split_ac">Split / Multi-split</option>
              <option value="central_ac">Ar Condicionado Central</option>
              <option value="none">Nenhum</option>
            </Select>
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Águas Quentes Sanitárias (AQS)</h3>
          <div>
            <Label>Sistema de AQS</Label>
            <Select
              value={project.systems.dhwSystem}
              onChange={e => updateSystems("dhwSystem", e.target.value)}
            >
              <option value="heat_pump">Bomba de Calor</option>
              <option value="gas_boiler">Esquentador / Caldeira a Gás</option>
              <option value="electric">Termoacumulador Elétrico</option>
              <option value="solar_thermal">Solar Térmico</option>
              <option value="thermodynamic">Termodinâmico</option>
            </Select>
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Energias Renováveis</h3>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="hasPV"
              checked={project.systems.hasSolarPV}
              onChange={e => updateSystems("hasSolarPV", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="hasPV" className="text-sm text-gray-700">
              Painéis Solares Fotovoltaicos
            </label>
          </div>
          {project.systems.hasSolarPV && (
            <div>
              <Label>Capacidade PV (kWp)</Label>
              <Input
                type="number"
                step="0.1"
                value={project.systems.solarPVCapacity ?? 0}
                onChange={e => updateSystems("solarPVCapacity", Number(e.target.value))}
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="hasST"
              checked={project.systems.hasSolarThermal}
              onChange={e => updateSystems("hasSolarThermal", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="hasST" className="text-sm text-gray-700">
              Coletores Solares Térmicos
            </label>
          </div>
          {project.systems.hasSolarThermal && (
            <div>
              <Label>Área de Coletores (m²)</Label>
              <Input
                type="number"
                step="0.1"
                value={project.systems.solarThermalArea ?? 0}
                onChange={e => updateSystems("solarThermalArea", Number(e.target.value))}
              />
            </div>
          )}

          {project.buildingType === "commercial" && (
            <>
              <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Iluminação</h3>
              <div>
                <Label>Densidade de Potência de Iluminação (W/m²)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={project.systems.lightingPowerDensity ?? 0}
                  onChange={e => updateSystems("lightingPowerDensity", Number(e.target.value))}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Accessibility Section */}
      {activeSection === "accessibility" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="accEntrance"
              checked={project.accessibility.hasAccessibleEntrance}
              onChange={e => updateAccessibility("hasAccessibleEntrance", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="accEntrance" className="text-sm text-gray-700">
              Entrada Acessível
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="accElevator"
              checked={project.accessibility.hasElevator}
              onChange={e => updateAccessibility("hasElevator", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="accElevator" className="text-sm text-gray-700">
              Ascensor
            </label>
          </div>

          {project.accessibility.hasElevator && (
            <>
              <div>
                <Label>Largura do Ascensor (m)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={project.accessibility.elevatorMinWidth ?? 1.10}
                  onChange={e => updateAccessibility("elevatorMinWidth", Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Profundidade do Ascensor (m)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={project.accessibility.elevatorMinDepth ?? 1.40}
                  onChange={e => updateAccessibility("elevatorMinDepth", Number(e.target.value))}
                />
              </div>
            </>
          )}

          <div>
            <Label>Largura Mínima das Portas (m)</Label>
            <Input
              type="number"
              step="0.01"
              value={project.accessibility.doorWidths}
              onChange={e => updateAccessibility("doorWidths", Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Largura Mínima dos Corredores (m)</Label>
            <Input
              type="number"
              step="0.01"
              value={project.accessibility.corridorWidths}
              onChange={e => updateAccessibility("corridorWidths", Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="accWC"
              checked={project.accessibility.hasAccessibleWC}
              onChange={e => updateAccessibility("hasAccessibleWC", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="accWC" className="text-sm text-gray-700">
              Instalação Sanitária Acessível
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="accParking"
              checked={project.accessibility.hasAccessibleParking}
              onChange={e => updateAccessibility("hasAccessibleParking", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="accParking" className="text-sm text-gray-700">
              Estacionamento Acessível
            </label>
          </div>

          <div>
            <Label>Inclinação da Rampa (%)</Label>
            <Input
              type="number"
              step="0.5"
              value={project.accessibility.rampGradient ?? 0}
              onChange={e => updateAccessibility("rampGradient", Number(e.target.value))}
              placeholder="0 se não aplicável"
            />
          </div>
        </div>
      )}

      {/* Fire Safety Section */}
      {activeSection === "fire" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Utilização-Tipo</Label>
            <Select
              value={project.fireSafety.utilizationType}
              onChange={e => updateFireSafety("utilizationType", e.target.value)}
            >
              <option value="I">I - Habitacional</option>
              <option value="II">II - Estacionamento</option>
              <option value="III">III - Administrativa</option>
              <option value="IV">IV - Escolar</option>
              <option value="V">V - Hospitalar</option>
              <option value="VI">VI - Espetáculos</option>
              <option value="VII">VII - Hotelaria</option>
              <option value="VIII">VIII - Comercial</option>
              <option value="IX">IX - Desportiva</option>
              <option value="X">X - Museus</option>
              <option value="XI">XI - Bibliotecas</option>
              <option value="XII">XII - Industrial</option>
            </Select>
          </div>

          <div>
            <Label>Categoria de Risco</Label>
            <Select
              value={project.fireSafety.riskCategory}
              onChange={e => updateFireSafety("riskCategory", e.target.value)}
            >
              <option value="1">1ª Categoria (Risco Reduzido)</option>
              <option value="2">2ª Categoria (Risco Moderado)</option>
              <option value="3">3ª Categoria (Risco Elevado)</option>
              <option value="4">4ª Categoria (Risco Muito Elevado)</option>
            </Select>
          </div>

          <div>
            <Label>Resistência ao Fogo da Estrutura (REI min)</Label>
            <Input
              type="number"
              step="30"
              value={project.fireSafety.fireResistanceOfStructure}
              onChange={e => updateFireSafety("fireResistanceOfStructure", Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Distância Máx. de Evacuação (m)</Label>
            <Input
              type="number"
              value={project.fireSafety.maxEvacuationDistance}
              onChange={e => updateFireSafety("maxEvacuationDistance", Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Largura das Vias de Evacuação (m)</Label>
            <Input
              type="number"
              step="0.1"
              value={project.fireSafety.evacuationRouteWidth}
              onChange={e => updateFireSafety("evacuationRouteWidth", Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Número de Saídas</Label>
            <Input
              type="number"
              min={1}
              value={project.fireSafety.numberOfExits}
              onChange={e => updateFireSafety("numberOfExits", Number(e.target.value))}
            />
          </div>

          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
            <CheckboxField
              id="hasDetection"
              label="Deteção Automática"
              checked={project.fireSafety.hasFireDetection}
              onChange={v => updateFireSafety("hasFireDetection", v)}
            />
            <CheckboxField
              id="hasAlarm"
              label="Sistema de Alarme"
              checked={project.fireSafety.hasFireAlarm}
              onChange={v => updateFireSafety("hasFireAlarm", v)}
            />
            <CheckboxField
              id="hasSprinklers"
              label="Sprinklers"
              checked={project.fireSafety.hasSprinklers}
              onChange={v => updateFireSafety("hasSprinklers", v)}
            />
            <CheckboxField
              id="hasEmLighting"
              label="Iluminação de Emergência"
              checked={project.fireSafety.hasEmergencyLighting}
              onChange={v => updateFireSafety("hasEmergencyLighting", v)}
            />
            <CheckboxField
              id="hasExtinguishers"
              label="Extintores"
              checked={project.fireSafety.hasFireExtinguishers}
              onChange={v => updateFireSafety("hasFireExtinguishers", v)}
            />
          </div>
        </div>
      )}

      {/* Electrical Section */}
      {activeSection === "electrical" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="md:col-span-2 font-semibold text-gray-800">Alimentação</h3>
          <div>
            <Label>Tipo de Alimentação</Label>
            <Select
              value={project.electrical.supplyType}
              onChange={e => updateElectrical("supplyType", e.target.value)}
            >
              <option value="single_phase">Monofásica</option>
              <option value="three_phase">Trifásica</option>
            </Select>
          </div>
          <div>
            <Label>Potência Contratada (kVA)</Label>
            <Input
              type="number"
              step="0.1"
              value={project.electrical.contractedPower}
              onChange={e => updateElectrical("contractedPower", Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="hasProjectApproval"
              checked={project.electrical.hasProjectApproval}
              onChange={e => updateElectrical("hasProjectApproval", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="hasProjectApproval" className="text-sm text-gray-700">
              Projeto Aprovado (DGEG)
            </label>
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Proteções</h3>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasMainCB"
              label="Disjuntor Geral"
              checked={project.electrical.hasMainCircuitBreaker}
              onChange={v => updateElectrical("hasMainCircuitBreaker", v)}
            />
            <CheckboxField
              id="hasRCD"
              label="Diferencial (RCD)"
              checked={project.electrical.hasResidualCurrentDevice}
              onChange={v => updateElectrical("hasResidualCurrentDevice", v)}
            />
            <CheckboxField
              id="hasCircuitProt"
              label="Proteção por Circuito"
              checked={project.electrical.hasIndividualCircuitProtection}
              onChange={v => updateElectrical("hasIndividualCircuitProtection", v)}
            />
            <CheckboxField
              id="hasSPD"
              label="Descarregador Sobretensões (SPD)"
              checked={project.electrical.hasSurgeProtection}
              onChange={v => updateElectrical("hasSurgeProtection", v)}
            />
          </div>
          {project.electrical.hasResidualCurrentDevice && (
            <div>
              <Label>Sensibilidade do Diferencial (mA)</Label>
              <Select
                value={String(project.electrical.rcdSensitivity)}
                onChange={e => updateElectrical("rcdSensitivity", Number(e.target.value))}
              >
                <option value="30">30 mA (Alta Sensibilidade)</option>
                <option value="100">100 mA</option>
                <option value="300">300 mA</option>
              </Select>
            </div>
          )}

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Terra e Equipotenciais</h3>
          <div className="md:col-span-2 grid grid-cols-2 gap-3">
            <CheckboxField
              id="hasEarthing"
              label="Sistema de Terra"
              checked={project.electrical.hasEarthingSystem}
              onChange={v => updateElectrical("hasEarthingSystem", v)}
            />
            <CheckboxField
              id="hasEquipotential"
              label="Ligações Equipotenciais"
              checked={project.electrical.hasEquipotentialBonding}
              onChange={v => updateElectrical("hasEquipotentialBonding", v)}
            />
          </div>
          {project.electrical.hasEarthingSystem && (
            <div>
              <Label>Resistência de Terra (Ohms)</Label>
              <Input
                type="number"
                step="1"
                value={project.electrical.earthingResistance ?? 20}
                onChange={e => updateElectrical("earthingResistance", Number(e.target.value))}
              />
            </div>
          )}

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Circuitos e Cablagem</h3>
          <div>
            <Label>Tipo de Canalização</Label>
            <Select
              value={project.electrical.wiringType}
              onChange={e => updateElectrical("wiringType", e.target.value)}
            >
              <option value="embedded">Embebida (Embutida)</option>
              <option value="surface">Aparente / Calha</option>
              <option value="cable_tray">Esteira de Cabos</option>
            </Select>
          </div>
          <div>
            <Label>Número de Circuitos</Label>
            <Input
              type="number"
              min={1}
              value={project.electrical.numberOfCircuits}
              onChange={e => updateElectrical("numberOfCircuits", Number(e.target.value))}
            />
          </div>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasSepLight"
              label="Circuitos Iluminação Separados"
              checked={project.electrical.hasSeparateLightingCircuits}
              onChange={v => updateElectrical("hasSeparateLightingCircuits", v)}
            />
            <CheckboxField
              id="hasSepSocket"
              label="Circuitos Tomadas Separados"
              checked={project.electrical.hasSeparateSocketCircuits}
              onChange={v => updateElectrical("hasSeparateSocketCircuits", v)}
            />
            <CheckboxField
              id="hasDedicated"
              label="Circuitos Dedicados (Forno, etc.)"
              checked={project.electrical.hasDedicatedApplianceCircuits}
              onChange={v => updateElectrical("hasDedicatedApplianceCircuits", v)}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Zonas Especiais e Extras</h3>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasBathZone"
              label="Conformidade Zonas WC"
              checked={project.electrical.hasBathroomZoneCompliance}
              onChange={v => updateElectrical("hasBathroomZoneCompliance", v)}
            />
            <CheckboxField
              id="hasOutdoorIP"
              label="IP Adequado Exterior"
              checked={project.electrical.hasOutdoorIPProtection}
              onChange={v => updateElectrical("hasOutdoorIPProtection", v)}
            />
            <CheckboxField
              id="hasEV"
              label="Carregamento VE"
              checked={project.electrical.hasEVCharging}
              onChange={v => updateElectrical("hasEVCharging", v)}
            />
            <CheckboxField
              id="hasSchematic"
              label="Esquema Unifilar"
              checked={project.electrical.hasSchematicDiagram}
              onChange={v => updateElectrical("hasSchematicDiagram", v)}
            />
            <CheckboxField
              id="hasBoardLabel"
              label="Quadro Identificado"
              checked={project.electrical.hasDistributionBoardLabelling}
              onChange={v => updateElectrical("hasDistributionBoardLabelling", v)}
            />
          </div>
        </div>
      )}

      {/* ITED/ITUR Section */}
      {activeSection === "telecom" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="md:col-span-2 font-semibold text-gray-800">ITED - Infraestrutura do Edifício</h3>
          <div>
            <Label>Edição do Manual ITED</Label>
            <Select
              value={project.telecommunications.itedEdition}
              onChange={e => updateTelecom("itedEdition", e.target.value)}
            >
              <option value="4">4ª Edição (2023 - Atual)</option>
              <option value="3">3ª Edição</option>
              <option value="2">2ª Edição</option>
              <option value="1">1ª Edição</option>
            </Select>
          </div>

          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasATE"
              label="ATE (Edifício)"
              checked={project.telecommunications.hasATE}
              onChange={v => updateTelecom("hasATE", v)}
            />
            <CheckboxField
              id="hasATI"
              label="ATI (Individual)"
              checked={project.telecommunications.hasATI}
              onChange={v => updateTelecom("hasATI", v)}
            />
            <CheckboxField
              id="hasRiser"
              label="Coluna Montante"
              checked={project.telecommunications.hasRiserCableway}
              onChange={v => updateTelecom("hasRiserCableway", v)}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Cablagem</h3>
          <div className="md:col-span-2 grid grid-cols-3 gap-3">
            <CheckboxField
              id="hasCopper"
              label="Par de Cobre (UTP)"
              checked={project.telecommunications.hasCopperCabling}
              onChange={v => updateTelecom("hasCopperCabling", v)}
            />
            <CheckboxField
              id="hasFiber"
              label="Fibra Óptica"
              checked={project.telecommunications.hasFiberOptic}
              onChange={v => updateTelecom("hasFiberOptic", v)}
            />
            <CheckboxField
              id="hasCoax"
              label="Cabo Coaxial"
              checked={project.telecommunications.hasCoaxialCabling}
              onChange={v => updateTelecom("hasCoaxialCabling", v)}
            />
          </div>

          {project.telecommunications.hasCopperCabling && (
            <div>
              <Label>Categoria do Cabo UTP</Label>
              <Select
                value={project.telecommunications.copperCableCategory}
                onChange={e => updateTelecom("copperCableCategory", e.target.value)}
              >
                <option value="5e">Categoria 5e</option>
                <option value="6">Categoria 6</option>
                <option value="6a">Categoria 6a</option>
                <option value="7">Categoria 7</option>
              </Select>
            </div>
          )}

          {project.telecommunications.hasFiberOptic && (
            <div>
              <Label>Tipo de Fibra</Label>
              <Select
                value={project.telecommunications.fiberType}
                onChange={e => updateTelecom("fiberType", e.target.value)}
              >
                <option value="single_mode">Monomodo (Single Mode)</option>
                <option value="multi_mode">Multimodo (Multi Mode)</option>
              </Select>
            </div>
          )}

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Tomadas por Fração</h3>
          <div>
            <Label>Tomadas RJ45</Label>
            <Input
              type="number"
              min={0}
              value={project.telecommunications.rj45OutletsPerDwelling}
              onChange={e => updateTelecom("rj45OutletsPerDwelling", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Tomadas Coaxiais</Label>
            <Input
              type="number"
              min={0}
              value={project.telecommunications.coaxialOutletsPerDwelling}
              onChange={e => updateTelecom("coaxialOutletsPerDwelling", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Tomadas Fibra Óptica</Label>
            <Input
              type="number"
              min={0}
              value={project.telecommunications.fiberOutletsPerDwelling}
              onChange={e => updateTelecom("fiberOutletsPerDwelling", Number(e.target.value))}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Certificação</h3>
          <div className="md:col-span-2 grid grid-cols-2 gap-3">
            <CheckboxField
              id="hasITEDCert"
              label="Certificação ITED"
              checked={project.telecommunications.hasITEDCertification}
              onChange={v => updateTelecom("hasITEDCertification", v)}
            />
            <CheckboxField
              id="hasInstallerLicense"
              label="Instalador Credenciado ANACOM"
              checked={project.telecommunications.installerITEDLicense}
              onChange={v => updateTelecom("installerITEDLicense", v)}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">ITUR - Urbanização</h3>
          <div className="md:col-span-2">
            <CheckboxField
              id="isUrbanization"
              label="Projeto de Loteamento / Urbanização"
              checked={project.telecommunications.isUrbanization}
              onChange={v => updateTelecom("isUrbanization", v)}
            />
          </div>

          {project.telecommunications.isUrbanization && (
            <>
              <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                <CheckboxField
                  id="hasITURProject"
                  label="Projeto ITUR"
                  checked={project.telecommunications.hasITURProject}
                  onChange={v => updateTelecom("hasITURProject", v)}
                />
                <CheckboxField
                  id="hasUndergroundDucts"
                  label="Tubagem Subterrânea"
                  checked={project.telecommunications.hasUndergroundDucts}
                  onChange={v => updateTelecom("hasUndergroundDucts", v)}
                />
                <CheckboxField
                  id="hasCEE"
                  label="CEE (Câm. Entrada Edifício)"
                  checked={project.telecommunications.hasCEE}
                  onChange={v => updateTelecom("hasCEE", v)}
                />
              </div>
              <div>
                <Label>Número de Lotes</Label>
                <Input
                  type="number"
                  min={1}
                  value={project.telecommunications.numberOfLots ?? 1}
                  onChange={e => updateTelecom("numberOfLots", Number(e.target.value))}
                />
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || !project.name}
        className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? "A analisar..." : "Analisar Projeto"}
      </button>
    </form>
  );
}

// ============================================================
// Reusable form components
// ============================================================

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-gray-700 mb-1">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${props.className ?? ""}`}
    />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${props.className ?? ""}`}
    >
      {children}
    </select>
  );
}

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300"
      />
      <label htmlFor={id} className="text-sm text-gray-700">{label}</label>
    </div>
  );
}
