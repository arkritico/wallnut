"use client";

/**
 * 🚰 Plumbing Rules Browser
 *
 * UI component for browsing, searching, and viewing the 331 plumbing rules
 * from RGSPPDADAR, RT-SCIE, DL 69/2023, EN 806, and EN 12056.
 */

import { useState, useMemo } from "react";
import { Search, Filter, BookOpen, AlertTriangle, Info, CheckCircle } from "lucide-react";

interface PlumbingRule {
  id: string;
  specialty: string;
  category: string;
  subcategory: string;
  reference: string;
  regulation: string;
  article: string;
  rule_text: string;
  parameters: any;
  validation_type: string;
  severity: 'mandatory' | 'recommended' | 'informative';
  error_message: string;
  success_message: string;
  recommendation: string;
  explanation: string;
  metadata: {
    application_scope: string[];
    building_types: string[];
  };
}

interface PlumbingRulesBrowserProps {
  rules: PlumbingRule[];
  onRuleSelect?: (rule: PlumbingRule) => void;
}

export default function PlumbingRulesBrowser({
  rules,
  onRuleSelect,
}: PlumbingRulesBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedRegulation, setSelectedRegulation] = useState<string>("all");
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  // Extract unique categories, severities, and regulations
  const categories = useMemo(() => {
    const cats = new Set(rules.map(r => r.category));
    return ['all', ...Array.from(cats).sort()];
  }, [rules]);

  const regulations = useMemo(() => {
    const regs = new Set(rules.map(r => r.regulation));
    return ['all', ...Array.from(regs).sort()];
  }, [rules]);

  // Filter rules
  const filteredRules = useMemo(() => {
    return rules.filter(rule => {
      // Category filter
      if (selectedCategory !== 'all' && rule.category !== selectedCategory) {
        return false;
      }

      // Severity filter
      if (selectedSeverity !== 'all' && rule.severity !== selectedSeverity) {
        return false;
      }

      // Regulation filter
      if (selectedRegulation !== 'all' && rule.regulation !== selectedRegulation) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          rule.rule_text.toLowerCase().includes(query) ||
          rule.reference.toLowerCase().includes(query) ||
          rule.id.toLowerCase().includes(query) ||
          rule.category.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [rules, searchQuery, selectedCategory, selectedSeverity, selectedRegulation]);

  // Statistics
  const stats = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byRegulation: Record<string, number> = {};

    for (const rule of rules) {
      byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
      bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
      byRegulation[rule.regulation] = (byRegulation[rule.regulation] || 0) + 1;
    }

    return { byCategory, bySeverity, byRegulation };
  }, [rules]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'mandatory':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'recommended':
        return <Info className="w-4 h-4 text-yellow-500" />;
      case 'informative':
        return <BookOpen className="w-4 h-4 text-accent" />;
      default:
        return <CheckCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      mandatory: 'bg-red-100 text-red-800 border-red-200',
      recommended: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      informative: 'bg-accent-medium text-accent border-accent',
    };
    const labels = {
      mandatory: 'Obrigatório',
      recommended: 'Recomendado',
      informative: 'Informativo',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full border ${colors[severity as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
        {labels[severity as keyof typeof labels] || severity}
      </span>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent-medium rounded-lg">
            <BookOpen className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Regulamentos Hidráulicos</h1>
            <p className="text-sm text-gray-600">
              {rules.length} regras de instalações hidráulicas portuguesas
            </p>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">Total de Regras</div>
            <div className="text-2xl font-bold text-gray-900">{rules.length}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">Obrigatórias</div>
            <div className="text-2xl font-bold text-red-600">{stats.bySeverity.mandatory || 0}</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">Recomendadas</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.bySeverity.recommended || 0}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">Categorias</div>
            <div className="text-2xl font-bold text-green-600">{Object.keys(stats.byCategory).length}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Pesquisar regras..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoria
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'Todas' : cat} {cat !== 'all' && `(${stats.byCategory[cat]})`}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Severidade
            </label>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
            >
              <option value="all">Todas</option>
              <option value="mandatory">Obrigatório ({stats.bySeverity.mandatory || 0})</option>
              <option value="recommended">Recomendado ({stats.bySeverity.recommended || 0})</option>
              <option value="informative">Informativo ({stats.bySeverity.informative || 0})</option>
            </select>
          </div>

          {/* Regulation Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Regulamento
            </label>
            <select
              value={selectedRegulation}
              onChange={(e) => setSelectedRegulation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
            >
              {regulations.map(reg => (
                <option key={reg} value={reg}>
                  {reg === 'all' ? 'Todos' : reg} {reg !== 'all' && `(${stats.byRegulation[reg]})`}
                </option>
              ))}
            </select>
          </div>

          {/* Results count */}
          <div className="flex items-end">
            <div className="text-sm text-gray-600">
              {filteredRules.length} resultado{filteredRules.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {filteredRules.map(rule => (
          <div
            key={rule.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            <div
              className="p-4 cursor-pointer"
              onClick={() => {
                setExpandedRuleId(expandedRuleId === rule.id ? null : rule.id);
                onRuleSelect?.(rule);
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getSeverityIcon(rule.severity)}
                    <span className="text-xs font-mono text-gray-500">{rule.id}</span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-600">{rule.reference}</span>
                  </div>
                  <h3 className="text-base font-medium text-gray-900 mb-2">
                    {rule.rule_text}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {getSeverityBadge(rule.severity)}
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                      {rule.category}
                    </span>
                    <span className="px-2 py-1 text-xs rounded-full bg-accent-light text-accent border border-accent">
                      {rule.regulation}
                    </span>
                    <span className="px-2 py-1 text-xs rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      {rule.validation_type}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedRuleId === rule.id && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Subcategoria</div>
                    <div className="text-sm text-gray-600">{rule.subcategory}</div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Explicação</div>
                    <div className="text-sm text-gray-600">{rule.explanation}</div>
                  </div>

                  {rule.parameters && Object.keys(rule.parameters).length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Parâmetros</div>
                      <div className="text-sm text-gray-600 font-mono bg-gray-50 rounded p-2">
                        {JSON.stringify(rule.parameters, null, 2)}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Recomendação</div>
                    <div className="text-sm text-gray-600">{rule.recommendation}</div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Âmbito de Aplicação</div>
                    <div className="flex flex-wrap gap-1">
                      {rule.metadata.application_scope.map((scope, idx) => (
                        <span key={idx} className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Tipos de Edifício</div>
                    <div className="flex flex-wrap gap-1">
                      {rule.metadata.building_types.map((type, idx) => (
                        <span key={idx} className="px-2 py-1 text-xs rounded bg-green-50 text-green-700">
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* No Results */}
      {filteredRules.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhuma regra encontrada
          </h3>
          <p className="text-gray-600">
            Tente ajustar os filtros ou termo de pesquisa
          </p>
        </div>
      )}
    </div>
  );
}
