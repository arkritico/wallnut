import type { AnalysisResult } from "@/lib/types";
import { XCircle, AlertTriangle, CheckCircle, Download } from "lucide-react";
import { useI18n } from "@/lib/i18n";

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-500" : "text-red-500";
  const bgColor = score >= 80 ? "bg-green-50" : score >= 60 ? "bg-amber-50" : "bg-red-50";
  return (
    <div className={`w-20 h-20 rounded-full ${bgColor} flex flex-col items-center justify-center`}>
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-gray-500">/100</span>
    </div>
  );
}

function EnergyClassBadge({ energyClass }: { energyClass: string }) {
  const colors: Record<string, string> = {
    "A+": "bg-green-700 text-white",
    A: "bg-green-600 text-white",
    B: "bg-green-500 text-white",
    "B-": "bg-yellow-400 text-gray-900",
    C: "bg-yellow-500 text-gray-900",
    D: "bg-orange-400 text-white",
    E: "bg-orange-500 text-white",
    F: "bg-red-600 text-white",
  };
  return (
    <div className="text-center">
      <div className={`inline-block px-4 py-2 rounded-lg font-bold text-2xl ${colors[energyClass] ?? "bg-gray-400 text-white"}`}>
        {energyClass}
      </div>
      <p className="text-xs text-gray-500 mt-1">Classe Energética</p>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const bgMap: Record<string, string> = { red: "bg-red-50", amber: "bg-amber-50", green: "bg-green-50" };
  return (
    <div className={`${bgMap[color] ?? "bg-gray-50"} rounded-lg p-4 text-center`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

export default function HeroSummary({ result, narrative, criticalCount, warningCount, passCount, isExporting, onQuickPDF }: {
  result: AnalysisResult;
  narrative: string;
  criticalCount: number;
  warningCount: number;
  passCount: number;
  isExporting: boolean;
  onQuickPDF: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{result.projectName}</h2>
          <p className="text-3xl font-bold mt-2">
            <span className={result.overallScore >= 80 ? "text-green-600" : result.overallScore >= 60 ? "text-amber-600" : "text-red-600"}>
              {result.overallScore}%
            </span>
            <span className="text-lg font-medium text-gray-500 ml-2">conforme</span>
          </p>
          <p className="text-sm text-gray-600 mt-3 leading-relaxed max-w-2xl">{narrative}</p>
        </div>
        <div className="flex items-center gap-4">
          <ScoreCircle score={result.overallScore} />
          <EnergyClassBadge energyClass={result.energyClass} />
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end gap-4 mt-6">
        <div className="grid grid-cols-3 gap-4 flex-1">
          <StatCard icon={<XCircle className="w-5 h-5 text-red-500" />} label={t.nonCompliant} value={criticalCount} color="red" />
          <StatCard icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} label={t.warnings} value={warningCount} color="amber" />
          <StatCard icon={<CheckCircle className="w-5 h-5 text-green-500" />} label={t.compliant} value={passCount} color="green" />
        </div>
        <button
          onClick={onQuickPDF}
          disabled={isExporting}
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium shadow-sm disabled:opacity-50 whitespace-nowrap"
        >
          <Download className="w-5 h-5" />
          {isExporting ? "A gerar..." : "Relatório PDF"}
        </button>
      </div>
    </div>
  );
}
