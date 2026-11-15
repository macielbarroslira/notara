# Plano — Banco de Concursos do Notara

> Objetivo: um banco próprio com **todos os concursos abertos e previstos**, atualizado sozinho, com
> todas as variáveis para busca instantânea (no app, no Telegram e pela IA) e alertas de "concurso
> novo que combina comigo". Tudo dentro dos planos gratuitos (Firestore Spark, GitHub Actions, IAs grátis).

## Andamento

| Fase | Status | Observações |
|---|---|---|
| 1. Fundação | ✅ no ar (15/11/2026) | 466 concursos; coleta a cada 2 h (6h–23h); índice compacto (1 documento); aba Banco com filtros; `buscar_concursos` na IA; `/concursos` no Telegram |
| 2. Detalhes | ✅ no ar (15/11/2026) | Ficha extraída da página de cada concurso, **sem IA** (extrator determinístico, versão 3): cronograma (inscrição com hora, isenção, boleto, cada prova), banca, taxa, salário mín./máx., jornada, regime, validade, etapas, benefícios, cargos com vagas imediatas + CR. Página da ficha no app; `detalhes_concurso` na IA; eventos de retificação/prorrogação com o que mudou. Ao subir a versão do extrator, as fichas são relidas sozinhas. |
| 2b. Adaptadores das bancas | ⏸ movido para a fase 4 | A banca já é identificada pelo site de inscrição (43 bancas conhecidas). Ler o site de cada banca só vale a pena junto com os **editais oficiais** (fase 4), que são a fonte primária. |
| 3–5 | a fazer | |

## 1. Situação hoje e o que muda

| Hoje | Com o banco |
|---|---|
| Monitores avisam quando a **página** de uma fonte muda | O motor **entende** cada concurso e guarda os dados em campos |
| A IA só "vê" a internet pela ferramenta `ler_pagina` (abre 1 página por vez, lenta, gasta cota) | A IA consulta o banco na hora (`buscar_concursos`) e só abre páginas para detalhes frescos |
| Sem busca por cargo, salário, UF, escolaridade… | Busca com filtros combinados, em milissegundos |
| Alertas por mudança de texto (ruidosos) | **Buscas salvas**: "Analista de TI, Nordeste, ≥ R$ 8 mil" → alerta só quando surgir um que combine |

## 2. Fontes (em ordem de prioridade)

| Fonte | O que traz | Frequência | Observações |
|---|---|---|---|
| **PCI Concursos – listagem** (`/concursos/`) | ~470 concursos: órgão, UF, vagas, salário máx., cargos resumidos, escolaridade, fim das inscrições, link | a cada 2 h (7h–23h) | 1 requisição só; `robots.txt` permite `/concursos/` e `/noticias/`; **proíbe** `/*.pdf` e `/*.php` |
| **PCI – página do concurso** (`/noticias/...`) | banca, datas, taxa, cargos detalhados, link do edital oficial | só quando o item é **novo ou mudou** | ~1 req a cada 3 s, no máximo 60/rodada |
| **Bancas** (Cebraspe, FGV, FCC, Vunesp, Fundatec, Cesgranrio via notícias…) | edital oficial, retificações, resultados | a cada 6 h | adaptador por banca; confirma e completa os dados do PCI |
| **Editais em PDF (site oficial/banca)** | cargos, vagas, salários, requisitos, cronograma | 1× por edital + a cada retificação | leitura com `unpdf` + extração por IA (cota diária limitada) |
| **Querido Diário** (API aberta de diários oficiais municipais) | concursos de prefeituras que nem chegam aos agregadores | 1× por dia | busca "concurso público" / "processo seletivo" nos diários do dia |
| (opcional) **Busca na web pela IA** | perguntas fora do banco | sob demanda | só se a cota grátis de "Google Search" do Gemini estiver disponível; senão fica de fora |

Regras de boa vizinhança (valem para todas as fontes): respeitar `robots.txt`, 1 requisição por vez
por domínio com pausa de 2–3 s, `User-Agent` identificando o Notara, cache por `ETag/Last-Modified`,
guardar **fatos** (números, datas, links) e não copiar o texto editorial dos sites, sempre com link
para a fonte. O repositório é público: nenhum dado coletado vai para o Git.

## 3. Modelo de dados (Firestore)

