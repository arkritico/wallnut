# Extração de Regras — Regulamentação Térmica (REH / RECS)

Analisa o texto regulamentar da especialidade **Regulamentação Térmica (REH / RECS)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "THERMAL-NNN",
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

- **id**: Formato `THERMAL-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Regulamentação Térmica (REH / RECS)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Climáticos
  - `location.heatingDegreeDays` (number, °C.dia) — Número de graus-dia de aquecimento na base de 18 °C para a localidade do edifício (Despacho 15793-F/2013)
  - `location.climateZoneWinter` ("I1" | "I2" | "I3") — Zona climática de inverno conforme Despacho 15793-F/2013 (determinada pelos graus-dia)
  - `location.climateZoneSummer` ("V1" | "V2" | "V3") — Zona climática de verão conforme Despacho 15793-F/2013 (determinada pela temperatura exterior)
  - `location.summerExteriorTemp` (number, °C) — Temperatura exterior de projeto para a estação de arrefecimento na localidade
  - `building.isNew` (boolean) — Indica se o edifício é de construção nova (aplica requisitos mais exigentes do REH)

  ### Envolvente Opaca
  - `envelope.externalWallUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica da parede exterior — valores máximos conforme zona climática
  - `envelope.roofUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica da cobertura exterior
  - `envelope.floorUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica do pavimento exterior ou sobre espaço não aquecido
  - `envelope.interiorWallHighBtrUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica de paredes interiores em contacto com espaços com btr > 0,7
  - `envelope.adjacentWallUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica de parede em contacto com edifício adjacente
  - `envelope.floorOverUnheatedUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica do pavimento sobre espaço não útil (garagem, cave)
  - `envelope.groundFloorUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica do pavimento em contacto com o solo (inclui resistência do solo)
  - `envelope.externalDoorUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica da porta exterior opaca
  - `energy.thermalInertiaMass` (number, kg/m²) — Massa superficial útil por unidade de área de pavimento para classificação da inércia térmica (fraca < 150, média 150-400, forte > 400)

  ### Vãos Envidraçados
  - `envelope.windowUValue` (number, W/(m².°C)) — Coeficiente de transmissão térmica dos vãos envidraçados (vidro + caixilharia)
  - `envelope.windowSolarFactor` (number) — Fator solar global do vão envidraçado com proteção solar ativada (g⊥vi)
  - `envelope.hasExteriorSolarProtection` (boolean) — Indica se os vãos envidraçados possuem dispositivos de proteção solar pelo exterior (estores, portadas, palas)

  ### Pontes Térmicas
  - `envelope.thermalBridgeCoefficient` (number, W/(m.°C)) — Coeficiente de transmissão térmica linear das pontes térmicas lineares (ψ)

  ### Ventilação
  - `envelope.airChangesPerHour` (number, h⁻¹) — Taxa de renovação de ar do edifício (Rph) — mínimo regulamentar de 0,4 h⁻¹
  - `envelope.ventilationType` ("natural" | "mechanical" | "hybrid") — Tipo de sistema de ventilação do edifício conforme REH
  - `envelope.hasSelfRegulatingGrilles` (boolean) — Indica se existem grelhas de admissão de ar autorreguláveis nas fachadas
  - `envelope.kitchenExtractionRate` (number, m³/h) — Caudal de extração de ar na cozinha conforme NP 1037-1
  - `envelope.bathroomExtractionRate` (number, m³/h) — Caudal de extração de ar nas instalações sanitárias conforme NP 1037-1
  - `envelope.heatRecoveryEfficiency` (number, %) — Eficiência nominal do sistema de recuperação de calor na ventilação mecânica

  ### Sistemas e Renováveis
  - `energy.hasSolarThermal` (boolean) — Indica se o edifício possui sistema solar térmico para AQS (obrigatório em edifícios novos — Art. 27.º REH)
  - `envelope.solarCollectorArea` (number, m²) — Área total de captação dos coletores solares térmicos instalados
  - `envelope.dhwHeatPumpCOP` (number) — Coeficiente de desempenho (COP) da bomba de calor dedicada à produção de AQS

  ### Necessidades Energéticas
  - `energy.energyClassRatio` (number) — Rácio entre necessidades nominais globais de energia primária e o limite regulamentar — determina a classe energética
  - `energy.heatingNeeds` (number, kWh/m².ano) — Necessidades nominais anuais de energia útil para aquecimento
  - `energy.coolingNeeds` (number, kWh/m².ano) — Necessidades nominais anuais de energia útil para arrefecimento
  - `energy.dhwNeeds` (number, kWh/ano) — Necessidades anuais de energia para preparação de águas quentes sanitárias
  - `energy.primaryEnergyNeeds` (number, kWhEP/m².ano) — Necessidades nominais globais anuais de energia primária do edifício

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

  - `max_u_walls` — Coeficiente de transmissão térmica máximo — paredes exteriores (W/(m².K)) por zona climática de inverno (Despacho 15793-K/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `max_u_roofs` — Coeficiente de transmissão térmica máximo — coberturas (W/(m².K)) por zona climática de inverno (Despacho 15793-K/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `max_u_floors` — Coeficiente de transmissão térmica máximo — pavimentos exteriores e sobre ENU (W/(m².K)) por zona climática de inverno (Despacho 15793-K/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `max_u_windows` — Coeficiente de transmissão térmica máximo — vãos envidraçados (W/(m².K)) por zona climática de inverno (Despacho 15793-K/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `max_u_interior_walls_low_btr` — Coeficiente de transmissão térmica máximo — paredes interiores com btr ≤ 0.7 (W/(m².K)) = Umáx_exterior × 1.25 (Despacho 15793-K/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `max_u_ground_floor` — Coeficiente de transmissão térmica máximo — pavimento em contacto com o solo Ubf (W/(m².K)) por zona climática de inverno (Despacho 15793-K/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `max_u_doors` — Coeficiente de transmissão térmica máximo — portas exteriores opacas (W/(m².K)) por zona climática de inverno (Despacho 15793-K/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `max_solar_factor` — Factor solar máximo g⊥,vi de vãos envidraçados por zona climática de verão (Portaria 349-B/2013 Art. 7.º) (keys: `location.climateZoneSummer`)
  - `max_solar_factor_south` — Factor solar máximo g⊥,vi de vãos envidraçados orientação Sul por zona climática de verão (keys: `location.climateZoneSummer`)
  - `max_solar_factor_west` — Factor solar máximo g⊥,vi de vãos envidraçados orientação Oeste por zona climática de verão (keys: `location.climateZoneSummer`)
  - `max_solar_factor_east` — Factor solar máximo g⊥,vi de vãos envidraçados orientação Este por zona climática de verão (keys: `location.climateZoneSummer`)
  - `ref_u_walls` — Coeficiente de transmissão térmica de referência — paredes exteriores (W/(m².K)) para cálculo de Ni (Portaria 349-B/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `ref_u_roofs` — Coeficiente de transmissão térmica de referência — coberturas (W/(m².K)) para cálculo de Ni (Portaria 349-B/2013 Tabela I.01) (keys: `location.climateZoneWinter`)
  - `ref_u_windows` — Coeficiente de transmissão térmica de referência — vãos envidraçados (W/(m².K)) para cálculo de Ni (Portaria 349-B/2013 Tabela I.01) (keys: `location.climateZoneWinter`)

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

## Estado Atual — Regulamentação Térmica (REH / RECS)

Regulamentos registados nesta especialidade:

  - **Portaria 349-B/2013** — REH — Regulamento de Desempenho Energético de Edifícios de Habitação [verified, 56 rules]
  - **DL 118/2013** — SCE — Sistema de Certificação Energética dos Edifícios [verified, 4 rules]
  - **Despacho 15793-F/2013** — Parâmetros para o zonamento climático e respectivos dados [verified, 6 rules]

Total: 66 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "REH-UWALL-01",
    "regulationId": "portaria-349b-2013-reh",
    "article": "Despacho 15793-K/2013 Tabela I.01 — Umáx Paredes Exteriores",
    "description": "O coeficiente de transmissão térmica das paredes exteriores ({envelope.externalWallUValue} W/(m².K)) excede o valor máximo para a zona climática {location.climateZoneWinter}.",
    "severity": "critical",
    "conditions": [
      {
        "field": "envelope.externalWallUValue",
        "operator": "lookup_gt",
        "value": null,
        "table": "max_u_walls",
        "keys": [
          "location.climateZoneWinter"
        ]
      }
    ],
    "remediation": "Reforçar o isolamento térmico das paredes exteriores. Soluções: ETICS (isolamento pelo exterior), isolamento na caixa-de-ar, ou isolamento pelo interior. Espessura e tipo de isolamento dependem do sistema construtivo.",
    "currentValueTemplate": "U = {envelope.externalWallUValue} W/(m².K)",
    "requiredValue": "Consultar Despacho 15793-K/2013 Tabela I.01 por zona climática ({location.climateZoneWinter}): I1 ≤ 0.50 / I2 ≤ 0.40 / I3 ≤ 0.35 W/(m².K)",
    "enabled": true,
    "tags": [
      "paredes",
      "valor-U",
      "isolamento",
      "lookup",
      "envolvente exterior"
    ]
  },
  {
    "id": "REH-NIC-01",
    "regulationId": "portaria-349b-2013-reh",
    "article": "Portaria 349-B/2013 Art. 3.º — Necessidades de Aquecimento (Nic ≤ Ni)",
    "description": "As necessidades nominais de energia útil para aquecimento Nic ({energy.heatingNeeds} kWh/(m2.ano)) excedem o valor limite Ni ({energy.heatingNeedsLimit} kWh/(m2.ano)). A verificação Nic <= Ni é obrigatória para conformidade regulamentar.",
    "severity": "critical",
    "conditions": [
      {
        "field": "energy.heatingNeeds",
        "operator": "formula_gt",
        "value": "energy.heatingNeedsLimit"
      }
    ],
    "remediation": "Reduzir as necessidades de aquecimento (Nic). Medidas: reforçar o isolamento térmico da envolvente (paredes, cobertura, pavimentos, envidraçados), corrigir pontes térmicas, melhorar a estanquidade ao ar, optimizar os ganhos solares de inverno (envidraçados a sul sem sombreamento excessivo), instalar sistema de ventilação com recuperação de calor.",
    "currentValueTemplate": "Nic = {energy.heatingNeeds} kWh/(m2.ano)",
    "requiredValue": "<= Ni = {energy.heatingNeedsLimit} kWh/(m2.ano) (Nic/Ni <= 1.0)",
    "enabled": true,
    "tags": [
      "necessidades energéticas",
      "aquecimento",
      "Nic",
      "Ni",
      "verificação regulamentar"
    ]
  },
  {
    "id": "REH-ZONE-SUMMER-01",
    "regulationId": "despacho-15793f-2013",
    "article": "Despacho 15793-F/2013 — Zona Climática de Verão por θext,v",
    "description": "A temperatura exterior média de verão ({location.summerExteriorTemp} C) determina a zona climática de verão. Limiares: V1 (theta_ext,v <= 20 C), V2 (20 < theta_ext,v <= 22 C), V3 (theta_ext,v > 22 C). A zona atribuída ({location.climateZoneSummer}) deve ser coerente com a temperatura.",
    "severity": "info",
    "conditions": [
      {
        "field": "location.summerExteriorTemp",
        "operator": "exists",
        "value": true
      }
    ],
    "remediation": "Verificar a atribuição da zona climática de verão conforme o Despacho 15793-F/2013. Os limiares são: V1 (theta_ext,v <= 20 C, clima ameno), V2 (20 < theta_ext,v <= 22 C, clima moderado), V3 (theta_ext,v > 22 C, clima quente). A temperatura de verão afecta os limites de factor solar e as necessidades de arrefecimento (Nv).",
    "currentValueTemplate": "theta_ext,v = {location.summerExteriorTemp} C (zona {location.climateZoneSummer})",
    "requiredValue": "V1: theta_ext,v <= 20 / V2: 20 < theta_ext,v <= 22 / V3: theta_ext,v > 22 C",
    "enabled": true,
    "tags": [
      "zona climática",
      "verão",
      "temperatura",
      "localização"
    ]
  },
  {
    "id": "REH-UFLOOR-01",
    "regulationId": "portaria-349b-2013-reh",
    "article": "Despacho 15793-K/2013 Tabela I.01 — Umáx Pavimento Exterior",
    "description": "O coeficiente de transmissão térmica do pavimento em contacto com o exterior ({envelope.floorUValue} W/(m².K)) excede o valor máximo para a zona climática {location.climateZoneWinter}.",
    "severity": "warning",
    "conditions": [
      {
        "field": "envelope.floorUValue",
        "operator": "lookup_gt",
        "value": null,
        "table": "max_u_floors",
        "keys": [
          "location.climateZoneWinter"
        ]
      }
    ],
    "remediation": "Reforçar o isolamento térmico do pavimento em contacto com o exterior ou espaço não-aquecido. Soluções: isolamento sob a laje, isolamento no pavimento flutuante.",
    "currentValueTemplate": "U = {envelope.floorUValue} W/(m².K)",
    "requiredValue": "Consultar Despacho 15793-K/2013 Tabela I.01 por zona climática ({location.climateZoneWinter}): I1 ≤ 0.50 / I2 ≤ 0.40 / I3 ≤ 0.35 W/(m².K)",
    "enabled": true,
    "tags": [
      "pavimento",
      "valor-U",
      "isolamento",
      "lookup"
    ]
  },
  {
    "id": "REH-VENT-02",
    "regulationId": "portaria-349b-2013-reh",
    "article": "Portaria 349-B/2013 Art. 10.º — Taxa de Renovação de Ar de Referência",
    "description": "A taxa de renovação de ar ({envelope.airChangesPerHour} h-1) é inferior ao valor de referência de 0.6 h-1 utilizado no cálculo regulamentar. Embora o mínimo absoluto seja 0.4 h-1, o valor de referência de 0.6 h-1 é utilizado nos cálculos de Ni e Nv e garante melhor qualidade do ar interior.",
    "severity": "warning",
    "conditions": [
      {
        "field": "envelope.airChangesPerHour",
        "operator": "<",
        "value": 0.6
      },
      {
        "field": "envelope.airChangesPerHour",
        "operator": ">=",
        "value": 0.4
      }
    ],
    "remediation": "Aumentar a taxa de ventilação para o valor de referência de 0.6 h-1. Soluções: dimensionar correctamente as grelhas de admissão de ar auto-reguláveis (classe 2 ou 3), garantir aberturas de passagem entre compartimentos (folga sob portas interiores >= 25mm ou grelhas de passagem), verificar as condutas de extracção natural (dimensão e altura). O valor de 0.6 h-1 garante conformidade com o cálculo de referência Ni/Nv.",
    "currentValueTemplate": "{envelope.airChangesPerHour} h-1",
    "requiredValue": ">= 0.6 h-1 (referência REH para cálculo Ni/Nv)",
    "enabled": true,
    "tags": [
      "ventilação",
      "renovação de ar",
      "QAI",
      "referência"
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

- [ ] Cada regra tem ID único no formato `THERMAL-NNN`
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