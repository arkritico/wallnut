# Extração de Regras — Arquitetura (RGEU + Código Civil)

Analisa o texto regulamentar da especialidade **Arquitetura (RGEU + Código Civil)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "ARCHITECTURE-NNN",
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

- **id**: Formato `ARCHITECTURE-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Arquitetura (RGEU + Código Civil)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais
  - `buildingType` ("residential" | "commercial" | "mixed" | "industrial")
  - `isRehabilitation` (boolean) — Indica se se trata de uma obra de reabilitação, podendo beneficiar de flexibilizações regulamentares
  - `architecture.isMultifamily` (boolean) — Indica se o edifício possui mais do que um fogo (habitação coletiva)
  - `architecture.hasBuildingPermitDesign` (boolean) — Indica se existe projeto de arquitetura para efeitos de licenciamento camarário
  - `architecture.pdmCompliance` (boolean) — Indica se o projeto está conforme os parâmetros urbanísticos do PDM vigente
  - `architecture.buildingHeight` (number, m) — Altura do edifício medida desde a cota do terreno até à cumeeira ou platibanda
  - `architecture.ceilingHeight` (number, m) — Pé-direito livre mínimo dos compartimentos, conforme RGEU Art. 65.º (mínimo 2,70 m em habitação)

  ### Áreas e Tipologia
  - `architecture.typology` ("T0" | "T1" | "T2" | "T3" | "T4" | "T5") — Tipologia da habitação (Tn, onde n é o número de quartos)
  - `architecture.totalUsableArea` (number, m²) — Área útil total do fogo, conforme Portaria 62/2003 — áreas mínimas variam com a tipologia
  - `architecture.numberOfBedrooms` (number) — Número de quartos de dormir do fogo, define a tipologia (Tn)
  - `architecture.numberOfBathrooms` (number) — Número de instalações sanitárias do fogo

  ### Compartimentos
  - `architecture.hasKitchen` (boolean) — Indica se o fogo possui cozinha independente, conforme RGEU
  - `architecture.hasLivingRoom` (boolean) — Indica se o fogo possui sala de estar, obrigatória a partir de T1
  - `architecture.livingRoomArea` (number, m²) — Área útil da sala de estar — mínimo 12 m² conforme Portaria 62/2003
  - `architecture.livingRoomMinWidth` (number, m) — Largura mínima da sala de estar — mínimo 3,0 m
  - `architecture.mainBedroomArea` (number, m²) — Área útil do quarto principal — mínimo 10,5 m² conforme Portaria 62/2003
  - `architecture.mainBedroomMinWidth` (number, m) — Largura mínima do quarto principal — mínimo 2,70 m
  - `architecture.secondaryBedroomArea` (number, m²) — Área útil dos quartos secundários — mínimo 9,0 m² conforme Portaria 62/2003
  - `architecture.kitchenArea` (number, m²) — Área útil da cozinha — mínimo 6,0 m² conforme Portaria 62/2003
  - `architecture.kitchenMinWidth` (number, m) — Largura mínima da cozinha — mínimo 1,80 m
  - `architecture.bathroomArea` (number, m²) — Área útil da instalação sanitária principal
  - `architecture.hasStorageRoom` (boolean) — Indica se o fogo possui arrecadação individual, recomendada pelo RGEU
  - `architecture.entryHallArea` (number, m²) — Área do vestíbulo ou hall de entrada do fogo
  - `architecture.basementCeilingHeight` (number, m) — Pé-direito livre mínimo das caves — mínimo 2,20 m conforme RGEU

  ### Ventilação e Iluminação
  - `architecture.windowToFloorRatio` (number) — Relação entre a área de envidraçado e a área de pavimento — mínimo 1/10 conforme RGEU Art. 71.º
  - `architecture.hasNaturalLight` (boolean) — Indica se os compartimentos habitáveis possuem iluminação natural direta, conforme RGEU Art. 71.º
  - `architecture.roomDepthToHeightRatio` (number) — Relação entre a profundidade do compartimento e o pé-direito — máximo recomendado 2,5
  - `architecture.hasCrossVentilation` (boolean) — Indica se o fogo possui ventilação cruzada (aberturas em fachadas opostas)

  ### Escadas e Circulações
  - `architecture.commonStairWidth` (number, m) — Largura útil da escada comum do edifício — mínimo 1,10 m em edifícios até 3 pisos, 1,20 m acima
  - `architecture.stairWidth` (number, m) — Largura útil da escada interior do fogo — mínimo 0,90 m
  - `architecture.stairLandingDepth` (number, m) — Profundidade mínima do patamar intermédio e de piso da escada
  - `architecture.handrailHeight` (number, m) — Altura do corrimão da escada — entre 0,85 m e 0,95 m
  - `architecture.balconyGuardHeight` (number, m) — Altura mínima das guardas de varandas e terraços — mínimo 1,10 m
  - `architecture.corridorWidth` (number, m) — Largura mínima dos corredores comuns — mínimo 1,10 m em habitação

  ### Índices Urbanísticos
  - `architecture.maxAllowedHeight` (number, m) — Altura máxima de construção permitida pelo PDM para a parcela
  - `architecture.implantationIndex` (number) — Rácio entre a área de implantação e a área do lote — conforme PDM
  - `architecture.impermeabilizationIndex` (number) — Rácio entre a área impermeabilizada e a área total do lote — conforme PDM
  - `architecture.permeabilityIndex` (number) — Percentagem de área permeável do lote — conforme PDM
  - `architecture.sideSetback` (number, m) — Afastamento mínimo do edifício à estrema lateral do lote — conforme PDM
  - `architecture.rearSetback` (number, m) — Afastamento mínimo do edifício à estrema posterior do lote — conforme PDM

  ### Exteriores e Estacionamento
  - `architecture.parkingSpaces` (number) — Número total de lugares de estacionamento previstos, conforme PDM e tipologia
  - `architecture.hasRoofPlan` (boolean) — Indica se o projeto inclui planta de cobertura com definição de pendentes e drenagem

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

## Estado Atual — Arquitetura (RGEU + Código Civil)

Regulamentos registados nesta especialidade:

  - **DL 38382/1951 (RGEU)** — Regulamento Geral das Edificações Urbanas [verified, 5 rules]
  - **Código Civil** — Código Civil — Direito de Propriedade e Relações de Vizinhança (Arts. 1344.º-1422.º) [verified, 5 rules]
  - **RJUE — DL 555/99** — Regime Jurídico da Urbanização e Edificação (projeto de arquitetura) [verified, 1 rules]
  - **DL 307/2009 (RJRU)** — Decreto-Lei n.º 307/2009 — Regime Jurídico da Reabilitação Urbana [complete, 1 rules]

Total: 61 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "ARQ-PERMIT-01",
    "regulationId": "dl-555-99-rjue-arq",
    "article": "Art. 11.º — Projeto de Arquitetura (RJUE)",
    "description": "O projeto de arquitetura é obrigatório para operações de licenciamento, devendo incluir peças desenhadas, memória descritiva e demonstração de conformidade regulamentar.",
    "severity": "critical",
    "conditions": [
      {
        "field": "architecture.hasBuildingPermitDesign",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "isRehabilitation",
        "operator": "==",
        "value": false
      }
    ],
    "remediation": "Elaborar projeto de arquitetura subscrito por arquiteto inscrito na Ordem dos Arquitetos, incluindo peças desenhadas (plantas, cortes, alçados) e memória descritiva conforme Art. 11.º do RJUE.",
    "requiredValue": "Projeto de arquitetura obrigatório",
    "enabled": true,
    "tags": [
      "projeto",
      "arquitetura",
      "licenciamento",
      "RJUE"
    ]
  },
  {
    "id": "ARQ-IMPERM-01",
    "regulationId": "dl-555-99-rjue-arq",
    "article": "Art. 60.º — Percentagem de Impermeabilização Máxima",
    "description": "O índice de impermeabilização ({architecture.impermeabilizationIndex}) excede o máximo permitido pelo PDM.",
    "severity": "warning",
    "conditions": [
      {
        "field": "architecture.impermeabilizationIndex",
        "operator": ">",
        "value": 0.7
      }
    ],
    "remediation": "Reduzir a área impermeabilizada do lote. Considerar pavimentos permeáveis, jardins e zonas verdes para respeitar o índice de impermeabilização máximo do PDM.",
    "currentValueTemplate": "{architecture.impermeabilizationIndex}",
    "requiredValue": "≤ 70% (genérico, verificar PDM)",
    "enabled": true,
    "tags": [
      "impermeabilização",
      "permeabilidade",
      "PDM",
      "urbanismo"
    ]
  },
  {
    "id": "ARQ-PDM-01",
    "regulationId": "dl-555-99-rjue-arq",
    "article": "Art. 60.º — Conformidade com PDM/Regulamento Municipal",
    "description": "O projeto de arquitetura deve ser conforme com o PDM e regulamento municipal aplicável, nomeadamente quanto a cércea, volumetria, alinhamentos e usos permitidos.",
    "severity": "critical",
    "conditions": [
      {
        "field": "architecture.pdmCompliance",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Verificar e demonstrar conformidade do projeto com o Plano Director Municipal, incluindo usos, cércea, volumetria, alinhamentos e afastamentos previstos no regulamento municipal.",
    "requiredValue": "Conformidade com PDM obrigatória",
    "enabled": true,
    "tags": [
      "PDM",
      "conformidade",
      "urbanismo",
      "RJUE"
    ]
  },
  {
    "id": "ARQ-CERCEA-01",
    "regulationId": "dl-555-99-rjue-arq",
    "article": "Art. 60.º — Cércea Máxima e Número de Pisos",
    "description": "A cércea do edifício ({architecture.buildingHeight}m) excede a cércea máxima permitida pelo PDM/regulamento municipal.",
    "severity": "critical",
    "conditions": [
      {
        "field": "architecture.buildingHeight",
        "operator": ">",
        "value": 0
      },
      {
        "field": "architecture.maxAllowedHeight",
        "operator": ">",
        "value": 0
      },
      {
        "field": "architecture.buildingHeight",
        "operator": ">",
        "value": null
      }
    ],
    "remediation": "Reduzir a altura do edifício e/ou número de pisos para respeitar a cércea máxima definida no PDM ou regulamento municipal aplicável.",
    "currentValueTemplate": "{architecture.buildingHeight} m / {architecture.numberOfFloors} pisos",
    "requiredValue": "Conforme cércea máxima do PDM",
    "enabled": true,
    "tags": [
      "cércea",
      "pisos",
      "altura",
      "PDM",
      "urbanismo"
    ]
  },
  {
    "id": "ARQ-IMP-01",
    "regulationId": "dl-555-99-rjue-arq",
    "article": "Art. 60.º — Índice de Implantação",
    "description": "O índice de implantação ({architecture.implantationIndex}) excede o máximo permitido pelo PDM.",
    "severity": "critical",
    "conditions": [
      {
        "field": "architecture.implantationIndex",
        "operator": ">",
        "value": 0
      },
      {
        "field": "architecture.maxImplantationIndex",
        "operator": ">",
        "value": 0
      }
    ],
    "remediation": "Reduzir a área de implantação do edifício para respeitar o índice de implantação máximo definido no PDM.",
    "currentValueTemplate": "{architecture.implantationIndex}",
    "requiredValue": "Conforme índice de implantação do PDM",
    "enabled": true,
    "tags": [
      "implantação",
      "índice",
      "PDM",
      "urbanismo"
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

- [ ] Cada regra tem ID único no formato `ARCHITECTURE-NNN`
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