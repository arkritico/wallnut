# Extração de Regras — Segurança Contra Incêndio em Edifícios (SCIE)

Analisa o texto regulamentar da especialidade **Segurança Contra Incêndio em Edifícios (SCIE)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "FIRE_SAFETY-NNN",
  "regulationId": "<id-do-regulamento>",
  "article": "Art. X.º, n.º Y",
  "description": "Descrição em português do requisito. Pode usar {campo} para interpolação.",
  "severity": "critical | warning | info",
  "conditions": [
    { "field": "namespace.campo", "operator": "<operador>", "value": <valor> }
  ],
  "exclusions": [],
  "remediation": "Orientação para corrigir a não-conformidade.",
  "currentValueTemplate": "{namespace.campo} (opcional, usa interpolação)",
  "requiredValue": "Valor exigido pelo regulamento (opcional)",
  "enabled": true,
  "tags": ["tag1", "tag2"]
}
```

### Regras de preenchimento:

- **id**: Formato `FIRE_SAFETY-NNN` com numeração sequencial (001, 002, ...).
  Usa o ID do regulamento em formato kebab-case (ex: "dl-220-2008", "portaria-949a-2006").
- **article**: Referência precisa ao artigo/secção/alínea do regulamento.
- **description**: Em português, descreve o requisito de forma verificável. Usa `{campo}` para interpolar valores do projeto (ex: "A potência contratada ({electrical.contractedPower} kVA) excede o limite").
- **severity**:
  - `"critical"` — Obrigatório por lei; incumprimento impede licenciamento
  - `"warning"` — Boas práticas ou recomendações normativas
  - `"info"` — Informativo; sem impacto no licenciamento
- **conditions**: Array de condições que devem ser TODAS verdadeiras para a regra disparar. A regra dispara quando o projeto está em incumprimento (não quando está conforme).
- **exclusions**: Array de condições de exclusão (qualquer verdadeira = regra não se aplica). Usar para exceções explícitas no regulamento.
- **remediation**: Em português, orientação concreta para corrigir.
- **tags**: Palavras-chave relevantes (em português).

## Critérios de Severidade

| Severidade | Quando usar | Exemplos |
|------------|-------------|----------|
| `critical` | Requisito legal obrigatório (DL, Portaria, Lei). Incumprimento impede licenciamento ou constitui infração. | "deve", "é obrigatório", "não é permitido" |
| `warning` | Boas práticas, normas técnicas (NP, EN), ou requisitos que permitem alternativas. | "recomenda-se", "preferencialmente", regras de cálculo com tolerâncias |
| `info` | Informativo, referências cruzadas, ou requisitos sem impacto direto no licenciamento. | "nota", "para informação", condições já verificadas por outra regra |

## Campos Disponíveis — Segurança Contra Incêndio em Edifícios (SCIE)

Estes são os campos que as condições das regras podem referenciar:


  ### Classificação e Dados Gerais
  - `buildingType` ("residential" | "commercial" | "mixed" | "industrial")
  - `grossFloorArea` (number, m²)
  - `numberOfFloors` (number)
  - `fireSafety.riskCategory` ("1" | "2" | "3" | "4") — Categoria de risco conforme DL 220/2008 Art. 12.º, determinada pela UT, altura, efetivo e área
  - `fireSafety.buildingHeight` (number, m) — Altura do edifício medida do plano de referência ao pavimento do último piso acima do solo suscetível de ocupação
  - `fireSafety.occupantLoad` (number, pessoas) — Número máximo estimado de ocupantes do edifício (efetivo)
  - `fireSafety.occupancyIndex` (number, pessoas/m²) — Índice de ocupação por m² conforme RT-SCIE, depende da utilização-tipo
  - `fireSafety.isMixedUseBuilding` (boolean) — Indica se o edifício contém mais de uma utilização-tipo
  - `fireSafety.hasMixedUseIsolation` (boolean) — Indica se as utilizações-tipo distintas no edifício misto estão devidamente isoladas
  - `fireSafety.hasRiskBIsolation` (boolean) — Locais de risco B (efetivo > 100 ou > 50 em pisos abaixo do PR) devidamente isolados
  - `fireSafety.hasRiskDLocations` (boolean) — Locais de risco D (acamados, crianças < 6 anos, pessoas com mobilidade condicionada)
  - `fireSafety.hasRiskFIsolation` (boolean) — Locais de risco F (centrais térmicas, postos de transformação, grupos de emergência) devidamente isolados
  - `fireSafety.distanceToFireStation` (number, km) — Distância rodoviária ao quartel de bombeiros mais próximo
  - `fireSafety.distanceToAdjacentBuilding` (number, m) — Distância entre fachadas de edifícios adjacentes para avaliação de propagação
  - `fireSafety.fireStationsForTriangulation` (number) — Número de quartéis de bombeiros a considerar na triangulação do socorro
  - `fireSafety.responseTime` (number, min) — Tempo estimado de chegada dos bombeiros ao edifício
  - `fireSafety.undergroundArea` (number, m²) — Área total dos pisos abaixo do plano de referência

  ### Estrutura e Resistência ao Fogo
  - `fireSafety.fireResistanceOfStructure` (number, min) — Classificação mínima de resistência ao fogo dos elementos estruturais (REI) em minutos
  - `fireSafety.structuralFireResistance` (number, min) — Valor efetivo de REI verificado nos elementos estruturais principais
  - `fireSafety.hasStructuralFireExemption` (boolean) — Edifícios de 1.ª cat. com 1 piso e área < 300 m² podem ter isenção de classificação de resistência ao fogo
  - `fireSafety.floorFireResistance` (number, min) — Resistência ao fogo dos pavimentos que constituem compartimentação

  ### Compartimentação Corta-Fogo
  - `fireSafety.compartmentArea` (number, m²) — Maior área de compartimento corta-fogo existente no edifício
  - `fireSafety.compartmentMinRating` (number, min) — Classificação mínima de resistência ao fogo das paredes de compartimentação (EI)
  - `fireSafety.compartmentWallRating` (number, min) — Classificação EI efetiva das paredes de compartimentação existentes
  - `fireSafety.fireDoorsRating` (number, min) — Classificação EI das portas corta-fogo nos caminhos de evacuação
  - `fireSafety.fireDoorsHaveCloser` (boolean) — Indica se as portas corta-fogo possuem dispositivo de fecho automático (C)
  - `fireSafety.hasFireLobby` (boolean) — Indica se existem câmaras corta-fogo nas vias de evacuação protegidas
  - `fireSafety.hasFireStoppedPenetrations` (boolean) — Indica se as travessias de tubagens, cabos e condutas em paredes/pavimentos CF estão devidamente seladas
  - `fireSafety.hasFireDampers` (boolean) — Indica se existem registos corta-fogo (dampers) nas condutas que atravessam elementos de compartimentação
  - `fireSafety.elevatorShaftRating` (number, min) — Classificação EI do encerramento da caixa de elevadores
  - `fireSafety.elevatorsReturnOnAlarm` (boolean) — Indica se os elevadores estão programados para regressar ao piso de saída em caso de alarme de incêndio
  - `fireSafety.hasFirefighterElevator` (boolean) — Indica se existe elevador com comando prioritário para uso dos bombeiros (obrigatório para altura > 28 m)
  - `fireSafety.hasUnprotectedVerticalOpening` (boolean) — Indica se existem aberturas verticais não protegidas (escadas abertas, vazios, átrios) que comunicam pisos

  ### Reação ao Fogo dos Materiais
  - `fireSafety.wallReactionClass` (string) — Euroclasse de reação ao fogo dos revestimentos de paredes e tetos (ex.: A2-s1,d0)
  - `fireSafety.floorReactionClass` (string) — Euroclasse de reação ao fogo dos revestimentos de pavimentos (ex.: CFL-s2)
  - `fireSafety.roofFireRating` (string) — Classificação de resistência ao fogo da cobertura (REI/EI)
  - `fireSafety.roofCladding` (string) — Tipo e classe de reação ao fogo do revestimento de cobertura (ex.: BROOF(t1))
  - `fireSafety.riskBCWallReactionClass` (string) — Euroclasse de reação ao fogo dos revestimentos de paredes em locais de risco B e C
  - `fireSafety.riskCAreaWallRating` (number, min) — Classificação EI das paredes que delimitam locais de risco C (armazéns, oficinas)
  - `fireSafety.riskDArea` (number, m²) — Área dos locais de risco D (ocupantes acamados, crianças, mobilidade condicionada)
  - `fireSafety.riskDAreaWallRating` (number, min) — Classificação EI das paredes que delimitam locais de risco D
  - `fireSafety.cableFireRating` (string) — Classe de reação ao fogo dos cabos elétricos (ex.: Cca-s1b,d1,a1)

  ### Fachadas e Empenas
  - `fireSafety.empenaFireRating` (number, min) — Resistência ao fogo das empenas (paredes de meação) — mínimo EI 60 a EI 120
  - `fireSafety.facadeFireBreakHeight` (number, m) — Altura mínima do pano de peito entre vãos de pisos consecutivos para impedir propagação vertical pela fachada
  - `fireSafety.facadeProtectionStripHeight` (number, m) — Altura da faixa de proteção entre pisos — mínimo 1,10 m em edifícios > 28 m
  - `fireSafety.guardaFogosHeight` (number, m) — Altura do guarda-fogos na cobertura adjacente a empenas — mínimo 0,60 m
  - `fireSafety.hasDiedroProtection` (boolean) — Indica se o diedro (ângulo < 135° entre fachadas) tem proteção contra propagação de incêndio
  - `fireSafety.accessibleOpeningsPerFacade` (number) — Número de aberturas acessíveis aos bombeiros por fachada do edifício

  ### Pátios e Logradouros
  - `fireSafety.courtyardHeight` (number, m) — Altura das paredes interiores do pátio interior (saguão)
  - `fireSafety.courtyardVentArea` (number, m²) — Área livre de ventilação no topo do pátio interior

  ### Evacuação — Caminhos e Saídas
  - `fireSafety.numberOfExits` (number) — Número total de saídas de evacuação do edifício ou fração
  - `fireSafety.maxEvacuationDistance` (number, m) — Maior distância a percorrer desde qualquer ponto até à saída mais próxima
  - `fireSafety.evacuationPathWidth` (number, m) — Largura mínima dos caminhos de evacuação (1 UP = 0,90 m; 2 UP = 1,40 m)
  - `fireSafety.evacuationUP` (number, UP) — Número de unidades de passagem (UP) nos caminhos de evacuação
  - `fireSafety.deadEndDistance` (number, m) — Maior distância de percurso em impasse (sem saída alternativa) — máximo 15 m
  - `fireSafety.horizontalRouteLength` (number, m) — Maior distância horizontal nos caminhos de evacuação
  - `fireSafety.exitDoorsOpenOutward` (boolean) — Indica se as portas das saídas de evacuação abrem no sentido da fuga (obrigatório para efetivo > 50)
  - `fireSafety.exitsInDistinctDirections` (boolean) — Indica se as saídas de evacuação estão dispostas em direções distintas (ângulo > 45°)
  - `fireSafety.hasProtectedStairs` (boolean) — Indica se as escadas de evacuação são protegidas com envolvente resistente ao fogo
  - `fireSafety.stepsPerFlight` (number) — Número de degraus por lanço de escada (máximo 25, mínimo 3)
  - `fireSafety.guardHeight` (number, m) — Altura mínima das guardas de proteção (mínimo 1,10 m)
  - `fireSafety.roofGuardHeight` (number, m) — Altura da guarda de proteção na cobertura acessível
  - `fireSafety.hasRefugeSpaces` (boolean) — Indica se existem espaços de refúgio para pessoas com mobilidade condicionada
  - `fireSafety.belowRefEvacDistance` (number, m) — Maior distância de evacuação nos pisos abaixo do plano de referência
  - `fireSafety.residentialEvacWidth` (number, m) — Largura mínima dos caminhos de evacuação nos pisos de utilização residencial
  - `fireSafety.verticalEvacWidth` (number, m) — Largura mínima das escadas e rampas de evacuação vertical
  - `fireSafety.storageEvacDistance` (number, m) — Distância máxima de evacuação em zonas de armazenagem

  ### Deteção e Alarme de Incêndio
  - `fireSafety.hasFireDetection` (boolean) — Indica se o edifício possui sistema automático de deteção de incêndio conforme NP EN 54 / NT12
  - `fireSafety.hasFireAlarm` (boolean) — Indica se o edifício possui sistema de alarme de incêndio (sirenes/difusores)
  - `fireSafety.alarmConfigType` ("1" | "2" | "3") — Tipo de configuração do alarme conforme RT-SCIE Art. 121.º
  - `fireSafety.detectorSpacing` (number, m) — Distância máxima entre detetores automáticos de incêndio
  - `fireSafety.manualCallPointSpacing` (number, m) — Distância máxima entre botões de alarme manual (botoneiras) — máximo 30 m
  - `fireSafety.hasMonitoredFirePanel` (boolean) — Indica se a central de deteção de incêndio (CDI) é monitorizada por posto de segurança ou CRA
  - `fireSafety.hasFalseCeilingDetection` (boolean) — Indica se existe deteção automática no espaço plenum dos tetos falsos (obrigatório se h > 0,80 m)
  - `fireSafety.hasTechnicalZoneDetection` (boolean) — Indica se existe deteção automática em ductos, courettes e zonas técnicas
  - `fireSafety.hasFireBrigadeAlert` (boolean) — Indica se o sistema de deteção possui transmissão automática de alarme aos bombeiros
  - `fireSafety.hasCentralizedFireManagement` (boolean) — Indica se existe sistema de gestão técnica centralizada que integre os sistemas de segurança contra incêndio

  ### Sinalização de Segurança
  - `fireSafety.hasFireSignage` (boolean) — Indica se existe sinalização fotoluminescente conforme ISO 7010 e NP 4386
  - `fireSafety.signageHeight` (number, m) — Altura de montagem das placas de sinalização (tipicamente 2,10 m a 2,40 m)
  - `fireSafety.signageLuminance` (number, cd/m²) — Luminância mínima das placas fotoluminescentes (≥ 2 cd/m² aos 10 min, ≥ 0,3 cd/m² aos 60 min)

  ### Iluminação de Emergência
  - `fireSafety.hasEmergencyLighting` (boolean) — Indica se existe iluminação de emergência nos caminhos de evacuação e saídas
  - `fireSafety.emergencyLightingLevel` (number, lux) — Nível mínimo de iluminação de emergência nos percursos de evacuação (1 lux) e junto a equipamentos (5 lux)
  - `fireSafety.emergencyLightingAutonomy` (number, min) — Autonomia mínima das luminárias de emergência (mínimo 60 minutos)
  - `fireSafety.emergencyLightingActivationTime` (number, s) — Tempo máximo para ativação da iluminação de emergência após falha da alimentação normal (≤ 5 s para 50% do nível)
  - `fireSafety.emergencyLightingAtEquipment` (boolean) — Indica se existe iluminação de emergência junto a extintores, bocas de incêndio e botões de alarme (mínimo 5 lux)

  ### Alimentação de Emergência
  - `fireSafety.hasBackupPower` (boolean) — Indica se existe fonte de energia de emergência (grupo gerador ou UPS) para os sistemas de segurança
  - `fireSafety.emergencyPowerStartup` (number, s) — Tempo máximo para o grupo gerador de emergência entrar em funcionamento (≤ 15 s)

  ### Extintores e 1.ª Intervenção
  - `fireSafety.extinguisherDensity` (number, un./200 m²) — Número de extintores por cada 200 m² de área útil — mínimo 1 extintor por 200 m²
  - `fireSafety.extinguisherMaxDistance` (number, m) — Distância máxima de qualquer ponto do piso a um extintor — máximo 15 m
  - `fireSafety.extinguisherHeight` (number, m) — Altura do manípulo do extintor ao pavimento (máximo 1,20 m)
  - `fireSafety.extinguisherTotalCharge` (number, kg) — Carga total de agente extintor (pó químico ABC) — mínimo 18 kg por cada 500 m²
  - `fireSafety.kitchenExtinguisherRating` (string) — Classificação do extintor específico para cozinhas (classe F) — ex.: 75F
  - `fireSafety.firstInterventionFlow` (number, L/min) — Caudal disponível para meios de 1.ª intervenção (carretéis tipo teatro)
  - `fireSafety.firstInterventionAutonomy` (number, min) — Autonomia da reserva de água para meios de 1.ª intervenção

  ### Rede de Incêndio Armada (RIA)
  - `fireSafety.hasRIA` (boolean) — Indica se existe rede de incêndio armada com bocas de incêndio tipo carretel (Ø 25 mm)
  - `fireSafety.riaMinPressure` (number, bar) — Pressão mínima no difusor do carretel — mínimo 250 kPa (2,5 bar)
  - `fireSafety.riaSimultaneousFlow` (number, L/min) — Caudal para 2 carretéis em funcionamento simultâneo (2 × 1,5 L/s = 180 L/min)
  - `fireSafety.riaMaxSpacing` (number, m) — Distância máxima de qualquer ponto a uma boca de incêndio (20 m mangueira + 5 m jato)
  - `fireSafety.riaHoseLength` (number, m) — Comprimento da mangueira semi-rígida do carretel — tipicamente 20 m
  - `fireSafety.hasRASICapacityCalculation` (boolean) — Indica se foi efetuado cálculo hidráulico da rede de alimentação de serviço de incêndio (RASI)
  - `fireSafety.hasHydraulicCalculation` (boolean) — Indica se foi realizado e verificado o cálculo hidráulico da rede de incêndio

  ### Coluna Seca
  - `fireSafety.hasDryRiser` (boolean) — Indica se existe coluna seca para uso dos bombeiros (obrigatória em edifícios com altura > 9 m)
  - `fireSafety.dryRiserDiameter` (number, mm) — Diâmetro nominal da coluna seca — tipicamente DN 80
  - `fireSafety.dryRiserFlowRate` (number, L/min) — Caudal de ensaio da coluna seca para verificação hidráulica
  - `fireSafety.dryRiserMinPressure` (number, bar) — Pressão mínima na boca de incêndio mais desfavorável da coluna seca
  - `fireSafety.dryRiserTestPressure` (number, bar) — Pressão de ensaio hidrostático da coluna seca (tipicamente 1,5× a pressão de serviço)
  - `fireSafety.hasSiameseConnection` (boolean) — Indica se existe boca siamesa de alimentação na fachada acessível para ligação dos bombeiros
  - `fireSafety.supplyInletCabinetSize` (string) — Dimensões do armário que aloja a boca siamesa de alimentação na fachada

  ### Coluna Húmida
  - `fireSafety.hasWetRiser` (boolean) — Indica se existe coluna húmida permanentemente pressurizada para uso dos bombeiros
  - `fireSafety.wetRiserTestPressure` (number, bar) — Pressão de ensaio hidrostático da coluna húmida

  ### Hidrantes Exteriores
  - `fireSafety.hydrantDistance` (number, m) — Distância do edifício ao marco de incêndio ou boca de incêndio de parede mais próximo
  - `fireSafety.hydrantAutonomy` (number, min) — Autonomia mínima do abastecimento de água aos hidrantes exteriores
  - `fireSafety.nearestHydrantDistance` (number, m) — Distância à boca de incêndio ou marco de incêndio da rede pública mais próximo
  - `fireSafety.wallHydrantDistance` (number, m) — Distância à boca de incêndio de parede exterior — máximo 15 m
  - `fireSafety.privateHydrantReserve` (number, m³) — Volume da reserva de água para hidrantes privados do edifício

  ### Reservatórios e Abastecimento de Água
  - `fireSafety.hasFireWaterReservoir` (boolean) — Indica se existe reservatório de água privativo para o serviço de incêndio
  - `fireSafety.fireWaterReserveVolume` (number, m³) — Volume da reserva de água para o serviço de incêndio (RASI)
  - `fireSafety.reservoirRefillTime` (number, h) — Tempo máximo para reenchimento do reservatório de água de incêndio (tipicamente 36 h)
  - `fireSafety.reservoirAccessSize` (string) — Dimensões da abertura de acesso para limpeza e inspeção do reservatório
  - `fireSafety.reservoirBottomSlope` (number, %) — Pendente mínima do fundo do reservatório para drenagem completa
  - `fireSafety.hasFirePumpRoom` (boolean) — Indica se existe central de bombagem dedicada ao serviço de incêndio
  - `fireSafety.maxServicePressure` (number, bar) — Pressão máxima de serviço na rede de incêndio (tipicamente ≤ 10 bar nas bocas)
  - `fireSafety.reducedFlow` (number, L/min) — Caudal reduzido através da bomba jockey ou by-pass de manutenção de pressão
  - `fireSafety.simultaneousOutlets` (number) — Número de bocas de incêndio a considerar em funcionamento simultâneo para dimensionamento

  ### Depósitos Pressurizados
  - `fireSafety.pressurizedTankCapacity` (number, L) — Capacidade total do depósito pressurizado de água para combate a incêndio
  - `fireSafety.pressurizedTankPressure` (number, bar) — Pressão de serviço do depósito pressurizado
  - `fireSafety.pressurizedTankAirRatio` (number, %) — Proporção de ar no depósito pressurizado (tipicamente 30% ar, 70% água)
  - `fireSafety.pressurizedTankRefillTime` (number, min) — Tempo para reenchimento do depósito pressurizado após descarga
  - `fireSafety.pressurizedTankCompartmentRating` (number, min) — Classificação de resistência ao fogo do compartimento que aloja o depósito pressurizado
  - `fireSafety.pressurizedTankProtectedArea` (number, m²) — Área máxima de proteção garantida pelo depósito pressurizado

  ### Tubagens e Acessórios da Rede de Incêndio
  - `fireSafety.branchLength` (number, m) — Comprimento do ramal de ligação da rede de incêndio
  - `fireSafety.buriedPipeDepth` (number, m) — Profundidade mínima de enterramento das tubagens da rede de incêndio
  - `fireSafety.hasAnticorrosionCoating` (boolean) — Indica se as tubagens enterradas ou expostas possuem proteção anticorrosiva
  - `fireSafety.pipeBendRadius` (number, mm) — Raio mínimo de curvatura nas mudanças de direção das tubagens
  - `fireSafety.pipeSupportSpacing` (number, m) — Distância máxima entre apoios/suportes das tubagens da rede de incêndio
  - `fireSafety.dischargePipeHeight` (number, m) — Altura da tubagem de descarga de válvulas de segurança ou extravasores
  - `fireSafety.outletAngle` (number, °) — Ângulo de inclinação da boca de saída da coluna seca ou húmida
  - `fireSafety.fireOutletHeight` (number, m) — Altura do centro da boca de incêndio ao pavimento (tipicamente 0,80 m a 1,50 m)

  ### Sprinklers (Extinção Automática por Água)
  - `fireSafety.hasSprinklers` (boolean) — Indica se existe sistema de extinção automática por aspersores (sprinklers) conforme NP EN 12845
  - `fireSafety.sprinklerDensity` (number, mm/min) — Densidade de descarga de água — risco ligeiro 2,25 mm/min, ordinário 5,0 mm/min
  - `fireSafety.sprinklerCoverageArea` (number, m²) — Área máxima de cobertura por cada aspersor individual
  - `fireSafety.sprinklerAreaPerHead` (number, m²) — Área protegida por cada cabeça de sprinkler no dimensionamento
  - `fireSafety.sprinklerMaxSpacing` (number, m) — Distância máxima entre aspersores conforme classe de risco
  - `fireSafety.sprinklerActivationTemp` (number, °C) — Temperatura nominal de ativação do elemento termossensível (tipicamente 68 °C)
  - `fireSafety.sprinklerCalibrationTemp` (number, °C) — Temperatura de calibração (rating) do aspersor
  - `fireSafety.sprinklerTempMargin` (number, °C) — Margem entre a temperatura máxima ambiente e a temperatura de ativação (mínimo 30 °C)
  - `fireSafety.sprinklerRTI` (number, (m·s)^½) — RTI do aspersor: resposta rápida < 50, resposta padrão 80–350
  - `fireSafety.sprinklerPipeVelocity` (number, m/s) — Velocidade máxima da água nas tubagens da rede de sprinklers (tipicamente ≤ 6 m/s)
  - `fireSafety.sprinklerTestPressure` (number, bar) — Pressão de ensaio hidrostático da rede de sprinklers
  - `fireSafety.sprinklerWaterSupplyAutonomy` (number, min) — Autonomia da reserva de água para sprinklers — 30 min (risco ligeiro) a 90 min (risco grave)
  - `fireSafety.sprinklersPerControlValve` (number) — Número máximo de aspersores por cada válvula de controlo de instalação
  - `fireSafety.hasESFRSprinklers` (boolean) — Indica se estão instalados sprinklers ESFR (Early Suppression, Fast Response) em armazéns de grande altura

  ### Controlo de Fumo (Desenfumagem)
  - `fireSafety.hasSmokeControl` (boolean) — Indica se existe sistema de controlo de fumo nos caminhos de evacuação e espaços obrigatórios
  - `fireSafety.smokeControlAirVelocity` (number, m/s) — Velocidade mínima do ar nas portas de acesso a vias protegidas — mínimo 1 m/s
  - `fireSafety.smokeVentArea` (number, m²) — Área livre total das aberturas de desenfumagem (exutores, janelas, grelhas)
  - `fireSafety.smokeExtractionRatePerUP` (number, m³/h) — Caudal de extração de fumo por unidade de passagem nas vias horizontais
  - `fireSafety.stairSmokeVentArea` (number, m²) — Área livre da abertura de desenfumagem no topo da caixa de escadas (mínimo 1 m²)
  - `fireSafety.horizontalSmokeVentArea` (number, m²) — Área de aberturas de desenfumagem nas vias horizontais de evacuação
  - `fireSafety.parkingSmokeVentArea` (number, m²) — Área de aberturas de desenfumagem nos parques de estacionamento cobertos

  ### Cortinas de Água
  - `fireSafety.curtainFlowRate` (number, L/min) — Caudal por metro linear de cortina de água para proteção de aberturas
  - `fireSafety.curtainAutonomy` (number, min) — Autonomia do abastecimento de água para as cortinas de água

  ### Extinção por Agente Gasoso
  - `fireSafety.hasGasSuppression` (boolean) — Indica se existe sistema de extinção automática por agente gasoso (CO₂, FM-200, Novec, gases inertes)
  - `fireSafety.co2DischargeDuration` (number, s) — Tempo máximo de descarga para sistemas de CO₂ (tipicamente ≤ 60 s para inundação total)
  - `fireSafety.fm200Concentration` (number, %) — Concentração de projeto de HFC-227ea (FM-200) para extinção
  - `fireSafety.novecConcentration` (number, %) — Concentração de projeto de FK-5-1-12 (Novec 1230) para extinção
  - `fireSafety.inertGasConcentration` (number, %) — Concentração de projeto de gás inerte (IG-55, IG-541) para extinção
  - `fireSafety.gasAgentDischargeDelay` (number, s) — Tempo de temporização entre o alarme e a descarga do agente gasoso para evacuação do espaço

  ### Extinção Especial (Cozinhas)
  - `fireSafety.hasKitchenSuppression` (boolean) — Indica se existe sistema de extinção automática na cozinha profissional
  - `fireSafety.hasSpecialKitchenSuppression` (boolean) — Indica se existe sistema de extinção específico para cozinhas industriais com potência ≥ 70 kW
  - `fireSafety.kitchenPower` (number, kW) — Potência térmica total instalada na cozinha (obriga a sistema de extinção se > 20 kW)
  - `fireSafety.kitchenGasPower` (number, kW) — Potência térmica dos equipamentos a gás na cozinha

  ### Instalação de Gás
  - `fireSafety.hasGasInstallation` (boolean) — Indica se o edifício possui instalação de gás combustível
  - `fireSafety.hasGasAutoShutoff` (boolean) — Indica se existe válvula de corte automático de gás atuada pelo sistema de deteção de incêndio
  - `fireSafety.gasSystemConnectionDeadline` (number, s) — Tempo máximo para o corte de gás após ativação do alarme de incêndio

  ### AVAC e Interação com Deteção
  - `fireSafety.hasHVACSystem` (boolean) — Indica se o edifício possui sistema de aquecimento, ventilação e ar condicionado
  - `fireSafety.hvacStopsOnAlarm` (boolean) — Indica se o sistema AVAC é desligado automaticamente em caso de alarme de incêndio

  ### Armazenamento e Riscos Especiais
  - `fireSafety.combustibleStorageVolume` (number, m³) — Volume total de armazenagem de materiais combustíveis ou líquidos inflamáveis
  - `fireSafety.warehouseStorageHeight` (number, m) — Altura máxima de armazenamento em estantes ou pilhas
  - `fireSafety.storageGroupArea` (number, m²) — Área máxima de cada grupo (ilha) de armazenagem
  - `fireSafety.storageIndividualRating` (number, min) — Classificação EI das paredes que separam zonas individuais de armazenagem

  ### Parques de Estacionamento
  - `fireSafety.parkingCompartmentArea` (number, m²) — Área do compartimento corta-fogo do parque de estacionamento coberto
  - `fireSafety.individualParkingRating` (number, min) — Classificação EI das paredes de compartimentação dentro do parque de estacionamento

  ### Meios de 2.ª Intervenção (Bombeiros)
  - `fireSafety.secondInterventionFlow` (number, L/min) — Caudal disponível para meios de 2.ª intervenção (bocas de incêndio DN 52 para bombeiros)
  - `fireSafety.secondInterventionAutonomy` (number, min) — Autonomia da reserva de água para meios de 2.ª intervenção
  - `fireSafety.hasMinimumFirstAlarmResources` (boolean) — Indica se existem os meios mínimos de 1.º alarme exigidos (extintores, carretéis, mantas)
  - `fireSafety.complementaryUnitDistance` (number, m) — Distância entre unidades complementares de meios de intervenção

  ### Vias de Acesso e Estacionamento de Emergência
  - `fireSafety.accessRoadWidth` (number, m) — Largura livre mínima da via de acesso para viaturas de socorro — mínimo 3,50 m (viatura tipo ligeiro) a 6,00 m
  - `fireSafety.accessRoadHeight` (number, m) — Altura livre mínima da via de acesso para viaturas de socorro — mínimo 4,00 m
  - `fireSafety.accessRoadRadius` (number, m) — Raio interior mínimo de curvatura da via de acesso — mínimo 11 m
  - `fireSafety.accessRoadCurveRadius` (number, m) — Raio exterior de curvatura da via de acesso para viaturas de socorro

  ### Gestão e Organização da Segurança
  - `fireSafety.hasSecurityDelegate` (boolean) — Indica se existe delegado de segurança nomeado para o edifício (obrigatório para 1.ª e 2.ª categorias)
  - `fireSafety.hasSecurityPost` (boolean) — Indica se existe posto de segurança permanente (obrigatório para 3.ª e 4.ª categorias)
  - `fireSafety.hasSecurityPlan` (boolean) — Indica se existe plano de segurança interno aprovado conforme RT-SCIE Art. 196.º e seguintes
  - `fireSafety.hasEmergencyPlan` (boolean) — Indica se existe plano de emergência interno com procedimentos de evacuação
  - `fireSafety.hasEmergencyPlans` (boolean) — Indica se existem plantas de emergência (planos de evacuação) afixadas em locais visíveis
  - `fireSafety.hasSecurityRecords` (boolean) — Indica se existem registos de segurança com registo de ocorrências, manutenções e inspeções
  - `fireSafety.recordRetentionYears` (number, anos) — Período mínimo de retenção dos registos de segurança
  - `fireSafety.hasMaintenanceProgram` (boolean) — Indica se existe programa de manutenção preventiva dos sistemas e equipamentos de segurança contra incêndio
  - `fireSafety.hasFireTraining` (boolean) — Indica se os funcionários/residentes recebem formação em segurança contra incêndio
  - `fireSafety.hasAnnualDrill` (boolean) — Indica se é realizado simulacro de evacuação pelo menos uma vez por ano

### Campos Comuns (disponíveis em todas as especialidades)

  - `computed.totalDwellingArea` (number, m2)
  - `computed.avgFloorHeight` (number, m)
  - `computed.numBedrooms` (number)
  - `computed.numBathrooms` (number)
  - `computed.numFullBathrooms` (number)
  - `computed.typology` ("undefined" | "undefined" | "undefined" | "undefined" | "undefined" | "undefined" | "undefined")
  - `computed.floorsAboveGround` (number)
  - `computed.isMultifamily` (boolean)
  - `computed.windowToFloorRatio` (number)
  - `computed.groundFloorElevation` (number, m)
  - `computed.livingRoomArea` (number, m2)
  - `computed.livingRoomWidth` (number, m)
  - `computed.kitchenArea` (number, m2)
  - `computed.kitchenWidth` (number, m)
  - `computed.bedroomArea` (number, m2)
  - `computed.bedroomWidth` (number, m)
  - `computed.mainBedroomArea` (number, m2)
  - `computed.mainBedroomWidth` (number, m)
  - `computed.wcArea` (number, m2)
  - `computed.wcWidth` (number, m)
  - `computed.halfBathArea` (number, m2)
  - `computed.halfBathWidth` (number, m)
  - `computed.pantryArea` (number, m2)
  - `computed.pantryWidth` (number, m)
  - `computed.storageArea` (number, m2)
  - `computed.storageHeight` (number, m)
  - `computed.roomDepthToHeightRatio` (number)
  - `computed.allBedroomsHaveNaturalLight` (boolean)
  - `computed.mainDoorWidth` (number, m)
  - `computed.mainDoorHeight` (number, m)
  - `computed.interiorDoorWidth` (number, m)
  - `computed.wcDoorWidth` (number, m)
  - `computed.buildingEntryDoorWidth` (number, m)
  - `computed.commonAreaDoorWidth` (number, m)
  - `computed.emergencyExitWidth` (number, m)
  - `computed.corridorWidth` (number, m)
  - `computed.corridorLength` (number, m)
  - `computed.shortCorridorWidth` (number, m)
  - `computed.commonCorridorWidth` (number, m)
  - `computed.entryHallWidth` (number, m)
  - `computed.entryLandingDepth` (number, m)
  - `computed.exteriorWalkwayWidth` (number, m)
  - `computed.maxDeadEndDistance` (number, m)
  - `computed.stairWidth` (number, m)
  - `computed.stairRiserHeight` (number, m)
  - `computed.stairTreadDepth` (number, m)
  - `computed.stairBlondelValue` (number, m)
  - `computed.stairLandingDepth` (number, m)
  - `computed.stairHasHandrail` (boolean)
  - `computed.numSteps` (number)
  - `computed.consecutiveSteps` (number)
  - `computed.commonStairWidth` (number, m)
  - `computed.commonStairRiserHeight` (number, m)
  - `computed.commonStairTreadDepth` (number, m)
  - `computed.commonStairBlondel` (number, m)
  - `computed.commonStairLandingDepth` (number, m)
  - `computed.commonStairHasHandrailsBothSides` (boolean)
  - `computed.publicStairWidth` (number, m)
  - `computed.stairLiveLoad` (number, kN/m2)
  - `computed.accessRampSlope` (number, %)
  - `computed.accessibleRampSlope` (number, %)
  - `computed.guardRailHeight` (number, m)
  - `computed.guardRailSpacing` (number, m)
  - `computed.interiorGuardRailHeight` (number, m)
  - `computed.hasElevator` (boolean)
  - `computed.elevatorCabinArea` (number, m2)
  - `computed.balconyDepth` (number, m)
  - `computed.balconyHasWaterproofing` (boolean)
  - `computed.balconyLiveLoad` (number, kN/m2)
  - `computed.wcHasImpermeableFloor` (boolean)
  - `computed.wcHasVentilation` (boolean)
  - `computed.wcTileHeight` (number, m)
  - `computed.hasBathtub` (boolean)
  - `computed.kitchenHasExhaust` (boolean)
  - `computed.kitchenHasNaturalLight` (boolean)
  - `computed.kitchenHasImpermeableFloor` (boolean)
  - `computed.kitchenTileHeight` (number, m)
  - `computed.garageHeight` (number, m)
  - `computed.garageRampSlope` (number, %)
  - `computed.garageRampWidth` (number, m)
  - `computed.garageAisleWidth` (number, m)
  - `computed.garageVentilationArea` (number, m2)
  - `computed.garageFireResistance` (number, min)
  - `computed.parkingSpaceWidth` (number, m)
  - `computed.parkingSpaceLength` (number, m)
  - `computed.basementHeight` (number, m)
  - `computed.basementHasNaturalVentilation` (boolean)
  - `computed.basementIsWaterproof` (boolean)
  - `computed.basementUsedAsHabitation` (boolean)
  - `computed.atticHeight` (number, m)
  - `computed.nonHabitableHeight` (number, m)
  - `computed.roofType` ("undefined" | "undefined" | "undefined")
  - `computed.roofSlopePercent` (number, %)
  - `computed.flatRoofSlopePercent` (number, %)
  - `computed.roofHasThermalInsulation` (boolean)
  - `computed.roofHasMaintenanceAccess` (boolean)
  - `computed.yardDepth` (number, m)
  - `computed.yardHasDrainage` (boolean)
  - `computed.permeableYardRatio` (number)
  - `computed.frontFenceHeight` (number, m)
  - `computed.frontFenceTransparency` (number, %)
  - `computed.frontWallHeight` (number, m)
  - `computed.sideWallHeight` (number, m)
  - `computed.hasWaterAndSewage` (boolean)
  - `computed.hasElectricalInstallation` (boolean)
  - `computed.hasCommonElectricalPanel` (boolean)
  - `computed.hasIndividualWaterMeter` (boolean)
  - `computed.hasNaturalVentilation` (boolean)
  - `computed.hasCrossVentilation` (boolean)
  - `computed.hasWaterproofing` (boolean)
  - `computed.hasThermalInsulation` (boolean)
  - `computed.hasAcousticInsulation` (boolean)
  - `computed.hasGasAppliances` (boolean)
  - `computed.gasRoomVentArea` (number, m2)
  - `computed.chimneyHeightAboveRidge` (number, m)
  - `computed.flueIsFireResistant` (boolean)
  - `computed.flueSectionArea` (number, m2)
  - `computed.hasCanteen` (boolean)
  - `computed.hasChangingRooms` (boolean)
  - `computed.commercialFloorHeight` (number, m)
  - `computed.commercialBasementHeight` (number, m)
  - `computed.commercialExitWidth` (number, m)
  - `computed.commercialLuxLevel` (number, lux)
  - `computed.commercialVentilationRate` (number, m3/h)
  - `computed.commercialWcRatio` (number)
  - `computed.industrialHeight` (number, m)
  - `computed.industrialVentilationRate` (number, m3/h)
  - `computed.industrialLiveLoad` (number, kN/m2)
  - `computed.industrialExitWidthPerOccupant` (number, m)
  - `computed.industrialWorkersPerWc` (number)
  - `computed.numWorkers` (number)
  - `computed.warehouseHeight` (number, m)
  - `computed.warehouseLiveLoad` (number, kN/m2)
  - `computed.warehouseVentRatio` (number)
  - `computed.facadeSoundInsulation` (number, dB)
  - `computed.interDwellingSoundInsulation` (number, dB)
  - `computed.impactSoundLevel` (number, dB)
  - `computed.floorHasSoundInsulation` (boolean)
  - `computed.floorLiveLoad` (number, kN/m2)
  - `computed.floorDeflectionRatio` (number)
  - `computed.extWallThickness` (number, m)
  - `computed.extWallMaterial` ("undefined" | "undefined" | "undefined" | "undefined" | "undefined" | "undefined" | "undefined" | "undefined")
  - `computed.interiorPartitionThickness` (number, m)
  - `computed.partitionWallThickness` (number, m)
  - `computed.boundaryWallThickness` (number, m)

## Operadores Disponíveis

| Operador | Descrição | Exemplo |
|----------|-----------|---------|
| `>` | Maior que (number) | `{"field":"electrical.contractedPower","operator":">","value":13.8}` |
| `>=` | Maior ou igual (number) | `{"field":"numberOfFloors","operator":">=","value":4}` |
| `<` | Menor que (number) | `{"field":"thermal.uValueWalls","operator":"<","value":0.5}` |
| `<=` | Menor ou igual (number) | `{"field":"acoustic.dntw","operator":"<=","value":50}` |
| `==` | Igual a (string/number/boolean) | `{"field":"buildingType","operator":"==","value":"residential"}` |
| `!=` | Diferente de | `{"field":"electrical.supplyType","operator":"!=","value":"three_phase"}` |
| `exists` | Campo existe e é verdadeiro (truthy) | `{"field":"fireSafety.hasFireAlarm","operator":"exists","value":null}` |
| `not_exists` | Campo não existe, é falso ou vazio | `{"field":"electrical.hasEarthingSystem","operator":"not_exists","value":null}` |
| `in` | Valor está numa lista | `{"field":"buildingType","operator":"in","value":["residential","mixed"]}` |
| `not_in` | Valor não está numa lista | `{"field":"fireSafety.riskCategory","operator":"not_in","value":["1","2"]}` |
| `between` | Valor entre [min, max] inclusive | `{"field":"grossFloorArea","operator":"between","value":[50,200]}` |
| `not_in_range` | Valor fora do intervalo [min, max] | `{"field":"electrical.rcdSensitivity","operator":"not_in_range","value":[10,30]}` |
| `lookup_gt` | Campo > valor da tabela de consulta | `{"field":"thermal.uValueWalls","operator":"lookup_gt","value":null,"table":"u_value_limits","keys":["location.climateZoneWinter"]}` | Requer 'table' e opcionalmente 'keys'
| `lookup_gte` | Campo >= valor da tabela | `{"field":"fireSafety.fireResistance","operator":"lookup_gte","value":null,"table":"fire_resistance"}` |
| `lookup_lt` | Campo < valor da tabela | `{"field":"acoustic.dntw","operator":"lookup_lt","value":null,"table":"acoustic_limits"}` |
| `lookup_lte` | Campo <= valor da tabela | `{"field":"structural.soilFactor","operator":"lookup_lte","value":null,"table":"soil_factors"}` |
| `lookup_eq` | Campo == valor da tabela (string/boolean) | `{"field":"fireSafety.hasDetection","operator":"lookup_eq","value":null,"table":"detection_requirements"}` |
| `lookup_neq` | Campo != valor da tabela | `{"field":"gas.ventilationType","operator":"lookup_neq","value":null,"table":"ventilation_types"}` |
| `ordinal_lt` | Campo classifica-se abaixo do limiar numa escala ordenada | `{"field":"energy.energyClass","operator":"ordinal_lt","value":"B-","scale":["A+","A","B","B-","C","D","E","F"]}` | Requer 'scale' — array ordenado do melhor para o pior
| `ordinal_lte` | Campo classifica-se no limiar ou abaixo | `{"field":"energy.energyClass","operator":"ordinal_lte","value":"C"}` |
| `ordinal_gt` | Campo classifica-se acima do limiar | `{"field":"acoustic.comfortClass","operator":"ordinal_gt","value":"D"}` |
| `ordinal_gte` | Campo classifica-se no limiar ou acima | `{"field":"accessibility.accessLevel","operator":"ordinal_gte","value":"AA"}` |
| `formula_gt` | Campo > resultado de uma fórmula (expressão JS) | `{"field":"electrical.numberOfCircuits","operator":"formula_gt","value":"grossFloorArea / 20 + 2"}` | O 'value' é uma expressão que acede aos campos do projeto
| `formula_gte` | Campo >= fórmula | `{"field":"fireSafety.exitWidth","operator":"formula_gte","value":"occupancy * 0.01"}` |
| `formula_lt` | Campo < fórmula | `{"field":"thermal.solarGain","operator":"formula_lt","value":"usableFloorArea * 0.15"}` |
| `formula_lte` | Campo <= fórmula | `{"field":"energy.ntc","operator":"formula_lte","value":"energy.nt * 1.0"}` |
| `computed_lt` | Como formula_lt mas fórmula no campo 'formula' | `{"field":"plumbing.pipeSize","operator":"computed_lt","value":null,"formula":"waterDrainage.peakFlow * 0.5 + 15"}` | Útil quando o 'value' precisa ser null e a fórmula é complexa
| `computed_lte` | Campo <= fórmula (no campo 'formula') | `{"field":"electrical.circuitCurrent","operator":"computed_lte","value":null}` |
| `computed_gt` | Campo > fórmula (no campo 'formula') | `{"field":"hvac.airflow","operator":"computed_gt","value":null}` |
| `computed_gte` | Campo >= fórmula (no campo 'formula') | `{"field":"structural.loadCapacity","operator":"computed_gte","value":null}` |
| `reaction_class_lt` | Euroclasse de reação ao fogo pior que o limiar (A1=melhor, F=pior) | `{"field":"fireSafety.wallReactionClass","operator":"reaction_class_lt","value":"C"}` | Escala: A1, A2, B, C, D, E, F, CFL-s1, CFL-s2, DFL-s1, EFL, FFL
| `reaction_class_lte` | Euroclasse igual ou pior | `{"field":"fireSafety.floorReactionClass","operator":"reaction_class_lte","value":"DFL-s1"}` |
| `reaction_class_gt` | Euroclasse melhor que o limiar | `{"field":"fireSafety.ceilingReactionClass","operator":"reaction_class_gt","value":"D"}` |
| `reaction_class_gte` | Euroclasse igual ou melhor | `{"field":"fireSafety.facadeReactionClass","operator":"reaction_class_gte","value":"B"}` |

### Notas sobre operadores:

- **Comparação direta** (`>`, `>=`, `<`, `<=`, `==`, `!=`): Para a maioria das regras com limiares fixos.
- **Existência** (`exists`, `not_exists`): Para verificar se um campo obrigatório foi preenchido.
- **Tabelas de consulta** (`lookup_*`): Quando o limiar depende de variáveis do projeto (zona climática, tipo de edifício, etc.). Requer campo `"table"` e opcionalmente `"keys"`.
- **Fórmulas** (`formula_*`): Quando o limiar é calculado a partir de outros campos. O `"value"` contém uma expressão JavaScript (ex: `"grossFloorArea / 20 + 2"`).
- **Ordinal** (`ordinal_*`): Para escalas ordenadas (classes energéticas, classificações). Requer campo `"scale"`.
- **Reação ao fogo** (`reaction_class_*`): Para Euroclasses de reação ao fogo (A1=melhor, F=pior).

**Regra de ouro**: Se o regulamento diz "deve ser pelo menos X", a regra que deteta incumprimento é `campo < X` (ou `campo "not_exists"` se o campo pode não estar preenchido).

## Tabelas de Consulta Existentes

As seguintes tabelas já estão definidas e podem ser referenciadas nas condições:

  - `fire_resistance` — Resistência ao fogo mínima (REI em minutos) por tipo de edifício e categoria de risco — RT-SCIE / NT07 (keys: `buildingType`, `fireSafety.riskCategory`)
  - `fire_detection_required` — Detecção automática de incêndio obrigatória — RT-SCIE / NT12 (keys: `buildingType`, `fireSafety.riskCategory`)
  - `fire_sprinklers_required` — Sprinklers obrigatórios — RT-SCIE / NT16 (keys: `buildingType`, `fireSafety.riskCategory`)
  - `max_evacuation_distance` — Distância máxima de evacuação (metros) por tipo de percurso (keys: `fireSafety.numberOfExits`)

Para referenciá-las, usa:
```json
{ "field": "campo.a.verificar", "operator": "lookup_gte", "value": null, "table": "id_da_tabela" }
```

Se precisares de uma nova tabela, indica-o num campo `"_newTable"` no topo do JSON:
```json
{
  "_newTables": [
    {
      "id": "nome_da_tabela",
      "description": "Descrição da tabela",
      "keys": ["campo.chave1", "campo.chave2"],
      "values": { "valor1": { "valor2": 123 } }
    }
  ],
  "rules": [...]
}
```

## Estado Atual — Segurança Contra Incêndio em Edifícios (SCIE)

Regulamentos registados nesta especialidade:

  - **DL 220/2008** — Regime Jurídico de Segurança Contra Incêndio em Edifícios (SCIE) [verified, 6 rules]
  - **Portaria 1532/2008** — Regulamento Técnico de SCIE (RT-SCIE) [verified, 0 rules]
  - **Portaria 135/2020** — Alteração e republicação do RT-SCIE [PENDING, 0 rules]
  - **RT-SCIE** — Regulamento Técnico de Segurança Contra Incêndio em Edifícios (RT-SCIE) [complete, 20 rules]

Total: 199 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "SCIE-REI-01",
    "regulationId": "dl-220-2008-scie",
    "article": "RT-SCIE Art. 15.º / NT07 — Resistência ao Fogo",
    "description": "A resistência ao fogo da estrutura ({fireSafety.fireResistanceOfStructure} min) é inferior ao mínimo exigido para a utilização-tipo e categoria de risco deste edifício.",
    "severity": "critical",
    "conditions": [
      {
        "field": "fireSafety.fireResistanceOfStructure",
        "operator": "lookup_lt",
        "value": null,
        "table": "fire_resistance",
        "keys": [
          "buildingType",
          "fireSafety.riskCategory"
        ]
      }
    ],
    "remediation": "Rever a classificação de resistência ao fogo (REI) dos elementos estruturais. Consultar NT07 para os valores exigidos por utilização-tipo e categoria de risco. Soluções possíveis: protecção passiva com placas de gesso, betão projectado, tintas intumescentes.",
    "currentValueTemplate": "REI {fireSafety.fireResistanceOfStructure}",
    "requiredValue": "Consultar tabela RT-SCIE por UT e categoria de risco",
    "enabled": true,
    "tags": [
      "REI",
      "resistência ao fogo",
      "estrutura",
      "lookup"
    ]
  },
  {
    "id": "SCIE-DET-01",
    "regulationId": "dl-220-2008-scie",
    "article": "RT-SCIE Art. 125.º / NT12 — Deteção Automática",
    "description": "Não está prevista deteção automática de incêndio (SADI). Para a utilização-tipo e categoria de risco deste edifício, a deteção automática é obrigatória.",
    "severity": "critical",
    "conditions": [
      {
        "field": "fireSafety.hasFireDetection",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "fireSafety.riskCategory",
        "operator": "ordinal_gte",
        "value": "2",
        "scale": [
          "1",
          "2",
          "3",
          "4"
        ]
      }
    ],
    "remediation": "Instalar sistema automático de deteção de incêndio (SADI) conforme NP EN 54 e NT12. Definir zonas de deteção, tipo de detetores (ópticos, térmicos, multi-sensor) e central de deteção.",
    "requiredValue": "SADI obrigatório para esta UT e categoria",
    "enabled": true,
    "tags": [
      "SADI",
      "deteção",
      "NT12"
    ]
  },
  {
    "id": "SCIE-SINAL-01",
    "regulationId": "dl-220-2008-scie",
    "article": "RT-SCIE Art. 108.º — Sinalização de Segurança",
    "description": "Não está prevista sinalização de segurança contra incêndio. A sinalética fotoluminescente é obrigatória em todos os caminhos de evacuação, saídas, equipamentos de combate e comandos de sistemas de segurança.",
    "severity": "warning",
    "conditions": [
      {
        "field": "fireSafety.hasFireSignage",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Instalar sinalização de segurança conforme ISO 7010 e NP 4386, incluindo: placas de saída e saída de emergência, indicação de sentido de evacuação, localização de extintores, bocas de incêndio, botões de alarme e comandos de desenfumagem. As placas devem ser fotoluminescentes com luminância ≥ 2 cd/m² aos 10 min e ≥ 0,3 cd/m² aos 60 min. Referência: RT-SCIE Art. 108.º a 112.º.",
    "currentValueTemplate": "Sinalização: {fireSafety.hasFireSignage}",
    "requiredValue": "Sinalização fotoluminescente obrigatória em todos os percursos",
    "enabled": true,
    "tags": [
      "sinalização",
      "fotoluminescente",
      "evacuação",
      "ISO 7010"
    ]
  },
  {
    "id": "SCIE-ALARM-01",
    "regulationId": "dl-220-2008-scie",
    "article": "RT-SCIE Art. 121.º — Alarme",
    "description": "Não está previsto sistema de alarme de incêndio. O alarme é obrigatório em todas as utilizações-tipo.",
    "severity": "critical",
    "conditions": [
      {
        "field": "fireSafety.hasFireAlarm",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Prever sistema de alarme de incêndio com sirenes audíveis em todo o edifício. Para categorias ≥ 2ª, o alarme deve ser integrado com o SADI. Referência: RT-SCIE Art. 121.º.",
    "requiredValue": "Alarme de incêndio obrigatório",
    "enabled": true,
    "tags": [
      "alarme",
      "incêndio"
    ]
  },
  {
    "id": "SCIE-EVAC-01",
    "regulationId": "dl-220-2008-scie",
    "article": "RT-SCIE Art. 56.º — Distância de Evacuação",
    "description": "A distância máxima de evacuação ({fireSafety.maxEvacuationDistance} m) excede o limite regulamentar. Percursos em impasse: máximo 15 m; com saídas alternativas: máximo 30 m.",
    "severity": "critical",
    "conditions": [
      {
        "field": "fireSafety.maxEvacuationDistance",
        "operator": ">",
        "value": 30
      }
    ],
    "remediation": "Reduzir distâncias de evacuação criando saídas adicionais ou reorganizando a circulação. Percursos em impasse (sem alternativa) não podem exceder 15 m. Com saídas alternativas, o máximo é 30 m.",
    "currentValueTemplate": "{fireSafety.maxEvacuationDistance} m",
    "requiredValue": "≤ 15 m (impasse) / ≤ 30 m (alternativas)",
    "enabled": true,
    "tags": [
      "evacuação",
      "distância",
      "impasse"
    ]
  }
]
```

## Formato de Resposta

Responde APENAS com um objeto JSON válido:

```json
{
  "regulationRef": "<id-do-regulamento>",
  "description": "Regras extraídas de <referência curta do regulamento>",
  "extractedBy": "claude-extraction",
  "extractedAt": "2026-02-18",
  "rules": [
    { ... },
    { ... }
  ]
}
```

### Checklist antes de responder:

- [ ] Cada regra tem ID único no formato `FIRE_SAFETY-NNN`
- [ ] Cada regra referencia o artigo/secção exata do regulamento
- [ ] Os campos usados existem na lista acima
- [ ] Os operadores são válidos (consulta a tabela de operadores)
- [ ] As regras detetam **incumprimento** (não conformidade)
- [ ] A severidade está correta (critical = lei, warning = norma, info = informativo)
- [ ] A remediação é concreta e em português
- [ ] Não há regras duplicadas
- [ ] Tags são palavras-chave relevantes em português

---

**Cola o texto do regulamento abaixo desta linha e responde com o JSON das regras extraídas.**