### `concursos/{id}` — um documento por concurso
```
id                 hash estável: órgão normalizado + ano + nº do edital (ou link canônico)
orgao              "Câmara dos Deputados"        orgaoSigla  "CD"
esfera             federal | estadual | municipal | autarquia | estatal
uf                 "DF" | "NACIONAL"              cidades     ["Brasília"]
banca              "Cebraspe"
status             previsto | autorizado | banca_definida | edital_aberto | inscricoes_abertas
                   | inscricoes_encerradas | provas_realizadas | resultado | homologado | suspenso | cancelado
inscricoes         { inicio: Timestamp, fim: Timestamp }
provas             [{ data: Timestamp, descricao: "objetiva" }]
taxa               { min: 85, max: 130 }
vagasTotal         184           cadastroReserva  true
salarioMin/Max     4300 / 32070.88
escolaridades      ["superior", "medio"]
areas              ["legislativo", "ti", "direito"]   (classificação por palavras-chave + IA)
cargos             [{ nome, nomeNormalizado, escolaridade, vagas, salario, area, requisitos, jornada }]
links              { fonte, edital, banca, oficial, inscricao }
fontes             ["pci", "cebraspe"]   (de onde veio cada informação)
confianca          { cargos: "edital-ia" | "pagina" | "listagem", ... }
busca              ["camara", "deputados", "analista", "legislativo", ...]  (tokens normalizados)
primeiroVistoEm / atualizadoEm / verificadoEm / hash
```

### Todas as variáveis do concurso

Além do resumo acima, cada concurso guarda (quando a fonte informar; campo vazio = "não divulgado"):

**Identificação**
- nº do edital, data de publicação, órgão (nome, sigla, CNPJ), poder (executivo/legislativo/judiciário/MP), esfera
- banca (nome, site, contato), comissão do concurso, link do Diário Oficial
- regime (estatutário, CLT, temporário, estágio, residência), tipo (concurso, processo seletivo, seleção simplificada)

**Vagas e cargos** (por cargo)
- nome e especialidade, escolaridade, requisitos (formação, registro em conselho, CNH, experiência, idade mínima/máxima, altura)
- vagas imediatas e cadastro reserva, vagas por cota (PcD, negros, indígenas, trans, quilombolas), vagas por cidade/lotação
- salário inicial, remuneração com benefícios (auxílio-alimentação, saúde, transporte…), jornada semanal
- etapas do cargo (objetiva, discursiva/redação, títulos, prova prática, TAF, avaliação psicológica, investigação social, exame médico, curso de formação), caráter (eliminatório/classificatório) e pesos
- disciplinas e conteúdo programático (resumo + link), nº de questões, nota mínima

**Inscrição e taxa**
- valor da taxa por cargo/escolaridade, formas de pagamento, quem tem **isenção** (CadÚnico, doador de medula, etc.)
- link de inscrição, cidades de prova, possibilidade de mais de um cargo

**Cronograma completo** — guardado como lista de datas tipadas (`cronograma: [{ tipo, inicio, fim, hora, observacao, fonte, atualizadoEm }]`), para entrar na busca, no calendário e nos lembretes:

| Fase | Tipos de data |
|---|---|
| Antes | autorização, banca contratada, previsão do edital, **publicação do edital** |
| Isenção | pedido de isenção (início/fim), resultado preliminar, recurso, resultado final |
| Inscrição | **início e fim das inscrições**, prorrogação, **vencimento do boleto**, inscrições deferidas, recurso, solicitação de atendimento especial, envio de laudo PcD, autodeclaração (cotas) |
| Prova | **local de prova / cartão de inscrição**, **prova objetiva**, discursiva/redação, prova prática, TAF, avaliação psicológica, títulos (envio), heteroidentificação, perícia PcD |
| Resultados | gabarito preliminar, **prazo de recurso**, gabarito definitivo, resultado preliminar, resultado final, **homologação** |
| Depois | **validade do concurso** (e prorrogação), convocações, nomeações, posse, curso de formação |

Retificações não apagam datas antigas: a data nova entra no cronograma e a antiga fica no histórico
("prova adiada de 10/02 para 24/03"), gerando um evento.

**Concorrência e desfecho** (quando divulgado): inscritos por cargo, candidatos por vaga, nota de
corte, nº de aprovados/convocados.

### `concursos/{id}/eventos/{id}` — linha do tempo
`novo`, `edital_publicado`, `retificacao`, `inscricoes_prorrogadas`, `data_prova`, `resultado`,
`cancelado`… com data, resumo e link. É daqui que saem os alertas.

