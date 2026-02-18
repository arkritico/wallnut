# Extração de Regras — Ascensores e Elevadores (DL 320/2002)

Analisa o texto regulamentar da especialidade **Ascensores e Elevadores (DL 320/2002)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "ELEVATORS-NNN",
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

- **id**: Formato `ELEVATORS-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Ascensores e Elevadores (DL 320/2002)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais do Ascensor
  - `elevator.hasElevator` (boolean) — Indica se o edifício possui ascensor instalado — campo de entrada principal (gate)
  - `numberOfFloors` (number) — Número total de pisos do edifício — obrigatório ascensor para edifícios com mais de 4 pisos
  - `elevator.numberOfElevators` (number) — Número total de ascensores instalados no edifício
  - `elevator.driveType` ("traction" | "hydraulic") — Tipo de acionamento do ascensor — por tração (cabos) ou hidráulico
  - `elevator.speed` (number, m/s) — Velocidade nominal do ascensor — tipicamente 1,0 m/s para edifícios residenciais
  - `elevator.cabinCapacity` (number, kg) — Carga nominal da cabina do ascensor em quilogramas
  - `elevator.ratedPersons` (number) — Número máximo de passageiros conforme a carga nominal (75 kg/pessoa)
  - `elevator.hasCEMarking` (boolean) — Indica se o ascensor possui marcação CE conforme Diretiva 2014/33/UE

  ### Cabina e Dimensões
  - `elevator.cabinDepth` (number, m) — Profundidade interior da cabina do ascensor
  - `elevator.doorWidth` (number, m) — Largura livre da porta de acesso à cabina do ascensor
  - `elevator.doorOpenTime` (number, s) — Tempo mínimo de permanência da porta aberta antes do fecho automático
  - `elevator.levellingAccuracy` (number, mm) — Precisão de paragem ao nível do piso — máximo ±10 mm conforme EN 81-20
  - `elevator.cabinIlluminance` (number, lux) — Nível mínimo de iluminação no interior da cabina — mínimo 100 lux
  - `elevator.hasHandrail` (boolean) — Indica se a cabina possui corrimão em pelo menos uma parede lateral
  - `elevator.hasFloorIndicator` (boolean) — Indica se existe indicador visual de piso no interior da cabina
  - `elevator.hasCabinVentilation` (boolean) — Indica se a cabina possui aberturas ou ventilação adequada conforme EN 81-20

  ### Segurança e Proteção
  - `elevator.pitDepth` (number, m) — Profundidade do poço do ascensor abaixo do nível mais baixo servido
  - `elevator.headroom` (number, m) — Distância vertical livre entre o topo da cabina e o teto da caixa do ascensor
  - `elevator.hasBuffers` (boolean) — Indica se existem amortecedores (buffers) no fundo do poço conforme EN 81-20
  - `elevator.hasSpeedGovernor` (boolean) — Indica se existe limitador de velocidade que aciona o para-quedas em caso de excesso de velocidade
  - `elevator.cableSafetyFactor` (number) — Coeficiente de segurança dos cabos de tração — mínimo 12 conforme EN 81-20
  - `elevator.landingDoorFireRating` (number, min) — Classificação de resistência ao fogo (E/EI) das portas de patamar do ascensor
  - `elevator.hasEmergencyCommunication` (boolean) — Indica se a cabina possui sistema de comunicação bidirecional (intercomunicador) com serviço de resgate 24h
  - `elevator.hasEmergencyLighting` (boolean) — Indica se a cabina possui iluminação de emergência com autonomia mínima de 1 hora
  - `elevator.hasEmergencyPower` (boolean) — Indica se o ascensor possui alimentação de emergência para funcionamento em caso de falha elétrica

  ### Acessibilidade
  - `elevator.isAccessible` (boolean) — Indica se o ascensor cumpre os requisitos de acessibilidade para pessoas com mobilidade condicionada (DL 163/2006)
  - `elevator.callButtonHeight` (number, m) — Altura dos botões de chamada nos patamares — entre 0,90 m e 1,10 m
  - `elevator.interiorPanelHeight` (number, m) — Altura do botão mais alto no painel de comandos interior da cabina — máximo 1,20 m
  - `elevator.hasAudioAnnouncement` (boolean) — Indica se existe anúncio sonoro automático do piso de paragem para pessoas com deficiência visual

  ### Casa das Máquinas
  - `elevator.machineRoomHeight` (number, m) — Altura livre no interior da casa das máquinas do ascensor

  ### Manutenção e Inspeção
  - `elevator.hasMaintenanceContract` (boolean) — Indica se existe contrato de manutenção com empresa de manutenção de ascensores (obrigatório)
  - `elevator.maintenanceVisitsPerYear` (number) — Número mínimo de visitas de manutenção por ano — mínimo 12 conforme DL 320/2002
  - `elevator.hasPeriodicInspection` (boolean) — Indica se a inspeção periódica obrigatória foi realizada por entidade inspetora (a cada 2 anos)
  - `elevator.hasLogBook` (boolean) — Indica se existe livro de registo do ascensor com histórico de manutenções e inspeções

  ### Ascensor de Bombeiros
  - `elevator.isFirefighterElevator` (boolean) — Indica se o ascensor é destinado a uso prioritário dos bombeiros conforme EN 81-72
  - `elevator.hasFirefighterElevator` (boolean) — Indica se o edifício possui pelo menos um ascensor prioritário para bombeiros (obrigatório para altura > 28 m)

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

## Estado Atual — Ascensores e Elevadores (DL 320/2002)

Regulamentos registados nesta especialidade:

  - **DL 320/2002** — Regime de Manutenção e Inspeção de Ascensores, Monta-cargas, Escadas Mecânicas e Tapetes Rolantes [verified, 15 rules]
  - **EN 81-20** — Regras de Segurança para Construção e Instalação de Ascensores — Parte 20: Ascensores de Pessoas e Cargas [verified, 31 rules]
  - **EN 81-50** — Regras de Segurança para Construção e Instalação de Ascensores — Parte 50: Regras de Projecto, Cálculos e Verificação [verified, 5 rules]
  - **EN 81-70** — Regras de Segurança para Construção e Instalação de Ascensores — Parte 70: Acessibilidade de Ascensores para Pessoas com Deficiência [verified, 10 rules]

Total: 61 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "ELEV-OBRIG-01",
    "regulationId": "dl-320-2002",
    "article": "Obrigatoriedade de Ascensor — DL 163/2006 Art. 2.º / RGEU Art. 50.º",
    "description": "O edifício tem {numberOfFloors} pisos. A instalação de pelo menos um ascensor é obrigatória.",
    "severity": "critical",
    "conditions": [
      {
        "field": "elevator.hasElevator",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "numberOfFloors",
        "operator": ">=",
        "value": 4
      }
    ],
    "remediation": "Instalar pelo menos um ascensor acessível conforme DL 163/2006 e EN 81-20.",
    "currentValueTemplate": "{numberOfFloors} pisos, sem ascensor",
    "requiredValue": "Ascensor obrigatório para >= 4 pisos",
    "enabled": true,
    "tags": [
      "obrigatório",
      "pisos",
      "acessibilidade"
    ]
  },
  {
    "id": "ELEV-NUM-01",
    "regulationId": "dl-320-2002",
    "article": "Número de Ascensores — RGEU Art. 50.º / Boas Práticas",
    "description": "Edifícios com {numberOfFloors} pisos devem ter pelo menos 2 ascensores para redundância.",
    "severity": "warning",
    "conditions": [
      {
        "field": "numberOfFloors",
        "operator": ">=",
        "value": 8
      },
      {
        "field": "elevator.numberOfElevators",
        "operator": "<",
        "value": 2
      },
      {
        "field": "elevator.hasElevator",
        "operator": "exists",
        "value": null
      }
    ],
    "remediation": "Instalar segundo ascensor para garantir redundância e mobilidade adequada.",
    "currentValueTemplate": "{elevator.numberOfElevators} ascensor(es)",
    "requiredValue": ">= 2 ascensores para edifícios >= 8 pisos",
    "enabled": true,
    "tags": [
      "número",
      "redundância",
      "pisos"
    ]
  },
  {
    "id": "ELEV-CE-01",
    "regulationId": "dl-320-2002",
    "article": "DL 320/2002 Art. 3.º / Diretiva 2014/33/UE Art. 2.º — Marcação CE",
    "description": "Os ascensores novos devem possuir marcação CE conforme a Diretiva Ascensores 2014/33/UE, transposta pelo DL 320/2002. A marcação CE atesta conformidade com os requisitos essenciais de saúde e segurança.",
    "severity": "critical",
    "conditions": [
      {
        "field": "elevator.hasCEMarking",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "elevator.hasElevator",
        "operator": "exists",
        "value": null
      }
    ],
    "remediation": "Garantir marcação CE do ascensor conforme Diretiva 2014/33/UE. A marcação deve ser aposta pelo fabricante ou instalador com declaração UE de conformidade e intervenção de organismo notificado.",
    "requiredValue": "Marcação CE obrigatória para ascensores novos",
    "enabled": true,
    "tags": [
      "CE",
      "diretiva",
      "segurança",
      "DL 320/2002"
    ]
  },
  {
    "id": "ELEV-MANUT-01",
    "regulationId": "dl-320-2002",
    "article": "DL 320/2002 Art. 4.º — Contrato de Manutenção Obrigatório",
    "description": "É obrigatório contrato de manutenção com empresa certificada (EMA — Empresa de Manutenção de Ascensores) registada no IMPIC.",
    "severity": "critical",
    "conditions": [
      {
        "field": "elevator.hasMaintenanceContract",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "elevator.hasElevator",
        "operator": "exists",
        "value": null
      }
    ],
    "remediation": "Celebrar contrato de manutenção com empresa de manutenção de ascensores (EMA) devidamente registada no IMPIC, conforme DL 320/2002 Art. 4.º.",
    "requiredValue": "Contrato de manutenção com empresa certificada obrigatório",
    "enabled": true,
    "tags": [
      "manutenção",
      "contrato",
      "obrigatório",
      "DL 320/2002"
    ]
  },
  {
    "id": "ELEV-MANUT-02",
    "regulationId": "dl-320-2002",
    "article": "DL 320/2002 Art. 4.º, n.º 3 — Frequência Mínima de Manutenção",
    "description": "O ascensor teve {elevator.maintenanceVisitsPerYear} visitas de manutenção no último ano. O mínimo legal é de 12 visitas por ano (1 por mês).",
    "severity": "critical",
    "conditions": [
      {
        "field": "elevator.maintenanceVisitsPerYear",
        "operator": "<",
        "value": 12
      },
      {
        "field": "elevator.hasElevator",
        "operator": "exists",
        "value": null
      }
    ],
    "remediation": "Assegurar pelo menos 12 visitas de manutenção por ano (1 mensal) conforme DL 320/2002 Art. 4.º, n.º 3. A empresa de manutenção deve registar cada visita no livro do ascensor.",
    "currentValueTemplate": "{elevator.maintenanceVisitsPerYear} visitas/ano",
    "requiredValue": ">= 12 visitas de manutenção por ano",
    "enabled": true,
    "tags": [
      "manutenção",
      "frequência",
      "obrigatório",
      "DL 320/2002"
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

- [ ] Cada regra tem ID único no formato `ELEVATORS-NNN`
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