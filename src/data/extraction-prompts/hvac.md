# Extração de Regras — AVAC — Aquecimento, Ventilação e Ar Condicionado

Analisa o texto regulamentar da especialidade **AVAC — Aquecimento, Ventilação e Ar Condicionado** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "HVAC-NNN",
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

- **id**: Formato `HVAC-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — AVAC — Aquecimento, Ventilação e Ar Condicionado

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais
  - `buildingType` ("residential" | "commercial" | "industrial" | "mixed") — Tipo de edifício para determinação das exigências AVAC aplicáveis
  - `hvac.spaceType` ("residential" | "commercial" | "office" | "retail" | "restaurant" | "classroom" | "hospital") — Tipo de espaço para determinação de caudais mínimos de ar novo e limites de QAI
  - `hvac.hasHVACProject` (boolean) — Indica se existe projeto de instalações AVAC elaborado por técnico responsável
  - `hvac.occupancy` (number, pessoas) — Número de ocupantes previsto para dimensionamento dos sistemas de ventilação e climatização

  ### Equipamentos de Climatização
  - `hvac.installedHVACPower` (number, kW) — Potência total instalada dos sistemas de climatização (aquecimento + arrefecimento)
  - `hvac.installedCoolingPower` (number, kW) — Potência nominal de arrefecimento instalada nos equipamentos de climatização
  - `hvac.heatPumpType` ("split" | "multi-split" | "VRV" | "central") — Tipo de sistema de bomba de calor / unidade de climatização
  - `hvac.cop` (number) — Coeficiente de desempenho em modo de aquecimento — mínimo regulamentar conforme RECS
  - `hvac.eer` (number) — Índice de eficiência energética em modo de arrefecimento — mínimo regulamentar conforme RECS
  - `hvac.hasSolarThermal` (boolean) — Indica se existe sistema solar térmico para preparação de águas quentes sanitárias
  - `hvac.hotWaterStorageTemp` (number, °C) — Temperatura de armazenamento de água quente sanitária — mínimo 60 °C para prevenção de Legionella
  - `hvac.refrigerantGWP` (number) — GWP do fluido frigorigéneo utilizado — restrições conforme Regulamento F-Gas (UE) 517/2014

  ### Ventilação e Qualidade do Ar
  - `hvac.hasVentilationSystem` (boolean) — Indica se existe sistema de ventilação mecânica ou mista no edifício
  - `hvac.ventilationType` ("natural" | "mechanical_exhaust" | "mechanical_supply" | "balanced") — Tipo de ventilação do edifício ou espaço — determina requisitos de caudais
  - `hvac.freshAirFlow` (number, m³/h) — Caudal mínimo de ar novo conforme Portaria 353-A/2013 (por pessoa e por m²)
  - `hvac.hasKitchenExtraction` (boolean) — Indica se existe extração mecânica ou natural na cozinha
  - `hvac.hasBathroomExtraction` (boolean) — Indica se existe extração mecânica ou natural nas instalações sanitárias
  - `hvac.heatRecoveryEfficiency` (number, %) — Eficiência do recuperador de calor ar-ar — obrigatório para caudais > 10 000 m³/h conforme RECS
  - `hvac.filterClass` (string) — Classe de filtração dos filtros de ar na UTA (ex.: F7, M5) conforme EN ISO 16890

  ### Condutas e Distribuição
  - `hvac.ductDeltaT` (number, °C) — Diferença de temperatura admissível entre o interior da conduta e o ar ambiente para dimensionamento do isolamento
  - `hvac.ductInsulationThickness` (number, mm) — Espessura do isolamento térmico das condutas de AVAC conforme RECS
  - `hvac.ductLeakageClass` ("A" | "B" | "C" | "D") — Classe de estanquidade das condutas conforme EN 1507 / EN 12237

  ### Qualidade do Ar Interior
  - `hvac.hasCO2Monitoring` (boolean) — Indica se existe sistema de monitorização contínua de CO₂ no edifício
  - `hvac.co2Level` (number, ppm) — Concentração máxima de CO₂ interior — limiar de proteção 1250 ppm (Portaria 353-A/2013)
  - `hvac.pm25Level` (number, µg/m³) — Concentração máxima de partículas finas PM2,5 — limiar de proteção 25 µg/m³
  - `hvac.relativeHumidity` (number, %) — Humidade relativa do ar interior — intervalo recomendado 30% a 70%
  - `hvac.hasRadonProtection` (boolean) — Indica se existem medidas de proteção contra radão conforme DL 108/2018
  - `hvac.radonLevel` (number, Bq/m³) — Concentração de radão interior — limite de referência 300 Bq/m³ (DL 108/2018)

  ### Conforto Térmico
  - `hvac.winterOperativeTemp` (number, °C) — Temperatura operativa interior mínima na estação de aquecimento (tipicamente 20 °C)
  - `hvac.summerOperativeTemp` (number, °C) — Temperatura operativa interior máxima na estação de arrefecimento (tipicamente 25 °C)

  ### Manutenção e Inspeção
  - `hvac.hasGTCSystem` (boolean) — Indica se existe sistema de gestão técnica centralizada para monitorização e controlo dos equipamentos AVAC
  - `hvac.hasMaintenancePlan` (boolean) — Indica se existe plano de manutenção preventiva dos sistemas AVAC conforme RECS

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

## Estado Atual — AVAC — Aquecimento, Ventilação e Ar Condicionado

Regulamentos registados nesta especialidade:

  - **DL 118/2013 (RECS)** — Regulamento de Desempenho Energético dos Edifícios de Comércio e Serviços [verified, 5 rules]
  - **Portaria 353-A/2013** — Requisitos de Ventilação e Qualidade do Ar Interior (RECS) [verified, 2 rules]
  - **DL 108/2018** — Proteção contra Radão em Edifícios [verified, 1 rules]
  - **Regulamento F-Gas (EU 517/2014)** — Regulamento relativo a Gases Fluorados com Efeito de Estufa [verified, 1 rules]
  - **DL 306/2007** — Decreto-Lei n.º 306/2007 — Qualidade da Água para Consumo Humano [complete, 1 rules]
  - **EN 16798-1** — EN 16798-1 — Desempenho Energético de Edifícios — Ventilação [complete, 1 rules]
  - **NP 1037-1** — NP 1037-1 — Ventilação e Evacuação dos Produtos de Combustão [complete, 1 rules]
  - **RECS / Portaria 353-A/2013** — Regulamento de Desempenho Energético do Comércio e Serviços — Portaria 353-A/2013 [complete, 1 rules]

Total: 63 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "AVAC-PROJ-01",
    "regulationId": "dl-118-2013-recs",
    "article": "Projeto AVAC",
    "description": "Edifícios de comércio e serviços requerem projeto de AVAC elaborado por engenheiro mecânico ou eletrotécnico.",
    "severity": "critical",
    "conditions": [
      {
        "field": "hvac.hasHVACProject",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "buildingType",
        "operator": "in",
        "value": [
          "commercial",
          "mixed"
        ]
      }
    ],
    "remediation": "Contratar engenheiro mecânico ou eletrotécnico para elaboração de projeto AVAC. Deve incluir cálculos de cargas térmicas, dimensionamento de equipamentos e rede de condutas.",
    "requiredValue": "Projeto AVAC obrigatório para comércio/serviços",
    "enabled": true,
    "tags": [
      "projeto",
      "AVAC",
      "comercial"
    ]
  },
  {
    "id": "AVAC-WC-01",
    "regulationId": "dl-118-2013-recs",
    "article": "Extração de Instalações Sanitárias — RGEU / REH",
    "description": "As instalações sanitárias devem ter extração mecânica.",
    "severity": "warning",
    "conditions": [
      {
        "field": "hvac.hasBathroomExtraction",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Instalar extração mecânica nas instalações sanitárias com caudal mínimo de 90 m³/h.",
    "requiredValue": "Extração mecânica ≥ 90 m³/h",
    "enabled": true,
    "tags": [
      "WC",
      "extração",
      "ventilação"
    ]
  },
  {
    "id": "AVAC-COZ-01",
    "regulationId": "dl-118-2013-recs",
    "article": "Extração de Cozinha — RGEU / REH",
    "description": "A cozinha deve ter sistema de extração mecânica com caudal mínimo para remoção de vapores e odores.",
    "severity": "critical",
    "conditions": [
      {
        "field": "hvac.hasKitchenExtraction",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Instalar extração mecânica na cozinha com caudal mínimo de 180 m³/h. Prever conduta de extração independente até à cobertura.",
    "requiredValue": "Extração mecânica ≥ 180 m³/h",
    "enabled": true,
    "tags": [
      "cozinha",
      "extração",
      "ventilação"
    ]
  },
  {
    "id": "AVAC-VENTMEC-01",
    "regulationId": "portaria-353a-2013",
    "article": "Ventilação Mecânica — Portaria 353-A/2013",
    "description": "Edifícios de comércio e serviços devem ter sistema de ventilação mecânica.",
    "severity": "critical",
    "conditions": [
      {
        "field": "hvac.hasVentilationSystem",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "buildingType",
        "operator": "in",
        "value": [
          "commercial",
          "mixed"
        ]
      }
    ],
    "remediation": "Instalar sistema de ventilação mecânica garantindo caudais mínimos de ar novo por pessoa (escritórios: 35 m³/(h.pessoa)).",
    "requiredValue": "Ventilação mecânica com caudais conforme Portaria 353-A",
    "enabled": true,
    "tags": [
      "ventilação mecânica",
      "caudal",
      "ar novo"
    ]
  },
  {
    "id": "AVAC-QAI-01",
    "regulationId": "portaria-353a-2013",
    "article": "Qualidade do Ar Interior (QAI) — Portaria 353-A/2013",
    "description": "O RECS exige monitorização da qualidade do ar interior em edifícios de comércio e serviços.",
    "severity": "warning",
    "conditions": [
      {
        "field": "hvac.hasAirQualityControl",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "buildingType",
        "operator": "in",
        "value": [
          "commercial",
          "mixed"
        ]
      }
    ],
    "remediation": "Instalar monitorização de QAI: CO₂ máx. 1250 ppm, PM2.5 máx. 25 μg/m³, TVOC máx. 600 μg/m³. Prever sensores e ajuste automático de caudal.",
    "requiredValue": "CO₂ ≤ 1250 ppm, PM2.5 ≤ 25 μg/m³",
    "enabled": true,
    "tags": [
      "QAI",
      "CO2",
      "PM2.5",
      "monitorização"
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

- [ ] Cada regra tem ID único no formato `HVAC-NNN`
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