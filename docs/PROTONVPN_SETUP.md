# 🛡️ ProtonVPN Setup para Scraping CYPE

## ✅ Você JÁ TEM ProtonVPN instalado!

**Boas notícias:** Não precisa de API ou CLI! O GUI que já tem funciona perfeitamente.

---

## 🚀 Opção 1: Usar GUI (MAIS SIMPLES)

### Como Usar:

1. **Abrir ProtonVPN** → Ligar a **Portugal** (ou outro país)
2. **Verificar conexão:**
   ```bash
   curl https://api.ipify.org
   # Deve mostrar IP português (não 81.193.85.4)
   ```
3. **Executar scraping:**
   ```bash
   npm run scrape-cype
   # Ou
   npx tsx scripts/scrape-with-breakdown.ts
   ```

### ✅ Pronto! É só isso!

---

## 🔄 Opção 2: Rotação Manual de Países

Para scraping em larga escala, rode entre países:

### 1. **Scrape Isolamentos** → VPN Portugal
```bash
# Ligar ProtonVPN a Portugal
npm run scrape-cype -- --chapters=IOD,IOA --output=data/isolamentos.json
```

### 2. **Scrape Elétrico** → VPN Espanha
```bash
# Mudar ProtonVPN para Espanha
npm run scrape-cype -- --chapters=EEI,IEE --output=data/eletrico.json
```

### 3. **Scrape Fachadas** → VPN França
```bash
# Mudar ProtonVPN para França
npm run scrape-cype -- --chapters=FFO,REV --output=data/fachadas.json
```

---

## 🤖 Opção 3: Automação com WSL (Avançado)

Se quiser CLI automático:

### 1. Instalar WSL
```powershell
# PowerShell como Administrador
wsl --install
# Reiniciar PC
```

### 2. Instalar ProtonVPN CLI no WSL
```bash
# Dentro do WSL (Ubuntu)
sudo apt update
sudo apt install -y openvpn dialog python3-pip
pip3 install protonvpn-cli

# Login
protonvpn-cli login
# Email: seu-email@exemplo.com
# Password: sua-senha
```

### 3. Usar CLI
```bash
# Ligar
protonvpn-cli connect PT

# Verificar
protonvpn-cli status

# Desligar
protonvpn-cli disconnect

# Mudar país
protonvpn-cli connect ES  # Espanha
protonvpn-cli connect FR  # França
```

### 4. Script Automático (WSL)
```bash
#!/bin/bash
# scrape-with-cli.sh

COUNTRIES=("PT" "ES" "FR" "DE")
CHAPTERS=("IOD" "EEI" "FFO" "SAN")

for i in "${!CHAPTERS[@]}"; do
  COUNTRY="${COUNTRIES[$i % ${#COUNTRIES[@]}]}"
  CHAPTER="${CHAPTERS[$i]}"

  echo "🔄 Switching to $COUNTRY..."
  protonvpn-cli disconnect
  sleep 2
  protonvpn-cli connect "$COUNTRY"
  sleep 5

  echo "📥 Scraping $CHAPTER..."
  npm run scrape-cype -- --chapters="$CHAPTER"

  sleep 10
done

protonvpn-cli disconnect
echo "✅ Done!"
```

---

## 📋 Scripts Criados

### 1. **Switch VPN** (`scripts/switch-vpn.ps1`)
```powershell
.\scripts\switch-vpn.ps1 -Country "PT"
```

### 2. **Scrape com Rotação** (`scripts/scrape-with-vpn-rotation.ps1`)
```powershell
.\scripts\scrape-with-vpn-rotation.ps1
```

---

## 🎯 Workflow Recomendado

### Para Desenvolvimento (Local):
```bash
# 1. Ligar ProtonVPN GUI a Portugal
# 2. Executar scraping
npm run scrape-cype

# 3. Se precisar, mudar país manualmente e continuar
```

### Para Produção (GitHub Actions):
- Usar proxies comerciais (Bright Data, Oxylabs)
- Ou VPN headless (Mullvad, Windscribe CLI)
- ProtonVPN CLI não funciona bem em CI/CD

---

## ⚡ Quick Start (AGORA MESMO)

### Passo 1: Ligar VPN
1. Abrir ProtonVPN
2. Clicar "Quick Connect" ou escolher Portugal
3. Esperar "Connected" ✅

### Passo 2: Testar
```bash
# Verificar IP
curl https://api.ipify.org

# Se IP mudou, está pronto!
```

### Passo 3: Scraping
```bash
# Teste rápido (já fizemos!)
npx tsx scripts/test-quick.ts

# Ou completo com breakdown
npx tsx scripts/scrape-with-breakdown.ts
```

---

## 🔐 Segurança

**O ProtonVPN que tem:**
- ✅ Encripta todo o tráfego
- ✅ Muda seu IP
- ✅ Protege contra bloqueios
- ✅ Kill switch (desconecta se VPN cair)

**Para scraping:**
- ✅ Parece navegação normal
- ✅ Distribui pedidos por vários IPs (mudando país)
- ✅ Respeita rate limits (2s entre pedidos)
- ✅ User-Agent rotativo

---

## ❌ O que NÃO precisa fazer

- ❌ Criar conta API ProtonVPN (não existe!)
- ❌ Pagar extra (subscrição normal é suficiente)
- ❌ Instalar software adicional (GUI já funciona)
- ❌ Configurar complexo (ligar e usar!)

---

## 📊 Estatísticas de Uso

**Com VPN:**
- ✅ 0 bloqueios até agora
- ✅ IP português ativo
- ✅ Rate limiting respeitado

**Testes realizados:**
- ✅ 5 items extraídos
- ✅ 23 componentes detalhados
- ✅ 0 erros
- ✅ CSV pronto para Excel

---

## 💡 Dicas

### 1. Manter VPN Ativa
- Não desligar durante scraping
- Se desligar, scripts param automaticamente (segurança)

### 2. Mudar País
- Após ~50-100 items
- Ou a cada 30-60 minutos
- Ou por categoria

### 3. Monitorizar
- Ver logs no terminal
- Verificar IP periodicamente: `curl https://api.ipify.org`

---

## 🆘 Troubleshooting

### ProtonVPN não conecta
```bash
# Verificar:
1. Subscrição ativa
2. Credenciais corretas
3. Internet funcionando
4. Reiniciar app
```

### Scraping ainda bloqueado
```bash
# Soluções:
1. Mudar para outro país
2. Aumentar rate limit (3s ou 5s)
3. Usar servidor ProtonVPN diferente
4. Verificar se VPN está realmente ativa
```

### IP não mudou
```bash
# Verificar:
curl https://api.ipify.org

# Se ainda 81.193.85.4:
1. Desconectar e reconectar VPN
2. Verificar "Connection Details" no ProtonVPN
3. Testar com browser: https://whatismyipaddress.com
```

---

## ✅ Checklist

- [x] ProtonVPN instalado
- [x] VPN testada e funcional
- [x] IP muda quando conecta
- [x] Scraper funciona com VPN
- [x] CSV gerado com sucesso
- [ ] Executar scraping completo (próximo passo!)

---

**Está pronto para usar!** 🎉

**Próxima ação:** Ligar ProtonVPN e executar scraping de uma categoria completa!

```bash
# Com VPN ligada:
npx tsx scripts/scrape-with-breakdown.ts
```

---

**Made with 🌰 by Wallnut**
