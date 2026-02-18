# Extração de Regras — Instalações Eléctricas (BT / MT)

Analisa o texto regulamentar da especialidade **Instalações Eléctricas (BT / MT)** e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.

## Schema da Regra

```json
{
  "id": "ELECTRICAL-NNN",
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

- **id**: Formato `ELECTRICAL-NNN` com numeração sequencial (001, 002, ...).
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

## Campos Disponíveis — Instalações Eléctricas (BT / MT)

Estes são os campos que as condições das regras podem referenciar:


  ### Dados Gerais da Instalação
  - `electrical.compliance` (boolean) — Indica se a instalação elétrica cumpre os requisitos regulamentares (campo de portão para validação RTIEBT)
  - `electrical.supplyType` ("single_phase" | "three_phase") — Tipo de alimentação elétrica da instalação (monofásica 230 V ou trifásica 400 V)
  - `electrical.contractedPower` (number, kVA) — Potência contratada junto do operador da rede de distribuição
  - `electrical.installedPower` (number, kW) — Potência total instalada na instalação elétrica
  - `electrical.designPower` (number, kW) — Potência utilizada para dimensionamento da instalação, com aplicação de fatores de simultaneidade
  - `electrical.max_AC_V` (number, V) — Tensão máxima em corrente alternada da instalação
  - `electrical.numberOfCircuits` (number) — Número total de circuitos da instalação elétrica
  - `electrical.value` (number) — Campo numérico genérico utilizado em diversas verificações regulamentares RTIEBT
  - `electrical.factor` (number) — Fator multiplicativo aplicável (simultaneidade, correção de temperatura, agrupamento, etc.)
  - `electrical.mandatory` (boolean) — Indica se o requisito regulamentar é de cumprimento obrigatório

  ### Proteção e Segurança
  - `electrical.hasMainCircuitBreaker` (boolean) — Indica se existe disjuntor geral de entrada na instalação
  - `electrical.hasResidualCurrentDevice` (boolean) — Indica se a instalação possui proteção diferencial conforme RTIEBT
  - `electrical.rcdSensitivity` (number, mA) — Corrente diferencial-residual estipulada de funcionamento (IΔn) — 30 mA para proteção de pessoas
  - `electrical.disconnectionTime` (number, s) — Tempo máximo de corte automático da alimentação em caso de defeito (0,4 s para circuitos terminais TN)
  - `electrical.hasSurgeProtection` (boolean) — Indica se existe descarregador de sobretensões transitórias (tipo 2) na origem da instalação
  - `electrical.hasEarthingSystem` (boolean) — Indica se a instalação possui sistema de ligação à terra conforme RTIEBT
  - `electrical.earthingScheme` ("TT" | "TN-S" | "TN-C" | "TN-C-S" | "IT") — Esquema de ligação à terra da instalação conforme RTIEBT Secção 312
  - `electrical.earthingResistance` (number, Ω) — Valor da resistência do elétrodo de terra — deve cumprir RA × IΔn ≤ 50 V
  - `electrical.hasEquipotentialBonding` (boolean) — Indica se existe ligação equipotencial principal conforme RTIEBT Secção 413

  ### Dimensionamento de Condutores
  - `electrical.conductorSection` (number, mm²) — Secção transversal do condutor de fase
  - `electrical.min_section_mm2` (number, mm²) — Secção mínima dos condutores conforme RTIEBT (1,5 mm² iluminação, 2,5 mm² tomadas)
  - `electrical.neutralSection` (number, mm²) — Secção transversal do condutor neutro — igual à fase até 16 mm² (Cu)
  - `electrical.voltageDrop` (number, %) — Queda de tensão máxima admissível nos circuitos de força motriz — 5% conforme RTIEBT
  - `electrical.voltageDropLighting` (number, %) — Queda de tensão máxima admissível nos circuitos de iluminação — 3% conforme RTIEBT

  ### Quadros Elétricos
  - `electrical.distancia_max_m` (number, m) — Distância máxima entre o ponto de utilização e o quadro elétrico de distribuição
  - `electrical.impasse_m` (number, m) — Distância máxima em impasse para caminhos de cabos ou canalizações elétricas

  ### Instalações Especiais
  - `electrical.hasBathroomZoneCompliance` (boolean) — Indica se a instalação elétrica na casa de banho cumpre as zonas 0, 1, 2 e 3 conforme RTIEBT Secção 701
  - `electrical.hasEVPreInstallation` (boolean) — Indica se existe infraestrutura de pré-instalação para carregamento de veículos elétricos conforme DL 39/2010

  ### Verificação e Ensaios
  - `electrical.insulationResistance` (number, MΩ) — Valor mínimo de resistência de isolamento da instalação — 1 MΩ para tensão nominal ≤ 500 V

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

  - `correntes_admissíveis___pvc_2_cond.` — Correntes admissiveis (A) em cabos PVC 2 condutores carregados — RTIEBT Quadro 52-C1 (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___xlpe_2_cond.` — Correntes admissiveis (A) em cabos XLPE 2 condutores carregados — RTIEBT Quadro 52-C2 (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___pvc_3_cond.` — Correntes admissiveis (A) em cabos PVC 3 condutores carregados — RTIEBT Quadro 52-C3 (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___xlpe_3_cond.` — Correntes admissiveis (A) em cabos XLPE 3 condutores carregados — RTIEBT Quadro 52-C4 (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___enterradas` — Correntes admissiveis (A) em cabos enterrados directamente — RTIEBT Quadro 52-C30 (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___pvc_cu_métodos_e` — Correntes admissiveis (A) PVC/Cu metodos E/F/G — RTIEBT (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___pvc_al_métodos_e` — Correntes admissiveis (A) PVC/Al metodos E/F/G — RTIEBT (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___xlpe_cu_métodos_e` — Correntes admissiveis (A) XLPE/Cu metodos E/F/G — RTIEBT (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___xlpe_al_métodos_` — Correntes admissiveis (A) XLPE/Al metodos E/F/G — RTIEBT (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___pvc_métodos_a2/b` — Correntes admissiveis (A) PVC metodos A2/B2 — RTIEBT (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___xlpe_métodos_a2/` — Correntes admissiveis (A) XLPE metodos A2/B2 — RTIEBT (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___mineral_70°c_mét` — Correntes admissiveis (A) cabo mineral 70C metodos E/F/G — RTIEBT (keys: `electrical.seccao_mm2`)
  - `correntes_admissíveis___mineral_105°c_mé` — Correntes admissiveis (A) cabo mineral 105C metodos E/F/G — RTIEBT (keys: `electrical.seccao_mm2`)
  - `fatores_correção___temperatura_ambiente_` — Fatores de correcao de temperatura ambiente para cabos ao ar — RTIEBT Quadro 52-D1 (keys: `electrical.temperaturaAmbiente`)
  - `fatores_correção___temperatura_solo` — Fatores de correcao de temperatura do solo para cabos enterrados — RTIEBT Quadro 52-D2 (keys: `electrical.temperaturaSolo`)
  - `fatores_correção___agrupamento_ao_ar` — Fatores de correcao de agrupamento para cabos ao ar (camada unica) — RTIEBT Quadro 52-E1 (keys: `electrical.nCircuitosAgrupados`)
  - `fatores_correção___agrupamento_enterrado` — Fatores de correcao de agrupamento para cabos enterrados — RTIEBT Quadro 52-E3 (keys: `electrical.nCircuitosEnterrados`)
  - `fatores_correção___resistividade_solo` — Fatores de correcao de resistividade do solo — RTIEBT Quadro 52-D3 (keys: `electrical.resistividadeSolo`)
  - `secções_mínimas_condutores` — Seccoes minimas (mm2) de condutores por tipo de circuito — RTIEBT Quadro 52-A1 (keys: `electrical.tipoCircuito`)
  - `secções_mínimas___habitação` — Seccoes minimas (mm2) por tipo de circuito em habitacoes — RTIEBT Seccao 803.2 (keys: `electrical.tipoCircuitoHabitacao`)
  - `tempos_corte___tt` — Tempos de corte maximos (s) para sistemas TT — RTIEBT Quadro 41B (keys: `electrical.tensaoNominal`)
  - `tempos_corte___tn` — Tempos de corte maximos (s) para sistemas TN — RTIEBT Quadro 41A (keys: `electrical.tensaoNominal`)
  - `fatores_simultaneidade_colunas` — Fatores de simultaneidade para colunas montantes — RTIEBT Quadro 803A (keys: `electrical.nInstalacoes`)
  - `potência_mínima_habitações` — Potencia minima (kVA) por tipo de alimentacao em habitacoes — RTIEBT 803.2.4.3.1 (keys: `electrical.tipoAlimentacao`)
  - `tensão_suportável_ao_choque` — Tensao suportavel ao choque (kV) por categoria de sobretensao — RTIEBT Quadro 44A (keys: `electrical.categoriaSobretensao`)
  - `temperaturas_máximas_isolamentos` — Temperatura maxima (C) de servico por tipo de isolamento — RTIEBT (keys: `electrical.tipoIsolamento`)
  - `temperatura_correção___mineral` — Fatores de correcao de temperatura para cabos com isolamento mineral — RTIEBT (keys: `electrical.temperaturaAmbiente`)
  - `secção_pe___tabela_simplificada` — Seccao minima (mm2) do condutor de proteccao por seccao de fase — RTIEBT Tab. 54F (keys: `electrical.seccaoFase`)
  - `resistência_terra_vs_dr` — Resistencia maxima de terra (ohm) por sensibilidade do diferencial — RTIEBT (keys: `electrical.sensibilidadeDR`)
  - `resistência_ao_fogo_elementos_estruturai` — Resistencia ao fogo minima (min) de elementos estruturais por UT e categoria — RT-SCIE (keys: `fireSafety.riskCategory`)
  - `valores_k___pe_em_cabo_multicondutor` — Valores K para calculo da seccao PE em cabo multicondutor — RTIEBT Tab. 54C (keys: `electrical.tipoIsolamento`)
  - `valores_k___pe_isolados_não_em_cabo` — Valores K para PE isolados nao incorporados em cabo — RTIEBT Tab. 54D (keys: `electrical.tipoIsolamento`)
  - `valores_k___pe_nu_em_contacto_cabo` — Valores K para PE nu em contacto com revestimento do cabo — RTIEBT Tab. 54E (keys: `electrical.tipoIsolamento`)
  - `valores_k___armaduras/bainhas` — Valores K para armaduras e bainhas metalicas de cabos — RTIEBT Tab. 54F (keys: `electrical.tipoArmadura`)
  - `ensaio_isolamento___tensão` — Tensao de ensaio de isolamento (V) por tensao nominal do circuito — RTIEBT (keys: `electrical.tensaoNominal`)
  - `ik_mínimo_por_localização` — Grau de protecao IK minimo por localizacao — RTIEBT (keys: `electrical.localizacaoEquipamento`)
  - `coeficiente_forma_condutores` — Coeficientes de forma para seccao de condutores — RTIEBT (keys: `electrical.formaCondutor`)
  - `dimensões_ductos` — Dimensoes minimas (m) de ductos por numero de habitacoes — RTIEBT 803.2.4.6 (keys: `electrical.nHabitacoesDucto`)
  - `quadro_803a___simultaneidade_detalhada` — Fatores de simultaneidade detalhados para calculo de potencia — RTIEBT Quadro 803A (keys: `electrical.nInstalacoes`)
  - `pressão_dinâmica_vento` — Pressao dinamica do vento (Pa) por zona e rugosidade — RSA/Eurocodigo 1 (keys: `electrical.zonaVento`)
  - `casas_de_banho___ip_por_volume` — Grau de protecao IP minimo por volume em casas de banho — RTIEBT 701 (keys: `electrical.volumeCasaBanho`)
  - `casas_de_banho___aparelhagem_proibida` — Aparelhagem proibida por volume em casas de banho (1=proibido, 0=permitido) — RTIEBT 701 (keys: `electrical.volumeCasaBanho`)
  - `piscinas___ip_por_volume` — Grau de protecao IP minimo por volume em piscinas — RTIEBT 702 (keys: `electrical.volumePiscina`)
  - `configuração_alarme_ut_i` — Configuracao minima de alarme para UT I (habitacionais) por categoria — RT-SCIE (keys: `fireSafety.riskCategory`)
  - `compartimentação_entre_uts_distintas` — Resistencia ao fogo (min) entre UTs distintas — RT-SCIE (keys: `fireSafety.riskCategory`)
  - `distância_evacuação_ut_xii_industrial` — Distancia maxima de evacuacao (m) para UT XII industrial — RT-SCIE (keys: `fireSafety.riskCategory`)
  - `efectivo___índices_de_ocupação` — Indices de ocupacao (pessoas/m2) por tipo de utilizacao — RT-SCIE (keys: `fireSafety.tipoUtilizacao`)
  - `agrupamento___múltiplas_camadas` — Fatores de reducao para multiplas camadas de cabos — RTIEBT (keys: `electrical.nCamadas`)
  - `dimensões_passagens_eletricas` — Dimensoes minimas (largura em m) de passagens electricas — RTIEBT (keys: `electrical.tipoPassagem`)

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

## Estado Atual — Instalações Eléctricas (BT / MT)

Regulamentos registados nesta especialidade:

  - **Portaria 949-A/2006** — Aprova as Regras Técnicas das Instalações Eléctricas de Baixa Tensão (RTIEBT) [verified, 33 rules]
  - **Portaria 252/2015** — Actualiza as RTIEBT — inclui Secção 722 (Infraestruturas para Veículos Eléctricos) [PENDING, 0 rules]
  - **DL 226/2005** — Enquadramento da aprovação das RTIEBT [PENDING, 0 rules]
  - **DL 96/2017** — Regime das Instalações Eléctricas de Serviço Particular [PENDING, 0 rules]
  - **Lei 14/2015** — Regime de qualificação de técnicos e entidades para instalações eléctricas [PENDING, 0 rules]
  - **DL 517/80** — Normas a observar na elaboração de projectos de instalações eléctricas [PENDING, 0 rules]
  - **Decreto 42895/1960** — Regulamento de Segurança de Subestações e Postos de Transformação e Seccionamento [PENDING, 0 rules]
  - **DR 90/84** — Regulamento de Redes de Distribuição de Energia Eléctrica em Baixa Tensão [PENDING, 0 rules]
  - **DR 1/92** — Regulamento de Segurança de Linhas Eléctricas de Alta Tensão [PENDING, 0 rules]
  - **DL 220/2008** — Regime Jurídico de Segurança Contra Incêndio em Edifícios (SCIE) [PENDING, 0 rules]
  - **Portaria 1532/2008** — Regulamento Técnico de Segurança Contra Incêndio em Edifícios (RT-SCIE) [PENDING, 0 rules]
  - **Portaria 135/2020** — Alteração e republicação do RT-SCIE [PENDING, 0 rules]
  - **DL 21/2017** — Directiva Baixa Tensão (LVD) — Marca CE [PENDING, 0 rules]
  - **DL 31/2017** — Compatibilidade Electromagnética (EMC) [PENDING, 0 rules]
  - **DL 103/2008** — Directiva Máquinas [PENDING, 0 rules]
  - **DL 111-C/2017** — Equipamentos para Atmosferas Explosivas (ATEX) [PENDING, 0 rules]
  - **E-REDES Manual de Ligações** — Manual de Ligações à Rede (11.ª Edição, Dez 2025) [PENDING, 0 rules]
  - **ERSE RARI** — Regulamento do Acesso às Redes e às Interligações [PENDING, 0 rules]
  - **ERSE Reg. 816/2023** — Regulamento de Operação das Redes [PENDING, 0 rules]
  - **IEC 60364** — Low-voltage electrical installations [PENDING, 0 rules]
  - **IEC 61439** — Low-voltage switchgear and controlgear assemblies [PENDING, 0 rules]
  - **IEC 60947-2** — Low-voltage switchgear — Circuit-breakers [PENDING, 0 rules]
  - **IEC 62271-200** — AC metal-enclosed switchgear and controlgear for rated voltages above 1 kV [PENDING, 0 rules]
  - **IEC 61936-1** — Power installations exceeding 1 kV AC [PENDING, 0 rules]
  - **RSRDEEBT (DL 740/74)** — Regulamento de Segurança das Redes de Distribuição de Energia Elétrica em Baixa Tensão — DL 740/74 [complete, 2 rules]

Total: 380 regras existentes.

## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

```json
[
  {
    "id": "RTIEBT-311-01",
    "regulationId": "portaria-949a-2006",
    "article": "Secção 311 - Alimentação",
    "description": "A potência contratada ({electrical.contractedPower} kVA) excede o limite para alimentação monofásica (13.8 kVA). É obrigatória alimentação trifásica.",
    "severity": "critical",
    "conditions": [
      {
        "field": "electrical.contractedPower",
        "operator": ">",
        "value": 13.8
      },
      {
        "field": "electrical.supplyType",
        "operator": "==",
        "value": "single_phase"
      }
    ],
    "remediation": "Alterar o tipo de alimentação para trifásica ou reduzir a potência contratada para valor inferior a 13.8 kVA.",
    "currentValueTemplate": "{electrical.contractedPower} kVA (monofásico)",
    "requiredValue": "Trifásico acima de 13.8 kVA",
    "enabled": true,
    "tags": [
      "alimentação",
      "potência",
      "trifásico"
    ]
  },
  {
    "id": "RTIEBT-ING-002",
    "regulationId": "portaria-949a-2006",
    "article": "RTIEBT Quadro 52-C1",
    "description": "Correntes admissíveis (A) - PVC, 2 condutores carregados, T_condutor=70°C, T_amb=30°C",
    "severity": "critical",
    "conditions": [
      {
        "field": "electrical.correntes_admissíveis___pvc_2_cond.",
        "operator": "lookup_lt",
        "value": null,
        "table": "correntes_admissíveis___pvc_2_cond."
      }
    ],
    "remediation": "Corrente de serviço excede corrente admissível do Quadro 52-C1",
    "requiredValue": "Consultar tabela: RTIEBT Quadro 52-C1",
    "enabled": true,
    "tags": [
      "Instalações Elétrica",
      "Correntes admissíveis - P"
    ]
  },
  {
    "id": "RTIEBT-531-01",
    "regulationId": "portaria-949a-2006",
    "article": "Secção 531.2 - Protecção Diferencial",
    "description": "O projecto não prevê dispositivo diferencial (RCD). A protecção diferencial é obrigatória em todas as instalações eléctricas de baixa tensão.",
    "severity": "critical",
    "conditions": [
      {
        "field": "electrical.hasResidualCurrentDevice",
        "operator": "not_exists",
        "value": null
      }
    ],
    "remediation": "Instalar dispositivo de protecção diferencial (RCD) no quadro eléctrico. Para circuitos de tomadas e zonas húmidas: sensibilidade ≤ 30 mA.",
    "requiredValue": "Protecção diferencial obrigatória",
    "enabled": true,
    "tags": [
      "protecção",
      "diferencial",
      "RCD"
    ]
  },
  {
    "id": "RTIEBT-542-02",
    "regulationId": "portaria-949a-2006",
    "article": "Secção 542 - Resistência de Terra",
    "description": "A resistência do eléctrodo de terra ({electrical.earthingResistance} Ω) é superior ao valor recomendado de 20 Ω.",
    "severity": "warning",
    "conditions": [
      {
        "field": "electrical.hasEarthingSystem",
        "operator": "exists",
        "value": null
      },
      {
        "field": "electrical.earthingResistance",
        "operator": ">",
        "value": 20
      }
    ],
    "remediation": "Melhorar o eléctrodo de terra para obter resistência ≤ 20 Ω.",
    "currentValueTemplate": "{electrical.earthingResistance} Ω",
    "requiredValue": "≤ 20 Ω (recomendado)",
    "enabled": true,
    "tags": [
      "terra",
      "resistência"
    ]
  },
  {
    "id": "RTIEBT-531-02",
    "regulationId": "portaria-949a-2006",
    "article": "Secção 531.2 - Sensibilidade do Diferencial",
    "description": "A sensibilidade do diferencial ({electrical.rcdSensitivity} mA) é insuficiente para circuitos de tomadas e zonas húmidas. É obrigatória protecção com sensibilidade ≤ 30 mA.",
    "severity": "critical",
    "conditions": [
      {
        "field": "electrical.hasResidualCurrentDevice",
        "operator": "exists",
        "value": null
      },
      {
        "field": "electrical.rcdSensitivity",
        "operator": ">",
        "value": 30
      }
    ],
    "remediation": "Substituir o diferencial por um de alta sensibilidade (30 mA) para circuitos de tomadas e zonas húmidas.",
    "currentValueTemplate": "{electrical.rcdSensitivity} mA",
    "requiredValue": "≤ 30 mA",
    "enabled": true,
    "tags": [
      "protecção",
      "diferencial",
      "sensibilidade"
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

- [ ] Cada regra tem ID único no formato `ELECTRICAL-NNN`
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