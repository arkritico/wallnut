import type { AnalysisResult } from "@/lib/types";
import type { AllCalculations } from "@/lib/calculations";
import type { CoverageReport } from "@/lib/plugins/coverage";
import {
  BarChart3, ClipboardList, AlertCircle,
  Zap, Calculator, Plug, Droplets, Volume2,
} from "lucide-react";
import { AREA_SHORT_LABELS, findDominantSection } from "@/lib/area-metadata";
import Section from "./Section";

export default function TechnicalDetailsPanel({ result, calculations, coverageReport, open, onToggle, onEditProject }: {
  result: AnalysisResult;
  calculations?: AllCalculations | null;
  coverageReport: CoverageReport | null;
  open: boolean;
  onToggle: () => void;
  onEditProject?: (targetSection?: string) => void;
}) {
  return (
    <Section
      title="Detalhes Técnicos"
      id="technical"
      icon={<BarChart3 className="w-5 h-5 text-gray-500" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-6">
        {/* Data Coverage */}
        {result.contextCoverage && result.contextCoverage.total > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-600" />
              Cobertura de Dados ({result.contextCoverage.percentage}%)
            </h4>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      result.contextCoverage.percentage >= 60 ? "bg-green-500" :
                      result.contextCoverage.percentage >= 30 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${result.contextCoverage.percentage}%` }}
                  />
                </div>
              </div>
              <span className={`text-sm font-bold ${
                result.contextCoverage.percentage >= 60 ? "text-green-600" :
                result.contextCoverage.percentage >= 30 ? "text-amber-600" : "text-red-600"
              }`}>
                {result.contextCoverage.populated}/{result.contextCoverage.total}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-accent-light border border-accent rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-accent">{result.contextCoverage.sources.fromForm.length}</p>
                <p className="text-xs text-accent">Formulário</p>
              </div>
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-teal-700">{result.contextCoverage.sources.fromIfc.length}</p>
                <p className="text-xs text-teal-600">IFC</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-700">{result.contextCoverage.sources.fromDefaults.length}</p>
                <p className="text-xs text-gray-600">Predefinições</p>
              </div>
            </div>
            {result.contextCoverage.missingFields.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      {result.contextCoverage.missingFields.length} campos em falta
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {result.contextCoverage.missingFields.slice(0, 8).map(f => (
                        <span key={f} className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">{f}</span>
                      ))}
                      {result.contextCoverage.missingFields.length > 8 && (
                        <span className="text-xs text-amber-500">+{result.contextCoverage.missingFields.length - 8} mais</span>
                      )}
                    </div>
                    {onEditProject && (
                      <button
                        type="button"
                        onClick={() => {
                          const section = findDominantSection(result.contextCoverage!.missingFields);
                          onEditProject(section);
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-xs font-medium"
                      >
                        <ClipboardList className="w-3.5 h-3.5" /> Completar Dados
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rule Evaluation */}
        {result.ruleEvaluation && result.ruleEvaluation.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-600" />
              {(() => {
                const totalEval = result.ruleEvaluation.reduce((s, m) => s + m.evaluatedRules, 0);
                const totalAll = result.ruleEvaluation.reduce((s, m) => s + m.totalRules, 0);
                const pct = totalAll > 0 ? Math.round((totalEval / totalAll) * 100) : 100;
                return `Avaliação de Regras (${totalEval}/${totalAll} — ${pct}%)`;
              })()}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="pb-2 pr-4">Especialidade</th>
                    <th className="pb-2 pr-2 text-right">Total</th>
                    <th className="pb-2 pr-2 text-right">Avaliadas</th>
                    <th className="pb-2 pr-2 text-right">Ignoradas</th>
                    <th className="pb-2 text-right">Cobertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...result.ruleEvaluation]
                    .sort((a, b) => b.totalRules - a.totalRules)
                    .map((m) => (
                      <tr key={m.pluginId} className="hover:bg-gray-50 transition-colors">
                        <td className="py-1.5 pr-4 font-medium text-gray-800">{AREA_SHORT_LABELS[m.area] ?? m.pluginName}</td>
                        <td className="py-1.5 pr-2 text-right text-gray-600 tabular-nums">{m.totalRules}</td>
                        <td className="py-1.5 pr-2 text-right text-green-700 tabular-nums font-medium">{m.evaluatedRules}</td>
                        <td className="py-1.5 pr-2 text-right text-amber-600 tabular-nums">{m.skippedRules > 0 ? m.skippedRules : "-"}</td>
                        <td className="py-1.5 text-right">
                          <span className={`inline-block min-w-[3rem] text-center px-2 py-0.5 rounded text-xs font-bold ${
                            m.coveragePercent >= 75 ? "bg-green-100 text-green-700" :
                            m.coveragePercent >= 40 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                          }`}>
                            {m.coveragePercent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Plugin Coverage */}
        {coverageReport && coverageReport.areas.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-teal-600" />
              Cobertura Regulamentar ({coverageReport.overallCoverageScore}%)
            </h4>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-gray-600">
                {coverageReport.totalPlugins} plugins &middot; {coverageReport.totalRules} regras &middot; {coverageReport.totalRegulations} regulamentos
              </span>
            </div>
            {coverageReport.pendingRegulations.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">
                    {coverageReport.pendingRegulations.length} regulamentos pendentes (sem regras extraídas)
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    {coverageReport.pendingRegulations.slice(0, 5).map(pr => pr.shortRef).join(", ")}
                    {coverageReport.pendingRegulations.length > 5 && <> e mais {coverageReport.pendingRegulations.length - 5}</>}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Technical Calculations */}
        {calculations && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-accent-light rounded-lg p-4 border border-accent">
              <h4 className="font-semibold text-accent mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Desempenho Térmico (REH)
              </h4>
              <div className="space-y-1 text-sm text-accent">
                <p>Nic = <strong>{calculations.thermal.Nic.toFixed(1)}</strong> kWh/m&sup2;.ano (max: {calculations.thermal.Ni.toFixed(1)})</p>
                <p>Nvc = <strong>{calculations.thermal.Nvc.toFixed(1)}</strong> kWh/m&sup2;.ano</p>
                <p>Nac = <strong>{calculations.thermal.Nac.toFixed(1)}</strong> kWh/m&sup2;.ano</p>
                <p>Ntc = <strong>{calculations.thermal.Ntc.toFixed(1)}</strong> | Nt = <strong>{calculations.thermal.Nt.toFixed(1)}</strong></p>
                <p>Ntc/Nt = <strong>{calculations.thermal.ratio.toFixed(2)}</strong></p>
                <p>Perdas totais: <strong>{calculations.thermal.totalHeatLoss.toFixed(0)}</strong> W/&deg;C</p>
                {calculations.thermalMonthly && (
                  <p className="text-xs text-accent mt-1">
                    Método mensal: Nic={calculations.thermalMonthly.annualNic.toFixed(1)} | Nvc={calculations.thermalMonthly.annualNvc.toFixed(1)} kWh/m&sup2;.ano
                  </p>
                )}
                <p className={`font-medium ${calculations.thermal.compliant ? "text-green-700" : "text-red-700"}`}>
                  {calculations.thermal.compliant ? "Conforme" : "Não conforme"} com REH
                </p>
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Classe Energética (SCE)
              </h4>
              <div className="space-y-1 text-sm text-green-800">
                <p>Classe calculada: <strong className="text-2xl">{calculations.energyClass.energyClass}</strong></p>
                <p>Ntc/Nt = <strong>{calculations.energyClass.ratio.toFixed(2)}</strong></p>
                <p className="text-xs text-green-600 mt-2">Baseado em DL 101-D/2020 (método simplificado)</p>
              </div>
            </div>

            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <h4 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                <Volume2 className="w-4 h-4" /> Acústica (RRAE)
              </h4>
              <div className="space-y-1 text-sm text-indigo-800">
                <p>D&apos;nT,w exigido: <strong>&ge; {calculations.acoustic.requiredAirborne} dB</strong> {calculations.acoustic.airborneCompliant ? "\u2713" : "\u2717"}</p>
                <p>L&apos;nT,w exigido: <strong>&le; {calculations.acoustic.requiredImpact} dB</strong> {calculations.acoustic.impactCompliant ? "\u2713" : "\u2717"}</p>
                <p>D2m,nT,w exigido: <strong>&ge; {calculations.acoustic.requiredFacade} dB</strong> {calculations.acoustic.facadeCompliant ? "\u2713" : "\u2717"}</p>
                <p>Ruído equipamentos: <strong>&le; {calculations.acoustic.equipmentNoiseLimit} dB(A)</strong></p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                <Plug className="w-4 h-4" /> Instalação Elétrica (RTIEBT)
              </h4>
              <div className="space-y-1 text-sm text-amber-800">
                <p>Carga total: <strong>{calculations.electrical.totalLoad} kVA</strong></p>
                <p>Alimentação: <strong>{calculations.electrical.recommendedSupply === "three_phase" ? "Trifásica" : "Monofásica"}</strong></p>
                <p>Potência contratada: <strong>{calculations.electrical.recommendedPower} kVA</strong></p>
                <p>Disjuntor geral: <strong>{calculations.electrical.mainBreakerAmps} A</strong></p>
                <p>Circuitos min.: <strong>{calculations.electrical.minCircuits}</strong> | RCDs min.: <strong>{calculations.electrical.minRCDCount}</strong></p>
                <p>Secção cabo: <strong>{calculations.electrical.mainCableSection} mm&sup2;</strong></p>
                {calculations.electrical.needsDGEGApproval && (
                  <p className="text-red-700 font-medium">Requer aprovação DGEG (&gt;41.4 kVA)</p>
                )}
              </div>
            </div>

            <div className="bg-sky-50 rounded-lg p-4 border border-sky-200 md:col-span-2">
              <h4 className="font-semibold text-sky-900 mb-2 flex items-center gap-2">
                <Droplets className="w-4 h-4" /> Dimensionamento Hidráulico (RGSPPDADAR)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-sky-800">
                <p>Caudal simultâneo: <strong>{calculations.waterSizing.simultaneousFlow} L/s</strong></p>
                <p>Ramal principal: <strong>&Oslash;{calculations.waterSizing.mainPipeDiameter} mm</strong></p>
                <p>Ramal AQS: <strong>&Oslash;{calculations.waterSizing.hotWaterPipeDiameter} mm</strong></p>
                <p>Drenagem: <strong>&Oslash;{calculations.waterSizing.drainagePipeDiameter} mm</strong></p>
                <p>Consumo diário: <strong>{calculations.waterSizing.dailyConsumption} L/dia</strong></p>
                {calculations.waterSizing.storageTankSize > 0 && (
                  <p>Reservatório: <strong>{calculations.waterSizing.storageTankSize} L</strong></p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
