# Plano — App Web de Monitoramento de Sites (Firebase / Google)

> **Histórico.** A arquitetura atual está no [README](README.md): Firebase gratuito (`notara-monitor`) + motor no GitHub Actions.

> App próprio, **inspirado nas funcionalidades** da extensão Distill Web Monitor (v4.2.21) analisada nesta pasta.
> Não reaproveitamos código, nome, logos ou ícones da extensão (são proprietários): tudo será reimplementado do zero.
> Nome: **Notara** — *note cada mudança*.

---

## ✅ Status (03/11/2026)

**Feito**
- Site `notara` criado e **publicado**: https://notara.web.app
- App web "Cafune Monitor" registrado no projeto (config em `web/src/firebase.ts`)
- Frontend MVP (React + Vite + Tailwind, PWA): login (Google/e-mail), monitores, formulário com "Testar", detalhe com histórico e diff, caixa de alterações, ajustes (push, instalar app)
- Backend (`functions/`): agendador (1 min), primeira captura ao criar, "Verificar agora", "Testar captura", regras, diff, push FCM, Slack/Discord/Teams/webhook, e-mail SMTP, proteção SSRF, backoff de erros
- Regras e índices do banco `monitor` (`firestore.rules`, `firestore.indexes.json`)
- Testado de ponta a ponta nos **emuladores** (login → criar → captura → mudança → alerta → diff; regras bloqueando escrita indevida). Testes unitários: `cd functions && npm test`

**Fase 2 — Navegador real (03/11/2026) ✅**
- `functions/src/navegador.ts`: Chromium headless (`puppeteer-core` + `@sparticuz/chromium` na nuvem; Chrome local nos emuladores). Cada requisição da página passa pelo filtro anti-SSRF; contexto isolado (sem cookies entre monitores)
- Opção **“Carregar como navegador”** + “Esperar depois de carregar” — para sites montados com JavaScript
- **Screenshots** por versão (JPEG < 900 KB em `monitores/{id}/capturas/{versaoId}`) e **comparação visual** antes/depois (deslizar ou lado a lado)
- **Seletor visual** (`abrirSeletor`): screenshot + mapa de elementos; o usuário toca no trecho, ajusta com Maior/Menor, escolhe vários; zoom no celular. Detecta sozinho se a página precisa do navegador
- Funções com navegador usam 2 GiB; o agendador roda no máx. 2 capturas com navegador em paralelo
- ⚠️ Ainda não testado **na nuvem** (só nos emuladores): conferir o Chromium após o primeiro deploy das Functions

**Falta (precisa de você no Console)**
1. **Ativar o plano Blaze** no projeto (e criar um alerta de orçamento): https://console.firebase.google.com/project/confra-cafe-vp/usage/details
2. **Autorizar o domínio** para login: Authentication › Configurações › Domínios autorizados › Adicionar `notara.web.app`
3. *(Opcional, push)* Configurações do projeto › Cloud Messaging › Certificados push da Web › Gerar par de chaves → colocar em `web/.env.production` como `VITE_VAPID_KEY=...`
4. *(Opcional, e-mail)* senha de app do Gmail → `npx firebase-tools functions:secrets:set SMTP_URL`

**Depois do Blaze (comandos que o Claude executa)**
```bash
npx firebase-tools firestore:databases:create monitor --location southamerica-east1
npx firebase-tools deploy --only firestore,functions:monitor
```

**Desenvolvimento local (sem custo)**
```bash
npx firebase-tools emulators:start --only auth,firestore,functions   # em monitor-app/
VITE_EMULADORES=1 npm --prefix web run dev                           # http://127.0.0.1:5173
```
Conta de teste do emulador: `seed-emulador.json`.

---

## 1. Projeto Firebase

| Item | Valor |
|---|---|
| Conta | conta Google do dono do projeto (CLI já logada na máquina de desenvolvimento) |
| Projeto | **Cafune** — `confra-cafe-vp` (nº 1090003834527) |
| Sites já existentes (NÃO usar) | `cafune.web.app`, `confra-cafe-vp.web.app` → hospedam o app Cafuné atual |
| Site novo para o monitor | `notara` → `https://notara.web.app` (**a criar**) |
| Ligação da pasta | `monitor-app/.firebaserc` (target de hosting `monitor`) |

**Por que um site separado:** um `firebase deploy` no site padrão sobrescreveria o app Cafuné em produção.
O deploy do monitor será sempre `firebase deploy --only hosting:monitor,functions:monitor`.

**Plano de cobrança:** monitorar sites exige Cloud Functions agendadas e acesso de rede externo, ou seja, **plano Blaze** (pago por uso, com cota gratuita). Antes de ativar, configurar um **alerta de orçamento** no Google Cloud (ex.: R$ 50/mês).

