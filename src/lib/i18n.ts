/**
 * Internationalization (i18n) for Wallnut.
 * Supports Portuguese (default) and English.
 */

"use client";

import { createContext, useContext } from "react";

export type Language = "pt" | "en";

export interface Translations {
  // App
  appName: string;
  appSubtitle: string;
  appDescription: string;
  regulationsCovered: string;

  // Navigation
  startAnalysis: string;
  newAnalysis: string;
  editProject: string;
  dashboard: string;
  back: string;
  settings: string;

  // Dashboard
  myProjects: string;
  createNewProject: string;
  noProjects: string;
  lastModified: string;
  deleteProject: string;
  openProject: string;
  confirmDelete: string;

  // Form
  projectData: string;
  projectName: string;
  projectNamePlaceholder: string;
  buildingType: string;
  residential: string;
  commercial: string;
  mixed: string;
  industrial: string;
  district: string;
  municipality: string;
  parish: string;
  latitude: string;
  longitude: string;
  altitude: string;
  distanceToCoast: string;
  grossArea: string;
  usableArea: string;
  numberOfFloors: string;
  buildingHeight: string;
  numberOfDwellings: string;
  rehabilitation: string;
  analyze: string;
  analyzing: string;

  // Sections
  context: string;
  general: string;
  architecture: string;
  structural: string;
  fireSafety: string;
  avac: string;
  water: string;
  gas: string;
  electrical: string;
  telecom: string;
  envelope: string;
  systems: string;
  acoustic: string;
  accessibility: string;
  elevators: string;
  licensing: string;
  waste: string;
  drawings: string;
  municipal: string;

  // Context section
  contextDescription: string;
  projectDescription: string;
  projectDescriptionPlaceholder: string;
  specificConcerns: string;
  specificConcernsPlaceholder: string;
  projectQuestions: string;
  addQuestion: string;
  removeQuestion: string;
  questionPlaceholder: string;

  // Results
  analysisReport: string;
  nonCompliant: string;
  warnings: string;
  compliant: string;
  regulationSummary: string;
  findings: string;
  recommendations: string;
  critical: string;
  warning: string;
  info: string;
  pass: string;
  current: string;
  required: string;
  highImpact: string;
  mediumImpact: string;
  lowImpact: string;
  estimatedSavings: string;
  regulatoryBasis: string;
  exportPDF: string;
  exportExcel: string;
  printReport: string;

  // Licensing
  projectPhase: string;
  processType: string;
  submissionDate: string;
  legalDeadline: string;
  expectedDate: string;
  silenceEffect: string;
  tacitApproval: string;
  canStartWorks: string;
  hasPIPResponse: string;
  pipSummary: string;

  // Municipal
  waterUtilityProvider: string;
  pdmZoning: string;
  pdmNotes: string;
  entitiesToConsult: string;
  uploadWaterRegulation: string;
  uploadMunicipalDoc: string;
  pending: string;
  approved: string;
  approvedConditions: string;
  rejected: string;
  noResponse: string;
  remove: string;

  // Drawings
  drawingsDescription: string;
  scales: string;
  architectureScale: string;
  detailScale: string;
  locationPlanScale: string;
  numberOfSheets: string;
  visualQuality: string;
  correctScales: string;
  consistentFonts: string;
  readableText: string;
  standardSymbols: string;
  legendEverySheet: string;
  northArrow: string;
  scaleBar: string;
  lineWeights: string;
  dimensioning: string;
  titleBlock: string;
  minimumFontSize: string;

  // Energy
  energyClass: string;

  // Templates
  templateMoradiaT3: string;
  templateMoradiaT3Desc: string;
  templateApartamentoT2: string;
  templateApartamentoT2Desc: string;
  templateLojaComercial: string;
  templateLojaComercialDesc: string;
  templateMultifamiliar: string;
  templateMultifamiliarDesc: string;
  templateReabilitacao: string;
  templateReabilitacaoDesc: string;

  // Wizard
  wizardTitle: string;
  useTemplate: string;
  uploadDocument: string;
  startFromScratch: string;
  continueToForm: string;
  basicData: string;
  reviewData: string;
  autoFilledFromDoc: string;
  basedOnTemplate: string;
  dataExtractedFrom: string;

  // Auth
  signIn: string;
  signOut: string;
  createAccount: string;
  cloudSync: string;

