# Extração de Regras — Gestão de Resíduos de Construção (DL 46/2008)

Analisa o texto regulamentar da especialidade **Gestão de Resíduos de Construção (DL 46/2008)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "WASTE-NNN",
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

- **id**: Formato `WASTE-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Gestão de Resíduos de Construção (DL 46/2008)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais RCD
  - `waste.totalRCDTonnes` (number, t) — Quantidade total estimada de residuos de construcao e demolicao em toneladas
  - `waste.projectArea` (number, m2) — Area bruta de construcao do projeto para estimativa de producao de RCD
  - `waste.rcdPerSqmEstimated` (number, kg/m2) — Estimativa de producao de RCD por metro quadrado de area de construcao
  - `waste.hasWasteEstimate` (boolean) — Indica se foi elaborada a estimativa de producao de RCD conforme DL 46/2008
  - `isDemolition` (boolean) — Indica se a operacao inclui trabalhos de demolicao
  - `building.yearBuilt` (number) — Ano de construcao original do edificio (relevante para identificacao de materiais perigosos)
  - `waste.isRegisteredProducer` (boolean) — Indica se o produtor de RCD esta registado conforme exigido pelo DL 46/2008
  - `waste.hasResponsibilityAssignment` (boolean) — Indica se foram definidas as responsabilidades pela gestao dos RCD em obra

  ### Plano de Prevencao e Gestao
  - `waste.hasPPG` (boolean) — Indica se foi elaborado o Plano de Prevencao e Gestao de RCD conforme Art. 10.o do DL 46/2008
  - `waste.ppgHasFullContent` (boolean) — Indica se o PPG contem todos os elementos exigidos (caracterizacao, metodologias, estimativas, destinos)
  - `waste.recyclingRate` (number, %) — Percentagem de RCD a encaminhar para reciclagem ou valorizacao (minimo 70% - Portaria 115/2011)

  ### Classificacao e Triagem
  - `waste.hasLERClassification` (boolean) — Indica se os RCD estao classificados segundo a Lista Europeia de Residuos (codigo LER capitulo 17)
  - `waste.hasTriagem` (boolean) — Indica se e efetuada triagem (separacao) dos RCD por fluxo/tipo em obra (Art. 9.o DL 46/2008)
  - `waste.hasOffSiteSorting` (boolean) — Indica se os RCD nao triados em obra sao encaminhados para operador de triagem licenciado
  - `waste.hasProperStorage` (boolean) — Indica se os RCD sao armazenados em condicoes adequadas (contentores, baias, coberturas)
  - `waste.storageTimeOnSiteDays` (number, dias) — Tempo maximo de armazenamento dos RCD em obra antes da remocao

  ### Transporte e Destino
  - `waste.hasLicensedTransporter` (boolean) — Indica se o transporte dos RCD e efetuado por operador com licenca de transporte de residuos
  - `waste.hasEGAR` (boolean) — Indica se sao emitidas guias eletronicas de acompanhamento de residuos (e-GAR) conforme DL 102-D/2020
  - `waste.hasCorrectGuideModel` (boolean) — Indica se e utilizado o modelo correto de guia de acompanhamento de RCD
  - `waste.hasLicensedDestination` (boolean) — Indica se os RCD sao encaminhados para operador de gestao de residuos licenciado
  - `waste.hasFullTraceability` (boolean) — Indica se existe rastreabilidade completa dos RCD desde a producao ate ao destino final
  - `waste.hasReceptionCertificates` (boolean) — Indica se foram obtidos os certificados de rececao dos RCD emitidos pelos operadores de destino

  ### Materiais Perigosos
  - `waste.asbestosPresent` (boolean) — Indica se foram identificados materiais contendo amianto no edificio
  - `waste.hasAsbestosLERClassification` (boolean) — Indica se os residuos contendo amianto estao classificados com o codigo LER correto (17 06 05*)
  - `waste.hasAsbestosManagement` (boolean) — Indica se existe plano de gestao de amianto conforme legislacao aplicavel (DL 266/2007)
  - `waste.hasAsbestosWorkPlan` (boolean) — Indica se foi elaborado o plano de trabalhos para remocao de materiais contendo amianto
  - `waste.asbestosFiberMonitoring` (boolean) — Indica se e realizada monitorizacao de fibras de amianto no ar durante os trabalhos de remocao
  - `waste.hasHazardousIdentification` (boolean) — Indica se foi realizada a identificacao e inventariacao de todos os residuos perigosos
  - `waste.hasLeadPaintAssessment` (boolean) — Indica se foi avaliada a presenca de tintas contendo chumbo no edificio
  - `waste.hasPCBAssessment` (boolean) — Indica se foi avaliada a presenca de equipamentos ou materiais contendo PCB
  - `waste.hasSoilReuseAssessment` (boolean) — Indica se foi avaliada a possibilidade de reutilizacao dos solos e rochas de escavacao
  - `waste.hasExcavationSoils` (boolean) — Indica se a obra gera solos e rochas provenientes de escavacao

  ### Reciclagem e Valorizacao
  - `waste.concreteRecyclingRate` (number, %) — Percentagem de residuos de betao encaminhados para reciclagem
  - `waste.metalRecyclingRate` (number, %) — Percentagem de residuos metalicos encaminhados para reciclagem
  - `waste.woodRecyclingRate` (number, %) — Percentagem de residuos de madeira encaminhados para reciclagem ou valorizacao energetica
  - `waste.glassPlasticRecyclingRate` (number, %) — Percentagem de residuos de vidro e plastico encaminhados para reciclagem
  - `waste.hasOnSiteRecyclingPermit` (boolean) — Indica se foi obtida autorizacao para reciclagem ou reutilizacao de RCD em obra

  ### Registos e Documentacao
  - `waste.hasSILiAmbRegistration` (boolean) — Indica se o produtor de RCD esta registado no Sistema Integrado de Licenciamento do Ambiente (SILiAmb)
  - `waste.hasMIRRSubmission` (boolean) — Indica se foi submetido o Mapa Integrado de Registo de Residuos (MIRR) anual conforme DL 102-D/2020
  - `waste.hasCaucao` (boolean) — Indica se foi prestada caucao para garantir a correta gestao dos RCD (Art. 12.o DL 46/2008)
  - `waste.hasComplianceCheck` (boolean) — Indica se foi realizada verificacao de conformidade da gestao de RCD em obra
  - `waste.hasFinalReport` (boolean) — Indica se foi elaborado o relatorio final de gestao de RCD com balanco das quantidades produzidas e destinos

  ### Demolicao
  - `waste.hasPreDemolitionAudit` (boolean) — Indica se foi realizada auditoria pre-demolicao para identificacao e quantificacao de materiais
  - `waste.hasSelectiveDemolition` (boolean) — Indica se esta prevista demolicao seletiva para maximizar a separacao e valorizacao de materiais

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

## Estado Atual — Gestão de Resíduos de Construção (DL 46/2008)

Regulamentos registados nesta especialidade:

  - **DL 46/2008** — Regime de Gestão de Resíduos de Construção e Demolição (RCD) [verified, 7 rules]
  - **DL 102-D/2020** — Decreto-Lei n.º 102-D/2020 — Regime Geral de Gestão de Resíduos [complete, 1 rules]

Total: 60 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "RCD-PPG-01",
    "regulationId": "dl-46-2008",
    "article": "Art. 10.º — Plano de Prevenção e Gestão (PPG)",
    "description": "O PPG-RCD é obrigatório para todas as obras sujeitas a licenciamento ou comunicação prévia. Deve acompanhar o projeto de execução e ser aprovado antes do início da obra.",
    "severity": "critical",
    "conditions": [
      {
        "field": "waste.hasPPG",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Elaborar Plano de Prevenção e Gestão de RCD conforme Art. 10.º do DL 46/2008. Deve acompanhar o projeto para licenciamento urbanístico.",
    "currentValueTemplate": "{waste.hasPPG}",
    "requiredValue": "PPG-RCD obrigatório",
    "enabled": true,
    "tags": [
      "PPG",
      "plano",
      "obrigatório",
      "licenciamento"
    ]
  },
  {
    "id": "RCD-PPG-02",
    "regulationId": "dl-46-2008",
    "article": "Art. 10.º, n.º 2 — Conteúdo do PPG",
    "description": "O PPG deve conter: caracterização da obra, metodologias de prevenção, estimativa de RCD por código LER, medidas de acondicionamento e triagem, e destino final previsto para cada fluxo.",
    "severity": "warning",
    "conditions": [
      {
        "field": "waste.ppgHasFullContent",
        "operator": "==",
        "value": false
      }
    ],
    "remediation": "Completar o PPG com todos os elementos obrigatórios: 1) Caracterização sumária da obra; 2) Metodologias de prevenção de RCD incorporadas no projeto; 3) Estimativa de RCD a produzir, discriminada por código LER; 4) Referência a metodologias de acondicionamento e triagem em obra; 5) Destino final previsto para cada fluxo de RCD (operador licenciado identificado).",
    "currentValueTemplate": "{waste.ppgHasFullContent}",
    "requiredValue": "PPG com conteúdo completo conforme Art. 10.º, n.º 2",
    "enabled": true,
    "tags": [
      "PPG",
      "conteúdo",
      "Art. 10.º"
    ]
  },
  {
    "id": "RCD-LER-02",
    "regulationId": "dl-46-2008",
    "article": "Portaria 209/2004 — Resíduos perigosos LER 17 06 05*",
    "description": "Materiais contendo amianto devem ser classificados como LER 17 06 05* (materiais de construção contendo amianto) e geridos como resíduos perigosos, com circuito dedicado.",
    "severity": "critical",
    "conditions": [
      {
        "field": "waste.hasAsbestosLERClassification",
        "operator": "==",
        "value": false
      },
      {
        "field": "waste.asbestosPresent",
        "operator": "==",
        "value": true
      }
    ],
    "remediation": "Classificar materiais contendo amianto (MCA) como LER 17 06 05*. Estes resíduos perigosos exigem: embalagem dupla estanque; etiquetagem conforme legislação de amianto; transporte por operador licenciado para resíduos perigosos; destino final em aterro de resíduos perigosos autorizado.",
    "currentValueTemplate": "{waste.hasAsbestosLERClassification}",
    "requiredValue": "Classificação LER 17 06 05* obrigatória para amianto",
    "enabled": true,
    "tags": [
      "LER",
      "amianto",
      "17 06 05*",
      "perigoso"
    ]
  },
  {
    "id": "RCD-PPG-03",
    "regulationId": "dl-46-2008",
    "article": "Art. 10.º, n.º 3 — Prazo de submissão do PPG",
    "description": "O PPG deve ser apresentado à câmara municipal juntamente com o requerimento de licenciamento ou comunicação prévia da obra.",
    "severity": "warning",
    "conditions": [
      {
        "field": "waste.ppgSubmittedWithLicense",
        "operator": "==",
        "value": false
      }
    ],
    "remediation": "Submeter o PPG-RCD à câmara municipal conjuntamente com o requerimento de licenciamento ou comunicação prévia. A ausência do PPG pode levar à não admissão do pedido de licenciamento.",
    "currentValueTemplate": "{waste.ppgSubmittedWithLicense}",
    "requiredValue": "PPG submetido com pedido de licenciamento",
    "enabled": true,
    "tags": [
      "PPG",
      "prazo",
      "câmara municipal",
      "submissão"
    ]
  },
  {
    "id": "RCD-LER-01",
    "regulationId": "dl-46-2008",
    "article": "Portaria 209/2004 — Classificação LER de RCD",
    "description": "Os RCD devem ser classificados segundo os códigos LER do capítulo 17 (resíduos de construção e demolição). A classificação correta é obrigatória para transporte e destino final.",
    "severity": "critical",
    "conditions": [
      {
        "field": "waste.hasLERClassification",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Classificar todos os RCD segundo a Lista Europeia de Resíduos (LER), capítulo 17: 17 01 — betão, tijolos, cerâmicos; 17 02 — madeira, vidro, plástico; 17 03 — misturas betuminosas; 17 04 — metais; 17 05 — solos e rochas; 17 06 — materiais de isolamento (incl. amianto); 17 08 — gesso; 17 09 — outros RCD. Códigos com asterisco (*) indicam resíduos perigosos.",
    "currentValueTemplate": "{waste.hasLERClassification}",
    "requiredValue": "Classificação LER 17 XX XX obrigatória",
    "enabled": true,
    "tags": [
      "LER",
      "classificação",
      "17 XX XX",
      "Portaria 209/2004"
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

- [ ] Cada regra tem ID único no formato `WASTE-NNN`
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