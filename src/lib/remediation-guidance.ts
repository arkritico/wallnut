/**
 * Remediation guidance for building regulation findings.
 * Maps regulation areas and common finding patterns to specific
 * remediation steps, required professionals, and estimated effort.
 */

import type { Finding, RegulationArea } from "./types";

interface RemediationRule {
  /** Regex pattern to match against finding description */
  pattern: RegExp;
  /** Remediation text */
  guidance: string;
}

/**
 * Rules per regulation area. Checked in order; first match wins.
 */
const REMEDIATION_RULES: Record<RegulationArea | "default", RemediationRule[]> = {
  architecture: [
    {
      pattern: /pé-direito|ceiling\s*height/i,
      guidance: "Ajustar o pé-direito no projeto de arquitetura. Em reabilitação, considerar rebaixar o pavimento ou alterar a cota do teto. Solicitar revisão do projeto de estruturas se houver alteração de lajes.",
    },
    {
      pattern: /iluminação\s*natural|natural\s*light/i,
      guidance: "Aumentar a área de envidraçados nos compartimentos principais (mínimo 10% da área do compartimento). Considerar claraboias ou tubos solares em zonas interiores.",
    },
    {
      pattern: /ventilação\s*cruzada|cross\s*ventilat/i,
      guidance: "Redesenhar a planta para permitir aberturas em fachadas opostas ou perpendiculares. Em alternativa, instalar sistema de ventilação mecânica (VMC) conforme RECS/REH.",
    },
    {
      pattern: /janelas.*vizinho|window.*neighbor|1360/i,
      guidance: "Reposicionar os vãos para garantir distância mínima de 1.5m ao limite do prédio vizinho. Alternativa: utilizar vidro opaco ou translúcido fixo (não abrível) que fica isento da regra dos 1.5m.",
    },
    {
      pattern: /estilicídio|rainwater|1362/i,
      guidance: "Instalar caleiras, algerozes e tubos de queda para recolher e conduzir as águas pluviais do telhado até à rede de drenagem, evitando o gotejamento para o prédio vizinho.",
    },
    {
      pattern: /propriedade\s*horizontal|common\s*parts|1422/i,
      guidance: "Obter autorização da assembleia de condóminos (maioria qualificada de 2/3) antes de submeter o projeto. Juntar ata da assembleia com a deliberação ao processo de licenciamento.",
    },
    {
      pattern: /RGEU|conformidade/i,
      guidance: "Rever o projeto face ao RGEU: verificar dimensões mínimas dos compartimentos, pé-direito, iluminação e ventilação naturais. Contratar arquiteto inscrito na OA para revisão de conformidade.",
    },
  ],

  structural: [
    {
      pattern: /projeto\s*estrutural|structural\s*project/i,
      guidance: "Contratar engenheiro civil ou de estruturas inscrito na Ordem para elaborar o projeto de estabilidade, incluindo memória de cálculo, peças desenhadas e termo de responsabilidade.",
    },
    {
      pattern: /geotécnic|geotechnical/i,
      guidance: "Encomendar estudo geotécnico (sondagens + ensaios) a empresa certificada. O relatório deve incluir perfil geológico, nível freático e parâmetros geomecânicos para dimensionamento das fundações.",
    },
    {
      pattern: /sísmic|seismic/i,
      guidance: "O projeto de estruturas deve considerar a ação sísmica conforme EC8 para a zona sísmica aplicável. Definir classe de ductilidade adequada (DCM recomendado para edifícios correntes).",
    },
  ],

  fire_safety: [
    {
      pattern: /deteção|detection|alarm/i,
      guidance: "Instalar sistema de deteção de incêndio automático (SADI) conforme a categoria de risco. Incluir detetores ótico-térmicos, botões de alarme manual e central de incêndio certificada EN 54.",
    },
    {
      pattern: /sprinkler/i,
      guidance: "Instalar rede de sprinklers dimensionada conforme EN 12845. Obrigatório para UT a partir da 3ª categoria de risco ou quando a carga de incêndio o exija.",
    },
    {
      pattern: /evacuação|evacuation|exit|saída/i,
      guidance: "Rever o projeto de caminhos de evacuação: garantir largura mínima (UP=0.9m), distâncias máximas a percorrer, saídas em número e posição adequados. Instalar sinalização fotoluminescente EN ISO 7010.",
    },
    {
      pattern: /resistência.*fogo|fire\s*resistance|REI/i,
      guidance: "Aplicar revestimento intumescente ou encamisamento em betão nos elementos estruturais para atingir a resistência ao fogo exigida (REI 30 a REI 120 conforme UT e categoria de risco).",
    },
    {
      pattern: /iluminação.*emergência|emergency\s*lighting/i,
      guidance: "Instalar blocos autónomos de iluminação de emergência (BAIE) nos caminhos de evacuação, junto a saídas, mudanças de direção e equipamentos de segurança. Autonomia mínima de 1 hora.",
    },
    {
      pattern: /extintor|extinguisher/i,
      guidance: "Colocar extintores de pó químico ABC (6kg) a cada 15m de distância nos caminhos de circulação, junto a saídas e pontos de maior risco. Manter contrato de manutenção anual.",
    },
  ],

  avac: [
    {
      pattern: /ventilação|ventilation/i,
      guidance: "Instalar sistema de ventilação mecânica (VMC) com caudais conforme EN 15251 / RECS. Prever extração em cozinhas (60 L/s) e instalações sanitárias (15 L/s por aparelho).",
    },
    {
      pattern: /manutenção|maintenance/i,
      guidance: "Elaborar e implementar plano de manutenção AVAC conforme DL 118/2013. Inclui inspeção semestral de filtros, limpeza de condutas, verificação de refrigerante e eficiência energética.",
    },
    {
      pattern: /radão|radon/i,
      guidance: "Instalar membrana anti-radão na laje térrea e prever sistema de despressurização do solo (ventilação sob o pavimento). Realizar medição de radão pós-construção conforme DL 108/2018.",
    },
  ],

  water_drainage: [
    {
      pattern: /separação|separativ|pluvial.*residual/i,
      guidance: "Projetar rede separativa: águas residuais domésticas para o coletor de saneamento e águas pluviais para o coletor pluvial ou infiltração no solo. Incluir câmaras de visita acessíveis.",
    },
    {
      pattern: /válvula.*anti.*retorno|check\s*valve/i,
      guidance: "Instalar válvula anti-retorno (tipo EA) no ramal de ligação, imediatamente após o contador. Em zonas com pressão variável, adicionar redutor de pressão.",
    },
    {
      pattern: /ventilação.*drenagem|ventilated.*drainage/i,
      guidance: "Prolongar os tubos de queda acima da cobertura (mínimo 0.5m) para ventilação primária. Em redes extensas, adicionar colunas de ventilação secundária.",
    },
  ],

  gas: [
    {
      pattern: /detetor|detector/i,
      guidance: "Instalar detetor de gás combustível junto aos aparelhos a gás (15cm do teto para gás natural, 15cm do pavimento para GPL). Ligar a electroválvula de corte automático.",
    },
    {
      pattern: /válvula.*emergência|emergency.*valve/i,
      guidance: "Instalar válvula de corte de emergência acessível e sinalizada no exterior do edifício ou na entrada da fração, conforme DL 521/99.",
    },
    {
      pattern: /estanquidade|pressure.*test/i,
      guidance: "Realizar ensaio de estanquidade da rede de gás por instalador credenciado DGEG antes da ligação. Pressão de ensaio: 1.5x a pressão de serviço, duração mínima 15 minutos.",
    },
  ],

  electrical: [
    {
      pattern: /diferencial|RCD|residual.*current/i,
      guidance: "Instalar disjuntores diferenciais de 30mA (alta sensibilidade) em todos os circuitos de tomadas, zonas húmidas e circuitos exteriores. Tipo A para circuitos com equipamentos eletrónicos.",
    },
    {
      pattern: /esquema.*unifilar|schematic/i,
      guidance: "Elaborar esquema unifilar completo da instalação, indicando: calibres dos disjuntores, secções de cabos, RCDs, barramentos e identificação de circuitos. Incluir no projeto para aprovação.",
    },
    {
      pattern: /zona.*banho|bathroom.*zone/i,
      guidance: "Respeitar as zonas 0-3 das casas de banho (IEC 60364-7-701): Zona 0 - apenas SELV 12V; Zona 1 - IPX4, apenas equipamentos fixos; Zona 2 - IPX4, luminária Classe II; Zona 3 - tomadas com DDR 30mA.",
    },
    {
      pattern: /ligação.*terra|earthing|equipotencial/i,
      guidance: "Instalar elétrodo de terra (fita de cobre 30x2mm mínimo 10m enterrada a 0.8m) com resistência ≤20Ω. Ligar barramento equipotencial principal a todas as massas metálicas (tubagens, caixilharias, armaduras).",
    },
    {
      pattern: /sobretens|surge|SPD/i,
      guidance: "Instalar descarregador de sobretensões (SPD) Tipo 2 no quadro elétrico principal. Capacidade mínima 20kA (8/20μs). Ligar com condutor ≤0.5m ao barramento de terra.",
    },
  ],

  ited_itur: [
    {
      pattern: /fibra|fiber/i,
      guidance: "Instalar infraestrutura de fibra óptica monomodo (OS2) desde o ATE até cada ATI, conforme manual ITED 4ª edição. Mínimo 2 fibras por fração residencial.",
    },
    {
      pattern: /ATE|ATI|armário/i,
      guidance: "Instalar ATE (Armário de Telecomunicações de Edifício) em zona acessível do piso 0 ou cave. Cada fração deve ter ATI (Armário de Telecomunicações Individual) junto ao quadro elétrico.",
    },
    {
      pattern: /certificação|certification|ANACOM/i,
      guidance: "Contratar instalador credenciado pela ANACOM para a instalação e certificação ITED. A certificação é obrigatória antes da emissão da licença de utilização.",
    },
  ],

  thermal: [
    {
      pattern: /parede.*U.*value|wall.*U|externalWallUValue/i,
      guidance: "Aplicar ETICS (Sistema de Isolamento Térmico pelo Exterior) com EPS/XPS de espessura adequada. Alternativa: isolamento na caixa-de-ar com poliuretano projetado ou lã mineral insuflada.",
    },
    {
      pattern: /cobertura.*U|roof.*U|roofUValue/i,
      guidance: "Isolar a cobertura: em cobertura plana aplicar XPS sob a impermeabilização (invertida) com mínimo 80mm; em cobertura inclinada isolar na esteira com lã mineral 120mm ou nas vertentes com PIR 80mm.",
    },
    {
      pattern: /janela.*U|window.*U|envidraçado/i,
      guidance: "Substituir caixilharia por perfis com rotura térmica (RPT ≥ 24mm) ou PVC multicâmaras. Vidro duplo com caixa de ar ≥16mm e vidro baixo emissivo (low-E). Considerar vidro triplo em I3.",
    },
    {
      pattern: /ponte.*térmica|thermal.*bridge/i,
      guidance: "Tratar pontes térmicas planas (pilares, vigas, caixas de estore) com isolamento pelo exterior. Aplicar perfis de corte térmico nos peitoris e ombreiras das janelas.",
    },
    {
      pattern: /fator.*solar|solar.*factor/i,
      guidance: "Instalar dispositivos de sombreamento exterior (estores, portadas, palas) ou aplicar vidro com fator solar adequado (g⊥ × Fs ≤ valor máximo). O sombreamento exterior é 3-4x mais eficaz que o interior.",
    },
  ],

  acoustic: [
    {
      pattern: /aéreo|airborne|D'nT/i,
      guidance: "Aumentar a massa das paredes divisórias entre frações (parede dupla com lã mineral na caixa-de-ar). Usar blocos de betão de alta densidade ou parede dupla com gesso cartonado dessolidarizado.",
    },
    {
      pattern: /percussão|impact|L'nT/i,
      guidance: "Instalar pavimento flutuante com camada resiliente (polietileno reticulado, cortiça ou lã mineral 10-20mm) sob a betonilha de regularização. Atenção à dessolidarização perimetral.",
    },
    {
      pattern: /fachada|facade|D2m/i,
      guidance: "Melhorar o isolamento acústico da fachada: substituir janelas por caixilharia com classe de permeabilidade ao ar 4 e vidro laminado acústico. Em zonas ruidosas, considerar janela dupla.",
    },
  ],

  accessibility: [
    {
      pattern: /entrada|entrance/i,
      guidance: "Garantir percurso acessível desde a via pública: desnível máximo de 2cm nos acessos, rampa com inclinação máxima 6% (8% em reabilitação), patamar de 1.5m×1.5m junto à porta.",
    },
    {
      pattern: /porta|door.*width/i,
      guidance: "Alargar portas para vão livre mínimo de 0.87m (0.77m em reabilitação). Em zonas de manobra junto a portas, garantir espaço de rotação de 1.5m de diâmetro para cadeira de rodas.",
    },
    {
      pattern: /corredor|corridor/i,
      guidance: "Garantir largura mínima de corredores de 1.20m (1.10m em reabilitação). Prever zonas de manobra (1.5m×1.5m) nos pontos de mudança de direção.",
    },
    {
      pattern: /wc.*acess|sanit.*acess|accessible.*wc/i,
      guidance: "Instalar sanita acessível (altura 0.45m), lavatório sem coluna (espaço livre inferior), barras de apoio rebatíveis, e espaço lateral livre de 0.80m junto à sanita para transferência.",
    },
    {
      pattern: /rampa|ramp/i,
      guidance: "Corrigir inclinação da rampa: máximo 6% (comprimento >10m: 5%). Largura mínima 1.20m. Corrimãos bilaterais contínuos entre 0.85-0.90m. Pavimento antiderrapante. Patamares a cada 10m.",
    },
    {
      pattern: /elevador|elevator/i,
      guidance: "O elevador acessível deve ter: cabina mínima 1.1m×1.4m, porta 0.80m, botões entre 0.90-1.20m, sinalização tátil e sonora, espelho no fundo da cabina.",
    },
  ],

  energy: [
    {
      pattern: /solar.*térmico|solar.*thermal/i,
      guidance: "Instalar coletor solar térmico orientado a Sul (±45°), inclinação igual à latitude local. Dimensionar para 1 m² por ocupante. Incluir depósito de acumulação (50-75 L/m² de coletor).",
    },
    {
      pattern: /solar.*pv|fotovoltaico/i,
      guidance: "Instalar sistema fotovoltaico para autoconsumo. Dimensionar para 1-2 kWp por fração residencial. Orientação Sul, inclinação 30-35°. Registar na DGEG para autoconsumo (UPAC).",
    },
    {
      pattern: /renováv|renewable/i,
      guidance: "Garantir contribuição mínima de fontes renováveis: solar térmico (AQS), solar fotovoltaico (eletricidade) ou bomba de calor aerotérmica (considerada parcialmente renovável). Mínimo Eren ≥ 50% das necessidades de AQS.",
    },
  ],

  elevators: [
    {
      pattern: /marcação.*CE|CE\s*marking/i,
      guidance: "O elevador deve ter marcação CE conforme Diretiva 2014/33/UE. Solicitar declaração de conformidade ao fabricante e verificar placa de identificação na casa das máquinas.",
    },
    {
      pattern: /manutenção|maintenance/i,
      guidance: "Celebrar contrato de manutenção com empresa certificada pelo IPQ. Manutenção preventiva obrigatória: mensal para elevadores de passageiros, trimestral para monta-cargas.",
    },
    {
      pattern: /inspeção|inspection/i,
      guidance: "Solicitar inspeção periódica ao IPQ ou organismo acreditado. Periodicidade: 2 anos para elevadores com mais de 8 anos. Corrigir não-conformidades no prazo indicado no relatório.",
    },
  ],

  licensing: [
    {
      pattern: /termo.*responsabilidade/i,
      guidance: "Obter termos de responsabilidade assinados por todos os técnicos autores dos projetos de especialidades e pelo diretor de obra/fiscalização. Usar modelos oficiais da Portaria 232/2008.",
    },
    {
      pattern: /alvará|construção.*licen/i,
      guidance: "Requerer alvará de construção na câmara municipal após aprovação dos projetos de especialidades. Pagar as taxas urbanísticas e a caução (se aplicável). Prazo de execução consta do alvará.",
    },
    {
      pattern: /licença.*utilização|utilization.*licen/i,
      guidance: "Requerer licença de utilização após conclusão da obra: juntar termos de responsabilidade, certificado energético (SCE), certificação ITED, ficha técnica da habitação e telas finais.",
    },
    {
      pattern: /especialidade|specialty.*project/i,
      guidance: "Submeter todos os projetos de especialidades obrigatórios: estabilidade, AVAC, águas e drenagem, eletricidade, telecomunicações (ITED), gás, acústica e segurança contra incêndio (SCIE).",
    },
  ],

  waste: [
    {
      pattern: /PPG|plano.*gestão|management.*plan/i,
      guidance: "Elaborar Plano de Prevenção e Gestão de RCD (DL 46/2008). Incluir: estimativa de quantidades por tipo (LER), medidas de prevenção, destino final (operadores licenciados) e cronograma de gestão.",
    },
    {
      pattern: /triagem|sort|segregat/i,
      guidance: "Instalar contentores/big bags identificados em obra para triagem dos resíduos: betão/alvenaria (LER 17 01), madeira (17 02), metais (17 04), plásticos (17 02 03), mistos (17 09). Sinalizar zonas de deposição.",
    },
  ],

  local: [
    {
      pattern: /PDM|zoning|classificação/i,
      guidance: "Consultar a planta de ordenamento e regulamento do PDM no site da câmara municipal ou no SNIT (snit.dgterritorio.gov.pt). Verificar classificação do solo, índices urbanísticos e condicionantes.",
    },
  ],

  drawings: [
    {
      pattern: /escala|scale/i,
      guidance: "Verificar e corrigir as escalas: planta de localização 1:1000-1:2000, plantas gerais 1:100-1:200, detalhes construtivos 1:10-1:20. Incluir escala gráfica em todas as folhas.",
    },
    {
      pattern: /legenda|legend|carimbo/i,
      guidance: "Adicionar carimbo/legenda normalizada em todas as folhas: nome do projeto, autor, especialidade, escala, data, número da folha e revisão. Incluir legenda de simbologia.",
    },
  ],

  general: [],
  default: [],
};

/**
 * Get remediation guidance for a finding based on its area and description.
 * Returns undefined if no matching rule is found.
 */
export function getRemediation(finding: Finding): string | undefined {
  const areaRules = REMEDIATION_RULES[finding.area] ?? [];

  for (const rule of areaRules) {
    if (rule.pattern.test(finding.description)) {
      return rule.guidance;
    }
  }

  // Fall back to generic remediation by severity
  if (finding.severity === "critical") {
    return `Corrigir esta não-conformidade antes da submissão do projeto. Consultar o regulamento ${finding.regulation} (${finding.article}) para requisitos detalhados.`;
  }
  if (finding.severity === "warning") {
    return `Verificar e documentar a conformidade com ${finding.regulation}. Incluir justificação técnica na memória descritiva se houver desvio.`;
  }

  return undefined;
}