  // ZIP upload
  uploadZip: string;
  uploadZipDesc: string;
  documentChecklist: string;
  filesFound: string;
  complete: string;
  mandatoryMissing: string;

  // Cost / Schedule toggles
  costEstimation: string;
  projectPlanning: string;
  additionalModules: string;

  // Collaboration
  collaboration: string;
  members: string;
  addMember: string;
  removeMember: string;
  roleOwner: string;
  roleReviewer: string;
  roleViewer: string;
  inviteMemberEmail: string;
  memberAdded: string;
  memberRemoved: string;
  comments: string;
  addComment: string;
  commentPlaceholder: string;
  resolve: string;
  resolved: string;
  unresolve: string;
  history: string;
  changeHistory: string;
  projectCreated: string;
  projectUpdated: string;
  projectAnalyzed: string;
  memberInvited: string;
  commentAdded: string;
  sharedWith: string;
  noComments: string;
  noHistory: string;
  allComments: string;
  onlyUnresolved: string;
  userNotFound: string;

  // Auth
  onlyWallnutEmails: string;
  twoFactorRequired: string;

  // Landing page
  heroHeadline: string;
  heroSubline: string;
  inputFormats: string;
  inputFormatsDesc: string;
  capCostTitle: string;
  capCostDesc: string;
  capScheduleTitle: string;
  capScheduleDesc: string;
  capComplianceTitle: string;
  capComplianceDesc: string;

  // Earned Value Management
  evmTitle: string;
  evmBaseline: string;
  evmCaptureBaseline: string;
  evmDataDate: string;
  evmPlannedValue: string;
  evmEarnedValue: string;
  evmActualCost: string;
  evmScheduleVariance: string;
  evmCostVariance: string;
  evmSpi: string;
  evmCpi: string;
  evmBac: string;
  evmEac: string;
  evmEtc: string;
  evmVac: string;
  evmTcpi: string;
  evmHealth: string;
  evmOnTrack: string;
  evmAtRisk: string;
  evmDelayed: string;
  evmCompleted: string;
  evmProjectedFinish: string;
  evmSlippage: string;
  evmSCurve: string;
  evmTaskPerformance: string;
  evmNoBaseline: string;
  evmDays: string;

  // Common
  yes: string;
  no: string;
  notes: string;
  select: string;
  upload: string;
  documents: string;
  save: string;
  cancel: string;
  loading: string;
  error: string;
  success: string;
}

