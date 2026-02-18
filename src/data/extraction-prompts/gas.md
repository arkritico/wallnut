# Extração de Regras — Instalações de Gás (DL 521/99)

Analisa o texto regulamentar da especialidade **Instalações de Gás (DL 521/99)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "GAS-NNN",
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

- **id**: Formato `GAS-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Instalações de Gás (DL 521/99)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais da Instalação
  - `gas.hasGasInstallation` (boolean) — Indica se o edifício possui instalação de gás combustível — campo de entrada principal (gate)
  - `gas.gasType` ("natural_gas" | "lpg_bottled" | "lpg_piped") — Tipo de gás combustível utilizado na instalação
  - `gas.installationType` ("individual" | "collective") — Indica se a instalação de gás é individual (uma fração) ou coletiva (edifício inteiro)
  - `gas.hasGasProject` (boolean) — Indica se existe projeto de instalação de gás aprovado por técnico responsável
  - `gas.buildingUse` ("residential" | "commercial" | "industrial" | "mixed") — Tipo de utilização do edifício onde se encontra a instalação de gás
  - `gas.installationLocation` ("interior" | "exterior" | "both") — Indica se as tubagens de gás passam pelo interior, exterior, ou ambos
  - `gas.meterLocation` ("exterior_cabinet" | "common_area" | "interior" | "technical_duct") — Localização do contador/medidor de gás conforme DL 521/99
  - `gas.utilizationPressure` (number, mbar) — Pressão de utilização da instalação de gás nos aparelhos (tipicamente 21 mbar para GN, 30 mbar para GPL)
  - `gas.totalPressureDrop` (number, mbar) — Perda de carga total admissível na instalação interior de gás
  - `gas.hasPressureRegulator` (boolean) — Indica se existe regulador de pressão na instalação de gás

  ### Aparelhos e Equipamentos
  - `gas.applianceType` ("cooktop" | "water_heater" | "boiler" | "oven") — Tipo de aparelho de utilização de gás instalado no local
  - `gas.roomType` ("kitchen" | "bathroom" | "garage" | "laundry") — Tipo de compartimento onde se encontra instalado o aparelho a gás
  - `gas.roomVolume` (number, m³) — Volume do compartimento onde se encontram os aparelhos a gás (mínimos definidos por tipo de aparelho)
  - `gas.hasPhysicalSeparation` (boolean) — Indica se existe separação física adequada entre aparelhos a gás no mesmo compartimento

  ### Ventilação e Exaustão
  - `gas.ventilationType` ("natural" | "mechanical") — Tipo de ventilação do compartimento onde se encontram aparelhos a gás
  - `gas.ventilationAreaLower` (number, cm²) — Área da abertura de ventilação inferior para admissão de ar comburente
  - `gas.ventilationAreaUpper` (number, cm²) — Área da abertura de ventilação superior para evacuação de gases de combustão
  - `gas.mechanicalExtractionRate` (number, m³/h) — Caudal de extração mecânica do compartimento com aparelhos a gás

  ### Tubagens e Materiais
  - `gas.pipesMaterial` ("copper" | "steel" | "polyethylene") — Material das tubagens da instalação de gás (cobre e aço para interior; polietileno para exterior enterrado)
  - `gas.interiorPipeDiameter` (number, mm) — Diâmetro nominal das tubagens interiores da instalação de gás
  - `gas.exteriorPipeDiameter` (number, mm) — Diâmetro nominal das tubagens exteriores (ramal) da instalação de gás
  - `gas.copperPipeStandard` (string) — Norma de conformidade das tubagens de cobre (tipicamente EN 1057)
  - `gas.steelPipeStandard` (string) — Norma de conformidade das tubagens de aço (tipicamente EN 10255)
  - `gas.flexTubeLength` (number, m) — Comprimento do tubo flexível de ligação ao aparelho — máximo 1,50 m conforme regulamento

  ### Chaminé e Condutas de Fumos
  - `gas.hasFlueSystem` (boolean) — Indica se existe sistema de evacuação de produtos de combustão (chaminé ou conduta de fumos)
  - `gas.flueDiameter` (number, mm) — Diâmetro interior da conduta de evacuação de fumos
  - `gas.flueHeight` (number, m) — Altura total da chaminé de evacuação de fumos
  - `gas.flueHeightAboveRidge` (number, m) — Altura da chaminé acima da cumeeira do telhado — mínimo 0,50 m

  ### Ensaios e Certificação
  - `gas.testPressure` (number, mbar) — Pressão utilizada no ensaio de estanquidade da instalação (tipicamente 50 mbar para baixa pressão)
  - `gas.hasGasCertification` (boolean) — Indica se a instalação de gás possui certificação emitida por entidade inspetora
  - `gas.yearsSinceLastInspection` (number, anos) — Número de anos decorridos desde a última inspeção periódica da instalação de gás

  ### Segurança
  - `gas.hasGasDetector` (boolean) — Indica se existe detetor de gás combustível instalado no compartimento
  - `gas.hasEmergencyValve` (boolean) — Indica se existe válvula de corte de emergência acessível e identificada
  - `gas.hasIndividualValves` (boolean) — Indica se cada aparelho a gás possui válvula de corte individual

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

## Estado Atual — Instalações de Gás (DL 521/99)

Regulamentos registados nesta especialidade:

  - **DL 521/99** — Regulamento das Instalações de Gás em Edifícios [verified, 64 rules]
  - **Portaria 361/98** — Regulamento Técnico das Instalações de Gás [verified, 38 rules]

Total: 64 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "GAS-PROJ-01",
    "regulationId": "dl-521-99",
    "article": "DL 521/99 Art. 15.o -- Projeto de Gás",
    "description": "A instalação de gás requer projeto aprovado pela DGEG, elaborado por técnico credenciado.",
    "severity": "critical",
    "conditions": [
      {
        "field": "gas.hasGasProject",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "gas.hasGasInstallation",
        "operator": "exists",
        "value": null
      },
      {
        "field": "gas.gasType",
        "operator": "!=",
        "value": "none"
      }
    ],
    "remediation": "Contratar técnico credenciado pela DGEG para elaboração e submissão de projeto de gás. O projeto é obrigatório para instalações com gás canalizado.",
    "requiredValue": "Projeto de gás aprovado pela DGEG",
    "enabled": true,
    "tags": [
      "projeto",
      "DGEG",
      "obrigatório"
    ]
  },
  {
    "id": "GAS-DET-02",
    "regulationId": "dl-521-99",
    "article": "DL 521/99 Art. 16.o -- Deteção de Gás (GPL)",
    "description": "Recomenda-se a instalação de detetor de GPL nos locais com aparelhos a gás. Para GPL, o detetor deve ser colocado na parte inferior da parede, a menos de 0,30 m do pavimento, dado que o GPL é mais pesado que o ar.",
    "severity": "warning",
    "conditions": [
      {
        "field": "gas.hasGasDetector",
        "operator": "!=",
        "value": true
      },
      {
        "field": "gas.hasGasInstallation",
        "operator": "exists",
        "value": null
      },
      {
        "field": "gas.gasType",
        "operator": "in",
        "value": [
          "lpg_piped",
          "lpg_bottle"
        ]
      }
    ],
    "remediation": "Instalar detetor de GPL na parte inferior da parede (a menos de 0,30 m do pavimento) nos compartimentos com aparelhos a gás. Deve ter corte automático em caso de fuga.",
    "requiredValue": "Detetor de GPL recomendado",
    "enabled": true,
    "tags": [
      "detetor",
      "segurança",
      "fuga",
      "GPL"
    ]
  },
  {
    "id": "GAS-DET-01",
    "regulationId": "dl-521-99",
    "article": "DL 521/99 Art. 16.o -- Deteção de Gás (Gás Natural Interior)",
    "description": "Em instalações interiores de gás natural, é obrigatória a instalação de detetor de gás com corte automático. Para gás natural, o detetor deve ser colocado na parte superior da parede, a menos de 0,30 m do teto.",
    "severity": "critical",
    "conditions": [
      {
        "field": "gas.hasGasDetector",
        "operator": "!=",
        "value": true
      },
      {
        "field": "gas.hasGasInstallation",
        "operator": "exists",
        "value": null
      },
      {
        "field": "gas.gasType",
        "operator": "==",
        "value": "natural_gas"
      },
      {
        "field": "gas.installationLocation",
        "operator": "==",
        "value": "interior"
      }
    ],
    "remediation": "Instalar detetor de gás natural na parte superior da parede (a menos de 0,30 m do teto) nos compartimentos com aparelhos a gás. O detetor deve estar ligado a eletroválvula de corte automático do fornecimento de gás.",
    "requiredValue": "Detetor de gás natural obrigatório em instalações interiores",
    "enabled": true,
    "tags": [
      "detetor",
      "segurança",
      "fuga",
      "gas natural",
      "obrigatório"
    ]
  },
  {
    "id": "GAS-VALV-01",
    "regulationId": "dl-521-99",
    "article": "DL 521/99 Art. 12.o / Portaria 361/98 Art. 11.o -- Válvula de Corte Geral",
    "description": "A instalação deve prever válvula de corte geral na entrada do edifício/fração. O diâmetro nominal da válvula deve ser igual ou superior ao do ramal de alimentação. A válvula deve ser acessível e devidamente sinalizada.",
    "severity": "critical",
    "conditions": [
      {
        "field": "gas.hasEmergencyValve",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "gas.hasGasInstallation",
        "operator": "exists",
        "value": null
      },
      {
        "field": "gas.gasType",
        "operator": "!=",
        "value": "none"
      }
    ],
    "remediation": "Instalar válvula de corte geral acessível na entrada da fração. O DN da válvula deve ser >= DN do ramal. Sinalizar a válvula com placa indicativa conforme NP 182. Permite corte rápido do abastecimento em caso de fuga ou emergência.",
    "requiredValue": "Válvula de corte geral obrigatória; DN >= ramal; acessível; sinalizada",
    "enabled": true,
    "tags": [
      "válvula",
      "emergência",
      "corte",
      "geral",
      "sinalizada"
    ]
  },
  {
    "id": "GAS-VALV-02",
    "regulationId": "dl-521-99",
    "article": "Portaria 361/98 Art. 12.o -- Válvula de Corte por Aparelho",
    "description": "Cada aparelho a gás deve dispor de válvula de corte individual, instalada a montante e em local acessível e visível, permitindo o isolamento do aparelho sem interromper o fornecimento aos restantes.",
    "severity": "critical",
    "conditions": [
      {
        "field": "gas.hasIndividualValves",
        "operator": "!=",
        "value": true
      },
      {
        "field": "gas.hasGasInstallation",
        "operator": "exists",
        "value": null
      },
      {
        "field": "gas.gasType",
        "operator": "!=",
        "value": "none"
      }
    ],
    "remediation": "Instalar válvula de corte individual (de esfera ou macho) a montante de cada aparelho a gás, em local visível e de fácil acesso. A válvula deve situar-se a menos de 1,50 m do aparelho e a uma altura entre 0,60 m e 1,80 m do pavimento.",
    "currentValueTemplate": "Válvulas individuais: {gas.hasIndividualValves}",
    "requiredValue": "Válvula de corte individual por aparelho; acessível; visível",
    "enabled": true,
    "tags": [
      "válvula",
      "corte",
      "aparelho",
      "individual",
      "isolamento"
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

- [ ] Cada regra tem ID único no formato `GAS-NNN`
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