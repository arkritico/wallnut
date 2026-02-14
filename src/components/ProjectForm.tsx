"use client";

import { useState, useRef } from "react";
import type { BuildingProject, BuildingType, LocalRegulationDoc, ConsultedEntity } from "@/lib/types";
import { CLIMATE_DATA, PORTUGAL_DISTRICTS, WATER_UTILITY_PROVIDERS, PROCESS_LEGAL_TIMELINES, CONSULTATION_ENTITIES } from "@/lib/regulations";
import { DEFAULT_PROJECT } from "@/lib/defaults";

interface ProjectFormProps {
  onSubmit: (project: BuildingProject) => void;
  isLoading: boolean;
}

export default function ProjectForm({ onSubmit, isLoading }: ProjectFormProps) {
  const [project, setProject] = useState<BuildingProject>(DEFAULT_PROJECT);
  const [activeSection, setActiveSection] = useState<string>("context");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function updateAcoustic(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      acoustic: { ...prev.acoustic, [field]: value },
    }));
  }

  function updateGas(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      gas: { ...prev.gas, [field]: value },
    }));
  }

  function updateWaterDrainage(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      waterDrainage: { ...prev.waterDrainage, [field]: value },
    }));
  }

  function updateStructural(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      structural: { ...prev.structural, [field]: value },
    }));
  }

  function updateElevators(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      elevators: { ...prev.elevators, [field]: value },
    }));
  }

  function updateLicensing(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      licensing: { ...prev.licensing, [field]: value },
    }));
  }

  function updateWaste(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      waste: { ...prev.waste, [field]: value },
    }));
  }

  function updateArchitecture(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      architecture: { ...prev.architecture, [field]: value },
    }));
  }

  function updateAVAC(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      avac: { ...prev.avac, [field]: value },
    }));
  }

  function updateLocalRegulations(field: string, value: string) {
    setProject(prev => ({
      ...prev,
      localRegulations: { ...prev.localRegulations, [field]: value },
    }));
  }

  function updateDrawingQuality(field: string, value: string | number | boolean) {
    setProject(prev => ({
      ...prev,
      drawingQuality: { ...prev.drawingQuality, [field]: value },
    }));
  }

  function updateProjectContext(field: string, value: string | string[]) {
    setProject(prev => ({
      ...prev,
      projectContext: { ...prev.projectContext, [field]: value },
    }));
  }

  function addWaterUtilityDoc(doc: LocalRegulationDoc) {
    setProject(prev => ({
      ...prev,
      localRegulations: {
        ...prev.localRegulations,
        waterUtilityDocs: [...prev.localRegulations.waterUtilityDocs, doc],
      },
    }));
  }

  function removeWaterUtilityDoc(id: string) {
    setProject(prev => ({
      ...prev,
      localRegulations: {
        ...prev.localRegulations,
        waterUtilityDocs: prev.localRegulations.waterUtilityDocs.filter(d => d.id !== id),
      },
    }));
  }

  function addConsultedEntity(entity: ConsultedEntity) {
    setProject(prev => ({
      ...prev,
      localRegulations: {
        ...prev.localRegulations,
        consultedEntities: [...prev.localRegulations.consultedEntities, entity],
      },
    }));
  }

  function removeConsultedEntity(id: string) {
    setProject(prev => ({
      ...prev,
      localRegulations: {
        ...prev.localRegulations,
        consultedEntities: prev.localRegulations.consultedEntities.filter(e => e.id !== id),
      },
    }));
  }

  function addLocalDocument(doc: LocalRegulationDoc) {
    setProject(prev => ({
      ...prev,
      localRegulations: {
        ...prev.localRegulations,
        documents: [...prev.localRegulations.documents, doc],
      },
    }));
  }

  function removeLocalDocument(id: string) {
    setProject(prev => ({
      ...prev,
      localRegulations: {
        ...prev.localRegulations,
        documents: prev.localRegulations.documents.filter(d => d.id !== id),
      },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(project);
  }

  // Organized by project specialty hierarchy
  const sections = [
    { id: "context", label: "Contexto" },
    { id: "general", label: "Geral" },
    { id: "architecture", label: "Arquitetura" },
    { id: "structural", label: "Estruturas" },
    { id: "fire", label: "Incêndio" },
    { id: "avac", label: "AVAC" },
    { id: "water", label: "Águas" },
    { id: "gas", label: "Gás" },
    { id: "electrical", label: "Elétrico" },
    { id: "telecom", label: "ITED/ITUR" },
    { id: "envelope", label: "Envolvente" },
    { id: "systems", label: "Sistemas" },
    { id: "acoustic", label: "Acústica" },
    { id: "accessibility", label: "Acessibilidade" },
    { id: "elevators", label: "Ascensores" },
    { id: "licensing", label: "Licenciamento" },
    { id: "waste", label: "Resíduos" },
    { id: "drawings", label: "Desenhos" },
    { id: "local", label: "Municipal" },
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

      {/* Context Section */}
      {activeSection === "context" && (
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Descreva o seu projeto e coloque questões específicas. Esta informação contextualiza a análise regulamentar e permite identificar preocupações prioritárias.
            </p>
          </div>

          <div>
            <Label>Descrição do Projeto</Label>
            <textarea
              value={project.projectContext.description}
              onChange={e => updateProjectContext("description", e.target.value)}
              placeholder="Descreva o projeto: tipo de obra, estado atual, objetivos, condicionantes conhecidas..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <Label>Preocupações Regulamentares Específicas</Label>
            <textarea
              value={project.projectContext.specificConcerns}
              onChange={e => updateProjectContext("specificConcerns", e.target.value)}
              placeholder="Ex: Tenho dúvidas sobre a classificação SCIE, o PDM limita a cércea a 9m, a câmara exige parecer patrimonial..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <Label>Perguntas sobre o Projeto</Label>
            <div className="space-y-2">
              {project.projectContext.questions.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={q}
                    onChange={e => {
                      const newQuestions = [...project.projectContext.questions];
                      newQuestions[i] = e.target.value;
                      updateProjectContext("questions", newQuestions);
                    }}
                    placeholder="Escreva a sua pergunta..."
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newQuestions = project.projectContext.questions.filter((_, idx) => idx !== i);
                      updateProjectContext("questions", newQuestions);
                    }}
                    className="px-3 py-2 text-red-500 hover:text-red-700 text-sm"
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateProjectContext("questions", [...project.projectContext.questions, ""])}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Adicionar pergunta
              </button>
            </div>
          </div>
        </div>
      )}

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
            <Label>Município</Label>
            <Input
              value={project.location.municipality}
              onChange={e => updateLocation("municipality", e.target.value)}
              placeholder="Ex: Lisboa, Sintra, Cascais..."
            />
          </div>

          <div>
            <Label>Freguesia</Label>
            <Input
              value={project.location.parish ?? ""}
              onChange={e => updateLocation("parish", e.target.value)}
              placeholder="Ex: Estrela, Belém, Ajuda..."
            />
          </div>

          <div>
            <Label>Latitude</Label>
            <Input
              type="number"
              step="0.000001"
              value={project.location.latitude ?? ""}
              onChange={e => updateLocation("latitude", Number(e.target.value))}
              placeholder="Ex: 38.7223"
            />
          </div>

          <div>
            <Label>Longitude</Label>
            <Input
              type="number"
              step="0.000001"
              value={project.location.longitude ?? ""}
              onChange={e => updateLocation("longitude", Number(e.target.value))}
              placeholder="Ex: -9.1393"
            />
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

      {/* Architecture Section */}
      {activeSection === "architecture" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="md:col-span-2 font-semibold text-gray-800">Projeto de Arquitetura (RGEU)</h3>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasBuildingPermit"
              label="Projeto de Arquitetura Aprovado"
              checked={project.architecture.hasBuildingPermitDesign}
              onChange={v => updateArchitecture("hasBuildingPermitDesign", v)}
            />
            <CheckboxField
              id="meetsRGEU"
              label="Conformidade RGEU"
              checked={project.architecture.meetsRGEU}
              onChange={v => updateArchitecture("meetsRGEU", v)}
            />
            <CheckboxField
              id="hasNaturalLight"
              label="Iluminação Natural"
              checked={project.architecture.hasNaturalLight}
              onChange={v => updateArchitecture("hasNaturalLight", v)}
            />
            <CheckboxField
              id="hasCrossVent"
              label="Ventilação Cruzada"
              checked={project.architecture.hasCrossVentilation}
              onChange={v => updateArchitecture("hasCrossVentilation", v)}
            />
            <CheckboxField
              id="hasRainDrain"
              label="Drenagem Águas Pluviais (Estilicídio)"
              checked={project.architecture.hasRainwaterDrainage}
              onChange={v => updateArchitecture("hasRainwaterDrainage", v)}
            />
          </div>

          <div>
            <Label>Pé-direito (m)</Label>
            <Input
              type="number"
              step="0.01"
              value={project.architecture.ceilingHeight ?? ""}
              onChange={e => updateArchitecture("ceilingHeight", Number(e.target.value))}
              placeholder="Ex: 2.70"
            />
          </div>

          <div>
            <Label>Distância Janelas ao Limite Vizinho (m)</Label>
            <Input
              type="number"
              step="0.01"
              value={project.architecture.windowDistanceToNeighbor ?? ""}
              onChange={e => updateArchitecture("windowDistanceToNeighbor", Number(e.target.value))}
              placeholder="Art. 1360.º CC - mín. 1.5m"
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Código Civil</h3>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasCivilCode"
              label="Conformidade Código Civil"
              checked={project.architecture.hasCivilCodeCompliance}
              onChange={v => updateArchitecture("hasCivilCodeCompliance", v)}
            />
            <CheckboxField
              id="isHorizProp"
              label="Propriedade Horizontal"
              checked={project.architecture.isHorizontalProperty}
              onChange={v => updateArchitecture("isHorizontalProperty", v)}
            />
            {project.architecture.isHorizontalProperty && (
              <CheckboxField
                id="respectsCommon"
                label="Respeita Partes Comuns"
                checked={project.architecture.respectsCommonParts}
                onChange={v => updateArchitecture("respectsCommonParts", v)}
              />
            )}
          </div>
        </div>
      )}

      {/* AVAC Section */}
      {activeSection === "avac" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="md:col-span-2 font-semibold text-gray-800">Ventilação</h3>
          <div>
            <Label>Tipo de Ventilação</Label>
            <Select
              value={project.avac.ventilationType}
              onChange={e => updateAVAC("ventilationType", e.target.value)}
            >
              <option value="natural">Natural</option>
              <option value="mechanical_extract">Mecânica - Extração</option>
              <option value="mechanical_supply_extract">Mecânica - Insuflação e Extração</option>
              <option value="mixed">Mista</option>
            </Select>
          </div>

          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasHVACProject"
              label="Projeto AVAC"
              checked={project.avac.hasHVACProject}
              onChange={v => updateAVAC("hasHVACProject", v)}
            />
            <CheckboxField
              id="hasVentSystem"
              label="Sistema de Ventilação Mecânica"
              checked={project.avac.hasVentilationSystem}
              onChange={v => updateAVAC("hasVentilationSystem", v)}
            />
            <CheckboxField
              id="hasKitchenExt"
              label="Extração Cozinha"
              checked={project.avac.hasKitchenExtraction}
              onChange={v => updateAVAC("hasKitchenExtraction", v)}
            />
            <CheckboxField
              id="hasBathExt"
              label="Extração WC"
              checked={project.avac.hasBathroomExtraction}
              onChange={v => updateAVAC("hasBathroomExtraction", v)}
            />
            <CheckboxField
              id="hasDuctwork"
              label="Rede de Condutas"
              checked={project.avac.hasDuctwork}
              onChange={v => updateAVAC("hasDuctwork", v)}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Qualidade do Ar e Manutenção</h3>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasAirQuality"
              label="Controlo QAI (RECS)"
              checked={project.avac.hasAirQualityControl}
              onChange={v => updateAVAC("hasAirQualityControl", v)}
            />
            <CheckboxField
              id="hasMaintPlan"
              label="Plano de Manutenção"
              checked={project.avac.hasMaintenancePlan}
              onChange={v => updateAVAC("hasMaintenancePlan", v)}
            />
            <CheckboxField
              id="hasFGas"
              label="Conformidade F-Gas"
              checked={project.avac.hasFGasCompliance}
              onChange={v => updateAVAC("hasFGasCompliance", v)}
            />
            <CheckboxField
              id="hasRadon"
              label="Proteção Radão (DL 108/2018)"
              checked={project.avac.hasRadonProtection}
              onChange={v => updateAVAC("hasRadonProtection", v)}
            />
          </div>

          <div>
            <Label>Potência AVAC Instalada (kW)</Label>
            <Input
              type="number"
              step="0.1"
              value={project.avac.installedHVACPower ?? ""}
              onChange={e => updateAVAC("installedHVACPower", Number(e.target.value))}
              placeholder="Opcional"
            />
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

      {/* Acoustic Section */}
      {activeSection === "acoustic" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Localização Acústica</Label>
            <Select
              value={project.acoustic.buildingLocation}
              onChange={e => updateAcoustic("buildingLocation", e.target.value)}
            >
              <option value="quiet">Zona Sensível (residencial)</option>
              <option value="mixed">Zona Mista</option>
              <option value="noisy">Zona Ruidosa (próximo de vias)</option>
            </Select>
          </div>

          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasAcousticProject"
              label="Projeto Acústico (RRAE)"
              checked={project.acoustic.hasAcousticProject}
              onChange={v => updateAcoustic("hasAcousticProject", v)}
            />
            <CheckboxField
              id="hasAirborneInsul"
              label="Isolamento Sons Aéreos"
              checked={project.acoustic.hasAirborneInsulation}
              onChange={v => updateAcoustic("hasAirborneInsulation", v)}
            />
            <CheckboxField
              id="hasImpactInsul"
              label="Isolamento Sons Percussão"
              checked={project.acoustic.hasImpactInsulation}
              onChange={v => updateAcoustic("hasImpactInsulation", v)}
            />
            <CheckboxField
              id="hasFacadeInsul"
              label="Isolamento de Fachada"
              checked={project.acoustic.hasFacadeInsulation}
              onChange={v => updateAcoustic("hasFacadeInsulation", v)}
            />
            <CheckboxField
              id="hasEquipNoise"
              label="Controlo Ruído Equipamentos"
              checked={project.acoustic.hasEquipmentNoiseControl}
              onChange={v => updateAcoustic("hasEquipmentNoiseControl", v)}
            />
          </div>

          {project.acoustic.hasAirborneInsulation && (
            <div>
              <Label>Isolamento Aéreo D&apos;nT,w (dB)</Label>
              <Input
                type="number"
                step="1"
                value={project.acoustic.airborneInsulationValue ?? 0}
                onChange={e => updateAcoustic("airborneInsulationValue", Number(e.target.value))}
              />
            </div>
          )}

          {project.acoustic.hasImpactInsulation && (
            <div>
              <Label>Sons de Percussão L&apos;nT,w (dB)</Label>
              <Input
                type="number"
                step="1"
                value={project.acoustic.impactInsulationValue ?? 0}
                onChange={e => updateAcoustic("impactInsulationValue", Number(e.target.value))}
              />
            </div>
          )}

          {project.acoustic.hasFacadeInsulation && (
            <div>
              <Label>Isolamento Fachada D2m,nT,w (dB)</Label>
              <Input
                type="number"
                step="1"
                value={project.acoustic.facadeInsulationValue ?? 0}
                onChange={e => updateAcoustic("facadeInsulationValue", Number(e.target.value))}
              />
            </div>
          )}
        </div>
      )}

      {/* Gas Section */}
      {activeSection === "gas" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <CheckboxField
              id="hasGasInstall"
              label="Instalação de Gás"
              checked={project.gas.hasGasInstallation}
              onChange={v => updateGas("hasGasInstallation", v)}
            />
          </div>

          {project.gas.hasGasInstallation && (
            <>
              <div>
                <Label>Tipo de Gás</Label>
                <Select
                  value={project.gas.gasType}
                  onChange={e => updateGas("gasType", e.target.value)}
                >
                  <option value="natural_gas">Gás Natural</option>
                  <option value="lpg_piped">GPL Canalizado</option>
                  <option value="lpg_bottle">GPL Garrafa</option>
                  <option value="none">Nenhum</option>
                </Select>
              </div>

              <div>
                <Label>Material da Tubagem</Label>
                <Select
                  value={project.gas.pipesMaterial}
                  onChange={e => updateGas("pipesMaterial", e.target.value)}
                >
                  <option value="copper">Cobre</option>
                  <option value="steel">Aço</option>
                  <option value="polyethylene">Polietileno</option>
                  <option value="multilayer">Multicamada</option>
                  <option value="none">N/A</option>
                </Select>
              </div>

              <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                <CheckboxField
                  id="hasGasProject"
                  label="Projeto de Gás Aprovado"
                  checked={project.gas.hasGasProject}
                  onChange={v => updateGas("hasGasProject", v)}
                />
                <CheckboxField
                  id="hasGasDetector"
                  label="Detetor de Gás"
                  checked={project.gas.hasGasDetector}
                  onChange={v => updateGas("hasGasDetector", v)}
                />
                <CheckboxField
                  id="hasEmergValve"
                  label="Válvula de Emergência"
                  checked={project.gas.hasEmergencyValve}
                  onChange={v => updateGas("hasEmergencyValve", v)}
                />
                <CheckboxField
                  id="hasGasVent"
                  label="Ventilação Adequada"
                  checked={project.gas.hasVentilation}
                  onChange={v => updateGas("hasVentilation", v)}
                />
                <CheckboxField
                  id="hasFlue"
                  label="Sistema de Exaustão"
                  checked={project.gas.hasFlueSystem}
                  onChange={v => updateGas("hasFlueSystem", v)}
                />
                <CheckboxField
                  id="hasPressureTest"
                  label="Ensaio de Estanquidade"
                  checked={project.gas.hasPressureTest}
                  onChange={v => updateGas("hasPressureTest", v)}
                />
                <CheckboxField
                  id="hasGasCert"
                  label="Certificação DGEG"
                  checked={project.gas.hasGasCertification}
                  onChange={v => updateGas("hasGasCertification", v)}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Water & Drainage Section */}
      {activeSection === "water" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="md:col-span-2 font-semibold text-gray-800">Abastecimento de Água</h3>
          <div>
            <Label>Material das Tubagens</Label>
            <Select
              value={project.waterDrainage.waterPipeMaterial}
              onChange={e => updateWaterDrainage("waterPipeMaterial", e.target.value)}
            >
              <option value="ppr">PPR</option>
              <option value="pex">PEX</option>
              <option value="copper">Cobre</option>
              <option value="multicamada">Multicamada</option>
              <option value="galvanized">Aço Galvanizado</option>
              <option value="other">Outro</option>
            </Select>
          </div>

          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasPublicWater"
              label="Ligação à Rede Pública"
              checked={project.waterDrainage.hasPublicWaterConnection}
              onChange={v => updateWaterDrainage("hasPublicWaterConnection", v)}
            />
            <CheckboxField
              id="hasWaterMeter"
              label="Contador de Água"
              checked={project.waterDrainage.hasWaterMeter}
              onChange={v => updateWaterDrainage("hasWaterMeter", v)}
            />
            <CheckboxField
              id="hasCheckValve"
              label="Válvula Anti-retorno"
              checked={project.waterDrainage.hasCheckValve}
              onChange={v => updateWaterDrainage("hasCheckValve", v)}
            />
            <CheckboxField
              id="hasPressReducer"
              label="Redutor de Pressão"
              checked={project.waterDrainage.hasPressureReducer}
              onChange={v => updateWaterDrainage("hasPressureReducer", v)}
            />
            <CheckboxField
              id="hasRecirculation"
              label="Recirculação AQS"
              checked={project.waterDrainage.hotWaterRecirculation}
              onChange={v => updateWaterDrainage("hotWaterRecirculation", v)}
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Drenagem</h3>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasSepDrainage"
              label="Sistema Separativo"
              checked={project.waterDrainage.hasSeparateDrainageSystem}
              onChange={v => updateWaterDrainage("hasSeparateDrainageSystem", v)}
            />
            <CheckboxField
              id="hasVentDrain"
              label="Ventilação da Rede"
              checked={project.waterDrainage.hasVentilatedDrainage}
              onChange={v => updateWaterDrainage("hasVentilatedDrainage", v)}
            />
            <CheckboxField
              id="hasSiphons"
              label="Sifões nos Aparelhos"
              checked={project.waterDrainage.hasDrainageSiphons}
              onChange={v => updateWaterDrainage("hasDrainageSiphons", v)}
            />
            <CheckboxField
              id="hasGreaseTrap"
              label="Caixa de Gorduras"
              checked={project.waterDrainage.hasGreaseTrap}
              onChange={v => updateWaterDrainage("hasGreaseTrap", v)}
            />
            <CheckboxField
              id="hasStormwater"
              label="Gestão Águas Pluviais"
              checked={project.waterDrainage.hasStormwaterManagement}
              onChange={v => updateWaterDrainage("hasStormwaterManagement", v)}
            />
            <CheckboxField
              id="hasBackflow"
              label="Prevenção de Refluxo"
              checked={project.waterDrainage.hasBackflowPrevention}
              onChange={v => updateWaterDrainage("hasBackflowPrevention", v)}
            />
            <CheckboxField
              id="hasWaterReuse"
              label="Reutilização de Águas"
              checked={project.waterDrainage.hasWaterReuse}
              onChange={v => updateWaterDrainage("hasWaterReuse", v)}
            />
          </div>
        </div>
      )}

      {/* Structural Section */}
      {activeSection === "structural" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Sistema Estrutural</Label>
            <Select
              value={project.structural.structuralSystem}
              onChange={e => updateStructural("structuralSystem", e.target.value)}
            >
              <option value="reinforced_concrete">Betão Armado</option>
              <option value="steel">Estrutura Metálica</option>
              <option value="masonry">Alvenaria Estrutural</option>
              <option value="wood">Madeira</option>
              <option value="mixed">Misto</option>
            </Select>
          </div>

          <div>
            <Label>Zona Sísmica</Label>
            <Select
              value={project.structural.seismicZone}
              onChange={e => updateStructural("seismicZone", e.target.value)}
            >
              <option value="1.1">1.1 (Maior sismicidade)</option>
              <option value="1.2">1.2</option>
              <option value="1.3">1.3</option>
              <option value="1.4">1.4</option>
              <option value="1.5">1.5</option>
              <option value="1.6">1.6 (Menor sismicidade)</option>
              <option value="2.1">2.1 (Ação tipo 2 - Maior)</option>
              <option value="2.2">2.2</option>
              <option value="2.3">2.3</option>
              <option value="2.4">2.4</option>
              <option value="2.5">2.5 (Ação tipo 2 - Menor)</option>
            </Select>
          </div>

          <div>
            <Label>Tipo de Solo</Label>
            <Select
              value={project.structural.soilType}
              onChange={e => updateStructural("soilType", e.target.value)}
            >
              <option value="A">A - Rocha</option>
              <option value="B">B - Areia compacta / Cascalho</option>
              <option value="C">C - Areia média / Argila rija</option>
              <option value="D">D - Solo mole</option>
              <option value="E">E - Aluvião sobre rocha</option>
            </Select>
          </div>

          <div>
            <Label>Classe de Importância</Label>
            <Select
              value={project.structural.importanceClass}
              onChange={e => updateStructural("importanceClass", e.target.value)}
            >
              <option value="I">I - Importância Reduzida</option>
              <option value="II">II - Normal (Habitação/Comércio)</option>
              <option value="III">III - Elevada (Escolas/Hospitais)</option>
              <option value="IV">IV - Essencial (Proteção Civil)</option>
            </Select>
          </div>

          <div>
            <Label>Tipo de Fundação</Label>
            <Select
              value={project.structural.foundationType}
              onChange={e => updateStructural("foundationType", e.target.value)}
            >
              <option value="shallow">Superficial (Sapatas/Lintéis)</option>
              <option value="deep">Profunda (Estacas/Microestacas)</option>
              <option value="mixed">Mista</option>
            </Select>
          </div>

          <div>
            <Label>Classe de Ductilidade</Label>
            <Select
              value={project.structural.ductilityClass}
              onChange={e => updateStructural("ductilityClass", e.target.value)}
            >
              <option value="DCL">DCL - Baixa</option>
              <option value="DCM">DCM - Média</option>
              <option value="DCH">DCH - Alta</option>
            </Select>
          </div>

          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasStructProject"
              label="Projeto de Estabilidade"
              checked={project.structural.hasStructuralProject}
              onChange={v => updateStructural("hasStructuralProject", v)}
            />
            <CheckboxField
              id="hasGeoStudy"
              label="Estudo Geotécnico"
              checked={project.structural.hasGeotechnicalStudy}
              onChange={v => updateStructural("hasGeotechnicalStudy", v)}
            />
            <CheckboxField
              id="hasSeismicDesign"
              label="Projeto Sismo-resistente"
              checked={project.structural.hasSeismicDesign}
              onChange={v => updateStructural("hasSeismicDesign", v)}
            />
          </div>
        </div>
      )}

      {/* Elevators Section */}
      {activeSection === "elevators" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <CheckboxField
              id="hasElevatorInst"
              label="Edifício tem Ascensor"
              checked={project.elevators.hasElevator}
              onChange={v => updateElevators("hasElevator", v)}
            />
          </div>

          {project.elevators.hasElevator && (
            <>
              <div>
                <Label>Número de Ascensores</Label>
                <Input
                  type="number"
                  min={1}
                  value={project.elevators.numberOfElevators}
                  onChange={e => updateElevators("numberOfElevators", Number(e.target.value))}
                />
              </div>

              <div>
                <Label>Tipo de Ascensor</Label>
                <Select
                  value={project.elevators.elevatorType}
                  onChange={e => updateElevators("elevatorType", e.target.value)}
                >
                  <option value="passenger">Passageiros</option>
                  <option value="passenger_freight">Passageiros e Carga</option>
                  <option value="freight">Carga (Monta-cargas)</option>
                </Select>
              </div>

              <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                <CheckboxField
                  id="hasCEMark"
                  label="Marcação CE"
                  checked={project.elevators.hasCEMarking}
                  onChange={v => updateElevators("hasCEMarking", v)}
                />
                <CheckboxField
                  id="hasElevMaint"
                  label="Contrato de Manutenção"
                  checked={project.elevators.hasMaintenanceContract}
                  onChange={v => updateElevators("hasMaintenanceContract", v)}
                />
                <CheckboxField
                  id="hasElevInspection"
                  label="Inspeção Periódica"
                  checked={project.elevators.hasPeriodicInspection}
                  onChange={v => updateElevators("hasPeriodicInspection", v)}
                />
                <CheckboxField
                  id="hasElevComm"
                  label="Comunicação de Emergência"
                  checked={project.elevators.hasEmergencyCommunication}
                  onChange={v => updateElevators("hasEmergencyCommunication", v)}
                />
                <CheckboxField
                  id="hasPitHeadroom"
                  label="Fosso e Altura Adequados"
                  checked={project.elevators.hasPitAndHeadroom}
                  onChange={v => updateElevators("hasPitAndHeadroom", v)}
                />
                <CheckboxField
                  id="hasAccessElevator"
                  label="Ascensor Acessível"
                  checked={project.elevators.hasAccessibleElevator}
                  onChange={v => updateElevators("hasAccessibleElevator", v)}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Licensing Section */}
      {activeSection === "licensing" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Fase do Projeto</Label>
            <Select
              value={project.licensing.projectPhase}
              onChange={e => updateLicensing("projectPhase", e.target.value)}
            >
              <option value="prior_info">Informação Prévia (PIP)</option>
              <option value="pip">Pedido de Informação Prévia</option>
              <option value="licensing">Licenciamento</option>
              <option value="communication">Comunicação Prévia</option>
              <option value="utilization">Licença de Utilização</option>
              <option value="none">Não definida</option>
            </Select>
          </div>

          <div>
            <Label>Tipo de Processo (para cálculo de prazos)</Label>
            <Select
              value={project.licensing.processType ?? ""}
              onChange={e => updateLicensing("processType", e.target.value || undefined as unknown as string)}
            >
              <option value="">Selecionar...</option>
              <option value="pip">Informação Prévia (PIP) - 40 dias úteis</option>
              <option value="licensing">Licenciamento - 65 dias úteis</option>
              <option value="communication_prior">Comunicação Prévia - 20 dias úteis</option>
              <option value="special_authorization">Autorização Especial - 60 dias úteis</option>
              <option value="utilization_license">Licença de Utilização - 15 dias úteis</option>
            </Select>
          </div>

          {project.licensing.processType && (
            <>
              <div>
                <Label>Data de Submissão</Label>
                <Input
                  type="date"
                  value={project.licensing.submissionDate ?? ""}
                  onChange={e => updateLicensing("submissionDate", e.target.value)}
                />
              </div>
              {project.licensing.submissionDate && (() => {
                const pt = project.licensing.processType as keyof typeof PROCESS_LEGAL_TIMELINES;
                const timeline = pt ? PROCESS_LEGAL_TIMELINES[pt] : null;
                const totalDays = timeline && "totalMaxDays" in timeline ? timeline.totalMaxDays : (timeline && "startWorkDays" in timeline ? timeline.startWorkDays : 0);
                const sub = new Date(project.licensing.submissionDate!);
                const expected = new Date(sub);
                expected.setDate(expected.getDate() + Math.ceil(totalDays * 7 / 5));
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <strong>Prazo legal:</strong> {totalDays} dias úteis<br />
                      <strong>Data expectável:</strong> ~{expected.toLocaleDateString("pt-PT")}<br />
                      <strong>Efeito do silêncio:</strong> {timeline && timeline.silenceEffect === "deferimento_tácito" ? "Deferimento tácito" : "Pode iniciar obras"}
                    </p>
                  </div>
                );
              })()}
            </>
          )}

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">PIP / Direito à Informação</h3>
          <div className="md:col-span-2">
            <CheckboxField
              id="hasPIPResponse"
              label="Tem PIP ou Direito à Informação respondido"
              checked={project.licensing.hasPIPResponse ?? false}
              onChange={v => updateLicensing("hasPIPResponse", v)}
            />
          </div>
          {project.licensing.hasPIPResponse && (
            <div className="md:col-span-2">
              <Label>Resumo do PIP / Informação Prévia</Label>
              <textarea
                value={project.licensing.pipResponseSummary ?? ""}
                onChange={e => updateLicensing("pipResponseSummary", e.target.value)}
                placeholder="Resuma os condicionalismos e informações fornecidas pela câmara..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Projetos e Licenças</h3>

          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasArchProject"
              label="Projeto de Arquitetura"
              checked={project.licensing.hasArchitecturalProject}
              onChange={v => updateLicensing("hasArchitecturalProject", v)}
            />
            <CheckboxField
              id="hasSpecProjects"
              label="Projetos de Especialidades"
              checked={project.licensing.hasSpecialtyProjects}
              onChange={v => updateLicensing("hasSpecialtyProjects", v)}
            />
            <CheckboxField
              id="hasTermoResp"
              label="Termos de Responsabilidade"
              checked={project.licensing.hasTermoDeResponsabilidade}
              onChange={v => updateLicensing("hasTermoDeResponsabilidade", v)}
            />
            <CheckboxField
              id="hasMunApproval"
              label="Aprovação Municipal"
              checked={project.licensing.hasMunicipalApproval}
              onChange={v => updateLicensing("hasMunicipalApproval", v)}
            />
            <CheckboxField
              id="hasConstLicense"
              label="Alvará de Construção"
              checked={project.licensing.hasConstructionLicense}
              onChange={v => updateLicensing("hasConstructionLicense", v)}
            />
            <CheckboxField
              id="hasUtilLicense"
              label="Licença de Utilização"
              checked={project.licensing.hasUtilizationLicense}
              onChange={v => updateLicensing("hasUtilizationLicense", v)}
            />
            <CheckboxField
              id="hasTechDirector"
              label="Diretor de Obra/Fiscalização"
              checked={project.licensing.hasTechnicalDirector}
              onChange={v => updateLicensing("hasTechnicalDirector", v)}
            />
          </div>

          <div className="md:col-span-2 grid grid-cols-2 gap-3 mt-2">
            <CheckboxField
              id="isInARU"
              label="Área de Reabilitação Urbana (ARU)"
              checked={project.licensing.isInARU}
              onChange={v => updateLicensing("isInARU", v)}
            />
            <CheckboxField
              id="isProtectedArea"
              label="Área Protegida / Património"
              checked={project.licensing.isProtectedArea}
              onChange={v => updateLicensing("isProtectedArea", v)}
            />
          </div>
        </div>
      )}

      {/* Local/Municipal Section */}
      {activeSection === "local" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              Os regulamentos municipais, de hidráulica e de entidades concessionárias variam por concelho. Carregue documentação local para que a análise considere regras específicas.
            </p>
          </div>

          <div>
            <Label>Município</Label>
            <Input
              value={project.localRegulations.municipality}
              onChange={e => updateLocalRegulations("municipality", e.target.value)}
              placeholder="Ex: Lisboa, Porto, Coimbra..."
            />
          </div>

          {/* PDM / Urban Management */}
          <div>
            <Label>Classificação PDM</Label>
            <Input
              value={project.localRegulations.pdmZoning ?? ""}
              onChange={e => updateLocalRegulations("pdmZoning", e.target.value)}
              placeholder="Ex: Solo urbano - Espaços centrais e residenciais"
            />
          </div>

          <div className="md:col-span-2">
            <Label>Notas PDM / Instrumentos de Gestão Urbanística</Label>
            <textarea
              value={project.localRegulations.pdmNotes ?? ""}
              onChange={e => updateLocalRegulations("pdmNotes", e.target.value)}
              placeholder="Condicionantes do PDM: cércea máxima, índice de construção, alinhamentos, servidões..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Water Utility Provider */}
          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Entidade Gestora de Águas</h3>
          <div>
            <Label>Entidade</Label>
            <Select
              value={project.localRegulations.waterUtilityProvider ?? ""}
              onChange={e => updateLocalRegulations("waterUtilityProvider", e.target.value)}
            >
              <option value="">Selecionar...</option>
              {WATER_UTILITY_PROVIDERS.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
              <option value="outra">Outra</option>
            </Select>
          </div>

          <div>
            <Label>Carregar Regulamento de Águas</Label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  addWaterUtilityDoc({
                    id: crypto.randomUUID(),
                    name: file.name.replace(/\.[^.]+$/, ""),
                    municipality: project.localRegulations.municipality,
                    description: "Regulamento de águas/saneamento",
                    fileName: file.name,
                    uploadedAt: new Date().toISOString(),
                  });
                  e.target.value = "";
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {project.localRegulations.waterUtilityDocs.length > 0 && (
            <div className="md:col-span-2">
              <Label>Documentos de Águas/Saneamento</Label>
              <div className="space-y-2">
                {project.localRegulations.waterUtilityDocs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-sky-50 rounded-lg border border-sky-200">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                      <p className="text-xs text-gray-500">{project.localRegulations.waterUtilityProvider || doc.municipality}</p>
                    </div>
                    <button type="button" onClick={() => removeWaterUtilityDoc(doc.id)} className="ml-2 text-red-500 hover:text-red-700 text-sm font-medium">Remover</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entity Consultation */}
          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Entidades a Consultar</h3>
          <div className="md:col-span-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 mb-2">Entidades que podem requerer consulta (baseado no projeto):</p>
            <div className="flex flex-wrap gap-2">
              {[...CONSULTATION_ENTITIES.mandatory, ...CONSULTATION_ENTITIES.conditional].map(entity => {
                const isAdded = project.localRegulations.consultedEntities.some(e => e.name === entity.name);
                return (
                  <button
                    key={entity.name}
                    type="button"
                    onClick={() => {
                      if (!isAdded) {
                        addConsultedEntity({
                          id: crypto.randomUUID(),
                          name: entity.name,
                          type: entity.type,
                          consultationRequired: true,
                        });
                      }
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${isAdded ? "bg-green-100 border-green-300 text-green-700" : "bg-white border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-300"}`}
                    title={"condition" in entity ? entity.condition : entity.scope}
                  >
                    {isAdded ? "\u2713 " : ""}{entity.name}
                  </button>
                );
              })}
            </div>
          </div>

          {project.localRegulations.consultedEntities.length > 0 && (
            <div className="md:col-span-2 space-y-2">
              {project.localRegulations.consultedEntities.map(entity => (
                <div key={entity.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{entity.name}</p>
                    <p className="text-xs text-gray-500">{entity.type}</p>
                  </div>
                  <Select
                    value={entity.responseStatus ?? "pending"}
                    onChange={e => {
                      setProject(prev => ({
                        ...prev,
                        localRegulations: {
                          ...prev.localRegulations,
                          consultedEntities: prev.localRegulations.consultedEntities.map(en =>
                            en.id === entity.id ? { ...en, responseStatus: e.target.value as ConsultedEntity["responseStatus"] } : en
                          ),
                        },
                      }));
                    }}
                  >
                    <option value="pending">Pendente</option>
                    <option value="approved">Aprovado</option>
                    <option value="approved_conditions">Aprovado c/ condições</option>
                    <option value="rejected">Rejeitado</option>
                    <option value="no_response">Sem resposta</option>
                  </Select>
                  <button type="button" onClick={() => removeConsultedEntity(entity.id)} className="text-red-500 hover:text-red-700 text-sm">Remover</button>
                </div>
              ))}
            </div>
          )}

          {/* General Local Documents */}
          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Documentos Municipais</h3>
          <div className="md:col-span-2">
            <Label>Carregar PDM, Regulamentos, etc.</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  addLocalDocument({
                    id: crypto.randomUUID(),
                    name: file.name.replace(/\.[^.]+$/, ""),
                    municipality: project.localRegulations.municipality,
                    description: "",
                    fileName: file.name,
                    uploadedAt: new Date().toISOString(),
                  });
                  e.target.value = "";
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {project.localRegulations.documents.length > 0 && (
            <div className="md:col-span-2">
              <div className="space-y-2">
                {project.localRegulations.documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                      <p className="text-xs text-gray-500">{doc.municipality} - {new Date(doc.uploadedAt).toLocaleDateString("pt-PT")}</p>
                    </div>
                    <button type="button" onClick={() => removeLocalDocument(doc.id)} className="ml-2 text-red-500 hover:text-red-700 text-sm font-medium">Remover</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="md:col-span-2">
            <Label>Notas</Label>
            <textarea
              value={project.localRegulations.notes}
              onChange={e => updateLocalRegulations("notes", e.target.value)}
              placeholder="Notas adicionais sobre regulamentos locais aplicáveis..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Waste Section */}
      {activeSection === "waste" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasWastePlan"
              label="PPG (Plano de Gestão RCD)"
              checked={project.waste.hasWasteManagementPlan}
              onChange={v => updateWaste("hasWasteManagementPlan", v)}
            />
            <CheckboxField
              id="hasSortingOnSite"
              label="Triagem em Obra"
              checked={project.waste.hasSortingOnSite}
              onChange={v => updateWaste("hasSortingOnSite", v)}
            />
            <CheckboxField
              id="hasLicTransporter"
              label="Transportador Licenciado"
              checked={project.waste.hasLicensedTransporter}
              onChange={v => updateWaste("hasLicensedTransporter", v)}
            />
            <CheckboxField
              id="hasLicDestination"
              label="Destino Final Licenciado"
              checked={project.waste.hasLicensedDestination}
              onChange={v => updateWaste("hasLicensedDestination", v)}
            />
            <CheckboxField
              id="hasWasteReg"
              label="Registo e-GAR"
              checked={project.waste.hasWasteRegistration}
              onChange={v => updateWaste("hasWasteRegistration", v)}
            />
            <CheckboxField
              id="hasDemoAudit"
              label="Auditoria Prévia (Demolição)"
              checked={project.waste.hasDemolitionAudit}
              onChange={v => updateWaste("hasDemolitionAudit", v)}
            />
          </div>

          <div>
            <Label>Meta de Reciclagem (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={project.waste.recyclingPercentageTarget}
              onChange={e => updateWaste("recyclingPercentageTarget", Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Drawings Section */}
      {activeSection === "drawings" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Avaliação da qualidade das peças desenhadas: escalas, tipos de letra, simbologia, legendas e apresentação geral conforme Portaria 701-H/2008 e ISO 3098.
            </p>
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800">Escalas</h3>
          <div>
            <Label>Escala das Plantas (Arquitetura)</Label>
            <Select
              value={project.drawingQuality.architectureScale ?? ""}
              onChange={e => updateDrawingQuality("architectureScale", e.target.value)}
            >
              <option value="">Selecionar...</option>
              <option value="1:50">1:50</option>
              <option value="1:100">1:100</option>
              <option value="1:200">1:200</option>
            </Select>
          </div>
          <div>
            <Label>Escala dos Pormenores</Label>
            <Select
              value={project.drawingQuality.detailScale ?? ""}
              onChange={e => updateDrawingQuality("detailScale", e.target.value)}
            >
              <option value="">Selecionar...</option>
              <option value="1:5">1:5</option>
              <option value="1:10">1:10</option>
              <option value="1:20">1:20</option>
            </Select>
          </div>
          <div>
            <Label>Escala da Planta de Localização</Label>
            <Select
              value={project.drawingQuality.locationPlanScale ?? ""}
              onChange={e => updateDrawingQuality("locationPlanScale", e.target.value)}
            >
              <option value="">Selecionar...</option>
              <option value="1:1000">1:1000</option>
              <option value="1:2000">1:2000</option>
              <option value="1:5000">1:5000</option>
            </Select>
          </div>
          <div>
            <Label>Nº de Folhas</Label>
            <Input
              type="number"
              value={project.drawingQuality.numberOfSheets ?? ""}
              onChange={e => updateDrawingQuality("numberOfSheets", Number(e.target.value))}
              placeholder="Total de folhas"
            />
          </div>

          <h3 className="md:col-span-2 font-semibold text-gray-800 mt-2">Qualidade Visual</h3>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField
              id="hasCorrectScale"
              label="Escalas adequadas à impressão"
              checked={project.drawingQuality.hasCorrectScaleForPrint}
              onChange={v => updateDrawingQuality("hasCorrectScaleForPrint", v)}
            />
            <CheckboxField
              id="hasConsistentFonts"
              label="Fontes consistentes"
              checked={project.drawingQuality.hasConsistentFonts}
              onChange={v => updateDrawingQuality("hasConsistentFonts", v)}
            />
            <CheckboxField
              id="hasReadableText"
              label="Texto legível na escala"
              checked={project.drawingQuality.hasReadableTextAtScale}
              onChange={v => updateDrawingQuality("hasReadableTextAtScale", v)}
            />
            <CheckboxField
              id="hasStdSymbols"
              label="Simbologia normalizada"
              checked={project.drawingQuality.hasStandardSymbols}
              onChange={v => updateDrawingQuality("hasStandardSymbols", v)}
            />
            <CheckboxField
              id="hasLegendEvery"
              label="Legenda em cada folha c/ símbolos"
              checked={project.drawingQuality.hasLegendOnEverySheet}
              onChange={v => updateDrawingQuality("hasLegendOnEverySheet", v)}
            />
            <CheckboxField
              id="hasNorthArrow"
              label="Indicação do Norte"
              checked={project.drawingQuality.hasNorthArrow}
              onChange={v => updateDrawingQuality("hasNorthArrow", v)}
            />
            <CheckboxField
              id="hasScaleBar"
              label="Escala gráfica (barra)"
              checked={project.drawingQuality.hasScaleBar}
              onChange={v => updateDrawingQuality("hasScaleBar", v)}
            />
            <CheckboxField
              id="hasLineWeights"
              label="Espessuras de linha consistentes"
              checked={project.drawingQuality.hasConsistentLineWeights}
              onChange={v => updateDrawingQuality("hasConsistentLineWeights", v)}
            />
            <CheckboxField
              id="hasDimensioning"
              label="Cotagem completa"
              checked={project.drawingQuality.hasDimensioning}
              onChange={v => updateDrawingQuality("hasDimensioning", v)}
            />
            <CheckboxField
              id="hasTitleBlock"
              label="Carimbo / Legenda nas folhas"
              checked={project.drawingQuality.hasSheetTitleBlock}
              onChange={v => updateDrawingQuality("hasSheetTitleBlock", v)}
            />
          </div>

          <div>
            <Label>Tamanho mínimo de letra (mm)</Label>
            <Input
              type="number"
              step="0.5"
              value={project.drawingQuality.minimumFontSize ?? ""}
              onChange={e => updateDrawingQuality("minimumFontSize", Number(e.target.value))}
              placeholder="Ex: 2.5"
            />
          </div>
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
