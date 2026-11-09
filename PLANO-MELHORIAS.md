# Notara — Plano de melhorias (comparação com o Distill)

> Levantamento feito no código da extensão Distill v4.2.21 (`lib/rules.js`, `lib/const.js`, `ui/assets/*`) em 08/11/2026,
> comparado com o Notara publicado em https://notara.web.app.

## 0. Bloqueio atual (antes de qualquer melhoria)

| Item | Situação | Quem |
|---|---|---|
| **Plano Blaze** no projeto Cafune (`confra-cafe-vp`) | ❌ Console ainda mostra *Spark* — sem isso nada de captura funciona no ar | Você |
| Criar banco `monitor` + publicar regras e Functions | ⏳ pronto para publicar | Claude |
| Validar o Chromium na nuvem (seletor visual / sites com JS) | ⏳ só testado localmente | Claude |
| Chave de push (VAPID) | ⏳ gerar no Console › Cloud Messaging | Você + Claude |
| E-mail (SMTP / senha de app) | ⏳ opcional | Você |

---

## 1. O que o Notara já tem ✅

- Tipos: página inteira (ignora menu/rodapé), parte da página (seletor CSS), feed RSS/Atom, API/JSON, site no ar
- **Seletor visual** (tocar no trecho, Maior/Menor, vários trechos, zoom no celular)
- **Navegador automático** para sites montados com JavaScript (ex.: Cebraspe)
- Screenshots + **comparação visual** (deslizar / lado a lado) e diff de texto
- Condições: contém, não contém, texto novo contém, regex, número maior/menor, subiu/caiu (valor e %), formato BR/US, E/OU
- Alertas: push, e-mail, Slack, Discord, Teams, webhook
- Intervalos de 5 min a 1 semana, tags, busca, filtros, pausar, histórico de 50 versões
- Ignorar textos (regex) e excluir elementos; feedback “alerta falso”
- Erros com nova tentativa automática e aviso após 3 falhas
- App instalável (PWA) para celular, tablet e computador; login Google/e-mail

---

## 2. O que existe no Distill e ainda **não** existe no Notara

| # | Recurso do Distill | Onde aparece na extensão | Valor p/ você | Esforço |
|---|---|---|---|---|
| 1 | **Condição “texto nunca visto antes”** (`not_match_any_previous_text`) | `rules.js` | ⭐⭐⭐ Evita alerta quando a lista só muda de ordem; avisa só de **edital novo** | Baixo |
| 2 | Outras condições: começa/termina com, vazio/não vazio, tamanho do texto, regex negativa | `rules.js` | ⭐⭐ | Baixo |
| 3 | **Monitorar PDF/documentos** (`TYPE_PDF_HTML`, `TYPE_DOC`) | `const.js` | ⭐⭐⭐ Editais e resultados saem em PDF | Médio |
| 4 | **Agendamento avançado**: cron, dias da semana/horários, intervalo aleatório | `ScheduleEditor` (Interval, Random, Cron, dias, meses) | ⭐⭐ Ex.: só dias úteis 8h–20h (economiza custo) | Baixo |
| 5 | **Ações em caso de erro** configuráveis (e-mails/telefones, webhook, campos) | `ErrorActionsModal` | ⭐⭐ | Baixo |
| 6 | **Requisição personalizada** p/ API: método, cabeçalhos, `Authorization`, corpo, **importar de curl** | `SieveOptions` | ⭐⭐ | Baixo |
| 7 | **Resumo da mudança por IA** (com “Regenerar” e feedback “resumo errado”) | `SummaryResponseTable`, `FEEDBACK_WRONG_SUMMARY` | ⭐⭐⭐ “Saiu o Edital nº 16 – resultado final” em 1 frase | Médio |
| 8 | **Macros** (passos antes de capturar: login, clicar “ver mais”, preencher busca) + gravador | `macros`, `Recorder`, `macro-player` | ⭐⭐ Páginas que exigem login/clique | Alto |
| 9 | **Crawler**: descobrir páginas novas de um site e monitorar todas | `crawlers`, `full-site-diff`, `import` (URLs encontradas) | ⭐⭐⭐ Ex.: avisar quando aparece **concurso novo** no Cebraspe | Alto |
| 10 | **Importar/exportar** monitores (CSV/JSON) | `import` | ⭐ | Baixo |
| 11 | **Condições globais** (valem para todos os monitores) | `GlobalRuleEditorModal` | ⭐ | Baixo |
| 12 | Modos de diff extras: **código-fonte HTML**, **dados (JSON)**, **simplificado** | `DIFF_MODE_*` | ⭐ | Médio |
| 13 | **Histórico de execuções / uso** (cada verificação, tempo, erro, ação disparada) | `usage`, `job-detail` | ⭐⭐ Entender falhas e custo | Médio |
| 14 | **SMS** | `ACTION_SMS`, “Get SMS” | ⭐ (pago – Twilio) | Médio |
| 15 | **Equipes/workspaces** (editor e leitor) | `teams` | ⭐ | Alto |
| 16 | **Proxies / sessões / dispositivos na nuvem** (ver de outro país, manter login) | `SelectProxy`, `devices`, `profiles` | ⭐ | Alto |
| 17 | **Monitoramento “ao vivo”** (segundos) | `ScheduleEditor` “Live (beta)” | ⭐ (caro na nuvem) | Médio |
| 18 | Alertas locais: **som**, popup, abrir aba | `ACTION_LOCAL_*` | ⭐ (push já cobre) | Baixo |
| 19 | **Idiomas** (11 na extensão) | `_locales` | ⭐ | Médio |
| 20 | Monitorar páginas **logadas com a sua sessão** + “monitorar esta página” pelo botão direito | extensão (content scripts, menu de contexto) | ⭐⭐ Só uma extensão companheira resolve | Alto |

