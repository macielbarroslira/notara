# Notara — note cada mudança

Monitor de sites que avisa quando algo muda: preços, editais de concurso, notícias, PDFs, APIs e sites fora do ar.
Funciona no celular, tablet e computador (app instalável).

**App:** https://notara.web.app

## Como funciona (100% gratuito)

| Parte | Onde roda |
|---|---|
| Site (React + Vite, PWA) — `web/` | Firebase Hosting |
| Login, banco de dados e notificações push | Firebase, projeto `notara-monitor` (plano gratuito) |
| **Motor** — verifica os sites, Chrome headless, PDF, alertas — `motor/` | **GitHub Actions**, a cada ~10 min (`.github/workflows/motor.yml`) |

O app não chama servidor: grava **pedidos** no banco (`users/{uid}/pedidos`) — *Testar*, *Escolher na página*, *Verificar agora* — e o motor responde no mesmo documento.

## Recursos

- Página inteira (ignora menus/rodapé), parte da página (seletor CSS), feed RSS/Atom, API/JSON, PDF, site no ar
- **Seletor visual**: toque no trecho da página que quer monitorar
- Navegador automático para sites montados com JavaScript, screenshots e comparação visual
- Condições: **linha nunca vista antes**, contém/não contém, começa/termina com, vazio, tamanho, regex, números (valor e %)
- Dias e horários de verificação (horário de Brasília), avisos de erro e de recuperação
- Alertas: push, e-mail, Slack, Discord, Teams, webhook

## Configuração (uma vez)

Secrets do repositório (**Settings › Secrets and variables › Actions**):

| Secret | Obrigatório | O que é |
|---|---|---|
| `FIREBASE_SA` | sim | JSON da conta de serviço do projeto `notara-monitor` (Console do Firebase › Configurações do projeto › Contas de serviço › Gerar nova chave privada) |
| `SMTP_URL` | não | Para alertas por e-mail. Ex. Gmail com senha de app: `smtps://seu.email%40gmail.com:SENHA@smtp.gmail.com:465` |

## Desenvolvimento local

```bash
npx firebase-tools emulators:start --only auth,firestore        # banco e login locais
VITE_EMULADORES=1 npm --prefix web run dev                       # app em http://localhost:5173
cd motor && npm run build && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node lib/motor.js
cd motor && npm test                                              # testes
```

## Publicar

```bash
npx firebase-tools deploy --only firestore                        # regras e índices (projeto notara-monitor)
npm --prefix web run build && npx firebase-tools deploy --only hosting:monitor --project site
```

> O site fica no projeto `confra-cafe-vp` (alias `site`), que também hospeda outro app — por isso o deploy do site é sempre `--only hosting:monitor --project site`.
