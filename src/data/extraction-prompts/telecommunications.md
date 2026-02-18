# Extração de Regras — Telecomunicações (ITED / ITUR)

Analisa o texto regulamentar da especialidade **Telecomunicações (ITED / ITUR)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "TELECOMMUNICATIONS-NNN",
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

- **id**: Formato `TELECOMMUNICATIONS-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Telecomunicações (ITED / ITUR)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais ITED
  - `numberOfDwellings` (number) — Número total de fogos ou frações autónomas no edifício, determina o dimensionamento da infraestrutura ITED
  - `computed.dwellingSize` ("T0" | "T1" | "T2" | "T3" | "T4" | "T5") — Tipologia do fogo (T0 a T5+), determina o número mínimo de tomadas de telecomunicações
  - `telecommunications.isUrbanization` (boolean) — Indica se o projeto é uma urbanização (ITUR) ou edifício individual (ITED)
  - `isRehabilitation` (boolean) — Indica se é uma obra de reabilitação, podendo ter requisitos ITED simplificados
  - `itedEdition` ("4" | "3") — Edição do manual ITED aplicável ao projeto
  - `hasITEDProject` (boolean) — Indica se existe projeto ITED aprovado, obrigatório para edifícios novos e reabilitações significativas
  - `hasATE` (boolean) — Indica se o edifício possui Armário de Telecomunicações de Edifício no r/c ou cave
  - `ited.ateWidth` (number, m) — Largura do Armário de Telecomunicações de Edifício conforme ITED, depende do número de fogos
  - `hasATI` (boolean) — Indica se cada fogo possui Armário de Telecomunicações Individual
  - `ited.atiWidth` (number, m) — Largura do Armário de Telecomunicações Individual conforme ITED

  ### Fibra Óptica
  - `telecommunications.hasFiberOptic` (boolean) — Indica se o edifício possui infraestrutura de fibra óptica, obrigatório na 4.ª edição ITED
  - `fiberType` ("OS1" | "OS2") — Tipo de fibra óptica conforme EN 50173 e manual ITED
  - `ited.fibersPerDwelling` (number) — Número mínimo de fibras ópticas por fogo conforme ITED (mín. 2 fibras)
  - `ited.fiberSpliceAttenuation` (number, dB) — Atenuação máxima por junta de fusão (splicing) conforme ITED
  - `ited.fiberConnectorAttenuation` (number, dB) — Atenuação máxima por conector óptico conforme ITED
  - `ited.fiberAttenuation` (number, dB) — Atenuação total do percurso óptico (fibra + conectores + fusões) conforme ITED

  ### Par de Cobre
  - `telecommunications.hasCopperCabling` (boolean) — Indica se o edifício possui cablagem estruturada em par de cobre (UTP/FTP)
  - `telecommunications.rj45OutletsPerDwelling` (number) — Número mínimo de tomadas RJ45 por fogo conforme ITED, depende da tipologia
  - `copperCableCategory` ("5e" | "6" | "6A") — Categoria mínima do cabo de cobre conforme ITED (mín. Cat. 6 na 4.ª edição)
  - `ited.copperCategory` ("D" | "E" | "EA") — Classe do canal de transmissão conforme EN 50173 e ITED
  - `ited.copperPermanentLinkLength` (number, m) — Comprimento máximo do link permanente em cobre conforme EN 50173 (máx. 90 m)
  - `ited.copperImpedance` (number, Ω) — Impedância característica do cabo de cobre conforme EN 50173 (100 Ω)
  - `ited.separationFromPower` (number, mm) — Distância mínima de separação entre cabos de telecomunicações e cabos elétricos conforme ITED

  ### Cabo Coaxial
  - `telecommunications.hasCoaxialCabling` (boolean) — Indica se o edifício possui rede de cabos coaxiais para CATV/MATV
  - `telecommunications.coaxOutletsPerDwelling` (number) — Número mínimo de tomadas coaxiais por fogo conforme ITED, depende da tipologia

  ### Tubagem e Caminhos de Cabos
  - `ited.hasPAT` (boolean) — Indica se existe passagem aérea de topo para entrada de cabos no edifício
  - `ited.patDiameter` (number, mm) — Diâmetro do tubo da passagem aérea de topo conforme ITED
  - `ited.hasCVM` (boolean) — Indica se existe coluna vertical montante para distribuição vertical de telecomunicações
  - `ited.cvmWidth` (number, m) — Largura da coluna vertical montante conforme ITED, depende do número de fogos
  - `ited.buildingEntryDuctDiameter` (number, mm) — Diâmetro do tubo de entrada de telecomunicações no edifício conforme ITED
  - `ited.individualDuctDiameter` (number, mm) — Diâmetro dos tubos de distribuição individual dentro do fogo conforme ITED
  - `ited.riserDuctDiameter` (number, mm) — Diâmetro dos tubos na coluna montante vertical conforme ITED
  - `ited.ductOccupancyRate` (number, %) — Taxa máxima de ocupação da secção dos tubos conforme ITED (máx. 50%)

  ### ITUR — Infraestruturas de Urbanização
  - `itur.ductDiameter` (number, mm) — Diâmetro dos tubos da infraestrutura de urbanização conforme manual ITUR
  - `itur.ductsPerRoute` (number) — Número mínimo de tubos por percurso na infraestrutura ITUR
  - `itur.burialDepthSidewalk` (number, m) — Profundidade mínima de enterramento dos tubos sob passeios conforme ITUR
  - `itur.burialDepthRoadway` (number, m) — Profundidade mínima de enterramento dos tubos sob faixa de rodagem conforme ITUR
  - `itur.cvmuWidth` (number, m) — Largura da câmara de visita multi-operador conforme ITUR
  - `itur.cvmuSpacing` (number, m) — Distância máxima entre câmaras de visita multi-operador conforme ITUR
  - `itur.hasSignalTape` (boolean) — Indica se é colocada fita de sinalização acima da tubagem enterrada conforme ITUR

  ### Certificação e Ensaios
  - `telecommunications.hasCertification` (boolean) — Indica se foram realizados os ensaios e obtida a certificação ITED por técnico credenciado pela ANACOM

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

  - `min_rj45_by_size` — Número mínimo de tomadas RJ45 por tipologia de fração — ITED 4ª edição (keys: `computed.dwellingSize`)
  - `min_coax_by_size` — Número mínimo de tomadas coaxiais TV por tipologia de fração — ITED 4ª edição (keys: `computed.dwellingSize`)
  - `min_fiber_outlets_by_size` — Número mínimo de tomadas de fibra óptica por tipologia de fração — ITED 4ª edição (keys: `computed.dwellingSize`)
  - `ate_dimensions_by_dwellings` — Dimensões mínimas do ATE (L×A×P em metros) por escalão de fogos — ITED 4ª edição (keys: `numberOfDwellings`)
  - `entry_duct_diameter_by_dwellings` — Diâmetro mínimo do tubo de entrada do edifício por escalão de fogos — ITED 4ª edição (keys: `numberOfDwellings`)

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

## Estado Atual — Telecomunicações (ITED / ITUR)

Regulamentos registados nesta especialidade:

  - **DL 123/2009** — Regime Jurídico das Infraestruturas de Telecomunicações em Edifícios (ITED) e Urbanizações (ITUR) [verified, 16 rules]
  - **Portaria 264/2023** — Manual ITED 4ª Edição [verified, 63 rules]

Total: 79 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "ITED-PROJ-01",
    "regulationId": "dl-123-2009-ited",
    "article": "DL 123/2009, Art. 59.º — Obrigatoriedade de Projeto ITED",
    "description": "Edifícios novos ou sujeitos a obras de remodelação profunda devem possuir projeto ITED elaborado por projetista credenciado pela ANACOM.",
    "severity": "critical",
    "conditions": [
      {
        "field": "telecommunications.hasITEDProject",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "isRehabilitation",
        "operator": "==",
        "value": false
      }
    ],
    "remediation": "Elaborar projeto ITED por projetista credenciado pela ANACOM. O projeto é obrigatório para obtenção de licença de construção (DL 123/2009, Art. 59.º).",
    "requiredValue": "Projeto ITED obrigatório para edifícios novos",
    "enabled": true,
    "tags": [
      "projeto",
      "ITED",
      "obrigatório",
      "ANACOM"
    ]
  },
  {
    "id": "ITED-ED-01",
    "regulationId": "portaria-264-2023-ited4",
    "article": "Manual ITED 4ª Edição — Portaria 264/2023",
    "description": "O projeto referencia uma edição anterior do manual ITED. A versão atual é a 4ª edição (Portaria 264/2023, em vigor desde 25 de agosto de 2023).",
    "severity": "warning",
    "conditions": [
      {
        "field": "telecommunications.itedEdition",
        "operator": "<",
        "value": 4
      },
      {
        "field": "isRehabilitation",
        "operator": "==",
        "value": false
      }
    ],
    "remediation": "Atualizar o projeto para a 4ª edição do manual ITED (Portaria 264/2023). Edifícios novos devem cumprir a edição em vigor.",
    "currentValueTemplate": "{telecommunications.itedEdition}ª edição",
    "requiredValue": "4ª edição (Portaria 264/2023)",
    "enabled": true,
    "tags": [
      "edição",
      "atualização",
      "ITED"
    ]
  },
  {
    "id": "ITED-ATE-01",
    "regulationId": "dl-123-2009-ited",
    "article": "Manual ITED 4ª Ed., Cap. 3.2 — ATE (Armário de Telecomunicações de Edifício)",
    "description": "O edifício não prevê ATE. O ATE é obrigatório em edifícios com mais de 1 fração autónoma.",
    "severity": "critical",
    "conditions": [
      {
        "field": "telecommunications.hasATE",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "numberOfDwellings",
        "operator": ">=",
        "value": 2
      }
    ],
    "remediation": "Instalar ATE (Armário de Telecomunicações de Edifício) em zona comum acessível, com dimensões adequadas ao número de frações. O ATE deve ser localizado no piso de entrada ou cave, preferencialmente junto à entrada de cabos do edifício.",
    "requiredValue": "ATE obrigatório para ≥ 2 frações",
    "enabled": true,
    "tags": [
      "ATE",
      "armário",
      "edifício"
    ]
  },
  {
    "id": "ITED-ATE-02",
    "regulationId": "portaria-264-2023-ited4",
    "article": "Manual ITED 4ª Ed., Cap. 3.2.1 — Dimensões do ATE (até 8 fogos)",
    "description": "As dimensões do ATE são insuficientes para edifícios até 8 fogos. O ATE deve ter dimensões mínimas de 0.40×0.60×0.20 m (L×A×P).",
    "severity": "critical",
    "conditions": [
      {
        "field": "numberOfDwellings",
        "operator": "<=",
        "value": 8
      },
      {
        "field": "numberOfDwellings",
        "operator": ">=",
        "value": 2
      },
      {
        "field": "ited.ateWidth",
        "operator": "<",
        "value": 0.4
      }
    ],
    "remediation": "Aumentar as dimensões do ATE para no mínimo 0.40 m (largura) × 0.60 m (altura) × 0.20 m (profundidade) conforme Manual ITED 4ª edição para edifícios até 8 fogos.",
    "currentValueTemplate": "{ited.ateWidth}×{ited.ateHeight}×{ited.ateDepth} m",
    "requiredValue": "≥ 0.40×0.60×0.20 m (L×A×P) para até 8 fogos",
    "enabled": true,
    "tags": [
      "ATE",
      "dimensões",
      "até 8 fogos"
    ]
  },
  {
    "id": "ITED-ATE-03",
    "regulationId": "portaria-264-2023-ited4",
    "article": "Manual ITED 4ª Ed., Cap. 3.2.1 — Dimensões do ATE (9 a 24 fogos)",
    "description": "As dimensões do ATE são insuficientes para edifícios de 9 a 24 fogos. O ATE deve ter dimensões mínimas de 0.60×0.80×0.20 m (L×A×P).",
    "severity": "critical",
    "conditions": [
      {
        "field": "numberOfDwellings",
        "operator": ">=",
        "value": 9
      },
      {
        "field": "numberOfDwellings",
        "operator": "<=",
        "value": 24
      },
      {
        "field": "ited.ateWidth",
        "operator": "<",
        "value": 0.6
      }
    ],
    "remediation": "Aumentar as dimensões do ATE para no mínimo 0.60 m (largura) × 0.80 m (altura) × 0.20 m (profundidade) conforme Manual ITED 4ª edição para edifícios de 9 a 24 fogos.",
    "currentValueTemplate": "{ited.ateWidth}×{ited.ateHeight}×{ited.ateDepth} m",
    "requiredValue": "≥ 0.60×0.80×0.20 m (L×A×P) para 9 a 24 fogos",
    "enabled": true,
    "tags": [
      "ATE",
      "dimensões",
      "9-24 fogos"
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

- [ ] Cada regra tem ID único no formato `TELECOMMUNICATIONS-NNN`
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