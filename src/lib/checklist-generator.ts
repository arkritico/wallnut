/**
 * Per-specialty checklist generator for on-site verification.
 * Generates printable checklists based on the project's regulation analysis,
 * specific to the utilization type, risk category, and location.
 */

import type { BuildingProject, AnalysisResult, Finding, RegulationArea } from "./types";

export interface ChecklistItem {
  id: string;
  description: string;
  regulation: string;
  article: string;
  critical: boolean;
  checked: boolean;
  notes: string;
}

export interface Checklist {
  specialty: RegulationArea;
  title: string;
  subtitle: string;
  projectName: string;
  date: string;
  items: ChecklistItem[];
  relatedFindings: Finding[];
}

const SPECIALTY_CHECKLISTS: Record<string, (project: BuildingProject) => ChecklistItem[]> = {
  architecture: (p) => {
    const items: ChecklistItem[] = [
      ci("Pé-direito útil >= 2.40m (quartos) / 2.20m (cozinha/WC)", "RGEU", "Art. 65.º", true),
      ci("Iluminação natural nos compartimentos principais", "RGEU", "Art. 71.º", true),
      ci("Ventilação natural ou mecânica adequada", "RGEU", "Art. 73.º", true),
      ci("Área mínima de compartimentos: sala >= 10m², quartos >= 6.5m²", "RGEU", "Art. 66.º", false),
      ci("Cozinha com ventilação independente", "RGEU", "Art. 73.º", false),
      ci("WC com ventilação (natural ou mecânica)", "RGEU", "Art. 73.º", false),
    ];
    if (p.architecture.isHorizontalProperty) {
      items.push(ci("Partes comuns delimitadas e conformes (Art. 1421.º CC)", "Código Civil", "Art. 1421.º", true));
      items.push(ci("Titulo constitutivo da propriedade horizontal", "Código Civil", "Art. 1418.º", true));
    }
    if (p.architecture.windowDistanceToNeighbor !== undefined) {
      items.push(ci("Distância de janelas ao limite do prédio vizinho >= 1.5m", "Código Civil", "Art. 1360.º", true));
    }
    items.push(ci("Estilicídio - águas pluviais não caem em prédio vizinho", "Código Civil", "Art. 1365.º", false));
    return items;
  },

  fire_safety: (p) => {
    const items: ChecklistItem[] = [
      ci("Classificação de utilização-tipo correta", "SCIE", "DL 220/2008, Art. 8.º", true),
      ci("Categoria de risco determinada e validada", "SCIE", "DL 220/2008, Art. 12.º", true),
      ci("Vias de evacuação com largura regulamentar", "SCIE", "NT 04", true),
      ci("Sinalização de emergência instalada e visível", "SCIE", "NT 11", true),
      ci("Iluminação de emergência funcional", "SCIE", "NT 12", true),
      ci("Extintores em número e tipo adequado", "SCIE", "NT 13", true),
    ];
    if (parseInt(p.fireSafety.riskCategory) >= 2) {
      items.push(ci("Sistema automático de deteção de incêndio (SADI)", "SCIE", "NT 14", true));
      items.push(ci("Sistema de alarme centralizado", "SCIE", "NT 15", true));
    }
    if (parseInt(p.fireSafety.riskCategory) >= 3 || p.fireSafety.hasSprinklers) {
      items.push(ci("Rede de sprinklers conforme NFPA/EN", "SCIE", "NT 16", true));
    }
    items.push(ci("Resistência ao fogo da estrutura (REI " + p.fireSafety.fireResistanceOfStructure + ")", "SCIE", "Art. 15.º", true));
    items.push(ci("Distância máxima de evacuação verificada", "SCIE", "NT 04", true));
    items.push(ci("Número de saídas adequado à lotação", "SCIE", "NT 04", false));
    items.push(ci("Reação ao fogo dos materiais de revestimento", "SCIE", "Art. 16.º", false));
    items.push(ci("Registos de manutenção dos equipamentos SCIE", "SCIE", "Art. 29.º", false));
    items.push(ci("Plano de segurança interna (PSI) existente", "SCIE", "Art. 21.º", p.fireSafety.riskCategory !== "1"));
    return items;
  },

  electrical: (p) => {
    const items: ChecklistItem[] = [
      ci("Quadro elétrico com identificação dos circuitos", "RTIEBT", "Secção 514", true),
      ci("Disjuntor geral com calibre adequado", "RTIEBT", "Secção 433", true),
      ci("Diferencial(is) com sensibilidade 30mA", "RTIEBT", "Secção 531", true),
      ci("Terra de proteção com Rt <= 100 Ohm", "RTIEBT", "Secção 542", true),
      ci("Ligações equipotenciais nas I.S.", "RTIEBT", "Secção 415", true),
      ci("Zonas 0-3 das casas de banho respeitadas", "RTIEBT", "Secção 701", true),
      ci("Secção dos condutores adequada aos circuitos", "RTIEBT", "Secção 523", true),
      ci("Proteção contra sobretensões (SPD)", "RTIEBT", "Secção 534", false),
      ci("Circuitos de iluminação separados das tomadas", "RTIEBT", "Secção 314", false),
      ci("Circuitos dedicados para equipamentos pesados", "RTIEBT", "Secção 314", false),
      ci("Esquema unifilar atualizado e afixado", "RTIEBT", "Secção 514", true),
      ci("Proteção IP adequada em instalações exteriores", "RTIEBT", "Secção 512", false),
    ];
    if (p.electrical.hasEVCharging) {
      items.push(ci("Ponto de carregamento VE conforme DL 39/2010", "RTIEBT", "DL 39/2010", false));
    }
    return items;
  },

  thermal: (p) => {
    const items: ChecklistItem[] = [
      ci("Coeficientes U das paredes exteriores conformes ao REH", "REH", "DL 118/2013, Anexo", true),
      ci("Coeficientes U da cobertura conforme ao REH", "REH", "DL 118/2013, Anexo", true),
      ci("Coeficientes U dos vãos envidraçados conformes", "REH", "DL 118/2013, Anexo", true),
      ci("Fator solar dos vãos envidraçados verificado", "REH", "Desp. 15793-K/2013", true),
      ci("Pontes térmicas lineares tratadas/minimizadas", "REH", "Desp. 15793-K/2013", true),
      ci("Ventilação conforme (RPH >= 0.4 h⁻¹)", "REH", "Desp. 15793-K/2013", true),
      ci("Nic <= Ni (necessidades aquecimento)", "REH", "Art. 7.º", true),
      ci("Nvc <= Nv (necessidades arrefecimento)", "REH", "Art. 7.º", true),
      ci("Ntc/Nt <= 1 (energia primária)", "REH", "Art. 7.º", true),
      ci("Sistema solar térmico ou alternativa", "REH", "Art. 27.º", p.buildingType === "residential"),
      ci("Certificado energético SCE emitido", "SCE", "DL 118/2013", true),
    ];
    return items;
  },

  acoustic: () => [
    ci("D'nT,w entre frações >= 50 dB", "RRAE", "DL 129/2002, Anexo", true),
    ci("L'nT,w entre pisos <= 60 dB", "RRAE", "DL 129/2002, Anexo", true),
    ci("D2m,nT,w de fachada >= 28-33 dB (zona)", "RRAE", "DL 129/2002, Anexo", true),
    ci("Ruído de equipamentos coletivos controlado", "RRAE", "DL 129/2002, Art. 6.º", false),
    ci("Ensaio acústico in situ realizado", "RRAE", "DL 129/2002, Art. 8.º", true),
    ci("Projeto de condicionamento acústico aprovado", "RRAE", "DL 129/2002", false),
  ],

  accessibility: (p) => {
    const items: ChecklistItem[] = [
      ci("Entrada principal acessível (sem degrau ou com rampa)", "Acessibilidade", "DL 163/2006, Art. 2.º", true),
      ci("Largura de portas >= 0.87m", "Acessibilidade", "DL 163/2006, Sec. 4.9", true),
      ci("Largura de corredores >= 1.20m", "Acessibilidade", "DL 163/2006, Sec. 4.3", true),
    ];
    if (p.numberOfFloors > 1) {
      items.push(ci("Ascensor acessível (cabina >= 1.1x1.4m)", "Acessibilidade", "DL 163/2006, Sec. 4.5", true));
    }
    items.push(ci("I.S. acessível com dimensões regulamentares", "Acessibilidade", "DL 163/2006, Sec. 4.7", true));
    items.push(ci("Lugar(es) de estacionamento acessível", "Acessibilidade", "DL 163/2006, Sec. 4.1", false));
    if (p.buildingType === "commercial") {
      items.push(ci("Balcão de atendimento com zona rebaixada", "Acessibilidade", "DL 163/2006, Sec. 4.8", false));
    }
    return items;
  },

  water_drainage: () => [
    ci("Ligação à rede pública de abastecimento", "RGSPPDADAR", "DL 23/95, Art. 21.º", true),
    ci("Contador individual instalado", "RGSPPDADAR", "DL 23/95, Art. 82.º", true),
    ci("Válvula anti-retorno na ligação", "RGSPPDADAR", "DL 23/95, Art. 93.º", true),
    ci("Rede de drenagem separativa (pluvial/residual)", "RGSPPDADAR", "DL 23/95, Art. 116.º", true),
    ci("Ventilação da rede de drenagem", "RGSPPDADAR", "DL 23/95, Art. 134.º", true),
    ci("Sifões em todos os aparelhos sanitários", "RGSPPDADAR", "DL 23/95, Art. 222.º", true),
    ci("Dimensionamento das tubagens verificado", "RGSPPDADAR", "DL 23/95, Art. 91.º", true),
    ci("Redutor de pressão instalado (se > 600 kPa)", "RGSPPDADAR", "DL 23/95, Art. 95.º", false),
    ci("Caixa de gorduras (espaços comerciais)", "RGSPPDADAR", "DL 23/95, Art. 230.º", false),
  ],

  telecommunications: (p) => {
    const items: ChecklistItem[] = [
      ci("ATE (Armário Telecom. Edifício) instalado", "ITED", "4ª Ed., Cap. 3", p.numberOfFloors > 1),
      ci("ATI (Armário Telecom. Individual) por fração", "ITED", "4ª Ed., Cap. 3", true),
      ci("Cablagem de par de cobre Cat. 6 ou superior", "ITED", "4ª Ed., Cap. 4", true),
      ci("Fibra óptica monomodo instalada", "ITED", "4ª Ed., Cap. 4", true),
      ci("Tomadas RJ45 em número adequado", "ITED", "4ª Ed., Cap. 5", true),
      ci("Tubagem individual até cada fração", "ITED", "4ª Ed., Cap. 3", true),
      ci("Certificação ITED por instalador credenciado", "ITED", "4ª Ed., Cap. 8", true),
    ];
    if (p.telecommunications.isUrbanization) {
      items.push(ci("Projeto ITUR aprovado", "ITUR", "4ª Ed.", true));
      items.push(ci("Infraestrutura subterrânea de telecomunicações", "ITUR", "4ª Ed.", true));
    }
    return items;
  },

  structural: () => [
    ci("Projeto de estabilidade aprovado", "Eurocódigos", "EC0/EC1", true),
    ci("Estudo geotécnico realizado", "Eurocódigos", "EC7", true),
    ci("Ação sísmica considerada no dimensionamento", "Eurocódigos", "EC8, NA", true),
    ci("Classe de ductilidade apropriada", "Eurocódigos", "EC8, Cap. 5", true),
    ci("Fundações dimensionadas para o tipo de solo", "Eurocódigos", "EC7", true),
    ci("Armaduras e cofragens conforme projeto", "Eurocódigos", "EC2", true),
    ci("Ensaios de betão/aço realizados", "Eurocódigos", "NP EN 206", false),
  ],

  gas: (p) => {
    if (!p.gas.hasGasInstallation) return [];
    return [
      ci("Projeto de gás aprovado", "Gás", "DL 521/99, Art. 5.º", true),
      ci("Instalador credenciado pela DGEG", "Gás", "DL 521/99, Art. 12.º", true),
      ci("Ensaio de estanquidade realizado", "Gás", "DL 521/99, Art. 8.º", true),
      ci("Detetor de gás instalado", "Gás", "DL 521/99, Art. 15.º", true),
      ci("Válvula de corte de emergência acessível", "Gás", "DL 521/99, Art. 13.º", true),
      ci("Ventilação dos locais com aparelhos a gás", "Gás", "DL 521/99, Art. 14.º", true),
      ci("Sistema de exaustão / chaminé conforme", "Gás", "DL 521/99, Art. 16.º", true),
      ci("Certificação da instalação de gás", "Gás", "DL 521/99, Art. 9.º", true),
    ];
  },

  licensing: () => [
    ci("Projeto de arquitetura completo e assinado", "RJUE", "DL 555/99, Art. 11.º", true),
    ci("Projetos de especialidades entregues", "RJUE", "DL 555/99, Art. 11.º", true),
    ci("Termos de responsabilidade assinados", "RJUE", "DL 555/99, Art. 10.º", true),
    ci("Ficha de segurança contra incêndio ou projeto SCIE", "RJUE", "Port. 1532/2008", true),
    ci("Declaração de acessibilidades", "RJUE", "DL 163/2006", true),
    ci("Certificado energético (SCE) ou pré-certificado", "RJUE", "DL 118/2013", true),
    ci("Diretor de obra/fiscalização nomeado", "RJUE", "DL 555/99, Art. 63.º", true),
    ci("Livro de obra disponível em obra", "RJUE", "Port. 1268/2008", true),
  ],

  waste: () => [
    ci("Plano de Prevenção e Gestão de RCD elaborado", "RCD", "DL 46/2008, Art. 10.º", true),
    ci("Triagem de resíduos em obra organizada", "RCD", "DL 46/2008, Art. 9.º", true),
    ci("Transportador licenciado contratado", "RCD", "DL 46/2008, Art. 12.º", true),
    ci("Destino final licenciado identificado", "RCD", "DL 46/2008, Art. 12.º", true),
    ci("Registo em plataforma eletrónica (e-GAR)", "RCD", "DL 46/2008, Art. 13.º", true),
    ci("Meta de reciclagem >= 70%", "RCD", "DL 46/2008, Art. 7.º", false),
  ],
};