### `concursos_indice/{parte}` — índice compacto para busca instantânea
Lista com uma linha curta por concurso ativo (~300 bytes: id, órgão, UF, banca, status, datas,
vagas, salário máx., escolaridades, áreas, cargos normalizados). ~500 ativos ≈ 150 KB → **1 ou 2
documentos**. O app lê só isso (2 leituras) e filtra/ordena no próprio aparelho.

### `users/{uid}/buscas/{id}` — buscas salvas
Filtros + canais de aviso + "avisar também retificações/datas de prova".

### `fontes_saude/{fonte}` — saúde de cada coletor
Última execução, itens lidos, erros, e o alarme "listagem caiu de 470 para 12 → não apagar nada".

## 4. Como o motor coleta (pipeline)

```
coletor (por fonte) ──▶ normalizador ──▶ deduplicador ──▶ comparador ──▶ gravação + eventos
       │                    │                 │                │                │
   HTML/PDF/API        dinheiro, datas,   mesmo concurso   hash por campo   só grava o que
   com cache/ETag      UF, escolaridade,  vindo de 2 fontes  (o que mudou?)   mudou; gera evento
                       cargo, área         → um registro                     → alertas
```

1. **Coletores** com interface única (`listar()`, `detalhar(item)`), cada um com amostras de HTML
   salvas para testes (`fixtures/`). Se o site mudar de layout, o teste quebra antes de estragar o banco.
2. **Normalizador** determinístico: "R$ 10.354,29" → 10354.29; "14/12/2026" → data;
   "Superior/Médio" → `["superior","medio"]`; sinônimos de cargo ("Téc. Judiciário" = "Técnico Judiciário").
3. **IA só onde precisa** (Gemini/Groq grátis, com fila e limite diário, ex.: 40 chamadas/dia):
   extrair cargos/vagas/salários/cronograma de **editais em PDF** e classificar áreas difíceis.
   Saída validada por esquema; campo vindo da IA nunca sobrescreve campo de fonte mais confiável.
4. **Deduplicação**: chave canônica + comparação aproximada (órgão + ano + banca + nº do edital).
5. **Comparador**: só grava o que mudou e registra o evento (ex.: "inscrições prorrogadas até 20/12").
6. **Arquivamento**: encerrados há mais de 60 dias saem do índice (ficam no banco para histórico).

### Agenda (dentro da rodada contínua do motor)

| Tarefa | Quando |
|---|---|
| Listagem PCI | a cada 2 h, das 7h às 23h |
| Detalhe de concursos novos/alterados | logo após a listagem (máx. 60 por rodada) |
| Bancas | a cada 6 h |
| Editais com IA | fila contínua, até a cota diária |
| Querido Diário | 1× por dia, 6h |
| Revalidar abertos (datas, status) | 1× por dia |
| Reconstruir o índice compacto | após cada coleta que mudou algo |

## 5. Busca e uso

- **App › Concursos › aba "Banco"**: filtros por UF/cidade, escolaridade, área, cargo, salário
  mínimo, vagas, banca, status ("inscrições abertas"), "inscrições terminam até…", texto livre;
  ordenar por salário, vagas, prazo. Cada concurso abre uma ficha com cargos, datas, linha do tempo
  e links. Botão **"Salvar esta busca"** → alerta.
- **IA (app e Telegram)**: novas ferramentas `buscar_concursos(filtros, texto)`,
  `detalhes_concurso(id)`, `proximas_provas()`, `criar_busca_salva(...)`.
  Ex.: "tem concurso de TI no Nordeste com salário acima de 8 mil?" → resposta imediata do banco.
- **Telegram**: `/concursos <texto>` e `/buscas` (listar/pausar buscas salvas).
- **Alertas**: a cada evento novo, o motor confere as buscas salvas (em memória, sem gastar
  leituras extras) e avisa por Telegram/push: "🆕 Concurso combina com 'TI Nordeste': …".
- **Acompanhar um concurso** (botão na ficha, ou "acompanha esse pra mim" na IA) →
  `users/{uid}/acompanhados/{id}` com o(s) cargo(s) de interesse e se já se inscreveu/pagou.
- **Lembretes de prazo** dos acompanhados, por Telegram/push:
  - inscrições terminam em 7 dias, 3 dias e no último dia;
  - boleto vence amanhã (se marcou "inscrito, falta pagar");
  - local de prova saiu; prova em 7 dias, amanhã (com horário e local);
  - gabarito saiu → prazo de recurso termina em X; resultado e homologação;
  - qualquer **retificação** que mude data, vaga ou requisito.