const pt: Translations = {
  appName: "Wallnut",
  appSubtitle: "Analise e melhore projetos de edifícios em Portugal",
  appDescription: "Verificação abrangente de conformidade com a regulamentação portuguesa de edifícios.",
  regulationsCovered: "Regulamentação abrangida",

  startAnalysis: "Iniciar Análise",
  newAnalysis: "Nova Análise",
  editProject: "Editar Projeto",
  dashboard: "Painel de Projetos",
  back: "Voltar",
  settings: "Definições",

  myProjects: "Os Meus Projetos",
  createNewProject: "Novo Projeto",
  noProjects: "Nenhum projeto guardado. Crie um novo projeto para começar.",
  lastModified: "Última modificação",
  deleteProject: "Apagar Projeto",
  openProject: "Abrir",
  confirmDelete: "Tem a certeza que deseja apagar este projeto?",

  projectData: "Dados do Projeto",
  projectName: "Nome do Projeto",
  projectNamePlaceholder: "Ex: Moradia T3 em Lisboa",
  buildingType: "Tipo de Edifício",
  residential: "Residencial",
  commercial: "Comercial / Serviços",
  mixed: "Misto",
  industrial: "Industrial",
  district: "Distrito",
  municipality: "Município",
  parish: "Freguesia",
  latitude: "Latitude",
  longitude: "Longitude",
  altitude: "Altitude (m)",
  distanceToCoast: "Distância à Costa (km)",
  grossArea: "Área Bruta (m²)",
  usableArea: "Área Útil (m²)",
  numberOfFloors: "Número de Pisos",
  buildingHeight: "Altura do Edifício (m)",
  numberOfDwellings: "Número de Fogos",
  rehabilitation: "Reabilitação",
  analyze: "Analisar Projeto",
  analyzing: "A analisar...",

  context: "Contexto",
  general: "Geral",
  architecture: "Arquitetura",
  structural: "Estruturas",
  fireSafety: "Incêndio",
  avac: "AVAC",
  water: "Águas",
  gas: "Gás",
  electrical: "Elétrico",
  telecom: "ITED/ITUR",
  envelope: "Envolvente",
  systems: "Sistemas",
  acoustic: "Acústica",
  accessibility: "Acessibilidade",
  elevators: "Ascensores",
  licensing: "Licenciamento",
  waste: "Resíduos",
  drawings: "Desenhos",
  municipal: "Municipal",

  contextDescription: "Descreva o seu projeto e coloque questões específicas. Esta informação contextualiza a análise regulamentar.",
  projectDescription: "Descrição do Projeto",
  projectDescriptionPlaceholder: "Descreva o projeto: tipo de obra, estado atual, objetivos, condicionantes conhecidas...",
  specificConcerns: "Preocupações Regulamentares Específicas",
  specificConcernsPlaceholder: "Ex: Tenho dúvidas sobre a classificação SCIE, o PDM limita a cércea a 9m...",
  projectQuestions: "Perguntas sobre o Projeto",
  addQuestion: "+ Adicionar pergunta",
  removeQuestion: "Remover",
  questionPlaceholder: "Escreva a sua pergunta...",

  analysisReport: "Relatório de Análise Regulamentar",
  nonCompliant: "Não conformidades",
  warnings: "Avisos",
  compliant: "Conforme",
  regulationSummary: "Resumo por Regulamento",
  findings: "Constatações",
  recommendations: "Recomendações de Melhoria",
  critical: "Crítico",
  warning: "Aviso",
  info: "Info",
  pass: "Conforme",
  current: "Atual",
  required: "Exigido",
  highImpact: "Alto Impacto",
  mediumImpact: "Impacto Médio",
  lowImpact: "Baixo Impacto",
  estimatedSavings: "Poupança estimada",
  regulatoryBasis: "Base regulamentar",
  exportPDF: "Exportar PDF",
  exportExcel: "Exportar Excel",
  printReport: "Imprimir Relatório",

  projectPhase: "Fase do Projeto",
  processType: "Tipo de Processo",
  submissionDate: "Data de Submissão",
  legalDeadline: "Prazo legal",
  expectedDate: "Data expectável",
  silenceEffect: "Efeito do silêncio",
  tacitApproval: "Deferimento tácito",
  canStartWorks: "Pode iniciar obras",
  hasPIPResponse: "Tem PIP ou Direito à Informação respondido",
  pipSummary: "Resumo do PIP / Informação Prévia",

  waterUtilityProvider: "Entidade Gestora de Águas",
  pdmZoning: "Classificação PDM",
  pdmNotes: "Notas PDM / Instrumentos de Gestão Urbanística",
  entitiesToConsult: "Entidades a Consultar",
  uploadWaterRegulation: "Carregar Regulamento de Águas",
  uploadMunicipalDoc: "Carregar PDM, Regulamentos, etc.",
  pending: "Pendente",
  approved: "Aprovado",
  approvedConditions: "Aprovado c/ condições",
  rejected: "Rejeitado",
  noResponse: "Sem resposta",
  remove: "Remover",

  drawingsDescription: "Avaliação da qualidade das peças desenhadas conforme Portaria 701-H/2008 e ISO 3098.",
  scales: "Escalas",
  architectureScale: "Escala das Plantas (Arquitetura)",
  detailScale: "Escala dos Pormenores",
  locationPlanScale: "Escala da Planta de Localização",
  numberOfSheets: "Nº de Folhas",
  visualQuality: "Qualidade Visual",
  correctScales: "Escalas adequadas à impressão",
  consistentFonts: "Fontes consistentes",
  readableText: "Texto legível na escala",
  standardSymbols: "Simbologia normalizada",
  legendEverySheet: "Legenda em cada folha c/ símbolos",
  northArrow: "Indicação do Norte",
  scaleBar: "Escala gráfica (barra)",
  lineWeights: "Espessuras de linha consistentes",
  dimensioning: "Cotagem completa",
  titleBlock: "Carimbo / Legenda nas folhas",
  minimumFontSize: "Tamanho mínimo de letra (mm)",

  energyClass: "Classe Energética",

  templateMoradiaT3: "Moradia T3",
  templateMoradiaT3Desc: "Moradia unifamiliar de 2 pisos com 200m². Pré-preenchido com soluções típicas.",
  templateApartamentoT2: "Apartamento T2",
  templateApartamentoT2Desc: "Apartamento de 90m² em edifício de 5 pisos. Propriedade horizontal.",
  templateLojaComercial: "Loja Comercial",
  templateLojaComercialDesc: "Espaço comercial de 150m². AVAC, SCIE tipo VIII, elétrico trifásico.",
  templateMultifamiliar: "Edifício Multifamiliar",
  templateMultifamiliarDesc: "Edifício de 8 pisos com 24 fogos. Todas as especialidades.",
  templateReabilitacao: "Reabilitação",
  templateReabilitacaoDesc: "Reabilitação de edifício existente. ARU, estrutura em alvenaria.",

  wizardTitle: "Como deseja começar?",
  useTemplate: "Usar Modelo",
  uploadDocument: "Carregar Documento",
  startFromScratch: "Começar do Zero",
  continueToForm: "Continuar para Formulário Completo",
  basicData: "Dados Básicos",
  reviewData: "Revisão",
  autoFilledFromDoc: "Campos preenchidos automaticamente a partir do documento. Verifique e ajuste os valores.",
  basedOnTemplate: "Baseado no modelo",
  dataExtractedFrom: "Dados extraídos de",

  signIn: "Entrar",
  signOut: "Terminar sessão",
  createAccount: "Criar Conta",
  cloudSync: "Sincronizado na cloud",

  uploadZip: "Carregar ZIP do Projeto",
  uploadZipDesc: "Carregue um ZIP com todos os documentos (PDFs, XLS, desenhos). Auto-classificação e verificação de completude.",
  documentChecklist: "Lista de Verificação de Documentos",
  filesFound: "ficheiros encontrados",
  complete: "completo",
  mandatoryMissing: "documento(s) obrigatório(s) em falta",

  costEstimation: "Estimativa de Custos (CYPE)",
  projectPlanning: "Planeamento MS Project",
  additionalModules: "Módulos adicionais",

  collaboration: "Colaboração",
  members: "Membros",
  addMember: "Adicionar Membro",
  removeMember: "Remover Membro",
  roleOwner: "Proprietário",
  roleReviewer: "Revisor",
  roleViewer: "Visualizador",
  inviteMemberEmail: "Email do membro",
  memberAdded: "Membro adicionado",
  memberRemoved: "Membro removido",
  comments: "Comentários",
  addComment: "Adicionar comentário",
  commentPlaceholder: "Escreva um comentário...",
  resolve: "Resolver",
  resolved: "Resolvido",
  unresolve: "Reabrir",
  history: "Histórico",
  changeHistory: "Histórico de Alterações",
  projectCreated: "Projeto criado",
  projectUpdated: "Projeto atualizado",
  projectAnalyzed: "Análise executada",
  memberInvited: "Membro convidado",
  commentAdded: "Comentário adicionado",
  sharedWith: "Partilhado com",
  noComments: "Sem comentários",
  noHistory: "Sem histórico",
  allComments: "Todos os comentários",
  onlyUnresolved: "Apenas não resolvidos",
  userNotFound: "Utilizador não encontrado",

  onlyWallnutEmails: "Apenas emails @wallnut.pt são permitidos.",
  twoFactorRequired: "Autenticação de 2 fatores obrigatória.",

  heroHeadline: "Do projeto à obra.",
  heroSubline: "Submeta os ficheiros do seu projeto e receba uma estimativa de custos rigorosa, um planeamento de obra realista e a verificação de conformidade regulamentar completa.",
  inputFormats: "IFC · PDF · XLS · DWFx",
  inputFormatsDesc: "Qualquer nível de desenvolvimento",
  capCostTitle: "Estimativa de Custos",
  capCostDesc: "Base de preços CYPE com mão de obra, materiais e equipamentos. Ligação automática entre modelo IFC e Mapa de Quantidades por keynotes — ou MQT extrapolado com máximo rigor quando ausente.",
  capScheduleTitle: "Planeamento de Obra",
  capScheduleDesc: "Ficheiro MS Project com feriados portugueses, custos por recurso CYPE e mão de obra dimensionada à realidade da obra. Pronto para execução.",
  capComplianceTitle: "Conformidade Regulamentar",
  capComplianceDesc: "1.964 regras em 18 especialidades. RGEU, SCIE, REH, RECS, RRAE, RTIEBT, ITED/ITUR, Eurocódigos, DL 163/2006 e regulamentação municipal — verificação automática.",

  evmTitle: "Valor Ganho (EVM)",
  evmBaseline: "Linha de Base",
  evmCaptureBaseline: "Capturar Linha de Base",
  evmDataDate: "Data de Referência",
  evmPlannedValue: "Valor Planeado (PV)",
  evmEarnedValue: "Valor Ganho (EV)",
  evmActualCost: "Custo Real (AC)",
  evmScheduleVariance: "Variação de Prazo (SV)",
  evmCostVariance: "Variação de Custo (CV)",
  evmSpi: "Índice de Prazo (SPI)",
  evmCpi: "Índice de Custo (CPI)",
  evmBac: "Orçamento Total (BAC)",
  evmEac: "Estimativa na Conclusão (EAC)",
  evmEtc: "Estimativa para Concluir (ETC)",
  evmVac: "Variação na Conclusão (VAC)",
  evmTcpi: "Índice para Concluir (TCPI)",
  evmHealth: "Saúde do Projeto",
  evmOnTrack: "No prazo",
  evmAtRisk: "Em risco",
  evmDelayed: "Atrasado",
  evmCompleted: "Concluído",
  evmProjectedFinish: "Conclusão Projetada",
  evmSlippage: "Derrapagem",
  evmSCurve: "Curva S",
  evmTaskPerformance: "Desempenho por Tarefa",
  evmNoBaseline: "Capture uma linha de base para ativar o EVM.",
  evmDays: "dias",

  yes: "Sim",
  no: "Não",
  notes: "Notas",
  select: "Selecionar...",
  upload: "Carregar",
  documents: "Documentos",
  save: "Guardar",
  cancel: "Cancelar",
  loading: "A carregar...",
  error: "Erro",
  success: "Sucesso",
};

