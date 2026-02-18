# Extração de Regras — Estabilidade e Segurança Estrutural (Eurocódigos)

Analisa o texto regulamentar da especialidade **Estabilidade e Segurança Estrutural (Eurocódigos)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "STRUCTURAL-NNN",
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

- **id**: Formato `STRUCTURAL-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Estabilidade e Segurança Estrutural (Eurocódigos)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais
  - `structural.hasStructuralProject` (boolean) — Indica se existe projeto de estabilidade aprovado, obrigatório para obras sujeitas a licenciamento
  - `structural.hasULSVerification` (boolean) — Indica se foi efetuada verificação aos estados limites últimos conforme EN 1990
  - `structural.designLife` (number, anos) — Vida útil de projeto da estrutura conforme EN 1990 Quadro 2.1 (50 anos para edifícios correntes)
  - `structural.buildingCategory` ("A" | "B" | "C" | "D" | "E") — Categoria de utilização conforme EN 1991-1-1 Quadro 6.1, determina as sobrecargas aplicáveis
  - `structural.structuralSystem` ("frame" | "wall" | "dual" | "mixed") — Tipologia do sistema estrutural resistente, influencia o fator de comportamento sísmico
  - `structural.hasGeotechnicalStudy` (boolean) — Indica se foi realizado estudo geotécnico do terreno de fundação conforme EN 1997
  - `structural.importanceFactor` (number) — Coeficiente de importância da estrutura conforme EN 1998-1 (1.0 para edifícios correntes, 1.2 para escolas/hospitais)
  - `structural.hasSeismicDesign` (boolean) — Indica se a estrutura requer dimensionamento à ação sísmica conforme EN 1998 e Anexo Nacional

  ### Materiais
  - `structural.concreteClass` ("C20/25" | "C25/30" | "C30/37" | "C35/45" | "C40/50" | "C45/55" | "C50/60") — Classe de resistência à compressão do betão conforme NP EN 206 e EN 1992-1-1
  - `structural.steelGrade` ("A400NR" | "A500NR" | "A500ER") — Classe do aço para armaduras ordinárias conforme NP EN 1992-1-1 e especificações LNEC
  - `structural.concreteDensity` (number, kN/m³) — Peso volúmico do betão armado para cálculo do peso próprio conforme EN 1991-1-1
  - `structural.steelDensity` (number, kN/m³) — Peso volúmico do aço estrutural para cálculo do peso próprio conforme EN 1991-1-1
  - `structural.exposureClass` ("XC1" | "XC2" | "XC3" | "XC4" | "XS1" | "XS2" | "XS3") — Classe de exposição ambiental do betão conforme NP EN 206 Quadro 1, determina o recobrimento mínimo

  ### Ações e Cargas
  - `structural.liveLoad` (number, kN/m²) — Sobrecarga de utilização conforme EN 1991-1-1 Quadro 6.2 para a categoria de utilização
  - `structural.roofLiveLoad` (number, kN/m²) — Sobrecarga de utilização na cobertura (categoria H) conforme EN 1991-1-1
  - `structural.gammaG` (number) — Coeficiente parcial de segurança para ações permanentes conforme EN 1990 Quadro A1.2(B)
  - `structural.gammaQ` (number) — Coeficiente parcial de segurança para ações variáveis conforme EN 1990 Quadro A1.2(B)
  - `structural.psi0` (number) — Coeficiente de combinação para ações variáveis conforme EN 1990 Quadro A1.1

  ### Ação Sísmica
  - `structural.seismicZone` ("1.1" | "1.2" | "1.3" | "1.4" | "1.5" | "1.6" | "2.1" | "2.2" | "2.3" | "2.4" | "2.5") — Zona sísmica conforme EN 1998-1 Anexo Nacional NA.I (tipo 1 e tipo 2 para Portugal)
  - `structural.soilType` ("A" | "B" | "C" | "D" | "E") — Tipo de terreno de fundação conforme EN 1998-1 Quadro 3.1 para determinação do espetro de resposta
  - `structural.ductilityClass` ("DCL" | "DCM" | "DCH") — Classe de ductilidade da estrutura conforme EN 1998-1 Secção 5.2, influencia o dimensionamento sísmico
  - `structural.behaviourFactor` (number) — Fator de comportamento sísmico conforme EN 1998-1 Quadro 5.1, depende do sistema estrutural e classe de ductilidade
  - `structural.interstoreyDrift` (number, mm) — Deslocamento relativo entre pisos (drift) para verificação de limitação de danos conforme EN 1998-1 Secção 4.4.3

  ### Ação do Vento
  - `structural.windZone` ("A" | "B") — Zona de vento conforme EN 1991-1-4 Anexo Nacional para Portugal
  - `structural.windSpeed` (number, m/s) — Valor de referência da velocidade do vento conforme EN 1991-1-4 Anexo Nacional
  - `structural.terrainCategory` ("0" | "I" | "II" | "III" | "IV") — Categoria de rugosidade do terreno conforme EN 1991-1-4 Quadro 4.1
  - `structural.altitude` (number, m) — Altitude do local de implantação para correção da pressão do vento e ação da neve

  ### Ação da Neve
  - `structural.snowZone` ("Z1" | "Z2" | "Z3") — Zona de neve conforme EN 1991-1-3 Anexo Nacional para Portugal continental
  - `structural.snowLoad` (number, kN/m²) — Valor característico da carga de neve ao nível do solo conforme EN 1991-1-3 Anexo Nacional

  ### Betão Armado
  - `structural.coverDepth` (number, mm) — Recobrimento nominal das armaduras conforme EN 1992-1-1 Secção 4.4, depende da classe de exposição
  - `structural.crackWidth` (number, mm) — Valor máximo admissível da abertura de fendas conforme EN 1992-1-1 Quadro 7.1N
  - `structural.maxDeflection` (number, mm) — Valor máximo de flecha permitido (tipicamente L/250 para aspeto e L/500 para danos) conforme EN 1992-1-1
  - `structural.columnReinfRatio` (number) — Taxa geométrica de armadura longitudinal em pilares (mín. 1% conforme EN 1992-1-1 Secção 9.5.2)
  - `structural.columnBarDiameter` (number, mm) — Diâmetro dos varões longitudinais em pilares (mín. 12 mm conforme EN 1992-1-1)
  - `structural.beamBarDiameter` (number, mm) — Diâmetro dos varões longitudinais em vigas
  - `structural.stirrupDiameter` (number, mm) — Diâmetro dos estribos (mín. 6 mm conforme EN 1992-1-1)
  - `structural.stirrupSpacing` (number, mm) — Espaçamento máximo entre estribos conforme EN 1992-1-1 e EN 1998-1 para zonas críticas
  - `structural.anchorageLength` (number, mm) — Comprimento de amarração de cálculo conforme EN 1992-1-1 Secção 8.4

  ### Estrutura Metálica
  - `structural.sectionClass` ("1" | "2" | "3" | "4") — Classe da secção transversal metálica conforme EN 1993-1-1 Quadro 5.2
  - `structural.fireResistance` ("R30" | "R60" | "R90" | "R120") — Resistência ao fogo requerida para elementos estruturais conforme EN 1993-1-2 e SCIE

  ### Fundações e Geotecnia
  - `structural.foundationType` ("shallow" | "deep" | "piles") — Tipo de fundação adotado conforme EN 1997-1 e estudo geotécnico
  - `structural.geotechnicalCategory` ("1" | "2" | "3") — Categoria geotécnica conforme EN 1997-1 Secção 2.1, define o nível de investigação necessário
  - `structural.soilBearingCapacity` (number, kPa) — Tensão admissível do terreno de fundação obtida do estudo geotécnico
  - `structural.expectedSettlement` (number, mm) — Assentamento total previsto da fundação conforme EN 1997-1 (máx. 25 mm para estruturas correntes)
  - `structural.foundationSafetyFactor` (number) — Fator de segurança global para a capacidade de carga da fundação conforme EN 1997-1

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

  - `soil_amplification_factor` — Fator de amplificação sísmica S por tipo de solo — EC8 NA Quadro NA.3.2 (keys: `structural.soilType`)
  - `importance_factor` — Fator de importância γI por classe — EC8 Quadro 4.3 (keys: `structural.importanceClass`)

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

## Estado Atual — Estabilidade e Segurança Estrutural (Eurocódigos)

Regulamentos registados nesta especialidade:

  - **NP EN 1990 (EC0)** — Eurocódigo 0 — Bases para o Projeto de Estruturas [verified, 1 rules]
  - **NP EN 1991-1 (EC1)** — Eurocódigo 1 — Ações em Estruturas [verified, 7 rules]
  - **NP EN 1992-1 (EC2)** — Eurocódigo 2 — Projeto de Estruturas de Betão [verified, 4 rules]
  - **NP EN 1993-1 (EC3)** — Eurocódigo 3 — Projeto de Estruturas de Aço [verified, 1 rules]
  - **NP EN 1997-1 (EC7)** — Eurocódigo 7 — Projeto Geotécnico [verified, 4 rules]
  - **NP EN 1998-1 (EC8)** — Eurocódigo 8 — Projeto de Estruturas para Resistência aos Sismos [verified, 6 rules]
  - **NP EN 1998-3 (EC8-3)** — Eurocódigo 8 Parte 3 — Avaliação e Reforço de Edifícios [verified, 1 rules]
  - **Eurocódigos (Anexos Nacionais)** — Eurocódigos — Anexos Nacionais Portugueses (conjunto) [verified, 1 rules]

Total: 85 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "EC-PROJ-01",
    "regulationId": "eurocodes-na",
    "article": "Projeto de Estabilidade",
    "description": "O projeto de estabilidade (estruturas) é obrigatório para todos os edifícios novos. Deve ser elaborado por engenheiro civil inscrito na Ordem dos Engenheiros.",
    "severity": "critical",
    "conditions": [
      {
        "field": "structural.hasStructuralProject",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Contratar engenheiro civil para elaborar projeto de estabilidade conforme Eurocódigos. O projeto deve incluir: memória descritiva, cálculos de dimensionamento, peças desenhadas (plantas de fundações, armaduras, pormenores construtivos).",
    "requiredValue": "Projeto de estabilidade obrigatório",
    "enabled": true,
    "tags": [
      "projeto",
      "obrigatório",
      "engenheiro civil"
    ]
  },
  {
    "id": "STRUCT-EC0-04",
    "regulationId": "eurocodes-na",
    "article": "EC0 / NP EN 1990 Quadro NA.A1.1 — Coeficientes ψ Habitação",
    "description": "Os coeficientes de combinação ψ para sobrecargas de habitação (Cat. A) devem ser: ψ0=0.7, ψ1=0.5, ψ2=0.3, conforme Quadro NA.A1.1 do Anexo Nacional.",
    "severity": "warning",
    "conditions": [
      {
        "field": "structural.psi0",
        "operator": "!=",
        "value": 0.7
      },
      {
        "field": "buildingType",
        "operator": "==",
        "value": "residential"
      }
    ],
    "remediation": "Adotar os coeficientes de combinação ψ para habitação (Cat. A) conforme Quadro NA.A1.1 do NP EN 1990: ψ0=0.7 (combinação), ψ1=0.5 (frequente), ψ2=0.3 (quase-permanente). Estes coeficientes são utilizados nas combinações ELU e ELS para definir os valores representativos das ações variáveis.",
    "currentValueTemplate": "ψ0 = {structural.psi0}",
    "requiredValue": "ψ0=0.7, ψ1=0.5, ψ2=0.3 (Cat. A — Habitação)",
    "enabled": true,
    "tags": [
      "coeficientes psi",
      "combinações",
      "habitação",
      "EC0"
    ]
  },
  {
    "id": "STRUCT-EC0-01",
    "regulationId": "eurocodes-na",
    "article": "EC0 / NP EN 1990 — Combinações de Ações",
    "description": "O projeto estrutural deve incluir verificação aos Estados Limites Últimos (ELU) e Estados Limites de Serviço (ELS) conforme NP EN 1990. As combinações de ações devem seguir as expressões 6.10a/6.10b do Anexo Nacional.",
    "severity": "critical",
    "conditions": [
      {
        "field": "structural.hasULSVerification",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Incluir no projeto de estabilidade a verificação explícita dos ELU (resistência, estabilidade, fadiga) e ELS (deformação, fendilhação, vibração) conforme NP EN 1990. Utilizar os coeficientes parciais de segurança γG=1.35 e γQ=1.50 do Anexo Nacional para combinações fundamentais.",
    "requiredValue": "Verificação ELU e ELS obrigatória",
    "enabled": true,
    "tags": [
      "combinações",
      "ELU",
      "ELS",
      "EC0",
      "coeficientes parciais"
    ]
  },
  {
    "id": "STRUCT-EC0-02",
    "regulationId": "eurocodes-na",
    "article": "EC0 / NP EN 1990 Quadro NA.A1.2(B) — Coeficiente Parcial Ações Permanentes",
    "description": "O coeficiente parcial de segurança para ações permanentes desfavoráveis adotado ({structural.gammaG}) é inferior ao valor regulamentar γG=1.35 do Anexo Nacional para combinações ELU fundamentais.",
    "severity": "critical",
    "conditions": [
      {
        "field": "structural.gammaG",
        "operator": "<",
        "value": 1.35
      }
    ],
    "remediation": "Adotar o coeficiente parcial de segurança γG=1.35 para ações permanentes desfavoráveis nas combinações ELU fundamentais, conforme Quadro NA.A1.2(B) do NP EN 1990. Para ações permanentes favoráveis, γG=1.00. Para combinações acidentais, γG=1.00.",
    "currentValueTemplate": "γG = {structural.gammaG}",
    "requiredValue": "γG = 1.35 (desfavorável) / γG = 1.00 (favorável)",
    "enabled": true,
    "tags": [
      "coeficientes parciais",
      "ações permanentes",
      "EC0",
      "ELU"
    ]
  },
  {
    "id": "STRUCT-EC0-03",
    "regulationId": "eurocodes-na",
    "article": "EC0 / NP EN 1990 Quadro NA.A1.2(B) — Coeficiente Parcial Ações Variáveis",
    "description": "O coeficiente parcial de segurança para ações variáveis desfavoráveis adotado ({structural.gammaQ}) é inferior ao valor regulamentar γQ=1.50 do Anexo Nacional para combinações ELU fundamentais.",
    "severity": "critical",
    "conditions": [
      {
        "field": "structural.gammaQ",
        "operator": "<",
        "value": 1.5
      }
    ],
    "remediation": "Adotar o coeficiente parcial de segurança γQ=1.50 para ações variáveis desfavoráveis nas combinações ELU fundamentais, conforme Quadro NA.A1.2(B) do NP EN 1990. Para ações variáveis favoráveis, γQ=0. As expressões de combinação fundamental são: Ed = Σ(γG,j·Gk,j) + γQ,1·Qk,1 + Σ(γQ,i·ψ0,i·Qk,i).",
    "currentValueTemplate": "γQ = {structural.gammaQ}",
    "requiredValue": "γQ = 1.50 (desfavorável) / γQ = 0 (favorável)",
    "enabled": true,
    "tags": [
      "coeficientes parciais",
      "ações variáveis",
      "EC0",
      "ELU"
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

- [ ] Cada regra tem ID único no formato `STRUCTURAL-NNN`
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