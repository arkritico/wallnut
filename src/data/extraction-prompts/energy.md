# Extração de Regras — Certificação Energética (SCE)

Analisa o texto regulamentar da especialidade **Certificação Energética (SCE)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "ENERGY-NNN",
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

- **id**: Formato `ENERGY-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Certificação Energética (SCE)

Estes são os campos que as condições das regras podem referenciar:


  ### Certificação Energética
  - `buildingType` ("residential" | "commercial" | "mixed" | "industrial") — Tipo de edifício para determinação do regulamento aplicável (REH ou RECS)
  - `isRehabilitation` (boolean) — Indica se o edifício está sujeito a obras de reabilitação, com requisitos distintos no SCE
  - `isMajorRehabilitation` (boolean) — Indica se a intervenção representa uma grande reabilitação (custo > 25% do valor do edifício ou > 25% da envolvente)
  - `energy.hasCertificate` (boolean) — Indica se o edifício possui certificado energético válido emitido pela ADENE
  - `hasPreCertificate` (boolean) — Indica se foi emitido pré-certificado energético na fase de projeto
  - `hasFinalCertificate` (boolean) — Indica se foi emitido certificado energético final após conclusão da obra
  - `hasCertifiedExpert` (boolean) — Indica se existe perito qualificado (PQ) designado para o processo de certificação
  - `energy.certificateAgeYears` (number, anos) — Número de anos desde a emissão do certificado energético (validade máxima 10 anos)
  - `certificateValidity` (number, anos) — Período de validade do certificado energético — máximo 10 anos para edifícios existentes
  - `energy.energyClass` ("A+" | "A" | "B" | "B-" | "C" | "D" | "E" | "F") — Classe energética do edifício conforme escala SCE (A+ a F)
  - `energy.transactionType` ("sale" | "rental" | "new_construction" | "major_renovation") — Tipo de transação que desencadeia a obrigatoriedade de certificação energética
  - `projectPhase` ("design" | "construction" | "operation") — Fase do projeto para determinação dos requisitos SCE aplicáveis
  - `grossFloorArea` (number, m²) — Área bruta de pavimento do edifício para determinação de requisitos RECS

  ### Consumo e Eficiência
  - `energy.ieeActual` (number, kWh/m².ano) — Indicador de eficiência energética efetivo do edifício (consumo real por área útil por ano)
  - `ieeReference` (number, kWh/m².ano) — Indicador de eficiência energética de referência para a tipologia do edifício
  - `energy.primaryEnergyRatio` (number) — Rácio entre as necessidades nominais e o limite regulamentar de energia primária
  - `energy.ntcNtRatio` (number) — Rácio entre as necessidades nominais globais de energia primária (Ntc) e o limite (Nt)
  - `energy.isGES` (boolean) — Indica se o edifício é um GES (área útil > 1000 m² ou 500 m² em centros comerciais)
  - `energy.hasTIM` (boolean) — Indica se existe TIM designado para manutenção dos sistemas técnicos do edifício

  ### Sistemas de Energia
  - `energy.installedPower` (number, kW) — Potência nominal total dos sistemas técnicos instalados no edifício
  - `systems.hasHeatPump` (boolean) — Indica se o edifício utiliza bomba de calor para climatização ou AQS
  - `systems.dhwSystem` ("gas_heater" | "gas_boiler" | "electric_heater" | "heat_pump" | "solar_thermal" | "combined") — Tipo de sistema de preparação de águas quentes sanitárias (AQS)

  ### Iluminação
  - `energy.lightingDensity` (number, W/m²) — Densidade de potência de iluminação instalada (DPI) no edifício
  - `hasAutoDimming` (boolean) — Indica se existe sistema de regulação automática do fluxo luminoso (dimming)
  - `hasNaturalLight` (boolean) — Indica se existe sistema de aproveitamento de luz natural integrado com a iluminação artificial
  - `hasOccupancySensors` (boolean) — Indica se existem sensores de presença/ocupação para controlo da iluminação

  ### Renováveis
  - `systems.hasSolarThermal` (boolean) — Indica se o edifício possui sistema solar térmico para AQS (obrigatório em edifícios novos)
  - `systems.hasSolarPV` (boolean) — Indica se o edifício possui sistema de produção de energia fotovoltaica
  - `energy.pvPowerW` (number, W) — Potência de pico do sistema fotovoltaico instalado (Wp)
  - `solarContribution` (number, %) — Percentagem de energia solar na preparação de AQS (fração solar)

  ### Manutenção e Auditoria
  - `hasMaintenancePlan` (boolean) — Indica se existe plano de manutenção preventiva dos sistemas técnicos conforme SCE
  - `hasEnergyAudit` (boolean) — Indica se foi realizada auditoria energética ao edifício (obrigatória para GES)

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

## Estado Atual — Certificação Energética (SCE)

Regulamentos registados nesta especialidade:

  - **DL 101-D/2020** — Sistema de Certificação Energética dos Edifícios (SCE) [verified, 10 rules]
  - **DL 118/2013** — Sistema de Certificação Energética dos Edifícios (SCE) — Regime Base [verified, 37 rules]
  - **Portaria 349-B/2013** — REH — Requisitos de Desempenho Energético para Edifícios de Habitação [verified, 13 rules]
  - **DL 162/2019** — Regime Jurídico do Autoconsumo de Energia Renovável [verified, 3 rules]

Total: 63 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "SCE-CERT-01",
    "regulationId": "dl-118-2013-sce",
    "article": "DL 118/2013 Art. 3.º — Certificação Energética Obrigatória (Novos Edifícios)",
    "description": "A certificação energética é obrigatória para todos os edifícios novos. O pré-certificado deve ser obtido na fase de projeto (antes do licenciamento) e o certificado final antes da utilização.",
    "severity": "critical",
    "conditions": [
      {
        "field": "energy.hasCertificate",
        "operator": "==",
        "value": false
      },
      {
        "field": "isRehabilitation",
        "operator": "==",
        "value": false
      }
    ],
    "remediation": "Obter pré-certificado energético na fase de projeto (antes de submeter ao licenciamento camarário) e certificado final antes da emissão da licença de utilização ou da primeira venda/arrendamento. Contratar Perito Qualificado (PQ) registado na ADENE.",
    "currentValueTemplate": "{energy.hasCertificate}",
    "requiredValue": "Certificado energético obrigatório para edifícios novos",
    "enabled": true,
    "tags": [
      "certificação",
      "obrigatório",
      "novos edifícios",
      "DL 118/2013"
    ]
  },
  {
    "id": "SCE-NZEB-04",
    "regulationId": "dl-101d-2020-sce",
    "article": "DL 101-D/2020 — Contribuição Renovável Obrigatória NZEB",
    "description": "Edifícios NZEB devem incluir contribuição de energias renováveis. Painéis solares térmicos ou fotovoltaicos são obrigatórios em edifícios novos para cumprimento dos requisitos NZEB.",
    "severity": "critical",
    "conditions": [
      {
        "field": "systems.hasSolarPV",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "systems.hasSolarThermal",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "systems.hasHeatPump",
        "operator": "not_exists",
        "value": null
      },
      {
        "field": "isRehabilitation",
        "operator": "==",
        "value": false
      }
    ],
    "remediation": "Instalar pelo menos um sistema de energia renovável: coletores solares térmicos para AQS, painéis fotovoltaicos para autoconsumo, bomba de calor (COP ≥ 2.5) ou caldeira a biomassa. A contribuição renovável é indispensável para atingir os limiares NZEB.",
    "requiredValue": "Contribuição renovável obrigatória (solar térmico, PV, bomba de calor ou biomassa)",
    "enabled": true,
    "tags": [
      "NZEB",
      "renováveis",
      "obrigatório",
      "solar",
      "DL 101-D/2020"
    ]
  },
  {
    "id": "SCE-CERT-07",
    "regulationId": "dl-118-2013-sce",
    "article": "DL 118/2013 Art. 21.º — Publicidade com Classe Energética",
    "description": "A classe energética deve constar obrigatoriamente em todos os anúncios de publicidade para venda ou arrendamento de imóveis.",
    "severity": "warning",
    "conditions": [
      {
        "field": "energy.advertisingIncludesClass",
        "operator": "==",
        "value": false
      },
      {
        "field": "energy.transactionType",
        "operator": "in",
        "value": [
          "sale",
          "rent"
        ]
      }
    ],
    "remediation": "Incluir a classe energética (letra de A+ a F) em todos os anúncios de venda ou arrendamento, incluindo anúncios online, impressos e em montra. A omissão constitui contraordenação.",
    "currentValueTemplate": "{energy.advertisingIncludesClass}",
    "requiredValue": "Classe energética obrigatória em anúncios imobiliários",
    "enabled": true,
    "tags": [
      "publicidade",
      "classe energética",
      "anúncios",
      "DL 118/2013"
    ]
  },
  {
    "id": "SCE-CERT-02",
    "regulationId": "dl-118-2013-sce",
    "article": "DL 118/2013 Art. 20.º — Validade do Certificado Energético",
    "description": "O certificado energético expirou ou excede o prazo máximo de validade. Edifícios existentes: 10 anos; grandes edifícios de serviços (GES): 6 anos; edifícios novos: 10 anos.",
    "severity": "critical",
    "conditions": [
      {
        "field": "energy.certificateValidity",
        "operator": "==",
        "value": false
      }
    ],
    "remediation": "Solicitar nova certificação energética por Perito Qualificado (PQ) registado na ADENE. Para GES, a renovação deve ocorrer a cada 6 anos; para edifícios de habitação e pequenos edifícios de serviços, a cada 10 anos.",
    "currentValueTemplate": "{energy.certificateValidity}",
    "requiredValue": "Certificado válido (≤ 10 anos edifícios existentes/novos; ≤ 6 anos GES)",
    "enabled": true,
    "tags": [
      "certificado",
      "validade",
      "ADENE",
      "PQ"
    ]
  },
  {
    "id": "SCE-CERT-03",
    "regulationId": "dl-118-2013-sce",
    "article": "DL 118/2013 Art. 3.º n.º 2 — Certificação em Grandes Reabilitações",
    "description": "A certificação energética é obrigatória para grandes reabilitações (intervenções com custo superior a 25% do valor do edifício ou que afetem mais de 25% da envolvente).",
    "severity": "critical",
    "conditions": [
      {
        "field": "energy.hasCertificate",
        "operator": "==",
        "value": false
      },
      {
        "field": "isRehabilitation",
        "operator": "==",
        "value": true
      },
      {
        "field": "isMajorRehabilitation",
        "operator": "==",
        "value": true
      }
    ],
    "remediation": "Obter certificação energética para a grande reabilitação. A intervenção deve cumprir os requisitos mínimos de desempenho energético aplicáveis a edifícios novos (com possíveis exceções mediante parecer ADENE).",
    "currentValueTemplate": "{energy.hasCertificate}",
    "requiredValue": "Certificado energético obrigatório para grandes reabilitações",
    "enabled": true,
    "tags": [
      "certificação",
      "grandes reabilitações",
      "obrigatório",
      "DL 118/2013"
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

- [ ] Cada regra tem ID único no formato `ENERGY-NNN`
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