const en: Translations = {
  appName: "Wallnut",
  appSubtitle: "Analyze and improve building projects in Portugal",
  appDescription: "Comprehensive compliance verification with Portuguese building regulations.",
  regulationsCovered: "Regulations covered",

  startAnalysis: "Start Analysis",
  newAnalysis: "New Analysis",
  editProject: "Edit Project",
  dashboard: "Project Dashboard",
  back: "Back",
  settings: "Settings",

  myProjects: "My Projects",
  createNewProject: "New Project",
  noProjects: "No saved projects. Create a new project to get started.",
  lastModified: "Last modified",
  deleteProject: "Delete Project",
  openProject: "Open",
  confirmDelete: "Are you sure you want to delete this project?",

  projectData: "Project Data",
  projectName: "Project Name",
  projectNamePlaceholder: "e.g. T3 House in Lisbon",
  buildingType: "Building Type",
  residential: "Residential",
  commercial: "Commercial / Services",
  mixed: "Mixed Use",
  industrial: "Industrial",
  district: "District",
  municipality: "Municipality",
  parish: "Parish",
  latitude: "Latitude",
  longitude: "Longitude",
  altitude: "Altitude (m)",
  distanceToCoast: "Distance to Coast (km)",
  grossArea: "Gross Floor Area (m²)",
  usableArea: "Usable Area (m²)",
  numberOfFloors: "Number of Floors",
  buildingHeight: "Building Height (m)",
  numberOfDwellings: "Number of Dwellings",
  rehabilitation: "Rehabilitation",
  analyze: "Analyze Project",
  analyzing: "Analyzing...",

  context: "Context",
  general: "General",
  architecture: "Architecture",
  structural: "Structural",
  fireSafety: "Fire Safety",
  avac: "HVAC",
  water: "Water",
  gas: "Gas",
  electrical: "Electrical",
  telecom: "ITED/ITUR",
  envelope: "Envelope",
  systems: "Systems",
  acoustic: "Acoustics",
  accessibility: "Accessibility",
  elevators: "Elevators",
  licensing: "Licensing",
  waste: "Waste",
  drawings: "Drawings",
  municipal: "Municipal",

  contextDescription: "Describe your project and ask specific questions. This information contextualizes the regulatory analysis.",
  projectDescription: "Project Description",
  projectDescriptionPlaceholder: "Describe the project: type of work, current state, objectives, known constraints...",
  specificConcerns: "Specific Regulatory Concerns",
  specificConcernsPlaceholder: "e.g. I have questions about the SCIE classification, the PDM limits the height to 9m...",
  projectQuestions: "Project Questions",
  addQuestion: "+ Add question",
  removeQuestion: "Remove",
  questionPlaceholder: "Write your question...",

  analysisReport: "Regulatory Analysis Report",
  nonCompliant: "Non-compliant",
  warnings: "Warnings",
  compliant: "Compliant",
  regulationSummary: "Regulation Summary",
  findings: "Findings",
  recommendations: "Improvement Recommendations",
  critical: "Critical",
  warning: "Warning",
  info: "Info",
  pass: "Pass",
  current: "Current",
  required: "Required",
  highImpact: "High Impact",
  mediumImpact: "Medium Impact",
  lowImpact: "Low Impact",
  estimatedSavings: "Estimated savings",
  regulatoryBasis: "Regulatory basis",
  exportPDF: "Export PDF",
  exportExcel: "Export Excel",
  printReport: "Print Report",

  projectPhase: "Project Phase",
  processType: "Process Type",
  submissionDate: "Submission Date",
  legalDeadline: "Legal deadline",
  expectedDate: "Expected date",
  silenceEffect: "Silence effect",
  tacitApproval: "Tacit approval",
  canStartWorks: "Can start works",
  hasPIPResponse: "Has PIP or Information Request response",
  pipSummary: "PIP / Prior Information Summary",

  waterUtilityProvider: "Water Utility Provider",
  pdmZoning: "PDM Zoning",
  pdmNotes: "PDM Notes / Urban Management Instruments",
  entitiesToConsult: "Entities to Consult",
  uploadWaterRegulation: "Upload Water Regulation",
  uploadMunicipalDoc: "Upload PDM, Regulations, etc.",
  pending: "Pending",
  approved: "Approved",
  approvedConditions: "Approved w/ conditions",
  rejected: "Rejected",
  noResponse: "No response",
  remove: "Remove",

  drawingsDescription: "Drawing quality assessment per Portaria 701-H/2008 and ISO 3098.",
  scales: "Scales",
  architectureScale: "Architecture Plan Scale",
  detailScale: "Detail Scale",
  locationPlanScale: "Location Plan Scale",
  numberOfSheets: "Number of Sheets",
  visualQuality: "Visual Quality",
  correctScales: "Correct scales for printing",
  consistentFonts: "Consistent fonts",
  readableText: "Readable text at scale",
  standardSymbols: "Standard symbols",
  legendEverySheet: "Legend on every sheet with symbols",
  northArrow: "North arrow",
  scaleBar: "Scale bar",
  lineWeights: "Consistent line weights",
  dimensioning: "Complete dimensioning",
  titleBlock: "Title block on all sheets",
  minimumFontSize: "Minimum font size (mm)",

  energyClass: "Energy Class",

  templateMoradiaT3: "T3 Detached House",
  templateMoradiaT3Desc: "2-storey single-family house, 200m². Pre-filled with typical solutions.",
  templateApartamentoT2: "T2 Apartment",
  templateApartamentoT2Desc: "90m² apartment in a 5-storey building. Horizontal property.",
  templateLojaComercial: "Commercial Shop",
  templateLojaComercialDesc: "150m² commercial space. HVAC, SCIE type VIII, three-phase electrical.",
  templateMultifamiliar: "Multi-family Building",
  templateMultifamiliarDesc: "8-storey building with 24 dwellings. All specialties included.",
  templateReabilitacao: "Rehabilitation",
  templateReabilitacaoDesc: "Existing building rehabilitation. ARU, masonry structure.",

  wizardTitle: "How would you like to start?",
  useTemplate: "Use Template",
  uploadDocument: "Upload Document",
  startFromScratch: "Start from Scratch",
  continueToForm: "Continue to Full Form",
  basicData: "Basic Data",
  reviewData: "Review",
  autoFilledFromDoc: "Fields auto-filled from document. Please verify and adjust values.",
  basedOnTemplate: "Based on template",
  dataExtractedFrom: "Data extracted from",

  signIn: "Sign in",
  signOut: "Sign out",
  createAccount: "Create Account",
  cloudSync: "Synced to cloud",

  uploadZip: "Upload Project ZIP",
  uploadZipDesc: "Upload a ZIP with all documents (PDFs, XLS, drawings). Auto-classification and completeness check.",
  documentChecklist: "Document Checklist",
  filesFound: "files found",
  complete: "complete",
  mandatoryMissing: "mandatory document(s) missing",

  costEstimation: "Cost Estimate (CYPE)",
  projectPlanning: "MS Project Planning",
  additionalModules: "Additional modules",

  collaboration: "Collaboration",
  members: "Members",
  addMember: "Add Member",
  removeMember: "Remove Member",
  roleOwner: "Owner",
  roleReviewer: "Reviewer",
  roleViewer: "Viewer",
  inviteMemberEmail: "Member email",
  memberAdded: "Member added",
  memberRemoved: "Member removed",
  comments: "Comments",
  addComment: "Add comment",
  commentPlaceholder: "Write a comment...",
  resolve: "Resolve",
  resolved: "Resolved",
  unresolve: "Reopen",
  history: "History",
  changeHistory: "Change History",
  projectCreated: "Project created",
  projectUpdated: "Project updated",
  projectAnalyzed: "Analysis performed",
  memberInvited: "Member invited",
  commentAdded: "Comment added",
  sharedWith: "Shared with",
  noComments: "No comments",
  noHistory: "No history",
  allComments: "All comments",
  onlyUnresolved: "Only unresolved",
  userNotFound: "User not found",

  onlyWallnutEmails: "Only @wallnut.pt emails are allowed.",
  twoFactorRequired: "Two-factor authentication required.",

  heroHeadline: "From project to site.",
  heroSubline: "Submit your project files and receive a rigorous cost estimate, a realistic construction schedule, and complete regulatory compliance verification.",
  inputFormats: "IFC · PDF · XLS · DWFx",
  inputFormatsDesc: "Any level of development",
  capCostTitle: "Cost Estimation",
  capCostDesc: "CYPE price database with labor, materials, and equipment. Automatic linking between IFC model and Bill of Quantities via keynotes — or BOQ extrapolated with maximum rigor when absent.",
  capScheduleTitle: "Construction Scheduling",
  capScheduleDesc: "MS Project file with Portuguese holidays, CYPE resource costs, and workforce sized to the project's reality. Ready for execution.",
  capComplianceTitle: "Regulatory Compliance",
  capComplianceDesc: "1,964 rules across 18 specialties. RGEU, SCIE, REH, RECS, RRAE, RTIEBT, ITED/ITUR, Eurocodes, DL 163/2006, and municipal regulations — automatically verified.",

  evmTitle: "Earned Value (EVM)",
  evmBaseline: "Baseline",
  evmCaptureBaseline: "Capture Baseline",
  evmDataDate: "Data Date",
  evmPlannedValue: "Planned Value (PV)",
  evmEarnedValue: "Earned Value (EV)",
  evmActualCost: "Actual Cost (AC)",
  evmScheduleVariance: "Schedule Variance (SV)",
  evmCostVariance: "Cost Variance (CV)",
  evmSpi: "Schedule Performance Index (SPI)",
  evmCpi: "Cost Performance Index (CPI)",
  evmBac: "Budget at Completion (BAC)",
  evmEac: "Estimate at Completion (EAC)",
  evmEtc: "Estimate to Complete (ETC)",
  evmVac: "Variance at Completion (VAC)",
  evmTcpi: "To-Complete Performance Index (TCPI)",
  evmHealth: "Project Health",
  evmOnTrack: "On track",
  evmAtRisk: "At risk",
  evmDelayed: "Delayed",
  evmCompleted: "Completed",
  evmProjectedFinish: "Projected Finish",
  evmSlippage: "Slippage",
  evmSCurve: "S-Curve",
  evmTaskPerformance: "Task Performance",
  evmNoBaseline: "Capture a baseline to enable EVM tracking.",
  evmDays: "days",

  yes: "Yes",
  no: "No",
  notes: "Notes",
  select: "Select...",
  upload: "Upload",
  documents: "Documents",
  save: "Save",
  cancel: "Cancel",
  loading: "Loading...",
  error: "Error",
  success: "Success",
};

const translations: Record<Language, Translations> = { pt, en };

export function getTranslations(lang: Language): Translations {
  return translations[lang];
}

export function t(lang: Language, key: keyof Translations): string {
  return translations[lang][key];
}

// React context
export const I18nContext = createContext<{
  lang: Language;
  t: Translations;
  setLang: (lang: Language) => void;
}>({
  lang: "pt",
  t: pt,
  setLang: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}
