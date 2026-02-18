/**
 * General section — project name, building type, location, dimensions.
 * Tier 3: requires custom rendering (district dropdown with climate auto-update,
 * computed disabled fields, rehabilitation checkbox).
 */

import { Label, Input, Select } from "../form-primitives";
import DynamicFormSection from "../DynamicFormSection";
import type { BuildingProject, BuildingType } from "@/lib/types";
import type { FieldMapping } from "@/lib/context-builder";
import type { Translations } from "@/lib/i18n";
import { PORTUGAL_DISTRICTS } from "@/lib/regulations";

interface GeneralSectionProps {
  project: BuildingProject;
  updateField: <K extends keyof BuildingProject>(key: K, value: BuildingProject[K]) => void;
  updateLocation: (field: string, value: string | number) => void;
  updateDynamicField: (fieldPath: string, value: unknown) => void;
  dynamicFields?: FieldMapping[];
  t: Translations;
}

export default function GeneralSection({
  project,
  updateField,
  updateLocation,
  updateDynamicField,
  dynamicFields,
  t,
}: GeneralSectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <Label htmlFor="project-name">{t.projectName}</Label>
        <Input
          id="project-name"
          value={project.name}
          onChange={e => updateField("name", e.target.value)}
          placeholder={t.projectNamePlaceholder}
          required
          aria-required="true"
        />
      </div>

      <div>
        <Label htmlFor="building-type">{t.buildingType}</Label>
        <Select
          id="building-type"
          value={project.buildingType}
          onChange={e => updateField("buildingType", e.target.value as BuildingType)}
        >
          <option value="residential">{t.residential}</option>
          <option value="commercial">{t.commercial}</option>
          <option value="mixed">{t.mixed}</option>
          <option value="industrial">{t.industrial}</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="district">{t.district}</Label>
        <Select
          id="district"
          value={project.location.district}
          onChange={e => {
            updateLocation("district", e.target.value);
            updateLocation("municipality", e.target.value);
          }}
        >
          <option value="">Selecionar distrito...</option>
          {PORTUGAL_DISTRICTS.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="municipality">{t.municipality}</Label>
        <Input
          id="municipality"
          value={project.location.municipality}
          onChange={e => updateLocation("municipality", e.target.value)}
          placeholder="Ex: Lisboa, Sintra, Cascais..."
        />
      </div>

      <div>
        <Label htmlFor="parish">{t.parish}</Label>
        <Input
          id="parish"
          value={project.location.parish ?? ""}
          onChange={e => updateLocation("parish", e.target.value)}
          placeholder="Ex: Estrela, Belém, Ajuda..."
        />
      </div>

      <div>
        <Label htmlFor="latitude">{t.latitude}</Label>
        <Input
          id="latitude"
          type="number"
          step="0.000001"
          value={project.location.latitude ?? ""}
          onChange={e => updateLocation("latitude", Number(e.target.value))}
          placeholder="Ex: 38.7223"
        />
      </div>

      <div>
        <Label htmlFor="longitude">{t.longitude}</Label>
        <Input
          id="longitude"
          type="number"
          step="0.000001"
          value={project.location.longitude ?? ""}
          onChange={e => updateLocation("longitude", Number(e.target.value))}
          placeholder="Ex: -9.1393"
        />
      </div>

      <div>
        <Label>Zona Climática Inverno</Label>
        <Input value={project.location.climateZoneWinter} disabled aria-label="Zona Climática Inverno" />
      </div>

      <div>
        <Label>Zona Climática Verão</Label>
        <Input value={project.location.climateZoneSummer} disabled aria-label="Zona Climática Verão" />
      </div>

      <div>
        <Label htmlFor="altitude">{t.altitude}</Label>
        <Input
          id="altitude"
          type="number"
          value={project.location.altitude}
          onChange={e => updateLocation("altitude", Number(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="distanceToCoast">{t.distanceToCoast}</Label>
        <Input
          id="distanceToCoast"
          type="number"
          value={project.location.distanceToCoast}
          onChange={e => updateLocation("distanceToCoast", Number(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="grossArea">{t.grossArea}</Label>
        <Input
          id="grossArea"
          type="number"
          value={project.grossFloorArea}
          onChange={e => updateField("grossFloorArea", Number(e.target.value))}
          required
          aria-required="true"
        />
      </div>

      <div>
        <Label htmlFor="usableArea">{t.usableArea}</Label>
        <Input
          id="usableArea"
          type="number"
          value={project.usableFloorArea}
          onChange={e => updateField("usableFloorArea", Number(e.target.value))}
          required
          aria-required="true"
        />
      </div>

      <div>
        <Label htmlFor="numberOfFloors">{t.numberOfFloors}</Label>
        <Input
          id="numberOfFloors"
          type="number"
          value={project.numberOfFloors}
          onChange={e => updateField("numberOfFloors", Number(e.target.value))}
          min={1}
          required
          aria-required="true"
        />
      </div>

      <div>
        <Label htmlFor="buildingHeight">{t.buildingHeight}</Label>
        <Input
          id="buildingHeight"
          type="number"
          step="0.1"
          value={project.buildingHeight}
          onChange={e => updateField("buildingHeight", Number(e.target.value))}
          required
          aria-required="true"
        />
      </div>

      <div>
        <Label htmlFor="numberOfDwellings">{t.numberOfDwellings}</Label>
        <Input
          id="numberOfDwellings"
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
          {t.rehabilitation}
        </label>
      </div>

      {dynamicFields && (
        <div className="md:col-span-2 mt-4 border-t border-gray-200 pt-4">
          <DynamicFormSection
            fields={dynamicFields}
            values={project as unknown as Record<string, unknown>}
            onChange={updateDynamicField}
            pluginName="Campos Adicionais RGEU"
            defaultExpanded={false}
          />
        </div>
      )}
    </div>
  );
}
