/**
 * Contextual help database for form fields.
 * Maps each form field to its regulation reference,
 * explanation, and requirements.
 */

export interface FieldHelp {
  field: string;
  label: string;
  regulation: string;
  article: string;
  description: string;
  requirement?: string;
  example?: string;
  link?: string;
}

export const FIELD_HELP: Record<string, FieldHelp> = {
  // Architecture
  "architecture.ceilingHeight": {
    field: "architecture.ceilingHeight",
    label: "Pé-direito",
    regulation: "RGEU",
    article: "Art. 65.º",
    description: "Altura livre entre o pavimento e o teto de um compartimento.",
    requirement: "Mínimo 2.40m para quartos e salas. Mínimo 2.20m para cozinhas e instalações sanitárias. Em reabilitação pode admitir-se 2.20m em todos os compartimentos.",
    example: "2.70 m",
  },
  "architecture.hasCivilCodeCompliance": {
    field: "architecture.hasCivilCodeCompliance",
    label: "Conformidade com Código Civil",
    regulation: "Código Civil",
    article: "Art. 1344.º e seguintes",
    description: "Verificação da conformidade do projeto com as disposições do Código Civil relativas à construção, vizinhança e propriedade horizontal.",
    requirement: "Respeitar distâncias mínimas (1.5m para janelas), estilicídio, direitos de vizinhança e partes comuns em propriedade horizontal.",
  },
  "architecture.windowDistanceToNeighbor": {
    field: "architecture.windowDistanceToNeighbor",
    label: "Distância de janelas ao vizinho",
    regulation: "Código Civil",
    article: "Art. 1360.º",
    description: "Distância mínima entre janelas, varandas, terraços ou outros elementos semelhantes e o limite do prédio vizinho.",
    requirement: "Mínimo 1.5 metros medidos perpendicularmente ao limite do prédio vizinho.",
    example: "2.0 m",
  },
  "architecture.hasNaturalLight": {
    field: "architecture.hasNaturalLight",
    label: "Iluminação natural",
    regulation: "RGEU",
    article: "Art. 71.º",
    description: "Os compartimentos principais (quartos, salas) devem ter iluminação natural direta através de vãos abertos para o exterior.",
    requirement: "Área de vãos >= 10% da área do compartimento. Todos os compartimentos de permanência devem ter iluminação natural.",
  },

  // Envelope
  "envelope.externalWallUValue": {
    field: "envelope.externalWallUValue",
    label: "U paredes exteriores",
    regulation: "REH",
    article: "DL 118/2013, Portaria 349-B/2013",
    description: "Coeficiente de transmissão térmica das paredes exteriores. Quanto menor, melhor o isolamento.",
    requirement: "Máximos por zona climática: I1: 0.50, I2: 0.40, I3: 0.35 W/(m².K). Para NZEB são mais exigentes.",
    example: "0.35 W/(m².K)",
  },
  "envelope.roofUValue": {
    field: "envelope.roofUValue",
    label: "U cobertura",
    regulation: "REH",
    article: "DL 118/2013, Portaria 349-B/2013",
    description: "Coeficiente de transmissão térmica da cobertura.",
    requirement: "Máximos: I1: 0.40, I2: 0.35, I3: 0.30 W/(m².K).",
    example: "0.30 W/(m².K)",
  },
  "envelope.windowUValue": {
    field: "envelope.windowUValue",
    label: "U envidraçados",
    regulation: "REH",
    article: "DL 118/2013, Portaria 349-B/2013",
    description: "Coeficiente de transmissão térmica dos vãos envidraçados (vidro + caixilharia).",
    requirement: "Máximos: I1: 2.80, I2: 2.40, I3: 2.20 W/(m².K).",
    example: "2.40 W/(m².K)",
  },
  "envelope.windowSolarFactor": {
    field: "envelope.windowSolarFactor",
    label: "Fator solar",
    regulation: "REH",
    article: "Despacho 15793-K/2013",
    description: "Fator solar do envidraçado (g-value). Fração da energia solar que atravessa o vão.",
    requirement: "Máximos com proteção ativada: V1: 0.56, V2: 0.56, V3: 0.50.",
    example: "0.40",
  },
  "envelope.airChangesPerHour": {
    field: "envelope.airChangesPerHour",
    label: "Renovações por hora",
    regulation: "REH",
    article: "Despacho 15793-K/2013",
    description: "Taxa de renovação de ar do espaço. RPH: renovações por hora.",
    requirement: "Mínimo 0.4 h⁻¹ para ventilação adequada. Máximo recomendado 0.6 h⁻¹ para eficiência energética.",
    example: "0.6 h⁻¹",
  },

  // Fire Safety
  "fireSafety.utilizationType": {
    field: "fireSafety.utilizationType",
    label: "Utilização-tipo",
    regulation: "SCIE",
    article: "DL 220/2008, Art. 8.º",
    description: "Classificação do edifício quanto à sua utilização para efeitos de segurança contra incêndio.",
    requirement: "UT-I: Habitação. UT-II: Estacionamento. UT-III: Administrativos. UT-IV: Escolares. UT-V: Hospitalares. UT-VI: Espetáculos. UT-VII: Hotelaria. UT-VIII: Comércio. UT-IX: Desporto. UT-X: Museus. UT-XI: Bibliotecas. UT-XII: Industriais.",
  },
  "fireSafety.riskCategory": {
    field: "fireSafety.riskCategory",
    label: "Categoria de risco",
    regulation: "SCIE",
    article: "DL 220/2008, Art. 12.º",
    description: "Nível de risco associado ao edifício, que determina as medidas de segurança exigíveis.",
    requirement: "1ª (risco reduzido) a 4ª (risco muito elevado). Depende da UT, altura, efetivo e área.",
  },
  "fireSafety.fireResistanceOfStructure": {
    field: "fireSafety.fireResistanceOfStructure",
    label: "Resistência ao fogo da estrutura",
    regulation: "SCIE",
    article: "DL 220/2008, Art. 15.º, NT 05",
    description: "Tempo (em minutos) que a estrutura resiste ao fogo mantendo a sua capacidade portante (REI).",
    requirement: "1ª cat: REI 30. 2ª cat: REI 60. 3ª cat: REI 90. 4ª cat: REI 120.",
    example: "60 min (REI 60)",
  },

  // Electrical
  "electrical.contractedPower": {
    field: "electrical.contractedPower",
    label: "Potência contratada",
    regulation: "RTIEBT",
    article: "Secção 311",
    description: "Potência elétrica contratada com o distribuidor.",
    requirement: "Habitação: 3.45-10.35 kVA monofásico, até 41.4 kVA trifásico. Comércio: dimensionar conforme cargas.",
    example: "6.9 kVA",
  },
  "electrical.rcdSensitivity": {
    field: "electrical.rcdSensitivity",
    label: "Sensibilidade do diferencial",
    regulation: "RTIEBT",
    article: "Secção 531",
    description: "Corrente diferencial-residual que provoca o disparo do dispositivo de proteção.",
    requirement: "30mA para circuitos de tomadas acessíveis e instalações sanitárias. 300mA admissível apenas para alimentadores.",
    example: "30 mA",
  },

  // Acoustic
  "acoustic.buildingLocation": {
    field: "acoustic.buildingLocation",
    label: "Zona de ruído",
    regulation: "RRAE",
    article: "DL 129/2002, Regulamento Geral do Ruído",
    description: "Classificação da zona envolvente quanto ao ruído ambiente.",
    requirement: "Zona sensível: Lden <= 55 dB. Zona mista: Lden <= 65 dB. Zona ruidosa: sem limite.",
  },

  // Licensing
  "licensing.projectPhase": {
    field: "licensing.projectPhase",
    label: "Fase do projeto",
    regulation: "RJUE",
    article: "DL 555/99",
    description: "Fase atual do procedimento urbanístico no qual o projeto se encontra.",
    requirement: "PIP: Pedido de Informação Prévia (40 dias). Licenciamento: Licença de construção (65 dias). Comunicação Prévia: (20 dias). Autorização Especial: (60 dias). Licença de Utilização: (15 dias).",
  },
  "licensing.isInARU": {
    field: "licensing.isInARU",
    label: "Área de Reabilitação Urbana",
    regulation: "RJUE",
    article: "DL 307/2009",
    description: "Indica se o edifício se situa em Área de Reabilitação Urbana, o que pode conferir benefícios fiscais e dispensa de alguns requisitos.",
    requirement: "Em ARU: possível isenção de IMI/IMT, taxas reduzidas, IVA a 6% em obras de reabilitação, dispensa de alguns requisitos do REH.",
  },

  // Water
  "waterDrainage.hasSeparateDrainageSystem": {
    field: "waterDrainage.hasSeparateDrainageSystem",
    label: "Sistema de drenagem separativo",
    regulation: "RGSPPDADAR",
    article: "DL 23/95, Art. 116.º",
    description: "Separação das redes de drenagem de águas residuais domésticas e pluviais.",
    requirement: "Obrigatório em construção nova. As duas redes devem ser completamente independentes até à ligação municipal.",
  },

  // Telecommunications
  "telecommunications.itedEdition": {
    field: "telecommunications.itedEdition",
    label: "Edição ITED",
    regulation: "ITED",
    article: "Manual ITED, 4ª Edição",
    description: "Edição do Manual de Infraestruturas de Telecomunicações em Edifícios aplicável.",
    requirement: "A 4ª edição é obrigatória para todos os projetos submetidos desde 2021. Inclui requisitos de fibra óptica em todos os edifícios.",
  },

  // Gas
  "gas.hasGasInstallation": {
    field: "gas.hasGasInstallation",
    label: "Instalação de gás",
    regulation: "Gás",
    article: "DL 521/99, Art. 5.º",
    description: "Indica se o edifício possui instalação de gás (natural, GPL canalizado ou garrafa).",
    requirement: "Se sim: projeto obrigatório, instalador credenciado, ensaio de estanquidade, detetor de gás, válvula de corte de emergência.",
  },

  // Accessibility
  "accessibility.doorWidths": {
    field: "accessibility.doorWidths",
    label: "Largura de portas",
    regulation: "Acessibilidades",
    article: "DL 163/2006, Sec. 4.9",
    description: "Largura útil mínima de passagem nas portas.",
    requirement: "Mínimo 0.87m de largura útil. Em edifícios públicos e habitação acessível: 0.90m.",
    example: "0.90 m",
  },
  "accessibility.corridorWidths": {
    field: "accessibility.corridorWidths",
    label: "Largura de corredores",
    regulation: "Acessibilidades",
    article: "DL 163/2006, Sec. 4.3",
    description: "Largura útil mínima de corredores de circulação.",
    requirement: "Mínimo 1.20m. Em zonas comuns de edifícios: 1.50m para permitir cruzamento de cadeiras de rodas.",
    example: "1.20 m",
  },
};

/**
 * Get help for a specific field.
 */
export function getFieldHelp(fieldPath: string): FieldHelp | null {
  return FIELD_HELP[fieldPath] ?? null;
}

/**
 * Get all help entries for a section.
 */
export function getHelpForSection(sectionPrefix: string): FieldHelp[] {
  return Object.values(FIELD_HELP).filter(h => h.field.startsWith(sectionPrefix));
}

/**
 * Search help entries by keyword.
 */
export function searchHelp(query: string): FieldHelp[] {
  const lower = query.toLowerCase();
  return Object.values(FIELD_HELP).filter(h =>
    h.label.toLowerCase().includes(lower) ||
    h.description.toLowerCase().includes(lower) ||
    h.regulation.toLowerCase().includes(lower) ||
    h.article.toLowerCase().includes(lower),
  );
}
