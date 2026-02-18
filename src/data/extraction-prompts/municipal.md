# Extração de Regras — Regulamentos Municipais / PDM

Analisa o texto regulamentar da especialidade **Regulamentos Municipais / PDM** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "MUNICIPAL-NNN",
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

- **id**: Formato `MUNICIPAL-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Regulamentos Municipais / PDM

Estes são os campos que as condições das regras podem referenciar:


  ### Classificacao e Uso do Solo
  - `municipal.soilClassification` ("urban" | "rural") — Classificacao do solo conforme o PDM vigente
  - `municipal.urbanSoilCategory` ("urbanized" | "urbanizable" | "industrial" | "tourism") — Subcategoria do solo urbano conforme a planta de ordenamento do PDM
  - `municipal.proposedUse` ("residential" | "commercial" | "mixed" | "industrial" | "services" | "tourism") — Uso pretendido para o edificio ou fracao
  - `municipal.allowedUses` (string) — Usos admitidos pelo PDM para a parcela ou zona onde se localiza o imovel
  - `municipal.forbiddenUses` (string) — Usos expressamente interditos pelo PDM para a parcela ou zona

  ### Indices Urbanisticos
  - `municipal.buildingUseIndex` (number) — Indice de utilizacao do solo proposto (racio entre area bruta de construcao e area do terreno)
  - `municipal.buildingUseIndexMax` (number) — Indice de utilizacao maximo admitido pelo PDM para a zona
  - `municipal.implantationIndex` (number) — Indice de implantacao proposto (racio entre area de implantacao e area do terreno)
  - `municipal.implantationIndexMax` (number) — Indice de implantacao maximo admitido pelo PDM para a zona
  - `municipal.maxHeight` (number, m) — Altura maxima do edificio (cercea) admitida pelo PDM
  - `municipal.proposedHeight` (number, m) — Altura total proposta do edificio (cercea)
  - `municipal.maxFloorsAbove` (number) — Numero maximo de pisos acima da cota de soleira admitido pelo PDM
  - `municipal.proposedFloorsAbove` (number) — Numero de pisos acima da cota de soleira propostos no projeto
  - `municipal.maxFloorsBelow` (number) — Numero maximo de pisos abaixo da cota de soleira admitido pelo PDM
  - `municipal.proposedFloorsBelow` (number) — Numero de pisos abaixo da cota de soleira (caves) propostos no projeto
  - `municipal.permeabilityIndex` (number) — Indice de permeabilidade proposto (racio entre area permeavel e area total do lote)
  - `municipal.permeabilityIndexMin` (number) — Indice de permeabilidade minimo exigido pelo PDM para a zona

  ### Afastamentos
  - `municipal.frontSetback` (number, m) — Distancia proposta entre o alinhamento da fachada principal e o limite frontal do lote
  - `municipal.frontSetbackMin` (number, m) — Afastamento frontal minimo exigido pelo PDM ou regulamento municipal
  - `municipal.sideSetback` (number, m) — Distancia proposta entre a fachada lateral e o limite lateral do lote
  - `municipal.sideSetbackMin` (number, m) — Afastamento lateral minimo exigido pelo PDM ou regulamento municipal
  - `municipal.rearSetback` (number, m) — Distancia proposta entre a fachada posterior e o limite traseiro do lote
  - `municipal.rearSetbackMin` (number, m) — Afastamento posterior minimo exigido pelo PDM ou regulamento municipal

  ### Loteamento
  - `municipal.lotArea` (number, m2) — Area total do lote onde se insere o projeto
  - `municipal.lotAreaMin` (number, m2) — Area minima do lote exigida pelo PDM para a tipologia proposta
  - `municipal.lotFrontage` (number, m) — Largura da frente do lote confinante com a via publica
  - `municipal.lotFrontageMin` (number, m) — Largura minima da frente do lote exigida pelo PDM

  ### Servidoes e Condicionantes
  - `municipal.isInRAN` (boolean) — Indica se o terreno se encontra em area de Reserva Agricola Nacional
  - `municipal.isInREN` (boolean) — Indica se o terreno se encontra em area de Reserva Ecologica Nacional
  - `municipal.distanceToWaterDomain` (number, m) — Distancia do edificio ao limite do dominio hidrico publico (margem de rio, ribeira, lago)
  - `municipal.waterDomainBufferMin` (number, m) — Largura minima da faixa de protecao ao dominio hidrico publico (Lei 54/2005)
  - `municipal.isInRoadEasement` (boolean) — Indica se o terreno esta sujeito a servidao non aedificandi rodoviaria
  - `municipal.isInRailEasement` (boolean) — Indica se o terreno esta sujeito a servidao non aedificandi ferroviaria
  - `municipal.isInAeronauticEasement` (boolean) — Indica se o terreno esta sujeito a servidao aeronautica
  - `municipal.isInMilitaryEasement` (boolean) — Indica se o terreno esta sujeito a servidao militar
  - `municipal.isInHeritageProtectionZone` (boolean) — Indica se o terreno se encontra em zona de protecao de imovel classificado ou em vias de classificacao
  - `municipal.isInFloodZone` (boolean) — Indica se o terreno se encontra em zona sujeita a risco de inundacao
  - `municipal.isInGeotechnicalRiskArea` (boolean) — Indica se o terreno se encontra em zona identificada com risco geotecnico (deslizamentos, erosao)

  ### Estacionamento
  - `municipal.parkingSpacesPerUnit` (number) — Numero de lugares de estacionamento propostos por fracao ou fogo
  - `municipal.parkingSpacesPerUnitMin` (number) — Numero minimo de lugares de estacionamento por fracao exigido pelo PDM
  - `municipal.commercialParkingRatio` (number, lugares/m2) — Racio de lugares de estacionamento por m2 de area comercial proposto
  - `municipal.commercialParkingRatioMin` (number, lugares/m2) — Racio minimo de lugares de estacionamento por m2 de area comercial exigido pelo PDM
  - `municipal.accessibleParkingSpaces` (number) — Numero de lugares de estacionamento reservados para pessoas com mobilidade condicionada
  - `municipal.accessibleParkingSpacesMin` (number) — Numero minimo de lugares acessiveis exigido pelo DL 163/2006

  ### Espacos Exteriores
  - `municipal.backyardArea` (number, m2) — Area de logradouro proposta no projeto
  - `municipal.backyardAreaMin` (number, m2) — Area minima de logradouro exigida pelo PDM
  - `municipal.collectiveGreenArea` (number, m2) — Area de espaco verde de utilizacao coletiva proposta no projeto de loteamento
  - `municipal.collectiveGreenAreaMin` (number, m2) — Area minima de espaco verde de utilizacao coletiva exigida pelo PDM
  - `municipal.backyardPermeableRatio` (number, %) — Percentagem de area permeavel no logradouro proposta no projeto
  - `municipal.backyardPermeableRatioMin` (number, %) — Percentagem minima de area permeavel no logradouro exigida pelo PDM

  ### Infraestruturas
  - `municipal.hasPublicWaterConnection` (boolean) — Indica se o edificio esta ligado a rede publica de abastecimento de agua
  - `municipal.publicWaterNetworkAvailable` (boolean) — Indica se existe rede publica de abastecimento de agua junto ao lote
  - `municipal.hasPublicSewerConnection` (boolean) — Indica se o edificio esta ligado a rede publica de drenagem de aguas residuais
  - `municipal.publicSewerNetworkAvailable` (boolean) — Indica se existe rede publica de drenagem de aguas residuais junto ao lote
  - `municipal.hasElectricalConnection` (boolean) — Indica se o edificio esta ligado a rede publica de distribuicao de energia eletrica
  - `municipal.electricalNetworkAvailable` (boolean) — Indica se existe rede publica de distribuicao de energia eletrica junto ao lote
  - `municipal.hasITEDConnection` (boolean) — Indica se o edificio possui infraestrutura de telecomunicacoes conforme ITED (DL 123/2009)

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

## Estado Atual — Regulamentos Municipais / PDM

Regulamentos registados nesta especialidade:

  - **PDM** — Plano Diretor Municipal — Verificações Genéricas [verified, 3 rules]

Total: 35 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "PDM-IU-01",
    "regulationId": "pdm-generic",
    "article": "PDM / RJIGT — Índice de Utilização do Solo",
    "description": "O índice de utilização do solo (Iu) — rácio entre a área bruta de construção e a área do terreno — deve ser definido e não pode exceder o limite fixado no PDM.",
    "severity": "critical",
    "conditions": [
      {
        "field": "municipal.buildingUseIndex",
        "operator": ">",
        "value": 0
      },
      {
        "field": "municipal.buildingUseIndexMax",
        "operator": "exists",
        "value": null
      }
    ],
    "remediation": "Reduzir a área bruta de construção de modo a que o índice de utilização (Iu = ABC / área do terreno) não exceda o valor máximo fixado no PDM para a categoria de solo em causa.",
    "currentValueTemplate": "{municipal.buildingUseIndex}",
    "requiredValue": "Iu ≤ limite PDM (municipal.buildingUseIndexMax)",
    "enabled": true,
    "tags": [
      "índice-utilização",
      "Iu",
      "parâmetros-urbanísticos",
      "PDM"
    ]
  },
  {
    "id": "PDM-PISOS-02",
    "regulationId": "pdm-generic",
    "article": "PDM / RJIGT — Número Máximo de Pisos Abaixo da Cota de Soleira",
    "description": "O número de pisos abaixo da cota de soleira (caves) não pode exceder o máximo definido no PDM.",
    "severity": "warning",
    "conditions": [
      {
        "field": "municipal.maxFloorsBelow",
        "operator": "exists",
        "value": null
      },
      {
        "field": "municipal.proposedFloorsBelow",
        "operator": ">",
        "value": 0
      }
    ],
    "remediation": "Reduzir o número de pisos enterrados (caves) para respeitar o limite definido no PDM. Ponderar soluções alternativas de estacionamento ou armazenamento.",
    "currentValueTemplate": "{municipal.proposedFloorsBelow} pisos abaixo da soleira",
    "requiredValue": "Pisos abaixo da soleira ≤ {municipal.maxFloorsBelow}",
    "enabled": true,
    "tags": [
      "pisos",
      "caves",
      "parâmetros-urbanísticos",
      "PDM"
    ]
  },
  {
    "id": "PDM-II-01",
    "regulationId": "pdm-generic",
    "article": "PDM / RJIGT — Índice de Implantação",
    "description": "O índice de implantação (Ii) — rácio entre a área de implantação do edifício e a área do terreno — deve respeitar o limite máximo definido no PDM.",
    "severity": "critical",
    "conditions": [
      {
        "field": "municipal.implantationIndex",
        "operator": ">",
        "value": 0
      },
      {
        "field": "municipal.implantationIndexMax",
        "operator": "exists",
        "value": null
      }
    ],
    "remediation": "Reduzir a área de implantação do edifício para que o índice de implantação (Ii = área de implantação / área do terreno) cumpra o máximo fixado no PDM.",
    "currentValueTemplate": "{municipal.implantationIndex}",
    "requiredValue": "Ii ≤ limite PDM (municipal.implantationIndexMax)",
    "enabled": true,
    "tags": [
      "índice-implantação",
      "Ii",
      "parâmetros-urbanísticos",
      "PDM"
    ]
  },
  {
    "id": "PDM-CERCEA-01",
    "regulationId": "pdm-generic",
    "article": "PDM / RJIGT — Cércea Máxima",
    "description": "A cércea (altura máxima do edifício medida na fachada) não pode exceder o valor máximo definido no PDM para o local.",
    "severity": "critical",
    "conditions": [
      {
        "field": "municipal.maxHeight",
        "operator": "exists",
        "value": null
      },
      {
        "field": "municipal.proposedHeight",
        "operator": ">",
        "value": 0
      }
    ],
    "remediation": "Reduzir a altura do edifício (cércea) para não exceder o limite máximo definido no PDM. Considerar reduzir o número de pisos ou a altura entre pisos.",
    "currentValueTemplate": "{municipal.proposedHeight} m",
    "requiredValue": "Altura ≤ cércea máxima PDM ({municipal.maxHeight} m)",
    "enabled": true,
    "tags": [
      "cércea",
      "altura",
      "parâmetros-urbanísticos",
      "PDM"
    ]
  },
  {
    "id": "PDM-PISOS-01",
    "regulationId": "pdm-generic",
    "article": "PDM / RJIGT — Número Máximo de Pisos Acima da Cota de Soleira",
    "description": "O número de pisos acima da cota de soleira não pode exceder o máximo definido no PDM para a categoria de solo.",
    "severity": "critical",
    "conditions": [
      {
        "field": "municipal.maxFloorsAbove",
        "operator": "exists",
        "value": null
      },
      {
        "field": "municipal.proposedFloorsAbove",
        "operator": ">",
        "value": 0
      }
    ],
    "remediation": "Reduzir o número de pisos acima da cota de soleira para cumprir o limite fixado no PDM.",
    "currentValueTemplate": "{municipal.proposedFloorsAbove} pisos acima da soleira",
    "requiredValue": "Pisos acima da soleira ≤ {municipal.maxFloorsAbove}",
    "enabled": true,
    "tags": [
      "pisos",
      "cota-soleira",
      "parâmetros-urbanísticos",
      "PDM"
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

- [ ] Cada regra tem ID único no formato `MUNICIPAL-NNN`
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