# 🛡️ Proxy & VPN Setup para CYPE Scraper

## Porquê usar VPN/Proxy?

Quando faz scraping em larga escala, usar **múltiplos IPs rotativos** ajuda a:

✅ **Evitar bloqueios** - Distribuir pedidos por vários IPs
✅ **Evitar rate limiting** - Parecer múltiplos utilizadores normais
✅ **Aumentar privacidade** - Ocultar origem dos pedidos
✅ **Evitar bans** - Mesmo que um IP seja bloqueado, outros continuam

---

## 🎯 Opção 1: ProtonVPN (Recomendado)

### Instalação ProtonVPN

**Windows/Linux/Mac:**
```bash
# Download de https://protonvpn.com/download
# Ou instalar via CLI (Linux):
sudo apt install protonvpn
protonvpn-cli login
```

### Configurar para Scraping

```bash
# Ligar a servidor português
protonvpn-cli connect PT

# Ou rodar entre países
protonvpn-cli connect PT  # Portugal
protonvpn-cli connect ES  # Espanha
protonvpn-cli connect FR  # França
```

### Usar com o Scraper

```typescript
// Com ProtonVPN ligado, não precisa de configurar proxies
// O tráfego passa automaticamente pela VPN
const scraper = new CypeScraper({
  rateLimit: 3000, // Mais seguro com VPN
});
```

### Script de Rotação Automática

Criar `scripts/rotate-vpn.sh`:

```bash
#!/bin/bash
# Roda entre servidores ProtonVPN durante scraping

COUNTRIES=("PT" "ES" "FR" "DE" "IT")
CHAPTERS=("IOD" "EEI" "FFO" "AIS" "SAN")

for i in "${!CHAPTERS[@]}"; do
  COUNTRY="${COUNTRIES[$i % ${#COUNTRIES[@]}]}"

  echo "🔄 Switching to $COUNTRY..."
  protonvpn-cli disconnect
  sleep 2
  protonvpn-cli connect "$COUNTRY"
  sleep 5

  echo "📊 Scraping chapter ${CHAPTERS[$i]}..."
  npm run scrape-cype -- --chapters="${CHAPTERS[$i]}" --output="data/cype-${CHAPTERS[$i]}.json"

  sleep 10
done

protonvpn-cli disconnect
echo "✅ Done!"
```

Executar:
```bash
chmod +x scripts/rotate-vpn.sh
./scripts/rotate-vpn.sh
```

---

## 🎯 Opção 2: Proxies HTTP/SOCKS5

### Instalar Dependências

```bash
npm install https-proxy-agent socks-proxy-agent
```

### Configuração Básica

```typescript
import { CypeScraper } from "@/lib/cype-scraper";

const scraper = new CypeScraper({
  useProxy: true,
  rotateProxies: true,
  proxies: [
    {
      type: "http",
      host: "proxy1.example.com",
      port: 8080,
    },
    {
      type: "http",
      host: "proxy2.example.com",
      port: 8080,
    },
  ],
});
```

### Com Autenticação

```typescript
const scraper = new CypeScraper({
  useProxy: true,
  rotateProxies: true,
  proxies: [
    {
      type: "http",
      host: "premium-proxy.com",
      port: 8080,
      username: "your-username",
      password: "your-password",
    },
  ],
});
```

### SOCKS5 (Tor, etc.)

```typescript
const scraper = new CypeScraper({
  useProxy: true,
  proxies: [
    {
      type: "socks5",
      host: "127.0.0.1",
      port: 9050, // Tor default port
    },
  ],
});
```

---

## 🎯 Opção 3: Serviços de Proxies Pagos

### Bright Data (ex-Luminati)

```typescript
const scraper = new CypeScraper({
  useProxy: true,
  rotateProxies: true,
  proxies: [
    {
      type: "http",
      host: "brd.superproxy.io",
      port: 22225,
      username: "brd-customer-YOUR_ID-zone-residential",
      password: "YOUR_PASSWORD",
    },
  ],
});
```

**Vantagens:**
- ✅ IPs residenciais (mais difíceis de detectar)
- ✅ Rotação automática
- ✅ Geo-targeting (Portugal, etc.)

**Preço:** ~$500/mês (40GB)

### Oxylabs

```typescript
proxies: [
  {
    type: "http",
    host: "pr.oxylabs.io",
    port: 7777,
    username: "customer-YOUR_ID-cc-pt", // cc-pt = Portugal
    password: "YOUR_PASSWORD",
  },
]
```

### SmartProxy

```typescript
proxies: [
  {
    type: "http",
    host: "gate.smartproxy.com",
    port: 7000,
    username: "YOUR_USERNAME",
    password: "YOUR_PASSWORD",
  },
]
```

---

## 🎯 Opção 4: Proxies Gratuitos (Não Recomendado)

⚠️ **Cuidado:** Proxies grátis são lentos, instáveis e podem ser maliciosos!

