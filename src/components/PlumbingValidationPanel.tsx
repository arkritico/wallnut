"use client";

import { Droplets, CheckCircle, XCircle, AlertTriangle, Info, Download, FileText, Table } from "lucide-react";
import { useState } from "react";
import { generatePlumbingPDF, generatePlumbingExcel, generatePlumbingHTML } from "@/lib/plumbing-report-export";

export interface PlumbingValidationResult {
  rule_id: string;
  status: 'pass' | 'fail' | 'error';
  message: string;
  severity: 'mandatory' | 'recommended' | 'optional';
  category: string;
  value_found?: any;
  value_expected?: any;
  recommendation?: string;
}

interface PlumbingValidationPanelProps {
  results: PlumbingValidationResult[];
  statistics: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    byCategory: Record<string, { passed: number; failed: number }>;
  };
  projectName?: string;
}

export default function PlumbingValidationPanel({
  results,
  statistics,
  projectName = "Projeto"
}: PlumbingValidationPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [showOnlyFailures, setShowOnlyFailures] = useState(true);

  // Export handlers
  const handleExportPDF = () => {
    generatePlumbingPDF({ projectName, results, statistics });
  };

  const handleExportExcel = () => {
    generatePlumbingExcel({ projectName, results, statistics });
  };

  const handleExportHTML = () => {
    generatePlumbingHTML({ projectName, results, statistics });
  };

  // Filter results
  const filteredResults = results.filter(r => {
    if (showOnlyFailures && r.status !== 'fail') return false;
    if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
    return true;
  });

  // Calculate compliance percentage
  const compliancePercent = statistics.total > 0
    ? Math.round((statistics.passed / statistics.total) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="bg-sky-50 rounded-lg p-4 border border-sky-200">
        <div className="flex items-center gap-3 mb-3">
          <Droplets className="w-6 h-6 text-sky-600" />
          <div>
            <h4 className="font-semibold text-sky-900">Validação Hidráulica (RGSPPDADAR)</h4>
            <p className="text-xs text-sky-600">Decreto Regulamentar 23/95 - 100 regras validadas</p>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 text-center border border-sky-100">
            <p className="text-2xl font-bold text-sky-700">{statistics.total}</p>
            <p className="text-xs text-sky-600">Regras Avaliadas</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
            <p className="text-2xl font-bold text-green-700">{statistics.passed}</p>
            <p className="text-xs text-green-600">Conformes</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
            <p className="text-2xl font-bold text-red-700">{statistics.failed}</p>
            <p className="text-xs text-red-600">Não Conformes</p>
          </div>
          <div className="bg-sky-100 rounded-lg p-3 text-center border border-sky-300">
            <p className="text-2xl font-bold text-sky-800">{compliancePercent}%</p>
            <p className="text-xs text-sky-600">Conformidade</p>
          </div>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExportPDF}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium shadow-sm"
        >
          <Download className="w-4 h-4" />
          Exportar PDF
        </button>
        <button
          onClick={handleExportExcel}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"
        >
          <Table className="w-4 h-4" />
          Exportar Excel (CSV)
        </button>
        <button
          onClick={handleExportHTML}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium shadow-sm"
        >
          <FileText className="w-4 h-4" />
          Exportar HTML
        </button>
      </div>

      {/* Category Breakdown */}
      {Object.keys(statistics.byCategory).length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Por Categoria:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {Object.entries(statistics.byCategory).map(([category, counts]) => {
              const total = counts.passed + counts.failed;
              const percent = total > 0 ? Math.round((counts.passed / total) * 100) : 0;
              return (
                <div
                  key={category}
                  className="bg-white rounded-lg p-3 border border-gray-200 hover:border-sky-300 transition-colors cursor-pointer"
                  onClick={() => setSelectedCategory(selectedCategory === category ? 'all' : category)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-medium text-gray-800">{category}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      percent >= 90 ? 'bg-green-100 text-green-700' :
                      percent >= 70 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {percent}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {counts.passed}
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="w-3 h-3 text-red-500" />
                      {counts.failed}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 py-2 border-t border-b border-gray-200">
        <button
          onClick={() => setShowOnlyFailures(!showOnlyFailures)}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
            showOnlyFailures
              ? 'bg-red-100 text-red-700 border border-red-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
          }`}
        >
          {showOnlyFailures ? 'Mostrar apenas não-conformidades' : 'Mostrar todos'}
        </button>
        {selectedCategory !== 'all' && (
          <button
            onClick={() => setSelectedCategory('all')}
            className="text-xs px-3 py-1.5 rounded-full font-medium bg-sky-100 text-sky-700 border border-sky-300 hover:bg-sky-200 transition-colors"
          >
            Categoria: {selectedCategory} ✕
          </button>
        )}
        <span className="text-xs text-gray-500 ml-auto">
          {filteredResults.length} {filteredResults.length === 1 ? 'resultado' : 'resultados'}
        </span>
      </div>

      {/* Results List */}
      <div className="space-y-2">
        {filteredResults.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Info className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">
              {showOnlyFailures
                ? '✅ Nenhuma não-conformidade encontrada!'
                : 'Nenhum resultado para os filtros selecionados.'}
            </p>
          </div>
        ) : (
          filteredResults.map((result, idx) => (
            <ValidationResultCard key={`${result.rule_id}-${idx}`} result={result} />
          ))
        )}
      </div>

      {/* Footer Info */}
      <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
        <p>
          <strong>Regulamento:</strong> RGSPPDADAR - Regulamento Geral dos Sistemas Públicos e Prediais de Distribuição
          de Água e de Drenagem de Águas Residuais (Decreto Regulamentar 23/95)
        </p>
        <p className="mt-1">
          <strong>Abrangência:</strong> Abastecimento de água, drenagem de águas residuais, drenagem de águas pluviais
        </p>
      </div>
    </div>
  );
}

function ValidationResultCard({ result }: { result: PlumbingValidationResult }) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    pass: {
      bg: 'bg-green-50 border-green-200',
      icon: <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />,
      label: 'Conforme',
      textColor: 'text-green-800'
    },
    fail: {
      bg: result.severity === 'mandatory' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200',
      icon: result.severity === 'mandatory'
        ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
        : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
      label: result.severity === 'mandatory' ? 'Não Conforme' : 'Aviso',
      textColor: result.severity === 'mandatory' ? 'text-red-800' : 'text-amber-800'
    },
    error: {
      bg: 'bg-gray-50 border-gray-300',
      icon: <Info className="w-4 h-4 text-gray-500 shrink-0" />,
      label: 'Erro',
      textColor: 'text-gray-800'
    }
  };

  const config = statusConfig[result.status];

  return (
    <div className={`p-3 rounded-lg border ${config.bg}`}>
      <div className="flex items-start gap-2">
        {config.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono px-1.5 py-0.5 bg-white/60 text-gray-700 rounded">
              {result.rule_id}
            </code>
            <span className="text-xs text-gray-500">{result.category}</span>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              result.severity === 'mandatory' ? 'bg-red-100 text-red-700' :
              result.severity === 'recommended' ? 'bg-amber-100 text-amber-700' :
              'bg-accent-medium text-accent'
            }`}>
              {result.severity === 'mandatory' ? 'Obrigatório' :
               result.severity === 'recommended' ? 'Recomendado' : 'Opcional'}
            </span>
          </div>

          <p className={`text-sm mt-1 ${config.textColor}`}>{result.message}</p>

          {(result.value_found !== undefined || result.value_expected !== undefined) && (
            <div className="flex gap-4 mt-2 text-xs">
              {result.value_found !== undefined && (
                <span className="text-gray-600">
                  Encontrado: <strong>{result.value_found}</strong>
                </span>
              )}
              {result.value_expected !== undefined && (
                <span className="text-gray-600">
                  Exigido: <strong>{result.value_expected}</strong>
                </span>
              )}
            </div>
          )}

          {result.recommendation && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-sky-600 hover:text-sky-800 font-medium mt-2 underline"
              >
                {expanded ? 'Ocultar recomendação' : 'Ver recomendação'}
              </button>
              {expanded && (
                <div className="mt-2 p-2 bg-white/60 border border-sky-200 rounded text-xs text-gray-700">
                  <span className="font-semibold text-gray-800">💡 Recomendação: </span>
                  {result.recommendation}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
