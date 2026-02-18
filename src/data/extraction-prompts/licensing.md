# Extração de Regras — Licenciamento Urbanístico (RJUE)

Analisa o texto regulamentar da especialidade **Licenciamento Urbanístico (RJUE)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "LICENSING-NNN",
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

- **id**: Formato `LICENSING-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Licenciamento Urbanístico (RJUE)

Estes são os campos que as condições das regras podem referenciar:


  ### Tipo de Operacao
  - `licensing.operationType` ("building_permit" | "urbanization_permit" | "communication_prior" | "utilization")
  - `licensing.projectPhase` ("licensing" | "execution" | "construction" | "completion")
  - `licensing.isRehabilitation` (boolean) — Indica se a operacao se enquadra como reabilitacao urbana conforme RJRU
  - `licensing.isProtectedArea` (boolean) — Indica se o imovel se encontra em zona de protecao de imovel classificado ou em vias de classificacao
  - `licensing.isInARU` (boolean) — Indica se o imovel se encontra dentro de uma Area de Reabilitacao Urbana delimitada
  - `licensing.isConformWithPDM` (boolean) — Indica se a operacao esta em conformidade com o Plano Diretor Municipal vigente
  - `licensing.altersFacadeOrHeight` (boolean) — Indica se a intervencao altera a fachada principal, a cercea ou o numero de pisos
  - `licensing.altersStructure` (boolean) — Indica se a operacao implica alteracoes a estrutura resistente do edificio existente
  - `licensing.preservesStructure` (boolean) — Indica se a intervencao mantem a estrutura resistente original do edificio
  - `licensing.hasComunicacaoPrevia` (boolean) — Indica se a operacao urbanistica esta sujeita ao regime de comunicacao previa (Art. 4.o RJUE)
  - `licensing.hasMunicipalApproval` (boolean) — Indica se foi obtida a aprovacao da Camara Municipal para o projeto

  ### Documentos de Licenciamento
  - `licensing.hasRequerimento` (boolean) — Indica se foi apresentado o requerimento inicial conforme Art. 9.o do RJUE
  - `licensing.hasCertidaoPredial` (boolean) — Indica se foi junta a certidao permanente do registo predial do imovel
  - `licensing.hasArchitecturalProject` (boolean) — Indica se o projeto de arquitetura foi entregue conforme Portaria 113/2015
  - `licensing.hasSpecialtyProjects` (boolean) — Indica se foram entregues os projetos de especialidades exigidos (estabilidade, aguas, esgotos, AVAC, etc.)
  - `licensing.hasCalendarizacao` (boolean) — Indica se foi apresentada a calendarizacao prevista para a execucao da obra
  - `licensing.hasTermoDeResponsabilidade` (boolean) — Indica se foram entregues os termos de responsabilidade dos tecnicos subscritores
  - `licensing.hasFichasDeProjeto` (boolean) — Indica se foram entregues as fichas tecnicas e de elementos estatisticos do projeto
  - `licensing.requiresExternalConsultation` (boolean) — Indica se o processo requer parecer de entidades externas (DGPC, APA, CCDR, etc.)
  - `licensing.hasExternalConsultations` (boolean) — Indica se as consultas a entidades externas foram realizadas e os pareceres obtidos
  - `licensing.hasDGPCApproval` (boolean) — Indica se foi obtido parecer favoravel da Direcao-Geral do Patrimonio Cultural (imoveis classificados)
  - `licensing.prazoUltrapassado` (boolean) — Indica se o prazo legal para decisao da Camara Municipal foi ultrapassado (deferimento tacito)
  - `licensing.hasConstructionLicense` (boolean) — Indica se foi emitido o alvara de licenca de construcao (Art. 74.o RJUE)
  - `licensing.alvaraValidityMonths` (number, meses) — Prazo de validade do alvara de construcao em meses
  - `licensing.hasDemolitionLicense` (boolean) — Indica se foi obtida licenca de demolicao quando aplicavel (Art. 6.o RJUE)
  - `licensing.hasPSS` (boolean) — Indica se foi elaborado o Plano de Seguranca e Saude em fase de projeto conforme DL 273/2003

  ### Fase de Obra
  - `licensing.hasComunicacaoInicio` (boolean) — Indica se foi comunicado o inicio da obra a Camara Municipal com a antecedencia legal
  - `licensing.hasBookOfWork` (boolean) — Indica se o livro de obra foi aberto e esta disponivel em obra conforme Portaria 1268/2008
  - `licensing.hasPlacaDeObra` (boolean) — Indica se a placa identificativa da obra esta afixada no local conforme regulamento municipal
  - `licensing.hasViaPublicaLicense` (boolean) — Indica se foi obtida licenca de ocupacao da via publica para estaleiro, andaimes ou tapumes
  - `licensing.hasDesvioAoProjeto` (boolean) — Indica se existem alteracoes em obra que constituem desvio ao projeto aprovado
  - `licensing.isLegalizable` (boolean) — Indica se a situacao existente e passivel de legalizacao nos termos do RJUE

  ### Fiscalizacao e Direcao
  - `licensing.hasTechnicalDirector` (boolean) — Indica se foi nomeado o diretor tecnico de obra conforme Art. 14.o do RJUE
  - `licensing.hasFiscalizationDirector` (boolean) — Indica se foi nomeado o diretor de fiscalizacao de obra conforme Art. 14.o do RJUE

  ### Conclusao e Utilizacao
  - `licensing.hasTelasFinais` (boolean) — Indica se foram entregues as telas finais (desenhos conforme construido) de todas as especialidades
  - `licensing.hasCertificacoes` (boolean) — Indica se foram obtidas as certificacoes exigidas (energetica, acustica, ITED, gas, etc.)
  - `licensing.hasVistoriaMunicipal` (boolean) — Indica se foi realizada a vistoria municipal para efeitos de emissao da autorizacao de utilizacao
  - `licensing.hasUtilizationLicense` (boolean) — Indica se foi emitida a autorizacao de utilizacao do edificio (Art. 62.o RJUE)

  ### Casos Especiais
  - `licensing.hasAsbestosManagement` (boolean) — Indica se foi verificada a presenca de materiais com amianto e elaborado plano de gestao quando aplicavel

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

## Estado Atual — Licenciamento Urbanístico (RJUE)

Regulamentos registados nesta especialidade:

  - **DL 555/99 (RJUE)** — Regime Jurídico da Urbanização e Edificação [verified, 9 rules]
  - **DL 136/2014** — Alteração ao RJUE (13ª alteração ao DL 555/99) [PENDING, 0 rules]
  - **DL 307/2009 (RJRU)** — Regime Jurídico da Reabilitação Urbana [verified, 1 rules]
  - **DL 273/2003** — Decreto-Lei n.º 273/2003 — Segurança e Saúde no Trabalho em Estaleiros [complete, 1 rules]

Total: 45 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "RJUE-LIC-01",
    "regulationId": "dl-555-99-rjue",
    "article": "Art. 4.º, n.º 2, al. a) — Licenciamento de Construção Nova",
    "description": "As obras de construção nova estão sujeitas a licenciamento municipal obrigatório.",
    "severity": "critical",
    "conditions": [
      {
        "field": "licensing.operationType",
        "operator": "==",
        "value": "construcao_nova"
      },
      {
        "field": "licensing.hasConstructionLicense",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Submeter pedido de licenciamento à câmara municipal competente. O início de obras sem licença constitui contraordenação grave (Art. 98.º).",
    "currentValueTemplate": "{licensing.operationType}",
    "requiredValue": "Licenciamento obrigatório para construção nova",
    "enabled": true,
    "tags": [
      "licenciamento",
      "construção_nova",
      "obrigatório"
    ]
  },
  {
    "id": "RJUE-CP-01",
    "regulationId": "dl-555-99-rjue",
    "article": "Art. 4.º, n.º 4, al. a) — Comunicação Prévia de Reconstrução",
    "description": "As obras de reconstrução sem alteração de estrutura, fachada ou número de pisos estão sujeitas a comunicação prévia.",
    "severity": "warning",
    "conditions": [
      {
        "field": "licensing.operationType",
        "operator": "==",
        "value": "reconstrucao"
      },
      {
        "field": "licensing.altersFacadeOrHeight",
        "operator": "==",
        "value": false
      },
      {
        "field": "licensing.hasComunicacaoPrevia",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Submeter comunicação prévia à câmara municipal. A reconstrução sem alteração de estrutura, fachada ou número de pisos segue regime simplificado.",
    "currentValueTemplate": "{licensing.operationType}",
    "requiredValue": "Comunicação prévia obrigatória para reconstrução sem alteração",
    "enabled": true,
    "tags": [
      "comunicação_prévia",
      "reconstrução",
      "simplificado"
    ]
  },
  {
    "id": "RJUE-LIC-02",
    "regulationId": "dl-555-99-rjue",
    "article": "Art. 4.º, n.º 2, al. b) — Licenciamento de Reconstrução com Alteração",
    "description": "As obras de reconstrução com alteração de fachada, cércea ou número de pisos estão sujeitas a licenciamento.",
    "severity": "critical",
    "conditions": [
      {
        "field": "licensing.operationType",
        "operator": "==",
        "value": "reconstrucao"
      },
      {
        "field": "licensing.altersFacadeOrHeight",
        "operator": "==",
        "value": true
      },
      {
        "field": "licensing.hasConstructionLicense",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Submeter pedido de licenciamento à câmara municipal. A reconstrução com alteração de fachada, cércea ou número de pisos exige licença.",
    "currentValueTemplate": "{licensing.operationType} com alteração de fachada/cércea",
    "requiredValue": "Licenciamento obrigatório para reconstrução com alteração",
    "enabled": true,
    "tags": [
      "licenciamento",
      "reconstrução",
      "fachada",
      "cércea"
    ]
  },
  {
    "id": "RJUE-LIC-03",
    "regulationId": "dl-555-99-rjue",
    "article": "Art. 4.º, n.º 2, al. c) — Licenciamento de Ampliação",
    "description": "As obras de ampliação estão sujeitas a licenciamento municipal obrigatório.",
    "severity": "critical",
    "conditions": [
      {
        "field": "licensing.operationType",
        "operator": "==",
        "value": "ampliacao"
      },
      {
        "field": "licensing.hasConstructionLicense",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Submeter pedido de licenciamento à câmara municipal. A ampliação de edifícios existentes requer licença de construção.",
    "currentValueTemplate": "{licensing.operationType}",
    "requiredValue": "Licenciamento obrigatório para ampliação",
    "enabled": true,
    "tags": [
      "licenciamento",
      "ampliação",
      "obrigatório"
    ]
  },
  {
    "id": "RJUE-LIC-04",
    "regulationId": "dl-555-99-rjue",
    "article": "Art. 4.º, n.º 2, al. e) — Licenciamento de Demolição",
    "description": "As obras de demolição que não estejam integradas em obra nova licenciada estão sujeitas a licenciamento autónomo.",
    "severity": "critical",
    "conditions": [
      {
        "field": "licensing.operationType",
        "operator": "==",
        "value": "demolicao"
      },
      {
        "field": "licensing.hasDemolitionLicense",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Submeter pedido de licenciamento de demolição à câmara municipal. A demolição integrada em obra nova pode ser abrangida pelo mesmo alvará.",
    "currentValueTemplate": "{licensing.operationType}",
    "requiredValue": "Licenciamento obrigatório para demolição autónoma",
    "enabled": true,
    "tags": [
      "licenciamento",
      "demolição",
      "obrigatório"
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

- [ ] Cada regra tem ID único no formato `LICENSING-NNN`
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