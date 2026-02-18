# Extração de Regras — Condicionamento Acústico (RRAE)

Analisa o texto regulamentar da especialidade **Condicionamento Acústico (RRAE)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "ACOUSTIC-NNN",
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

- **id**: Formato `ACOUSTIC-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Condicionamento Acústico (RRAE)

Estes são os campos que as condições das regras podem referenciar:


  ### Classificação
  - `buildingType` ("residential" | "commercial" | "mixed" | "industrial" | "educational" | "healthcare")
  - `numberOfDwellings` (number) — Número total de fogos ou frações autónomas no edifício
  - `acoustic.buildingLocation` ("urban" | "rural" | "mixed") — Classificação acústica da zona onde se localiza o edifício, influencia os requisitos de isolamento de fachada
  - `acoustic.roomType` ("bedroom" | "living" | "kitchen" | "bathroom" | "office" | "classroom" | "treatment") — Tipo de compartimento recetor para determinação dos requisitos acústicos aplicáveis
  - `acoustic.roomVolume` (number, m³) — Volume do compartimento recetor, necessário para cálculo do tempo de reverberação
  - `acoustic.hasAdjacentGarage` (boolean) — Indica se o edifício possui garagem adjacente ou integrada, requerendo isolamento acústico reforçado
  - `acoustic.hasNoiseSource` (boolean) — Indica se existem fontes de ruído significativas na envolvente (vias rodoviárias, ferroviárias, indústrias)

  ### Isolamento Sonoro
  - `acoustic.facadeInsulationValue` (number, dB) — Índice de isolamento sonoro a sons de condução aérea da fachada, D2m,nT,w, conforme RRAE
  - `acoustic.airborneInsulationValue` (number, dB) — Índice de isolamento sonoro a sons de condução aérea entre fogos, DnT,w, conforme RRAE
  - `acoustic.airborneInsulationCommonAreas` (number, dB) — Índice de isolamento sonoro a sons de condução aérea entre zonas comuns e fogos
  - `acoustic.impactInsulationValue` (number, dB) — Nível sonoro de percussão padronizado, L'nT,w, conforme RRAE (valor máximo permitido)
  - `acoustic.airborneInsulationCommercial` (number, dB) — Índice de isolamento sonoro a sons aéreos entre espaços comerciais e fogos
  - `acoustic.airborneInsulationTechnical` (number, dB) — Índice de isolamento sonoro a sons aéreos entre locais técnicos (casa de máquinas, AVAC) e fogos
  - `acoustic.airborneInsulationGarage` (number, dB) — Índice de isolamento sonoro a sons aéreos entre garagens coletivas e fogos
  - `acoustic.hasAirborneInsulation` (boolean) — Indica se foi realizado ensaio ou cálculo de verificação do isolamento a sons aéreos
  - `acoustic.hasImpactInsulation` (boolean) — Indica se foi realizado ensaio ou cálculo de verificação do isolamento a sons de percussão
  - `acoustic.hasFacadeInsulation` (boolean) — Indica se foi realizado ensaio ou cálculo de verificação do isolamento sonoro da fachada
  - `acoustic.impactInsulationCommercial` (number, dB) — Nível sonoro de percussão padronizado entre espaços comerciais e fogos
  - `acoustic.impactInsulationGarage` (number, dB) — Nível sonoro de percussão padronizado entre garagens coletivas e fogos
  - `acoustic.airborneInsulationGym` (number, dB) — Índice de isolamento sonoro a sons aéreos entre ginásios ou espaços de atividades ruidosas e fogos

  ### Ruído de Equipamentos
  - `acoustic.equipmentNoiseBedroom` (number, dB(A)) — Nível de avaliação do ruído de equipamentos coletivos medido em quartos, LAr,nT
  - `acoustic.equipmentNoiseLevel` (number, dB(A)) — Nível de avaliação do ruído de funcionamento de equipamentos coletivos em compartimentos habitáveis
  - `acoustic.equipmentNoiseLiving` (number, dB(A)) — Nível de avaliação do ruído de equipamentos coletivos medido em salas de estar
  - `acoustic.equipmentNoiseKitchenWC` (number, dB(A)) — Nível de avaliação do ruído de equipamentos em cozinhas e instalações sanitárias
  - `acoustic.equipmentNoiseOffice` (number, dB(A)) — Nível de avaliação do ruído de equipamentos coletivos em escritórios
  - `acoustic.equipmentNoiseTreatment` (number, dB(A)) — Nível de avaliação do ruído de equipamentos em salas de tratamento ou consulta
  - `acoustic.hasEquipmentNoiseControl` (boolean) — Indica se foram adotadas medidas de controlo de ruído dos equipamentos coletivos (AVAC, elevadores, bombas)
  - `acoustic.hasTechnicalRooms` (boolean) — Indica se existem locais técnicos (casa de máquinas, central AVAC) adjacentes a fogos
  - `acoustic.hasVibrationIsolation` (boolean) — Indica se os equipamentos coletivos possuem sistemas de isolamento antivibratório
  - `acoustic.hasPlumbingNoiseControl` (boolean) — Indica se foram adotadas medidas de controlo do ruído transmitido por canalizações e esgotos
  - `acoustic.hasCollectiveEquipment` (boolean) — Indica se existem equipamentos coletivos no edifício (elevadores, bombas, AVAC centralizado)

  ### Ruído Ambiente
  - `acoustic.ambientNoiseLden` (number, dB) — Indicador de ruído Lden na zona de implantação, conforme mapa de ruído municipal
  - `acoustic.ambientNoiseLn` (number, dB) — Indicador de ruído noturno Ln na zona de implantação, conforme mapa de ruído municipal
  - `acoustic.emergentNoiseDaytime` (number, dB(A)) — Componente tonal ou impulsiva do ruído emergente no período diurno
  - `acoustic.emergentNoiseNighttime` (number, dB(A)) — Componente tonal ou impulsiva do ruído emergente no período noturno
  - `acoustic.noiseMapConsulted` (boolean) — Indica se foi consultado o mapa de ruído municipal para determinação dos requisitos de isolamento de fachada

  ### Projeto Acústico
  - `acoustic.hasAcousticProject` (boolean) — Indica se existe projeto de condicionamento acústico, obrigatório conforme RRAE
  - `acoustic.reverberationTime` (number, s) — Tempo de reverberação T do compartimento, conforme requisitos do RRAE para o uso
  - `project.hasConstructionPhase` (boolean) — Indica se a obra se encontra em fase de construção, para avaliação de ruído de estaleiro
  - `project.requiresLicensing` (boolean) — Indica se a operação urbanística requer licenciamento, implicando conformidade acústica obrigatória

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

  - `airborne_between_dwellings` — Isolamento mínimo a sons aéreos entre fogos — D'nT,w (dB) (keys: `buildingType`)
  - `facade_insulation_by_zone` — Isolamento mínimo de fachada — D2m,nT,w (dB) por zona acústica (keys: `acoustic.buildingLocation`)
  - `impact_between_dwellings` — Nível máximo de ruído de percussão entre fogos — L'nT,w (dB) (keys: `buildingType`)

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

## Estado Atual — Condicionamento Acústico (RRAE)

Regulamentos registados nesta especialidade:

  - **DL 96/2008** — Regulamento dos Requisitos Acústicos dos Edifícios (RRAE) [verified, 8 rules]
  - **DL 129/2002** — Regulamento dos Requisitos Acústicos dos Edifícios (versão original) [PENDING, 0 rules]
  - **DL 9/2007** — Regulamento Geral do Ruído [PENDING, 0 rules]

Total: 63 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "RRAE-HAB-AIR-01",
    "regulationId": "dl-96-2008-rrae",
    "article": "Art. 5.º, n.º 1, alínea a) — Isolamento a Sons Aéreos entre Fogos",
    "description": "Não está garantido o isolamento a sons aéreos entre frações. O RRAE exige D'nT,w ≥ 50 dB entre fogos habitacionais.",
    "severity": "critical",
    "conditions": [
      {
        "field": "acoustic.hasAirborneInsulation",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "numberOfDwellings",
        "operator": ">=",
        "value": 2
      },
      {
        "field": "buildingType",
        "operator": "in",
        "value": [
          "residential",
          "housing",
          "habitacional"
        ]
      }
    ],
    "remediation": "Verificar isolamento sonoro a sons aéreos entre frações. Soluções: paredes duplas com caixa-de-ar e lã mineral, sistemas de gesso cartonado com isolamento, ou paredes em alvenaria ≥ 25cm com reboco.",
    "requiredValue": "D'nT,w ≥ 50 dB",
    "enabled": true,
    "tags": [
      "sons aéreos",
      "isolamento",
      "inter-fogos",
      "habitacional"
    ]
  },
  {
    "id": "RRAE-ESC-REV-01",
    "regulationId": "dl-96-2008-rrae",
    "article": "Art. 7.º, n.º 2 — Tempo de Reverberação Salas de Aula (V ≤ 250 m³)",
    "description": "O tempo de reverberação medido em sala de aula ({acoustic.reverberationTime} s) excede o máximo admissível. O Art. 7.º exige T ≤ 0.15 × V^(1/3) s para salas de aula com volume V ≤ 250 m³, garantindo a inteligibilidade da palavra.",
    "severity": "critical",
    "conditions": [
      {
        "field": "acoustic.reverberationTime",
        "operator": "formula_gt",
        "value": "0.15 * Math.pow(acoustic.roomVolume, 1/3)"
      },
      {
        "field": "acoustic.roomVolume",
        "operator": "<=",
        "value": 250
      },
      {
        "field": "buildingType",
        "operator": "in",
        "value": [
          "school",
          "university",
          "education",
          "escolar"
        ]
      }
    ],
    "remediation": "Reduzir o tempo de reverberação em salas de aula. Soluções: teto falso acústico (α ≥ 0.8), painéis absorventes nas paredes posterior e laterais (≥ 25% da área), cortinas acústicas. Manter a parede frontal (quadro) refletora para projeção de voz do professor.",
    "currentValueTemplate": "T = {acoustic.reverberationTime} s (volume = {acoustic.roomVolume} m³)",
    "requiredValue": "T ≤ 0.15 × V^(1/3) s (V ≤ 250 m³)",
    "enabled": true,
    "tags": [
      "reverberação",
      "absorção",
      "escolar",
      "salas de aula",
      "inteligibilidade"
    ]
  },
  {
    "id": "RRAE-HAB-AIR-04",
    "regulationId": "dl-96-2008-rrae",
    "article": "Art. 5.º, n.º 1, alínea b) — Isolamento Fogos/Zonas Comuns de Circulação (sem verificação)",
    "description": "Não está verificado o isolamento a sons aéreos entre fogos e zonas comuns de circulação. O RRAE exige D'nT,w ≥ 48 dB para esta interface.",
    "severity": "warning",
    "conditions": [
      {
        "field": "acoustic.airborneInsulationCommonAreas",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "numberOfDwellings",
        "operator": ">=",
        "value": 2
      },
      {
        "field": "buildingType",
        "operator": "in",
        "value": [
          "residential",
          "housing",
          "habitacional"
        ]
      }
    ],
    "remediation": "Verificar e dimensionar o isolamento a sons aéreos entre frações e zonas comuns de circulação (escadas, corredores, átrios). Paredes com massa adequada e portas acústicas com vedação perimetral.",
    "requiredValue": "D'nT,w ≥ 48 dB",
    "enabled": true,
    "tags": [
      "sons aéreos",
      "isolamento",
      "zonas comuns",
      "circulação",
      "habitacional"
    ]
  },
  {
    "id": "RRAE-HAB-AIR-02",
    "regulationId": "dl-96-2008-rrae",
    "article": "Art. 5.º, n.º 1, alínea a) — Isolamento a Sons Aéreos entre Fogos (valor medido)",
    "description": "O isolamento a sons aéreos entre frações habitacionais ({acoustic.airborneInsulationValue} dB) é inferior ao mínimo exigido pelo RRAE (D'nT,w ≥ 50 dB).",
    "severity": "critical",
    "conditions": [
      {
        "field": "acoustic.airborneInsulationValue",
        "operator": "<",
        "value": 50
      },
      {
        "field": "numberOfDwellings",
        "operator": ">=",
        "value": 2
      },
      {
        "field": "buildingType",
        "operator": "in",
        "value": [
          "residential",
          "housing",
          "habitacional"
        ]
      }
    ],
    "remediation": "Reforçar isolamento das paredes divisórias entre frações. Considerar parede dupla com lã mineral na caixa-de-ar (mínimo 40mm) ou sistema de contra-fachada em gesso cartonado. Massa superficial da parede ≥ 350 kg/m².",
    "currentValueTemplate": "D'nT,w = {acoustic.airborneInsulationValue} dB",
    "requiredValue": "D'nT,w ≥ 50 dB",
    "enabled": true,
    "tags": [
      "sons aéreos",
      "isolamento",
      "valor medido",
      "habitacional"
    ]
  },
  {
    "id": "RRAE-HAB-AIR-03",
    "regulationId": "dl-96-2008-rrae",
    "article": "Art. 5.º, n.º 1, alínea b) — Isolamento a Sons Aéreos Fogos/Zonas Comuns de Circulação",
    "description": "O isolamento a sons aéreos entre fogos e zonas comuns de circulação ({acoustic.airborneInsulationCommonAreas} dB) é inferior ao mínimo exigido. O RRAE exige D'nT,w ≥ 48 dB entre frações habitacionais e zonas comuns de circulação (caixas de escadas, corredores, átrios).",
    "severity": "critical",
    "conditions": [
      {
        "field": "acoustic.airborneInsulationCommonAreas",
        "operator": "<",
        "value": 48
      },
      {
        "field": "numberOfDwellings",
        "operator": ">=",
        "value": 2
      },
      {
        "field": "buildingType",
        "operator": "in",
        "value": [
          "residential",
          "housing",
          "habitacional"
        ]
      }
    ],
    "remediation": "Reforçar isolamento das paredes e portas entre as frações e as zonas comuns de circulação. Soluções: portas acústicas com vedação perimetral (Rw ≥ 30 dB), paredes com massa superficial ≥ 200 kg/m², selagem de todas as juntas e passagens de tubagens.",
    "currentValueTemplate": "D'nT,w = {acoustic.airborneInsulationCommonAreas} dB",
    "requiredValue": "D'nT,w ≥ 48 dB",
    "enabled": true,
    "tags": [
      "sons aéreos",
      "isolamento",
      "zonas comuns",
      "circulação",
      "habitacional"
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

- [ ] Cada regra tem ID único no formato `ACOUSTIC-NNN`
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