# 💧 Águas e Esgotos - Regulamentos

## Estrutura

```
plumbing/
├── rgsppdadar/              # Decreto Regulamentar 23/95
│   ├── README.md
│   ├── metadata.json
│   ├── rules.json           # ~100 regras
│   └── tables/              # Tabelas normativas
│       ├── diametros-minimos.json
│       ├── declives-minimos.json
│       └── caudais-calculo.json
│
└── np-en-806/               # Normas europeias (futuro)
    └── ...
```

## Status

- [x] Estrutura criada
- [ ] RGSPPDADAR investigado
- [ ] Regras extraídas
- [ ] Engine implementado
- [ ] Testes criados

## Próximos Passos

1. Executar prompt de investigação
2. Extrair ~100 regras do RGSPPDADAR
3. Criar metadata.json e rules.json
4. Implementar PlumbingEngine
5. Testes E2E