---

## 2. Funcionalidades (mapeadas da extensão → app web)

| Extensão (o que existe) | No nosso app |
|---|---|
| **Monitores ("sieves")**: tipos página inteira, elemento HTML, feed RSS/Atom, JSON/API, PDF/documento, uptime | Cadastro de monitor com tipo: `pagina`, `elemento`, `feed`, `json`, `pdf`, `uptime` |
| **Seletor visual** (`htmlselector`, picker) — clicar no elemento da página | O backend abre a página (Puppeteer), devolve screenshot + DOM limpo; o usuário clica no elemento num iframe isolado → gera seletor CSS/XPath. Também é possível digitar o seletor manualmente |
| **Agendamento** (`ScheduleEditor`, `cron-parser`) | Intervalo (5 min, 15 min, 1 h, 1 dia…) ou expressão cron; mínimo configurável por plano |
| **Regras de alerta** (`rules.js`): contém / não contém, começa/termina com, regex, número menor/maior que, aumento/queda mínima (valor e %), formato numérico `1,234.5` / `1.234,5` / `1 234,5` | Mesmo motor de regras com grupos E/OU; padrão BR `1.234,56` |
| **Histórico + diff** (visual, texto, fonte, simplificado) | Linha do tempo de versões; diff de texto (lado a lado / inline), diff de HTML e comparação de screenshots |
| **Ações** (`ACTION_*`): e-mail, SMS, push, webhook, Slack, Discord, Teams, som, popup, abrir aba | E-mail, push (FCM), webhook, Slack, Discord, Teams, Telegram; SMS (Twilio) numa fase posterior |
| **Macros** (`macro-player`, Recorder) — clicar, digitar, logar antes de capturar | Passos antes da captura: `click`, `type`, `wait`, `scroll`, `select` (via Puppeteer) |
| **Caixa de entrada / Watchlist / change-feed** | Tela "Alterações": lido/não lido, filtros, busca |
| **Tags, pastas, ordenar, busca** (`TagsEditor`, `SortBy`, `SearchBar`) | Tags coloridas, pastas, ordenação e busca |
| **Estados** (pronto, pausado, erro, tentando de novo) + `error-actions` | Status por monitor, tentativas com backoff, aviso após N erros seguidos |
| **Feedback** ("alerta falso", "alerta com ruído") | Botão "isso não importa" → sugere ignorar trechos/números voláteis |
| **Proxies**, **Teams/Workspaces**, **Importar/Exportar** | Fase 4: equipes compartilhando monitores; importação/exportação JSON/CSV |
| **11 idiomas** (`_locales`) | Começar em pt-BR + en (i18n preparado) |

---

## 3. Arquitetura

```
 Celular / Tablet / Computador
 ┌─────────────────────────────┐
 │ PWA React (instalável)      │  Firebase Hosting (site notara)
 │ Auth · Firestore · FCM      │
 └──────────────┬──────────────┘
                │
   ┌────────────┼──────────────────────────────┐
   │ Firestore  │ Storage (screenshots, HTML)  │
   └────────────┼──────────────────────────────┘
                │
 Cloud Scheduler (a cada 1 min)
        └─► Function "dispatcher": busca monitores com proximaExecucao <= agora
                └─► Cloud Tasks (fila, limita concorrência)
                        ├─► Function "checkLeve"  (fetch + cheerio: HTML estático, feed, JSON, uptime)
                        └─► Cloud Run "checkNavegador" (Puppeteer/Chromium: JS, macros, screenshot, seletor visual)
                                └─► compara com a última versão → aplica regras → grava alteração
                                        └─► Function "notificar": e-mail / push / webhook / Slack / Discord / Teams
```

### Stack
- **Frontend:** React + Vite + TypeScript, Tailwind CSS, layout responsivo (mobile-first: lista em cards no celular, 2 colunas no tablet, painel com barra lateral no desktop), **PWA** (instalar na tela inicial, push no Android e no iOS 16.4+ quando instalado).
- **Auth:** Firebase Authentication com Google + e-mail/senha.
- **Banco:** Cloud Firestore.
- **Arquivos:** Cloud Storage (screenshots e snapshots grandes, com regra de expiração).
- **Backend:** Cloud Functions 2ª geração (Node 22, região `southamerica-east1`) + Cloud Run para o Chromium (precisa de 1–2 GB de RAM).
- **Push:** Firebase Cloud Messaging.
- **E-mail:** extensão "Trigger Email" do Firebase (com SMTP/SendGrid/Resend).
- **Segurança extra:** App Check (reCAPTCHA Enterprise) e Secret Manager para chaves (Twilio, SMTP, webhooks).

