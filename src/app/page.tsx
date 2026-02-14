"use client";

import { useState } from "react";
import ProjectForm from "@/components/ProjectForm";
import AnalysisResults from "@/components/AnalysisResults";
import { analyzeProject } from "@/lib/analyzer";
import type { BuildingProject, AnalysisResult } from "@/lib/types";
import { Building, Shield, Zap, ChevronRight } from "lucide-react";

export default function Home() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function handleAnalyze(project: BuildingProject) {
    setIsLoading(true);
    try {
      const analysisResult = analyzeProject(project);
      setResult(analysisResult);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setShowForm(false);
  }

  // Landing page
  if (!showForm && !result) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              Regulamentação Portuguesa de Edifícios
            </div>
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Wallnut
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-2">
              Analise e melhore projetos de edifícios em Portugal
            </p>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Verificação de conformidade com REH, RECS, SCIE, RRAE, DL 163/2006, RGEU e SCE.
              Recomendações de melhoria com base nas melhores práticas e regulamentação em vigor.
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <FeatureCard
              icon={<Zap className="w-8 h-8 text-blue-500" />}
              title="Desempenho Térmico"
              description="Verificação de coeficientes U, fatores solares, ventilação e pontes térmicas conforme o REH e RECS."
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8 text-orange-500" />}
              title="Segurança e Acessibilidade"
              description="Análise de conformidade SCIE (segurança contra incêndio) e DL 163/2006 (acessibilidade)."
            />
            <FeatureCard
              icon={<Building className="w-8 h-8 text-green-500" />}
              title="Certificação Energética"
              description="Estimativa da classe energética e recomendações para melhorar a eficiência do edifício."
            />
          </div>

          {/* CTA */}
          <div className="text-center">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-lg shadow-lg shadow-blue-200"
            >
              Iniciar Análise
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Regulations covered */}
          <div className="mt-16 pt-8 border-t border-gray-200">
            <p className="text-center text-sm text-gray-400 mb-4">Regulamentação abrangida</p>
            <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-500">
              {[
                "REH - Regulamento Energético Habitação",
                "RECS - Regulamento Energético Comércio e Serviços",
                "SCIE - Segurança Contra Incêndio",
                "DL 163/2006 - Acessibilidade",
                "RGEU - Regulamento Geral Edificações Urbanas",
                "SCE - Sistema Certificação Energética",
              ].map(reg => (
                <span key={reg} className="bg-gray-100 px-3 py-1 rounded-full">{reg}</span>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Form or Results view
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            Wallnut
          </button>
          {result && (
            <button
              onClick={() => { setResult(null); setShowForm(true); }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Editar Projeto
            </button>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {result ? (
          <AnalysisResults result={result} onReset={handleReset} />
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Dados do Projeto</h2>
            <ProjectForm onSubmit={handleAnalyze} isLoading={isLoading} />
          </div>
        )}
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="mb-4">{icon}</div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}