Fora do escopo: editor de *workflows*/raspagem (`workflow-editor`, Scrapex) — é outro produto da mesma empresa.

---

## 3. Extras que o Distill não tem (sugestões)

| Ideia | Por quê |
|---|---|
| **Telegram** (e WhatsApp via API oficial depois) | Muito usado no Brasil para alertas de concurso; Telegram é grátis |
| **Modelos prontos**: “Concurso (Cebraspe/FGV/Cesgranrio)”, “Preço de produto”, “Diário Oficial” | Criar monitor em 2 toques |
| **Resumo diário** por e-mail/push (“3 sites mudaram hoje”) | Menos notificações |
| **Botão “Compartilhar alerta”** (link público da alteração) | Mandar o edital novo para alguém |

---

## 4. Ordem recomendada

| Fase | Entrega | Itens | Resultado |
|---|---|---|---|
| **3a — Publicar** | Blaze → banco, regras, Functions, VAPID, teste do Chromium na nuvem | 0 | App funcionando de verdade |
| **3b — Concursos sem ruído** ✅ (08/11, testado nos emuladores) | “nunca visto antes”, demais condições, **PDF**, agendamento por dias/horários, ações em erro | 1, 2, 3, 4, 5 | Alerta só quando sai edital novo, inclusive em PDF |
| **3c — Inteligência** | **Resumo por IA**, Telegram, modelos prontos, histórico de execuções | 7, 13, extras | Alerta legível em 1 frase |
| **4 — Avançado** | Macros, **crawler** (concurso novo), requisição personalizada/curl, importar/exportar, diff de código | 6, 8, 9, 10, 12 | Paridade com o Distill nos recursos principais |
| **5 — Escala** | Equipes, proxies, SMS, idiomas, extensão companheira | 14–20 | Uso em grupo / casos especiais |

### Custos a considerar (Blaze)
- Verificação simples: centavos por milhares de execuções (cota grátis cobre uso pessoal)
- Com navegador (Chromium, 2 GiB): ~10–20× mais cara por verificação → usar só quando necessário (já é automático)
- Resumo por IA: custo por chamada da API (modelo pequeno) — ligar por monitor
- SMS/WhatsApp: pagos por mensagem