function ci(description: string, regulation: string, article: string, critical: boolean): ChecklistItem {
  return { id: crypto.randomUUID(), description, regulation, article, critical, checked: false, notes: "" };
}

/**
 * Generate checklists for all relevant specialties based on the project.
 */
export function generateChecklists(
  project: BuildingProject,
  analysisResult?: AnalysisResult,
): Checklist[] {
  const checklists: Checklist[] = [];

  const specialties: { area: RegulationArea; title: string }[] = [
    { area: "architecture", title: "Arquitetura e Código Civil" },
    { area: "structural", title: "Estruturas" },
    { area: "fire_safety", title: "Segurança Contra Incêndio (SCIE)" },
    { area: "thermal", title: "Desempenho Térmico (REH)" },
    { area: "acoustic", title: "Acústica (RRAE)" },
    { area: "electrical", title: "Instalações Elétricas (RTIEBT)" },
    { area: "water_drainage", title: "Águas e Drenagem (RGSPPDADAR)" },
    { area: "gas", title: "Instalações de Gás" },
    { area: "telecommunications", title: "Telecomunicações (ITED/ITUR)" },
    { area: "accessibility", title: "Acessibilidades (DL 163/2006)" },
    { area: "licensing", title: "Licenciamento (RJUE)" },
    { area: "waste", title: "Resíduos de Construção (RCD)" },
  ];

  for (const { area, title } of specialties) {
    const generator = SPECIALTY_CHECKLISTS[area];
    if (!generator) continue;

    const items = generator(project);
    if (items.length === 0) continue;

    const relatedFindings = analysisResult?.findings.filter(f => f.area === area) ?? [];

    checklists.push({
      specialty: area,
      title,
      subtitle: `${project.name} - ${project.location.municipality}`,
      projectName: project.name,
      date: new Date().toLocaleDateString("pt-PT"),
      items,
      relatedFindings,
    });
  }

  return checklists;
}

/**
 * Generate a single specialty checklist.
 */
export function generateChecklistForArea(
  area: RegulationArea,
  project: BuildingProject,
  analysisResult?: AnalysisResult,
): Checklist | null {
  const all = generateChecklists(project, analysisResult);
  return all.find(c => c.specialty === area) ?? null;
}
