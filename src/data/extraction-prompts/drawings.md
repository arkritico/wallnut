# Extração de Regras — Qualidade das Peças Desenhadas (Portaria 701-H/2008)

Analisa o texto regulamentar da especialidade **Qualidade das Peças Desenhadas (Portaria 701-H/2008)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "DRAWINGS-NNN",
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

- **id**: Formato `DRAWINGS-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Qualidade das Peças Desenhadas (Portaria 701-H/2008)

Estes são os campos que as condições das regras podem referenciar:


  ### Peças Desenhadas Obrigatórias
  - `drawings.hasLocationPlan` (boolean) — Indica se o projeto inclui planta de localização com enquadramento na cartografia oficial
  - `drawings.locationPlanScale` ("1:1000" | "1:2000" | "1:2500" | "1:5000") — Escala da planta de localização — tipicamente 1:2500 ou 1:5000
  - `drawings.hasImplantationPlan` (boolean) — Indica se o projeto inclui planta de implantação com cotas e alinhamentos
  - `drawings.implantationPlanScale` ("1:200" | "1:500" | "1:1000") — Escala da planta de implantação — tipicamente 1:200 ou 1:500
  - `drawings.hasFloorPlans` (boolean) — Indica se o projeto inclui plantas de todos os pisos distintos
  - `drawings.floorPlanScale` ("1:50" | "1:100" | "1:200") — Escala das plantas de pisos — tipicamente 1:50 ou 1:100
  - `drawings.hasSections` (boolean) — Indica se o projeto inclui cortes longitudinais e transversais representativos
  - `drawings.sectionCount` (number) — Número de cortes incluídos no projeto — mínimo 2 (longitudinal e transversal)
  - `drawings.hasElevations` (boolean) — Indica se o projeto inclui todos os alçados do edifício
  - `drawings.hasDetails` (boolean) — Indica se o projeto inclui desenhos de pormenorização construtiva
  - `drawings.detailScale` ("1:5" | "1:10" | "1:20") — Escala dos desenhos de pormenor — tipicamente 1:5 a 1:20
  - `drawings.hasRoofPlan` (boolean) — Indica se o projeto inclui planta de cobertura com pendentes e sistema de drenagem
  - `drawings.hasFinishesSchedule` (boolean) — Indica se o projeto inclui mapa de acabamentos interiores e exteriores
  - `drawings.hasOpeningsSchedule` (boolean) — Indica se o projeto inclui mapa de vãos (portas e janelas) com dimensões e características
  - `drawings.hasAreaSchedule` (boolean) — Indica se o projeto inclui quadro de áreas com áreas brutas, úteis e de implantação

  ### Fases de Projeto
  - `drawings.hasPreliminaryProgram` (boolean) — Indica se existe programa preliminar do projeto
  - `drawings.hasPreliminaryStudy` (boolean) — Indica se existe estudo prévio com a conceção geral da obra
  - `drawings.hasPreliminaryDesign` (boolean) — Indica se existe anteprojeto para efeitos de licenciamento
  - `drawings.hasExecutionProject` (boolean) — Indica se existe projeto de execução com detalhe suficiente para construção
  - `drawings.hasCorrectScaleForPhase` (boolean) — Indica se as escalas utilizadas são adequadas à fase do projeto (ex.: 1:100 para licenciamento, 1:50 para execução)

  ### Qualidade Gráfica
  - `drawings.hasScaleBar` (boolean) — Indica se os desenhos incluem escala gráfica para verificação após impressão
  - `drawings.lineWeightMin` (number, mm) — Espessura mínima de linha nos desenhos — mínimo 0,13 mm para legibilidade
  - `drawings.hasConsistentLineWeights` (boolean) — Indica se as espessuras de linha são consistentes e hierarquizadas em todo o projeto
  - `drawings.hasStandardLineTypes` (boolean) — Indica se são utilizados tipos de linha normalizados (contínuo, tracejado, traço-ponto)
  - `drawings.textHeightMin` (number, mm) — Altura mínima do texto nos desenhos — mínimo 2,5 mm à escala de impressão
  - `drawings.titleTextHeight` (number, mm) — Altura do texto de títulos e legendas principais
  - `drawings.hasReadableTextAtScale` (boolean) — Indica se todo o texto é legível quando impresso à escala indicada
  - `drawings.hasStandardBuildingRepresentation` (boolean) — Indica se a representação de elementos construtivos segue as normas de desenho técnico
  - `drawings.hasStandardDrawingPrinciples` (boolean) — Indica se os desenhos seguem os princípios gerais de representação normalizada (NP EN ISO 128)
  - `drawings.hasMaterialHatching` (boolean) — Indica se os materiais em corte são representados com hachuras normalizadas

  ### Informação Complementar
  - `drawings.hasDimensioning` (boolean) — Indica se os desenhos incluem cotagem completa
  - `drawings.hasLevelDimensions` (boolean) — Indica se os desenhos incluem cotas de nível (altimetria) referenciadas
  - `drawings.hasPartialAndTotalDimensions` (boolean) — Indica se a cotagem inclui cotas parciais e cotas totais encadeadas
  - `drawings.hasNorthOrientation` (boolean) — Indica se as plantas incluem indicação da orientação norte geográfico
  - `drawings.hasTitleBlock` (boolean) — Indica se os desenhos possuem legenda normalizada (carimbo) com informações do projeto
  - `drawings.titleBlockHasDesigner` (boolean) — Indica se a legenda inclui nome, assinatura e número de inscrição na ordem profissional
  - `drawings.titleBlockHasScale` (boolean) — Indica se a legenda inclui a indicação numérica da escala utilizada
  - `drawings.hasSequentialNumbering` (boolean) — Indica se os desenhos possuem numeração sequencial e organizada
  - `drawings.hasRevisionControl` (boolean) — Indica se os desenhos possuem sistema de controlo de revisões com data e descrição das alterações

  ### Simbologia
  - `drawings.hasSCIESymbology` (boolean) — Indica se os desenhos de segurança contra incêndio utilizam simbologia conforme NT-SCIE
  - `drawings.hasElectricalSymbology` (boolean) — Indica se os desenhos elétricos utilizam simbologia conforme NP EN 60617
  - `drawings.hasHVACSymbology` (boolean) — Indica se os desenhos AVAC utilizam simbologia normalizada
  - `drawings.hasHydraulicSymbology` (boolean) — Indica se os desenhos de redes hidráulicas utilizam simbologia normalizada
  - `drawings.hasAccessibilitySymbology` (boolean) — Indica se os desenhos incluem simbologia de acessibilidade conforme DL 163/2006
  - `drawings.hasSymbolLegend` (boolean) — Indica se os desenhos incluem legenda explicativa dos símbolos utilizados

  ### Apresentação e Formatação
  - `drawings.hasStandardPaperFormat` (boolean) — Indica se os desenhos utilizam formatos de papel normalizados (série A: A0, A1, A2, A3, A4)
  - `drawings.hasMinimumMargins` (boolean) — Indica se os desenhos respeitam as margens mínimas de enquadramento e arquivo
  - `drawings.hasFoldingMarks` (boolean) — Indica se os formatos superiores a A4 possuem marcas de dobragem normalizadas
  - `drawings.hasSpecialtyCoordination` (boolean) — Indica se existe coordenação gráfica entre as diversas especialidades do projeto

  ### Documentos Escritos
  - `drawings.hasFireSafetyPlans` (boolean) — Indica se existem plantas de segurança contra incêndio para instrução do processo SCIE
  - `drawings.hasAccessibilityPlans` (boolean) — Indica se existem plantas de acessibilidades com percursos acessíveis e equipamentos
  - `drawings.hasBOQ` (boolean) — Indica se existe mapa de quantidades de trabalho (medições) para orçamentação
  - `drawings.hasSpecifications` (boolean) — Indica se existe caderno de encargos ou condições técnicas especiais
  - `drawings.hasBudgetEstimate` (boolean) — Indica se existe estimativa orçamental ou orçamento detalhado
  - `drawings.hasWorkPlan` (boolean) — Indica se existe plano de trabalhos com cronograma de execução da obra

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

## Estado Atual — Qualidade das Peças Desenhadas (Portaria 701-H/2008)

Regulamentos registados nesta especialidade:

  - **Portaria 701-H/2008** — Conteúdo obrigatório do projeto de execução e outros elementos do projeto [verified, 7 rules]
  - **ISO 3098** — Technical Product Documentation — Lettering [verified, 2 rules]
  - **ISO 128** — Technical Product Documentation — General Principles of Presentation [verified, 1 rules]
  - **ISO 216** — ISO 216 — Formatos de Papel (série A, B) [complete, 1 rules]
  - **ISO 5457** — ISO 5457 — Formatos e Apresentação de Folhas de Desenho [complete, 1 rules]
  - **ISO 7001** — ISO 7001 — Símbolos Gráficos de Informação Pública [complete, 1 rules]
  - **NP 49** — NP 49 — Vocabulário de Desenho Técnico [complete, 1 rules]
  - **NP EN ISO 6412** — NP EN ISO 6412 — Representação Simplificada de Tubagens [complete, 1 rules]
  - **NP EN ISO 7518** — NP EN ISO 7518 — Símbolos para Instalações de Demolição e Construção [complete, 1 rules]
  - **NP EN ISO 7519** — NP EN ISO 7519 — Convenções Gerais para Plantas e Cortes [complete, 1 rules]
  - **NT04 / EN ISO 7010** — EN ISO 7010 — Símbolos de Segurança (Sinais de Emergência) [complete, 1 rules]
  - **IEC 60617** — IEC 60617 — Símbolos Gráficos para Esquemas Elétricos [complete, 1 rules]

Total: 55 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "DRW-LOC-01",
    "regulationId": "portaria-701h-2008",
    "article": "Art. 11.o -- Planta de localização",
    "description": "O projeto deve incluir planta de localização a escala adequada (1:1000 a 1:25000), identificando o terreno no contexto urbano ou rural.",
    "severity": "critical",
    "conditions": [
      {
        "field": "drawings.hasLocationPlan",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Incluir planta de localização a escala entre 1:1000 e 1:25000, com indicação clara do terreno, arruamentos e referências geográficas envolventes.",
    "currentValueTemplate": "{drawings.hasLocationPlan}",
    "requiredValue": "Planta de localização obrigatória",
    "enabled": true,
    "tags": [
      "planta",
      "localização",
      "escala",
      "portaria-701h"
    ]
  },
  {
    "id": "DRW-LOC-02",
    "regulationId": "portaria-701h-2008",
    "article": "Art. 11.o -- Escala da planta de localização",
    "description": "A planta de localização deve ter escala entre 1:1000 e 1:25000 conforme a dimensão do empreendimento.",
    "severity": "warning",
    "conditions": [
      {
        "field": "drawings.locationPlanScale",
        "operator": ">",
        "value": 25000
      }
    ],
    "remediation": "Ajustar a escala da planta de localização para um valor entre 1:1000 e 1:25000. Para áreas urbanas, recomenda-se 1:1000 a 1:5000.",
    "currentValueTemplate": "1:{drawings.locationPlanScale}",
    "requiredValue": "<= 1:25000",
    "enabled": true,
    "tags": [
      "escala",
      "localização",
      "portaria-701h"
    ]
  },
  {
    "id": "DRW-IMP-01",
    "regulationId": "portaria-701h-2008",
    "article": "Art. 11.o -- Planta de implantação",
    "description": "O projeto deve incluir planta de implantação a escala adequada (1:200 a 1:500), com a posição do edifício no lote.",
    "severity": "critical",
    "conditions": [
      {
        "field": "drawings.hasImplantationPlan",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Incluir planta de implantação a escala 1:200 ou 1:500, com limites do lote, edifício, acessos, alinhamentos e cotas de implantação.",
    "currentValueTemplate": "{drawings.hasImplantationPlan}",
    "requiredValue": "Planta de implantação obrigatória",
    "enabled": true,
    "tags": [
      "planta",
      "implantação",
      "escala",
      "portaria-701h"
    ]
  },
  {
    "id": "DRW-IMP-02",
    "regulationId": "portaria-701h-2008",
    "article": "Art. 11.o -- Escala da planta de implantação",
    "description": "A planta de implantação deve ter escala entre 1:200 e 1:500.",
    "severity": "warning",
    "conditions": [
      {
        "field": "drawings.implantationPlanScale",
        "operator": ">",
        "value": 500
      }
    ],
    "remediation": "Ajustar a escala da planta de implantação para um valor entre 1:200 e 1:500, garantindo legibilidade das cotas e limites do lote.",
    "currentValueTemplate": "1:{drawings.implantationPlanScale}",
    "requiredValue": "<= 1:500",
    "enabled": true,
    "tags": [
      "escala",
      "implantação",
      "portaria-701h"
    ]
  },
  {
    "id": "DRW-PISOS-01",
    "regulationId": "portaria-701h-2008",
    "article": "Art. 11.o -- Plantas de pisos",
    "description": "O projeto deve incluir plantas de todos os pisos distintos a escala 1:50 ou 1:100.",
    "severity": "critical",
    "conditions": [
      {
        "field": "drawings.hasFloorPlans",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Incluir plantas de todos os pisos distintos (cave, r/c, pisos tipo, cobertura) a escala 1:50 (projeto de execução) ou 1:100 (estudo prévio/anteprojeto).",
    "currentValueTemplate": "{drawings.hasFloorPlans}",
    "requiredValue": "Plantas de todos os pisos obrigatórias",
    "enabled": true,
    "tags": [
      "planta",
      "pisos",
      "escala",
      "portaria-701h"
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

- [ ] Cada regra tem ID único no formato `DRAWINGS-NNN`
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