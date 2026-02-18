# Extração de Regras — Acessibilidade (DL 163/2006)

Analisa o texto regulamentar da especialidade **Acessibilidade (DL 163/2006)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "ACCESSIBILITY-NNN",
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

- **id**: Formato `ACCESSIBILITY-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Acessibilidade (DL 163/2006)

Estes são os campos que as condições das regras podem referenciar:


  ### General accessibility / Acessibilidade geral
  - `undefined` (string)
  - `buildingType` ("undefined" | "undefined" | "undefined" | "undefined" | "undefined" | "undefined" | "undefined")
  - `isRehabilitation` (boolean)
  - `numberOfFloors` (number)
  - `accessibility.hasAccessibleEntrance` (boolean)
  - `accessibility.hasAccessibleWC` (boolean)
  - `accessibility.hasElevator` (boolean)
  - `accessibility.hasAccessibleParking` (boolean)
  - `accessibility.hasAccessibilitySymbol` (boolean)
  - `accessibility.hasExteriorPaths` (boolean)
  - `accessibility.hasProtrudingObjects` (boolean)
  - `accessibility.venueCapacity` (number)

  ### Paths & exterior / Percursos e espaços exteriores
  - `undefined` (string)
  - `accessibility.pathWidth` (number, m)
  - `accessibility.pathClearHeight` (number, m)
  - `accessibility.pathTurningWidth` (number, m)
  - `accessibility.pathCrossSlope` (number, %)
  - `accessibility.pathSurfaceCompliant` (boolean)
  - `accessibility.pathFrictionCoefficient` (number)
  - `accessibility.grateOpeningWidth` (number, mm)
  - `accessibility.protrudingObjectLow` (number, mm)
  - `accessibility.protrudingObjectHasTactile` (boolean)
  - `accessibility.pedestrianCrossingWidth` (number, m)

  ### Corridors / Corredores
  - `undefined` (string)
  - `accessibility.corridorWidths` (number, m)
  - `accessibility.corridorTurningWidth` (number, m)
  - `accessibility.lobbyMinDimension` (number, m)

  ### Doors & openings / Portas e aberturas
  - `undefined` (string)
  - `accessibility.doorWidths` (number, m)
  - `accessibility.doorWidthGeneral` (number, m)
  - `accessibility.doorHeight` (number, m)
  - `accessibility.doorClearance` (number, m)
  - `accessibility.doorHandleHeight` (number, m)
  - `accessibility.doorOpeningForce` (number, N)
  - `accessibility.doorRecessDepth` (number, m)
  - `accessibility.doorAutoOpenTime` (number, s)
  - `accessibility.doorAutoSensorFullWidth` (boolean)
  - `accessibility.doorSequentialClearance` (number, m)
  - `accessibility.entryDoorOpeningForce` (number, N)

  ### Ramps / Rampas
  - `undefined` (string)
  - `accessibility.rampGradient` (number, %)
  - `accessibility.rampWidth` (number, m)
  - `accessibility.rampLength` (number, m)
  - `accessibility.rampLevelDifference` (number, m)
  - `accessibility.rampCrossSlope` (number, %)
  - `accessibility.rampHasHandrails` (boolean)
  - `accessibility.rampHandrailExtension` (number, m)
  - `accessibility.rampGuardHeight` (number, m)
  - `accessibility.rampEdgeHeight` (number, m)
  - `accessibility.rampRestingInterval` (number, m)

  ### Stairs / Escadas
  - `undefined` (string)
  - `accessibility.stairWidth` (number, m)
  - `accessibility.stairRiserHeight` (number, m)
  - `accessibility.stairTreadDepth` (number, m)
  - `accessibility.stairBlondelValue` (number, m)
  - `accessibility.stairRisersClosed` (boolean)
  - `accessibility.stairLandingLength` (number, m)
  - `accessibility.stairHandrailExtension` (number, m)
  - `accessibility.stairHasSecondHandrail` (boolean)
  - `accessibility.stairHasNonSlipStrips` (boolean)

  ### Elevators & lifts / Ascensores e plataformas elevatórias
  - `undefined` (string)
  - `accessibility.elevatorCabinWidth` (number, m)
  - `accessibility.elevatorCabinDepth` (number, m)
  - `accessibility.elevatorDoorWidth` (number, m)
  - `accessibility.elevatorDoorOpenTime` (number, s)
  - `accessibility.elevatorCallButtonHeight` (number, m)
  - `accessibility.elevatorButtonsBraille` (boolean)
  - `accessibility.elevatorHasArrivalChime` (boolean)
  - `accessibility.elevatorHasFloorIndicator` (boolean)
  - `accessibility.elevatorHasRearMirror` (boolean)
  - `accessibility.elevatorLandingWidth` (number, m)
  - `accessibility.liftPlatformWidth` (number, m)
  - `accessibility.liftPlatformDepth` (number, m)
  - `accessibility.liftSpeed` (number, m/s)
  - `accessibility.inclinedLiftWidth` (number, m)
  - `accessibility.inclinedLiftSpeed` (number, m/s)

  ### WC / Instalações sanitárias
  - `undefined` (string)
  - `accessibility.wcArea` (number, m²)
  - `accessibility.wcTurningDiameter` (number, m)
  - `accessibility.wcDoorWidth` (number, m)
  - `accessibility.wcDoorOpensOutward` (boolean)
  - `accessibility.wcDoorUnlockableFromOutside` (boolean)
  - `accessibility.toiletSeatHeight` (number, m)
  - `accessibility.toiletWallDistance` (number, m)
  - `accessibility.grabBarHeight` (number, m)
  - `accessibility.grabBarLength` (number, m)
  - `accessibility.wcAccessoryHeight` (number, m)
  - `accessibility.washbasinHeight` (number, m)
  - `accessibility.washbasinClearanceHeight` (number, m)
  - `accessibility.washbasinClearanceDepth` (number, m)
  - `accessibility.mirrorBaseHeight` (number, m)

  ### Parking / Estacionamento
  - `undefined` (string)
  - `accessibility.accessibleParkingCount` (number)
  - `accessibility.parkingSpaceWidth` (number, m)
  - `accessibility.parkingSpaceLength` (number, m)
  - `accessibility.parkingAislWidth` (number, m)
  - `accessibility.parkingHasSignage` (boolean)

  ### Signage & tactile / Sinalização e elementos tácteis
  - `undefined` (string)
  - `accessibility.hasVisualTactileSignage` (boolean)
  - `accessibility.hasBrailleOnDoorsAndButtons` (boolean)
  - `accessibility.hasTactileWarningPaving` (boolean)
  - `accessibility.hasDirectionalTactilePaving` (boolean)
  - `accessibility.hasGuidingStrips` (boolean)
  - `accessibility.hasLevelChangeTactileContrast` (boolean)
  - `accessibility.tactileAlertWidth` (number, m)

  ### Furniture & counters / Mobiliário e balcões
  - `undefined` (string)
  - `accessibility.counterHeight` (number, m)
  - `accessibility.counterAccessibleLength` (number, m)
  - `accessibility.counterHasKneeSpace` (boolean)
  - `accessibility.tableHeight` (number, m)
  - `accessibility.tableKneeSpace` (number, m)

  ### Seating / Lugares reservados
  - `undefined` (string)
  - `accessibility.reservedSeats` (number)
  - `accessibility.reservedSeatWidth` (number, m)
  - `accessibility.reservedSeatDepth` (number, m)

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

## Estado Atual — Acessibilidade (DL 163/2006)

Regulamentos registados nesta especialidade:

  - **DL 163/2006** — Regime da Acessibilidade aos Edifícios e Estabelecimentos que Recebem Público, Via Pública e Edifícios Habitacionais [verified, 10 rules]

Total: 110 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "ACESS-ENT-01",
    "regulationId": "dl-163-2006",
    "article": "Secção 2.1 / Art. 2.º — Percurso Acessível",
    "description": "O edifício não possui entrada acessível. É obrigatório pelo menos um percurso acessível desde a via pública (Art. 2.º, n.º 1 do DL 163/2006).",
    "severity": "critical",
    "conditions": [
      {
        "field": "accessibility.hasAccessibleEntrance",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Garantir pelo menos um percurso acessível desde a via pública até à entrada principal, sem degraus isolados, com largura mínima de 1.20m.",
    "requiredValue": "Entrada acessível obrigatória",
    "enabled": true,
    "tags": [
      "entrada",
      "percurso",
      "acessível"
    ]
  },
  {
    "id": "ACESS-PERCURSO-02",
    "regulationId": "dl-163-2006",
    "article": "Secção 2.2 — Percurso Acessível (Inclinação transversal)",
    "description": "A inclinação transversal do percurso acessível ({accessibility.pathCrossSlope}%) excede o máximo regulamentar.",
    "severity": "warning",
    "conditions": [
      {
        "field": "accessibility.pathCrossSlope",
        "operator": ">",
        "value": 2
      }
    ],
    "remediation": "Corrigir o pavimento do percurso acessível para que a inclinação transversal não exceda 2%. O piso deve ser firme, estável, contínuo e antiderrapante. Evitar juntas abertas superiores a 0.005m e ressaltos superiores a 0.002m.",
    "currentValueTemplate": "{accessibility.pathCrossSlope}%",
    "requiredValue": "≤ 2% (inclinação transversal); piso firme, estável e contínuo",
    "enabled": true,
    "tags": [
      "percurso",
      "pavimento",
      "inclinação",
      "acessibilidade"
    ]
  },
  {
    "id": "ACESS-PERCURSO-01",
    "regulationId": "dl-163-2006",
    "article": "Secção 4.2 — Piso Tátil de Alerta",
    "description": "Os percursos acessíveis devem dispor de piso tátil de alerta antes de obstáculos e mudanças de direção (Secção 4.2 das Normas Técnicas).",
    "severity": "info",
    "conditions": [
      {
        "field": "accessibility.hasTactileWarningPaving",
        "operator": "==",
        "value": false
      },
      {
        "field": "buildingType",
        "operator": "!=",
        "value": "residential"
      }
    ],
    "remediation": "Instalar piso tátil de alerta (textura diferenciada de botões truncados) antes de obstáculos, mudanças de direção, e no início e fim de rampas e escadas. O piso tátil deve ter uma profundidade entre 0.40m e 0.60m e contraste cromático com o piso envolvente.",
    "currentValueTemplate": "Sem piso tátil de alerta instalado",
    "requiredValue": "Piso tátil de alerta obrigatório antes de obstáculos, mudanças de direção, início e fim de rampas e escadas",
    "enabled": true,
    "tags": [
      "percurso",
      "piso tátil",
      "alerta",
      "orientação"
    ]
  },
  {
    "id": "ACESS-PERCURSO-03",
    "regulationId": "dl-163-2006",
    "article": "Secção 2.2.1 — Percurso Acessível (Largura livre)",
    "description": "A largura livre do percurso acessível ({accessibility.pathWidth}m) é inferior ao mínimo regulamentar de 1.20m (Secção 2.2.1).",
    "severity": "critical",
    "conditions": [
      {
        "field": "accessibility.pathWidth",
        "operator": "<",
        "value": 1.2
      }
    ],
    "remediation": "Alargar o percurso acessível para largura mínima de 1.20m. Em zonas de mudança de direção, a largura deve ser no mínimo 1.50m para permitir a rotação de cadeira de rodas.",
    "currentValueTemplate": "{accessibility.pathWidth} m",
    "requiredValue": "≥ 1.20 m (geral); ≥ 1.50 m em mudanças de direção",
    "enabled": true,
    "tags": [
      "percurso",
      "largura",
      "acessível"
    ]
  },
  {
    "id": "ACESS-PERCURSO-04",
    "regulationId": "dl-163-2006",
    "article": "Secção 2.2.3 — Percurso Acessível (Mudança de direção)",
    "description": "A zona de mudança de direção do percurso acessível ({accessibility.pathTurningWidth}m) é inferior ao mínimo regulamentar de 1.50m × 1.50m (Secção 2.2.3).",
    "severity": "warning",
    "conditions": [
      {
        "field": "accessibility.pathTurningWidth",
        "operator": "<",
        "value": 1.5
      }
    ],
    "remediation": "Em zonas de mudança de direção no percurso acessível, garantir zona livre de 1.50m × 1.50m para permitir a rotação completa de uma cadeira de rodas (Secção 2.2.3).",
    "currentValueTemplate": "{accessibility.pathTurningWidth} m",
    "requiredValue": "Zona livre ≥ 1.50 m × 1.50 m em mudanças de direção (Secção 2.2.3)",
    "enabled": true,
    "tags": [
      "percurso",
      "largura",
      "mudança direção",
      "rotação"
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

- [ ] Cada regra tem ID único no formato `ACCESSIBILITY-NNN`
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