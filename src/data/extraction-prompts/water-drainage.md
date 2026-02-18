# Extração de Regras — Abastecimento de Água e Drenagem (RGSPPDADAR)

Analisa o texto regulamentar da especialidade **Abastecimento de Água e Drenagem (RGSPPDADAR)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "WATER_DRAINAGE-NNN",
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

- **id**: Formato `WATER_DRAINAGE-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Abastecimento de Água e Drenagem (RGSPPDADAR)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais
  - `water.hasPublicWaterConnection` (boolean) — Indica se o edifício possui ligação à rede pública de distribuição de água conforme RGSPPDADAR
  - `water.hasWaterMeter` (boolean) — Indica se existe contador de água individual conforme RGSPPDADAR Art.º 82.º
  - `water.hasCheckValve` (boolean) — Indica se existe válvula de retenção (anti-retorno) para proteção contra refluxo conforme RGSPPDADAR
  - `water.hasSeparateDrainageSystem` (boolean) — Indica se o sistema de drenagem é separativo (residuáis domésticas separadas das pluviais) conforme RGSPPDADAR
  - `water.waterPipeMaterial` ("PPR" | "PVC" | "PEAD" | "copper" | "steel") — Material das tubagens da rede predial de distribuição de água conforme RGSPPDADAR Art.º 93.º
  - `water.pipeMaterial` ("PVC" | "PP" | "PEAD" | "gres" | "iron") — Material das tubagens da rede predial de drenagem de águas residuais conforme RGSPPDADAR

  ### Abastecimento de Água
  - `water.hotWaterTemp` (number, °C) — Temperatura de distribuição da água quente sanitária (mín. 50 °C, recomendado 60 °C para prevenção de Legionella)
  - `water.fixtureFlowRate` (number, L/min) — Caudal instantâneo mínimo nos dispositivos de utilização conforme RGSPPDADAR Quadro I
  - `water.stackDiameter` (number, mm) — Diâmetro da coluna montante de distribuição de água conforme RGSPPDADAR
  - `water.pipeInsulationThickness` (number, mm) — Espessura mínima do isolamento térmico das tubagens de água quente conforme RGSPPDADAR

  ### Pressões e Velocidades
  - `water.pressaoMinimaKPa` (number, kPa) — Pressão mínima nos dispositivos de utilização conforme RGSPPDADAR Art.º 87.º (100 kPa = 10 m.c.a.)
  - `water.pressaoMaximaKPa` (number, kPa) — Pressão máxima nos dispositivos de utilização conforme RGSPPDADAR Art.º 87.º (600 kPa = 60 m.c.a.)
  - `water.maxPressure` (number, kPa) — Pressão estática máxima em qualquer ponto da rede predial conforme RGSPPDADAR
  - `water.velocidadeMinimaMS` (number, m/s) — Velocidade mínima de escoamento na rede de distribuição de água conforme RGSPPDADAR Art.º 94.º
  - `water.pipeVelocity` (number, m/s) — Velocidade máxima de escoamento na rede predial de água conforme RGSPPDADAR Art.º 94.º (máx. 2,0 m/s)
  - `water.fracaoDiametroConduta` (number) — Fator utilizado no dimensionamento hidráulico para relação entre diâmetro e caudal conforme RGSPPDADAR

  ### Drenagem de Águas Residuais
  - `water.hasVentilatedDrainage` (boolean) — Indica se a rede de drenagem possui ventilação (primária ou secundária) conforme RGSPPDADAR Art.º 209.º
  - `water.hasDrainageSiphons` (boolean) — Indica se todos os aparelhos sanitários possuem sifão individual ou partilhado conforme RGSPPDADAR Art.º 210.º
  - `water.hasBackflowPrevention` (boolean) — Indica se existe proteção contra refluxo de águas residuais em pisos abaixo da cota da via pública
  - `water.hasGreaseTrap` (boolean) — Indica se existe separador de gorduras, obrigatório em cozinhas coletivas conforme RGSPPDADAR Art.º 225.º
  - `drainage.diametroMinimoMm` (number, mm) — Diâmetro mínimo dos ramais de descarga de águas residuais conforme RGSPPDADAR Quadro XXII
  - `drainage.decliveMinimoMmM` (number, mm/m) — Declive mínimo dos coletores prediais de águas residuais conforme RGSPPDADAR Art.º 218.º (mín. 10 mm/m)
  - `drainage.alturaMinimaM` (number, m) — Altura mínima do fecho hídrico dos sifões conforme RGSPPDADAR Art.º 210.º (mín. 50 mm)
  - `drainage.velocidadeMinimaMs` (number, m/s) — Velocidade mínima de escoamento nos coletores prediais conforme RGSPPDADAR (auto-limpeza)
  - `water.drainPipeDiameter` (number, mm) — Diâmetro do tubo de queda de águas residuais conforme RGSPPDADAR Quadro XXIII

  ### Drenagem Pluvial
  - `water.hasStormwaterManagement` (boolean) — Indica se o edifício possui sistema de recolha e gestão de águas pluviais conforme RGSPPDADAR
  - `water.stormwaterDrainDiameter` (number, mm) — Diâmetro mínimo dos tubos de queda de águas pluviais conforme RGSPPDADAR
  - `water.stormwaterIntensity` (number, L/min/m²) — Intensidade de precipitação utilizada no dimensionamento conforme RGSPPDADAR e região pluviométrica

  ### Materiais e Tubagens
  - `water.pipeNominalPressure` ("PN6" | "PN10" | "PN16" | "PN20") — Pressão nominal das tubagens de distribuição de água conforme RGSPPDADAR Art.º 93.º
  - `water.pipeRoughnessCoefficient` (number, mm) — Coeficiente de rugosidade equivalente do material para cálculo de perdas de carga (fórmula de Colebrook-White)

  ### Ensaios
  - `water.hasHydraulicTest` (boolean) — Indica se foi realizado ensaio hidrostático à rede de distribuição de água conforme RGSPPDADAR Art.º 100.º
  - `water.hasDrainageTest` (boolean) — Indica se foi realizado ensaio de estanquidade à rede de drenagem conforme RGSPPDADAR Art.º 237.º

  ### Implantação Espacial
  - `waterDrainage.collectorDistanceToProperty` (number, m) — Distância mínima dos colectores de drenagem aos limites das propriedades (Art. 136 RGSPPDADAR)
  - `waterDrainage.waterToWastewaterDistance` (number, m) — Distância entre condutas de distribuição de água e colectores de águas residuais (Art. 24 RGSPPDADAR)
  - `waterDrainage.waterAboveWastewater` (boolean) — Indica se as condutas de água estão instaladas num plano superior ao dos colectores de águas residuais (Art. 24 RGSPPDADAR)

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

  - `caudal_instantaneo_min_dispositivo` — Caudais instantaneos minimos (l/s) por tipo de aparelho — DR 23/95 Art. 90 + Anexo IV (keys: `waterDrainage.tipoAparelho`)
  - `n_fluxometros_simultaneo` — Numero maximo de fluxometros em funcionamento simultaneo — DR 23/95 Art. 91 + Anexo V (keys: `waterDrainage.totalFluxometros`)
  - `dn_min_ramal_fluxometro` — Diametro minimo (mm) do ramal de alimentacao de fluxometros por pressao — DR 23/95 Art. 94 (keys: `waterDrainage.pressaoDisponivel`)
  - `profundidade_min_ramal_ligacao` — Profundidade minima de assentamento (m) do ramal de ligacao — DR 23/95 Art. 29 (keys: `waterDrainage.tipoSolo`)
  - `caudal_descarga_e_DN_ramal_por_aparelho` — Diametro minimo (mm) dos ramais de descarga por tipo de aparelho — DR 23/95 Anexo II (keys: `waterDrainage.tipoAparelho`)
  - `dist_max_sifao_seccao_ventilada` — Distancia maxima (m) entre sifao e seccao ventilada por DN — DR 23/95 Art. 225 (keys: `waterDrainage.dnRamalDescarga`)
  - `caudal_max_TQ_sem_ventilacao_por_DN` — Caudal maximo (l/s) em tubos de queda sem ventilacao secundaria por DN — DR 23/95 Art. 234 (keys: `waterDrainage.dnTuboQueda`)
  - `capitacao_minima_domestica` — Capitacao minima (l/hab/dia) por dimensao do aglomerado — DR 23/95 Art. 13 (keys: `waterDrainage.dimensaoAglomerado`)
  - `caudal_incendio_rede_publica` — Caudal instantaneo (l/s) para incendio na rede publica por grau de risco — DR 23/95 Art. 15 (keys: `fireSafety.riskCategory`)
  - `dn_min_condutas_publica` — Diametro nominal minimo (mm) das condutas de distribuicao publica — DR 23/95 Art. 24 (keys: `waterDrainage.tipoZona`)
  - `dn_min_condutas_incendio` — Diametro nominal minimo (mm) das condutas publicas com servico de incendio — DR 23/95 Art. 24 (keys: `fireSafety.riskCategory`)
  - `espacamento_marcos_agua` — Espacamento maximo (m) entre marcos de agua por grau de risco — DR 23/95 Art. 20 (keys: `fireSafety.riskCategory`)
  - `reserva_incendio_reservatorio` — Reserva minima de agua para incendio (m3) por grau de risco — DR 23/95 Art. 71 (keys: `fireSafety.riskCategory`)
  - `coeficiente_K_armazenamento` — Coeficiente K minimo para capacidade de armazenamento (V >= K*Qmd) — DR 23/95 Art. 69 (keys: `buildingType`)
  - `dn_coluna_montante` — Diametro nominal minimo (mm) de colunas secas/humidas montantes — RT-SCIE Art. 171 (keys: `waterDrainage.tipoColunaMontante`)
  - `autonomia_RASI_redes_humidas` — Autonomia minima (min) da reserva de agua para redes humidas de 2a intervencao — RT-SCIE Art. 172 (keys: `fireSafety.riskCategory`)
  - `autonomia_RASI_sprinklers` — Autonomia minima (min) da reserva de agua para sprinklers por categoria de risco — RT-SCIE Art. 173 (keys: `fireSafety.riskCategory`)
  - `autonomia_RASI_cortinas` — Autonomia minima (min) da reserva de agua para cortinas de agua — RT-SCIE Art. 174 (keys: `fireSafety.riskCategory`)
  - `trihalometanos_THM` — Valor parametrico maximo (ug/l) de trihalometanos na torneira — DL 306/2007 Anexo I (keys: `buildingType`)
  - `LU_por_aparelho` — Loading Units (LU) por aparelho sanitario para dimensionamento — NP EN 806-3 Tab. 3 (keys: `waterDrainage.tipoAparelho`)
  - `temperatura_distribuicao_AQS` — Temperatura minima (C) de distribuicao de agua quente nos pontos de utilizacao — NP EN 806-2 + Legionella (keys: `waterDrainage.tipoCircuitoAQS`)
  - `DU_por_aparelho_sistemaIII` — Discharge Units (DU) por aparelho para sistema III (single stack) — NP EN 12056-2 Tab. 5 (keys: `waterDrainage.tipoAparelho`)
  - `fator_frequencia_K` — Fator de frequencia K para calculo do caudal de drenagem — NP EN 12056-2 Tab. 2 (keys: `buildingType`)
  - `grau_enchimento_max_coletor` — Grau de enchimento maximo (fracao) em coletores prediais por tipo de sistema — NP EN 12056-2 (keys: `waterDrainage.sistemaDrenagem`)
  - `inclinacao_min_coletor_predial` — Inclinacao minima (%) de coletores prediais por DN para autolimpeza — DR 23/95 Art. 68 + NP EN 12056-2 (keys: `waterDrainage.dnColetorPredial`)

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

## Estado Atual — Abastecimento de Água e Drenagem (RGSPPDADAR)

Regulamentos registados nesta especialidade:

  - **DL 23/95** — Regulamento Geral dos Sistemas Públicos e Prediais de Distribuição de Água e de Drenagem de Águas Residuais (RGSPPDADAR) [verified, 10 rules]

Total: 325 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "RGSP-RET-01",
    "regulationId": "dl-23-95-rgsppdadar",
    "article": "Art. 93.º — Válvula Anti-retorno",
    "description": "Deve existir válvula anti-retorno para evitar contaminação da rede pública por refluxo.",
    "severity": "critical",
    "conditions": [
      {
        "field": "water.hasCheckValve",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Instalar válvula anti-retorno (de retenção) na ligação ao ramal de distribuição para prevenir contaminação por refluxo.",
    "requiredValue": "Válvula anti-retorno obrigatória",
    "enabled": true,
    "tags": [
      "válvula",
      "anti-retorno",
      "contaminação"
    ]
  },
  {
    "id": "WATER-M004",
    "regulationId": "dl-23-95-rgsppdadar",
    "article": "DR 23/95 Art. 90, nº 2 + Anexo IV",
    "description": "Caudais instantâneos mínimos nos dispositivos de utilização (água fria ou quente)",
    "severity": "critical",
    "conditions": [
      {
        "field": "water.caudal_instantaneo_min_dispositivo",
        "operator": "lookup_lt",
        "value": null,
        "table": "caudal_instantaneo_min_dispositivo"
      }
    ],
    "remediation": "Verificar conformidade: Caudais instantâneos mínimos nos dispositivos de utilização (água fria ou quente)",
    "requiredValue": "Consultar tabela regulamentar",
    "enabled": true,
    "tags": [
      "caudal"
    ]
  },
  {
    "id": "RGSP-AGUA-01",
    "regulationId": "dl-23-95-rgsppdadar",
    "article": "Art. 20.º — Abastecimento de Água",
    "description": "O edifício deve estar ligado à rede pública de abastecimento de água sempre que disponível.",
    "severity": "warning",
    "conditions": [
      {
        "field": "water.hasPublicWaterConnection",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Requerer ligação à rede pública de abastecimento junto da entidade gestora. A ligação é obrigatória em zonas urbanizadas.",
    "requiredValue": "Ligação à rede pública obrigatória",
    "enabled": true,
    "tags": [
      "água",
      "rede pública",
      "ligação"
    ]
  },
  {
    "id": "RGSP-GORD-01",
    "regulationId": "dl-23-95-rgsppdadar",
    "article": "Caixa de Gorduras",
    "description": "Edifícios comerciais com cozinha/restauração devem prever caixa de retenção de gorduras.",
    "severity": "warning",
    "conditions": [
      {
        "field": "water.hasGreaseTrap",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "buildingType",
        "operator": "==",
        "value": "commercial"
      }
    ],
    "remediation": "Instalar caixa de retenção de gorduras antes da ligação à rede pública. Dimensionar para o caudal de ponta da cozinha.",
    "requiredValue": "Caixa de gorduras obrigatória em restauração",
    "enabled": true,
    "tags": [
      "gorduras",
      "cozinha",
      "comercial"
    ]
  },
  {
    "id": "RGSP-CONT-01",
    "regulationId": "dl-23-95-rgsppdadar",
    "article": "Contagem de Água",
    "description": "Cada fração autónoma deve ter contador de água individual.",
    "severity": "warning",
    "conditions": [
      {
        "field": "water.hasWaterMeter",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Instalar contadores de água individuais por fração. A contagem individual é obrigatória em edifícios de habitação coletiva.",
    "requiredValue": "Contador individual por fração",
    "enabled": true,
    "tags": [
      "contador",
      "água",
      "fração"
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

- [ ] Cada regra tem ID único no formato `WATER_DRAINAGE-NNN`
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