---

## 4. Modelo de dados (Firestore)

```
users/{uid}
  nome, email, plano, idioma, fusoHorario, criadoEm
  dispositivos/{tokenId}        → token FCM, plataforma, ultimoUso

users/{uid}/monitores/{monitorId}
  nome, url, tipo, seletores[{tipo:'css'|'xpath', valor, incluir|excluir}]
  agendamento {modo:'intervalo'|'cron', segundos|cron, fuso}
  regras {op:'E'|'OU', itens[{tipo, valor, campo}]}, formatoNumero
  acoes [{tipo:'email'|'push'|'webhook'|'slack'|'discord'|'teams', destino}]
  macro [{passo, seletor, valor}]
  usarNavegador (bool), tags[], pasta
  estado: 'ativo'|'pausado'|'erro', erros, ultimaExecucao, proximaExecucao
  ultimoHash, ultimoTexto (resumo)

users/{uid}/monitores/{monitorId}/versoes/{versaoId}
  capturadoEm, hash, texto, htmlRef (Storage), screenshotRef (Storage)

users/{uid}/alteracoes/{alteracaoId}
  monitorId, versaoAnterior, versaoNova, resumoDiff, lida (bool), criadaEm, feedback

users/{uid}/tags/{tagId}       nome, cor
```

Índice composto para o dispatcher: `collectionGroup monitores` por `estado` + `proximaExecucao`.

**Regras de segurança:** cada usuário só lê e escreve em `users/{uid}/**` com `request.auth.uid == uid`. Os campos de execução (`estado`, `ultimoHash`, `versoes`, `alteracoes.criadaEm`) são gravados só pelo backend (Admin SDK).

---

## 5. Cuidados importantes

1. **SSRF:** o backend busca URLs informadas pelo usuário. Ele tem que bloquear IPs privados e de metadata (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254.169.254`, `::1`) e protocolos que não sejam http(s).
2. **Limites:** intervalo mínimo (ex.: 5 min no gratuito), máximo de monitores por usuário, timeout de 30 s por captura, tamanho máximo do snapshot.
3. **Bom comportamento:** User-Agent identificável, respeitar `robots.txt` como opção e os termos dos sites; backoff quando o site responder 429/5xx.
4. **Ruído:** normalizar espaços, remover scripts/estilos e ignorar datas e contadores por regex antes do diff.
5. **Custo:** sites estáticos vão pelo `checkLeve` (barato). O Chromium só roda quando `usarNavegador = true`.
6. **Retenção:** guardar as últimas N versões por monitor (ex.: 50) e apagar screenshots com mais de 30 dias.

---

## 6. Fases de entrega

| Fase | Entrega | Resultado |
|---|---|---|
| **0 — Setup** | Criar o site `notara`, ativar Blaze + alerta de orçamento, Auth (Google/e-mail), Firestore, Storage | Infra pronta, app Cafuné intacto |
| **1 — MVP** | Login; CRUD de monitores (URL + seletor CSS manual); intervalo; `checkLeve`; histórico; diff de texto; alerta por e-mail e push; layout responsivo + PWA | Já monitora páginas e avisa no celular |
| **2 — Navegador** | Cloud Run com Puppeteer; **seletor visual**; screenshots; diff visual; páginas com JavaScript | Monitora qualquer site moderno |
| **3 — Regras e integrações** | Motor de regras (texto, regex, número, %); feeds, JSON, PDF, uptime; webhook, Slack, Discord, Teams, Telegram | Alertas inteligentes, sem ruído |
| **4 — Avançado** | Macros (login/cliques), cron, tags/pastas, importar/exportar, equipes, SMS, i18n en | Paridade com as funções principais da extensão |

---

## 7. Estrutura da pasta

```
monitor-app/
  .firebaserc            ← liga ao projeto confra-cafe-vp (feito)
  firebase.json          ← hosting target "monitor", functions, regras
  firestore.rules
  firestore.indexes.json
  storage.rules
  web/                   ← React + Vite (PWA)
  functions/             ← dispatcher, checkLeve, notificar, API
  browser-worker/        ← Cloud Run com Puppeteer (fase 2)
  PLANO-FIREBASE.md
```

## 8. Comandos (depois do setup)

```bash
cd "/Users/maciel/Downloads/Distill Web Monitor/monitor-app"
npx firebase-tools hosting:sites:create cafune-monitor     # fase 0 (uma vez)
npx firebase-tools deploy --only hosting:monitor           # publica só o monitor
```

> Observação: a máquina está com Node 26, e o firebase-tools pede Node 20/22/24. Funciona com avisos; para o build das Functions, usar Node 22 (`brew install node@22`).