### Lista de Proxies Grátis

```typescript
// Carregar de lista online
async function loadFreeProxies(): Promise<ProxyConfig[]> {
  const response = await fetch("https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=PT&ssl=all&anonymity=all");
  const text = await response.text();
  const ips = text.split("\n");

  return ips.map(ip => {
    const [host, port] = ip.split(":");
    return {
      type: "http" as const,
      host,
      port: parseInt(port),
    };
  }).filter(p => p.host && p.port);
}

// Usar
const proxies = await loadFreeProxies();
const scraper = new CypeScraper({
  useProxy: true,
  rotateProxies: true,
  proxies: proxies.slice(0, 10), // Usar apenas os primeiros 10
});
```

---

## 🎯 Opção 5: Tor Network

### Instalar Tor

**Linux/Mac:**
```bash
sudo apt install tor
sudo systemctl start tor
```

**Windows:**
```bash
# Download Tor Browser ou Tor Expert Bundle
# https://www.torproject.org/download/
```

### Configurar Tor para Rotação

`torrc` configuration:
```
ControlPort 9051
HashedControlPassword YOUR_HASHED_PASSWORD
```

### Usar com Scraper

```typescript
import { CypeScraper } from "@/lib/cype-scraper";

const scraper = new CypeScraper({
  useProxy: true,
  proxies: [
    {
      type: "socks5",
      host: "127.0.0.1",
      port: 9050, // Tor SOCKS5 port
    },
  ],
  rateLimit: 5000, // Tor é mais lento
});
```

### Rotação de Circuito Tor

```typescript
import net from "net";

async function renewTorCircuit() {
  return new Promise((resolve) => {
    const client = net.connect(9051, "127.0.0.1", () => {
      client.write('AUTHENTICATE ""\r\n');
      client.write("SIGNAL NEWNYM\r\n");
      client.write("QUIT\r\n");
    });
    client.on("end", resolve);
  });
}

// Rodar a cada X capítulos
for (const chapter of chapters) {
  await scraper.scrapeChapter(chapter);
  await renewTorCircuit();
  console.log("🔄 Tor circuit renewed");
  await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
}
```

---

## 📊 Comparação de Opções

| Opção | Preço | Velocidade | Fiabilidade | Dificuldade |
|-------|-------|------------|-------------|-------------|
| **ProtonVPN** | €5-10/mês | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ Fácil |
| **Bright Data** | $500/mês | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ Médio |
| **Oxylabs** | $300/mês | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ Médio |
| **Tor** | Grátis | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ Difícil |
| **Proxies Grátis** | Grátis | ⭐ | ⭐ | ⭐⭐⭐⭐ Difícil |

---

## 🎯 Recomendação Final

### Para uso pessoal/desenvolvimento:
✅ **ProtonVPN** (€5-10/mês) + rotação manual

### Para produção:
✅ **Bright Data** ou **Oxylabs** com IPs residenciais

### Para testes:
✅ **Tor** (gratuito mas lento)

---

## 🚀 Exemplo Completo

```typescript
// scripts/scrape-with-vpn.ts
import { CypeScraper } from "@/lib/cype-scraper";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function switchProtonVPN(country: string) {
  console.log(`🔄 Switching to ${country}...`);
  await execAsync("protonvpn-cli disconnect");
  await new Promise(resolve => setTimeout(resolve, 2000));
  await execAsync(`protonvpn-cli connect ${country}`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log(`✅ Connected to ${country}`);
}

async function main() {
  const countries = ["PT", "ES", "FR", "DE", "IT"];
  const chapters = ["IOD", "EEI", "FFO", "AIS", "SAN"];

  for (let i = 0; i < chapters.length; i++) {
    const country = countries[i % countries.length];
    await switchProtonVPN(country);

    const scraper = new CypeScraper({
      includeChapters: [chapters[i]],
      rateLimit: 3000,
    });

    await scraper.scrapeAll();
    const workItems = scraper.convertToWorkItems();

    console.log(`✅ ${chapters[i]}: ${workItems.length} items`);

    // Save
    const fs = require("fs");
    fs.writeFileSync(
      `data/cype-${chapters[i]}.json`,
      JSON.stringify({ workItems }, null, 2)
    );

    // Wait between chapters
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30s
  }

  await execAsync("protonvpn-cli disconnect");
  console.log("🎉 All done!");
}

main();
```

Executar:
```bash
npm install
tsx scripts/scrape-with-vpn.ts
```

---

## ⚠️ Notas Legais

1. ✅ Respeite sempre os termos de serviço do site
2. ✅ Use rate limiting adequado (≥2s entre pedidos)
3. ✅ Identifique-se corretamente (User-Agent)
4. ⚠️ VPN/Proxy não torna scraping ilegal legal
5. 💰 Considere subscrever o serviço oficial CYPE para uso comercial

---

**Made with 🌰 by Wallnut**
