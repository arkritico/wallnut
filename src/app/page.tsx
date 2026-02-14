"use client";

import { useState } from "react";
import ProjectForm from "@/components/ProjectForm";
import AnalysisResults from "@/components/AnalysisResults";
import { analyzeProject } from "@/lib/analyzer";
import type { BuildingProject, AnalysisResult } from "@/lib/types";
import { Building, Shield, Zap, ChevronRight, Plug, Wifi, Volume2, Fuel, Droplets, Columns3, ArrowUpDown, FileText, Recycle, Ruler, Wind, MapPin } from "lucide-react";

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
              Verificação abrangente de conformidade com Código Civil, RGEU, Eurocódigos, SCIE (com Notas Técnicas), RECS, REH, RRAE, RTIEBT (ISQ/DGEG/E-REDES), ITED/ITUR (ANACOM), DL 521/99, RGSPPDADAR, DL 163/2006, DL 320/2002, RJUE, DL 46/2008 e regulamentação municipal.
              Recomendações de melhoria com base nas melhores práticas e regulamentação em vigor.
            </p>
          </div>

          {/* Features - organized by project specialty hierarchy */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <FeatureCard
              icon={<Ruler className="w-8 h-8 text-teal-600" />}
              title="Arquitetura e Código Civil"
              description="RGEU, Código Civil (Arts. 1344-1425): pé-direito, iluminação, ventilação, estilicídio, propriedade horizontal e partes comuns."
            />
            <FeatureCard
              icon={<Columns3 className="w-8 h-8 text-stone-600" />}
              title="Estruturas / Sísmica"
              description="Verificação de projeto estrutural e sismo-resistente conforme Eurocódigos. Estudo geotécnico e fundações."
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8 text-orange-500" />}
              title="Segurança Contra Incêndio"
              description="SCIE com Notas Técnicas (NT01-NT22 publicadas em DR). Categorias de risco, evacuação, deteção e extintores."
            />
            <FeatureCard
              icon={<Wind className="w-8 h-8 text-cyan-600" />}
              title="AVAC e Qualidade do Ar"
              description="Ventilação, climatização, qualidade do ar interior (RECS/Portaria 353-A), F-Gas, radão e planos de manutenção."
            />
            <FeatureCard
              icon={<Droplets className="w-8 h-8 text-sky-500" />}
              title="Águas e Drenagem"
              description="Abastecimento de água e drenagem conforme RGSPPDADAR: sistema separativo, ventilação, materiais e válvulas."
            />
            <FeatureCard
              icon={<Fuel className="w-8 h-8 text-red-500" />}
              title="Instalações de Gás"
              description="Conformidade DL 521/99: tubagem, ventilação, exaustão, válvulas de emergência e certificação DGEG."
            />
            <FeatureCard
              icon={<Plug className="w-8 h-8 text-amber-600" />}
              title="Instalações Elétricas"
              description="RTIEBT com documentos ISQ, normas E-REDES e DGEG: proteções, terra, diferenciais, circuitos e mobilidade elétrica."
            />
            <FeatureCard
              icon={<Wifi className="w-8 h-8 text-cyan-500" />}
              title="ITED / ITUR"
              description="Telecomunicações com documentos técnicos ANACOM (PET): fibra óptica, par de cobre, coaxial, ATE/ATI e certificação."
            />
            <FeatureCard
              icon={<Zap className="w-8 h-8 text-blue-500" />}
              title="Desempenho Térmico"
              description="Verificação de coeficientes U, fatores solares, ventilação e pontes térmicas conforme o REH e RECS."
            />
            <FeatureCard
              icon={<Volume2 className="w-8 h-8 text-indigo-500" />}
              title="Acústica (RRAE)"
              description="Isolamento a sons aéreos, percussão e fachada. Verificação dos requisitos do Regulamento dos Requisitos Acústicos."
            />
            <FeatureCard
              icon={<Building className="w-8 h-8 text-green-500" />}
              title="Certificação Energética"
              description="Estimativa da classe energética e recomendações para melhorar a eficiência do edifício."
            />
            <FeatureCard
              icon={<ArrowUpDown className="w-8 h-8 text-violet-500" />}
              title="Ascensores"
              description="Conformidade DL 320/2002 e EN 81-20: marcação CE, manutenção, inspeção periódica e acessibilidade."
            />
            <FeatureCard
              icon={<FileText className="w-8 h-8 text-emerald-600" />}
              title="Licenciamento (RJUE)"
              description="Verificação de projetos, termos de responsabilidade, alvarás, licenças e enquadramento urbanístico."
            />
            <FeatureCard
              icon={<Recycle className="w-8 h-8 text-lime-600" />}
              title="Resíduos de Construção"
              description="Gestão de RCD conforme DL 46/2008: PPG, triagem, transporte licenciado, destino e registo e-GAR."
            />
            <FeatureCard
              icon={<MapPin className="w-8 h-8 text-rose-500" />}
              title="Regulamentos Municipais"
              description="Upload de PDM e regulamentação municipal específica. Análise dependente de documentação local carregada."
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
                "Código Civil - Direitos de Propriedade",
                "RGEU - Regulamento Geral Edificações Urbanas",
                "Eurocódigos EC0-EC8 - Estruturas",
                "SCIE - Segurança Contra Incêndio",
                "Notas Técnicas SCIE (NT01-NT22)",
                "RECS - Reg. Energético Comércio/Serviços",
                "Portaria 353-A/2013 - QAI",
                "REH - Regulamento Energético Habitação",
                "RGSPPDADAR - Águas e Drenagem",
                "DL 521/99 - Instalações de Gás",
                "RTIEBT - Instalações Elétricas",
                "Documentos ISQ / E-REDES / DGEG",
                "ITED - Telecomunicações em Edifícios",
                "ITUR - Telecomunicações em Urbanizações",
                "Documentos Técnicos ANACOM (PET)",
                "RRAE - Requisitos Acústicos",
                "DL 163/2006 - Acessibilidade",
                "SCE - Certificação Energética",
                "DL 320/2002 - Ascensores",
                "RJUE - Licenciamento Urbanístico",
                "DL 46/2008 - Resíduos de Construção",
                "EU 517/2014 - Gases Fluorados",
                "DL 108/2018 - Radão",
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
