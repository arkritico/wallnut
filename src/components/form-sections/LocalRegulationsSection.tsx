/**
 * Local/Municipal section — PDM, water utilities, file uploads, entity consultation.
 * Tier 3: requires custom rendering (file uploads, entity arrays, water utility dropdown).
 */

import { useRef } from "react";
import { Label, Input, Select } from "../form-primitives";
import DynamicFormSection from "../DynamicFormSection";
import type { BuildingProject, LocalRegulationDoc, ConsultedEntity } from "@/lib/types";
import type { FieldMapping } from "@/lib/context-builder";
import { WATER_UTILITY_PROVIDERS, CONSULTATION_ENTITIES } from "@/lib/regulations";

interface LocalRegulationsSectionProps {
  project: BuildingProject;
  setProject: React.Dispatch<React.SetStateAction<BuildingProject>>;
  updateLocalRegulations: (field: string, value: string) => void;
  updateDynamicField: (fieldPath: string, value: unknown) => void;
  dynamicFields?: FieldMapping[];
}

export default function LocalRegulationsSection({
  project,
  setProject,
  updateLocalRegulations,
  updateDynamicField,
  dynamicFields,
}: LocalRegulationsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-accent-light file:text-accent hover:file:bg-accent-medium"
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
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${isAdded ? "bg-green-100 border-green-300 text-green-700" : "bg-white border-gray-300 text-gray-700 hover:bg-accent-light hover:border-accent"}`}
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-accent-light file:text-accent hover:file:bg-accent-medium"
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
        />
      </div>

      {dynamicFields && (
        <div className="md:col-span-2 mt-4 border-t border-gray-200 pt-4">
          <DynamicFormSection
            fields={dynamicFields}
            values={project as unknown as Record<string, unknown>}
            onChange={updateDynamicField}
            pluginName="Campos Adicionais PDM"
            defaultExpanded={false}
          />
        </div>
      )}
    </div>
  );
}