- **Calendário**: aba "Minha agenda" com todas as datas dos concursos acompanhados, e link de
  calendário (`.ics`) para assinar no Google Agenda / iPhone — atualiza sozinho quando a data muda.
- **Perguntas para a IA** que passam a funcionar: "quais provas tenho este mês?", "quando acaba a
  inscrição da Câmara?", "o que muda na retificação?", "quais concursos de nível médio pagam mais
  de 5 mil com inscrição aberta até sexta?".

## 6. Limites gratuitos (estimativa)

| Recurso | Limite grátis | Uso estimado |
|---|---|---|
| Firestore leituras | 50 mil/dia | ~3 mil (motor) + 2 por abertura do app + buscas salvas |
| Firestore gravações | 20 mil/dia | ~300–800 (só o que muda) + eventos |
| Firestore armazenamento | 1 GiB | ~10 MB com 3 mil concursos (ativos + histórico) |
| GitHub Actions | ilimitado (repo público) | já roda continuamente |
| IA grátis | cotas por modelo | fila com teto diário; o resto é determinístico |

Proteções: contador diário de gravações/chamadas de IA; se chegar a 80% do teto, o motor adia o
que não é urgente (revalidações, editais) e mantém só listagem e alertas.

## 7. Robustez

- **Nunca apagar por falha**: se uma fonte falhar ou trouxer muito menos itens que o normal, nada é
  removido; o concurso só muda de status com evidência.
- **Idempotência**: rodar a mesma coleta duas vezes não duplica nada (ids estáveis + hash).
- **Testes por fonte** com HTML salvo + testes do normalizador (dinheiro, datas, escolaridade).
- **Saúde das fontes** visível no app (Ajustes › Fontes) e aviso no Telegram se uma fonte ficar
  24 h sem funcionar.
- **Rastreabilidade**: cada campo sabe de qual fonte veio; a ficha mostra "fonte: edital oficial".
- **Reprocessar**: guardar a página/edital bruto resumido (hash + trechos) para reextrair sem
  baixar de novo quando o extrator melhorar.

## 8. Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| **1. Fundação** | modelo de dados, coletor da listagem PCI, normalizador, gravação com eventos, índice compacto, aba "Banco" com filtros, ferramenta `buscar_concursos` na IA | ~470 concursos no banco, busca com filtros < 100 ms, IA respondendo "concursos de TI abertos no DF" |
| **2. Detalhes e bancas** | página de cada concurso (banca, datas, taxa, cargos), adaptadores das bancas, deduplicação, linha do tempo | ficha completa nos concursos novos; retificações viram eventos |
| **3. Buscas salvas, acompanhamento e lembretes** | `users/{uid}/buscas` e `acompanhados`, telas para criar/editar, alertas e **lembretes de prazo** por Telegram/push, aba "Minha agenda" + link `.ics`, comandos `/concursos`, `/buscas`, `/agenda` | busca salva avisa só o que combina, sem repetir; lembretes chegam nos prazos certos e acompanham retificações |
| **4. Editais com IA e municípios** | leitura de editais oficiais em PDF com IA (cota diária) preenchendo **todas as variáveis e o cronograma completo**, Querido Diário, classificação de áreas | cargos/vagas/salários/requisitos/etapas e todas as datas nos editais lidos; prefeituras aparecendo |
| **5. Qualidade** | saúde das fontes no app, alarmes, arquivamento, testes com amostras, painel de cobertura | uma fonte quebrada é detectada e avisada em < 24 h, sem estragar o banco |

Cada fase é publicada e testada antes da próxima. A fase 1 já entrega o principal: busca rápida e a
IA respondendo com dados do banco.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Site muda o layout | testes com amostras + alarme de "poucos itens" + não apagar |
| Termos de uso dos agregadores | guardar só fatos com link para a fonte, uso pessoal, ritmo lento; priorizar fontes oficiais nas fases 2 e 4 |
| Bloqueio de servidores (como o 403 da Cesgranrio) | fonte alternativa (notícias/feeds) e registro em "saúde das fontes" |
| Cota de IA acabar | IA só para editais, com fila e teto; o resto é determinístico |
| GitHub pausar o motor | rodadas curtas como plano B (o banco continua válido, só atualiza menos) |
