# Regulation Extraction Roadmap

Generated: 2026-02-18

## Summary

| Priority | Plugin | Rules | Regs | Pending | Coverage | Lookup Tables | Computed Fields |
|----------|--------|-------|------|---------|----------|---------------|-----------------|
| 250 | **electrical** | 380 | 25 | 23 | 8% | 49 | 0 |
| 20 | **acoustic** | 63 | 3 | 2 | 33% | 3 | 0 |
| 15 | **licensing** | 45 | 4 | 1 | 75% | 0 | 0 |
| 10 | **fire-safety** | 199 | 4 | 1 | 75% | 4 | 1 |
| 5 | **municipal** | 35 | 1 | 0 | 100% | 0 | 0 |
| 0 | **thermal** | 66 | 3 | 0 | 100% | 14 | 1 |
| 0 | **structural** | 85 | 8 | 0 | 100% | 2 | 0 |
| 0 | **water-drainage** | 325 | 1 | 0 | 100% | 25 | 0 |
| 0 | **gas** | 64 | 2 | 0 | 100% | 0 | 0 |
| 0 | **hvac** | 63 | 8 | 0 | 100% | 0 | 0 |
| 0 | **telecommunications** | 79 | 2 | 0 | 100% | 5 | 1 |
| 0 | **accessibility** | 110 | 1 | 0 | 100% | 0 | 1 |
| 0 | **energy** | 63 | 4 | 0 | 100% | 0 | 0 |
| 0 | **elevators** | 61 | 4 | 0 | 100% | 0 | 0 |
| 0 | **waste** | 60 | 2 | 0 | 100% | 0 | 0 |
| 0 | **drawings** | 55 | 12 | 0 | 100% | 0 | 0 |
| 0 | **architecture** | 61 | 4 | 0 | 100% | 0 | 0 |
| 0 | **general** | 150 | 1 | 0 | 100% | 0 | 2 |

## Extraction Order (by priority)

### Phase 1: High Priority (large backlogs)

#### Instalações Eléctricas (BT / MT) (`electrical`)
- Current: 380 rules from 2/25 regulations
- Pending: 23 regulations to extract
- Regulations to process:
  - **Portaria 252/2015** — Actualiza as RTIEBT — inclui Secção 722 (Infraestruturas para Veículos Eléctricos) [public_dre]
  - **DL 226/2005** — Enquadramento da aprovação das RTIEBT [public_dre]
  - **DL 96/2017** — Regime das Instalações Eléctricas de Serviço Particular [public_dre]
  - **Lei 14/2015** — Regime de qualificação de técnicos e entidades para instalações eléctricas [public_dre]
  - **DL 517/80** — Normas a observar na elaboração de projectos de instalações eléctricas [public_dre]
  - **Decreto 42895/1960** — Regulamento de Segurança de Subestações e Postos de Transformação e Seccionamento [public_dre]
  - **DR 90/84** — Regulamento de Redes de Distribuição de Energia Eléctrica em Baixa Tensão [public_dre]
  - **DR 1/92** — Regulamento de Segurança de Linhas Eléctricas de Alta Tensão [public_dre]
  - **DL 220/2008** — Regime Jurídico de Segurança Contra Incêndio em Edifícios (SCIE) [public_dre]
  - **Portaria 1532/2008** — Regulamento Técnico de Segurança Contra Incêndio em Edifícios (RT-SCIE) [public_dre]
  - **Portaria 135/2020** — Alteração e republicação do RT-SCIE [public_dre]
  - **DL 21/2017** — Directiva Baixa Tensão (LVD) — Marca CE [public_dre]
  - **DL 31/2017** — Compatibilidade Electromagnética (EMC) [public_dre]
  - **DL 103/2008** — Directiva Máquinas [public_dre]
  - **DL 111-C/2017** — Equipamentos para Atmosferas Explosivas (ATEX) [public_dre]
  - **E-REDES Manual de Ligações** — Manual de Ligações à Rede (11.ª Edição, Dez 2025) [public_operator]
  - **ERSE RARI** — Regulamento do Acesso às Redes e às Interligações [public_erse]
  - **ERSE Reg. 816/2023** — Regulamento de Operação das Redes [public_erse]
  - **IEC 60364** — Low-voltage electrical installations [proprietary_iec]
  - **IEC 61439** — Low-voltage switchgear and controlgear assemblies [proprietary_iec]
  - **IEC 60947-2** — Low-voltage switchgear — Circuit-breakers [proprietary_iec]
  - **IEC 62271-200** — AC metal-enclosed switchgear and controlgear for rated voltages above 1 kV [proprietary_iec]
  - **IEC 61936-1** — Power installations exceeding 1 kV AC [proprietary_iec]

#### Condicionamento Acústico (RRAE) (`acoustic`)
- Current: 63 rules from 1/3 regulations
- Pending: 2 regulations to extract
- Regulations to process:
  - **DL 129/2002** — Regulamento dos Requisitos Acústicos dos Edifícios (versão original) [public_dre]
  - **DL 9/2007** — Regulamento Geral do Ruído [public_dre]

### Phase 2: Medium Priority (small backlogs or low rule count)

#### Licenciamento Urbanístico (RJUE) (`licensing`)
- Current: 45 rules, 75% coverage
- Pending:
  - **DL 136/2014** — Alteração ao RJUE (13ª alteração ao DL 555/99)

#### Segurança Contra Incêndio em Edifícios (SCIE) (`fire-safety`)
- Current: 199 rules, 75% coverage
- Pending:
  - **Portaria 135/2020** — Alteração e republicação do RT-SCIE

#### Regulamentos Municipais / PDM (`municipal`)
- Current: 35 rules, 100% coverage

### Phase 3: Maintenance (already well-covered)

- **thermal**: 66 rules, 100% coverage — maintenance only
- **structural**: 85 rules, 100% coverage — maintenance only
- **water-drainage**: 325 rules, 100% coverage — maintenance only
- **gas**: 64 rules, 100% coverage — maintenance only
- **hvac**: 63 rules, 100% coverage — maintenance only
- **telecommunications**: 79 rules, 100% coverage — maintenance only
- **accessibility**: 110 rules, 100% coverage — maintenance only
- **energy**: 63 rules, 100% coverage — maintenance only
- **elevators**: 61 rules, 100% coverage — maintenance only
- **waste**: 60 rules, 100% coverage — maintenance only
- **drawings**: 55 rules, 100% coverage — maintenance only
- **architecture**: 61 rules, 100% coverage — maintenance only
- **general**: 150 rules, 100% coverage — maintenance only

## How to Extract Rules

1. Pick a plugin from the priority list above
2. Open the corresponding prompt file: `src/data/extraction-prompts/<plugin-id>.md`
3. Open a new Claude instance (or any LLM)
4. Paste the prompt content
5. Paste the regulation text below the prompt
6. Review the extracted JSON rules
7. Validate: `npx tsx scripts/generate-extraction-prompts.ts --validate <file>`
8. Place the validated rules in: `src/data/plugins/<plugin-id>/regulations/<reg-id>/rules.json`
9. Update the registry.json ingestionStatus to 'complete'
10. Run `npx vitest run` to verify no regressions
