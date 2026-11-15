import { Timestamp } from "firebase-admin/firestore";
import { db } from "./db.js";
import { decodificar, fetchSeguro } from "./fetcher.js";
import { diferencasFicha, lerFichaPci, VERSAO_FICHA, type Ficha } from "./ficha.js";
import {
  enriquecer,
  lerAreas,
  tokensDeBusca,
  hojeBrasilia,
  lerListagemPci,
  normalizarTexto,
  SIGLAS_UF,
  situacaoAgora,
  UF_POR_NOME,
  type Concurso,
  type Situacao,
} from "./concursos.js";

/**
 * Banco de concursos (fase 1): coleta a listagem do PCI a cada 2 h, grava só o que mudou
 * (com eventos na linha do tempo), mantém um índice compacto para busca instantânea
 * e nunca apaga nada por causa de uma falha da fonte.
 */

const URL_PCI = "https://www.pciconcursos.com.br/concursos/";
const INTERVALO_COLETA_MS = 2 * 3600_000;
const HORARIO = { de: 6, ate: 23 }; // horário de Brasília
const DIAS_AUSENTE_PARA_ARQUIVAR = 3;
const MAX_BYTES_PARTE = 700_000;

/** Uma linha do índice compacto (chaves curtas: ~300 bytes por concurso). */
export interface Linha {
  i: string; // id
  o: string; // órgão
  u: string; // UF (sigla ou BR)
  c: string | null; // cidade
  e: string; // esfera
  t: string; // tipo
  es: string[]; // escolaridades
  a: string[]; // áreas
  cg: string; // cargos (resumo)
  v: number | null; // vagas
  cr: boolean; // cadastro de reserva
  s: number | null; // salário máximo
  ii: string | null; // inscrição início (AAAA-MM-DD)
  if: string | null; // inscrição fim
  si: Situacao;
  l: string; // link da fonte
  p: number; // primeira vez visto (ms)
  h: string; // hash do conteúdo
  b: string; // texto de busca normalizado
  au?: number; // ausente da fonte desde (ms)
  dl?: string; // link da página do concurso já lida (ficha)
  dv?: number; // versão do extrator usada nessa leitura
  bn?: string | null; // banca
  pv?: string | null; // próxima prova (AAAA-MM-DD)
}

export function linhaDoIndice(c: Concurso, primeiroVisto: number): Linha {
  return {
    i: c.id,
    o: c.orgao,
    u: c.uf,
    c: c.cidade,
    e: c.esfera,
    t: c.tipo,
    es: c.escolaridades,
    a: c.areas,
    cg: c.variosCargos ? "Vários cargos" : c.cargos.join(", ").slice(0, 160),
    v: c.vagas,
    cr: c.cadastroReserva,
    s: c.salarioMax,
    ii: c.inscricaoInicio,
    if: c.inscricaoFim,
    si: c.situacao,
    l: c.link,
    p: primeiroVisto,
    h: c.hash,
    b: c.busca.join(" "),
  };
}

// ---------- Busca (usada pela IA e pelo Telegram; o app tem a mesma lógica) ----------

export interface FiltrosConcurso {
  texto?: string;
  uf?: string;
  cidade?: string;
  escolaridade?: string;
  area?: string;
  esfera?: string;
  tipo?: string;
  banca?: string;
  salarioMin?: number;
  vagasMin?: number;
  /** true (padrão): só inscrições abertas ou abrindo em breve. */
  apenasAbertos?: boolean;
  /** Inscrições terminam até esta data (AAAA-MM-DD). */
  terminaAte?: string;
  ordenar?: "prazo" | "salario" | "vagas" | "recentes";
}

function siglaUf(uf: string) {
  const t = uf.trim().toUpperCase();
  if (SIGLAS_UF.has(t)) return t;
  if (/^(BRASIL|NACIONAL|FEDERAL)$/.test(normalizarTexto(uf).toUpperCase())) return "BR";
  return UF_POR_NOME[normalizarTexto(uf).toUpperCase()] ?? t;
}

export function filtrarConcursos(linhas: Linha[], f: FiltrosConcurso, hoje = hojeBrasilia()) {
  const palavras = normalizarTexto(f.texto ?? "").split(" ").filter((w) => w.length > 1);
  const uf = f.uf ? siglaUf(f.uf) : null;
  const cidade = f.cidade ? normalizarTexto(f.cidade) : null;
  const esc = f.escolaridade ? normalizarTexto(f.escolaridade).replace(/^ensino /, "").replace(/^nivel /, "") : null;
  const apenasAbertos = f.apenasAbertos !== false;
  const lista = linhas.filter((l) => {
    const sit = situacaoAgora({ inscricaoInicio: l.ii, inscricaoFim: l.if, situacao: l.si }, hoje);
    if (apenasAbertos && sit !== "aberto" && sit !== "em_breve") return false;
    if (uf && l.u !== uf) return false;
    if (cidade && !normalizarTexto(l.c ?? "").includes(cidade)) return false;
    if (esc && !l.es.some((e) => e.startsWith(esc.slice(0, 5)))) return false;
    if (f.area && !l.a.includes(normalizarTexto(f.area).replace(/ /g, "_"))) return false;
    if (f.esfera && l.e !== normalizarTexto(f.esfera)) return false;
    if (f.tipo && l.t !== f.tipo) return false;
    if (f.banca && !normalizarTexto(l.bn ?? "").includes(normalizarTexto(f.banca))) return false;
    if (f.salarioMin && (l.s ?? 0) < f.salarioMin) return false;
    if (f.vagasMin && (l.v ?? 0) < f.vagasMin) return false;
    if (f.terminaAte && (!l.if || l.if > f.terminaAte)) return false;
    if (palavras.length) {
      const tokens = `${l.b} ${normalizarTexto(l.cg)}`.split(" ");
      if (!palavras.every((p) => tokens.some((t) => t.startsWith(p)))) return false;
    }
    return true;
  });
  const ordem = f.ordenar ?? "prazo";
  lista.sort((a, b) =>
    ordem === "salario"
      ? (b.s ?? 0) - (a.s ?? 0)
      : ordem === "vagas"
        ? (b.v ?? 0) - (a.v ?? 0)
        : ordem === "recentes"
          ? b.p - a.p
          : (a.if ?? "9999").localeCompare(b.if ?? "9999"),
  );
  return lista;
}

// ---------- Índice em memória ----------

let indice: { linhas: Linha[]; lidoEm: number } | null = null;

async function lerIndice(): Promise<Linha[]> {
  const snap = await db.collection("concursos_indice").get();
  return snap.docs.sort((a, b) => a.id.localeCompare(b.id)).flatMap((d) => (d.get("linhas") as Linha[] | undefined) ?? []);
}

/** Índice para a IA/Telegram (cache de 10 min; a coleta atualiza na hora). */
export async function carregarIndice() {
  if (indice && Date.now() - indice.lidoEm < 10 * 60_000) return indice.linhas;
  indice = { linhas: await lerIndice(), lidoEm: Date.now() };
  return indice.linhas;
}

async function gravarIndice(linhas: Linha[]) {
  const partes: Linha[][] = [[]];
  let tamanho = 0;
  for (const l of linhas) {
    const t = JSON.stringify(l).length;
    if (tamanho + t > MAX_BYTES_PARTE) {
      partes.push([]);
      tamanho = 0;
    }
    partes.at(-1)!.push(l);
    tamanho += t;
  }
  const lote = db.batch();
  partes.forEach((p, n) => lote.set(db.doc(`concursos_indice/ativos-${n}`), { linhas: p, atualizadoEm: Timestamp.now() }));
  const existentes = await db.collection("concursos_indice").listDocuments();
  for (const d of existentes) if (!/^ativos-\d+$/.test(d.id) || Number(d.id.split("-")[1]) >= partes.length) lote.delete(d);
  await lote.commit();
  indice = { linhas, lidoEm: Date.now() };
}

// ---------- Coleta ----------

const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "?");

/** O que mudou entre duas versões (vira o resumo do evento). */
function descreverMudanca(antes: Linha, depois: Linha) {
  const partes: string[] = [];
  let tipo = "atualizado";
  if (antes.si !== depois.si) {
    tipo = depois.si === "normal" ? "atualizado" : depois.si;
    partes.push({ prorrogado: "Inscrições prorrogadas", reaberto: "Inscrições reabertas", suspenso: "Concurso suspenso", normal: "Situação normalizada" }[depois.si]);
  }
  if (antes.if !== depois.if) {
    if (tipo === "atualizado") tipo = "inscricoes_alteradas";
    partes.push(`Inscrições até ${dataBr(depois.if)} (antes ${dataBr(antes.if)})`);
  }
  if (antes.ii !== depois.ii && depois.ii) partes.push(`Início das inscrições: ${dataBr(depois.ii)}`);
  if (antes.v !== depois.v || antes.cr !== depois.cr) partes.push(`Vagas: ${antes.v ?? "CR"} → ${depois.v ?? "CR"}`);
  if (antes.s !== depois.s) partes.push(`Salário até R$ ${depois.s?.toLocaleString("pt-BR") ?? "?"} (antes ${antes.s?.toLocaleString("pt-BR") ?? "?"})`);
  if (antes.cg !== depois.cg) partes.push(`Cargos: ${depois.cg}`);
  if (antes.l !== depois.l && !partes.length) {
    tipo = "noticia";
    partes.push("Nova notícia sobre o concurso");
  }
  return { tipo, resumo: partes.join(" · ") || "Dados atualizados" };
}

async function registrarSaude(fonte: string, dados: Record<string, unknown>) {
  await db.doc(`fontes_saude/${fonte}`).set({ ...dados, quando: Timestamp.now() }, { merge: true });
}

export async function coletarConcursos() {
  const inicio = Date.now();
  const r = await fetchSeguro(URL_PCI);
  if (r.status !== 200) throw new Error(`PCI respondeu HTTP ${r.status}`);
  const html = r.corpo || decodificar(r.bytes, r.tipoConteudo);

  // Lê e dá id estável a cada concurso (desempata processos iguais do mesmo órgão)
  const novos = new Map<string, Concurso>();
  for (const item of lerListagemPci(html)) {
    let c = enriquecer(item);
    if (novos.has(c.id)) c = enriquecer(item, true);
    novos.set(c.id, c);
  }

  const antigas = await lerIndice();
  const config = db.doc("config/concursos");
  const totalAnterior = ((await config.get()).get("total") as number | undefined) ?? antigas.length;
  // Proteção: a fonte trouxe bem menos que o normal → não mexe em nada
  if (totalAnterior > 40 && novos.size < totalAnterior * 0.5) {
    await registrarSaude("pci", { ok: false, erro: `só ${novos.size} concursos (antes ${totalAnterior}); nada foi alterado` });
    throw new Error(`listagem do PCI veio com ${novos.size} itens (antes ${totalAnterior}) — coleta ignorada`);
  }

  const porId = new Map(antigas.map((l) => [l.i, l]));
  const primeiraCarga = antigas.length === 0;
  // O mesmo concurso pode mudar de id se os cargos mudarem: reconhece pela chave (órgão + UF)
  const sumidosPorChave = new Map<string, Linha>();
  for (const l of antigas) if (!novos.has(l.i)) sumidosPorChave.set(`${normalizarTexto(l.o)}|${l.u}`, l);

  const agora = Date.now();
  const escritor = db.bulkWriter();
  const linhas: Linha[] = [];
  const contagem = { novos: 0, alterados: 0, arquivados: 0, iguais: 0 };

  for (const c0 of novos.values()) {
    let c = c0;
    let antes = porId.get(c.id);
    if (!antes) {
      const mesmo = sumidosPorChave.get(c.chave);
      if (mesmo && !novos.has(mesmo.i)) {
        c = { ...c, id: mesmo.i };
        antes = mesmo;
        sumidosPorChave.delete(c.chave);
      }
    }
    // Na carga inicial nada é "novo" (p = 0); depois, p = quando apareceu pela primeira vez
    const linha = linhaDoIndice(c, antes?.p ?? (primeiraCarga ? 0 : agora));
    // Cargos completados pela página do concurso continuam valendo enquanto a notícia for a mesma
    if (antes?.dl && antes.dl === c.link) Object.assign(linha, { cg: antes.cg, a: antes.a, b: antes.b, dl: antes.dl, dv: antes.dv, bn: antes.bn, pv: antes.pv });
    linhas.push(linha);
    const ref = db.doc(`concursos/${c.id}`);
    const doc = {
      ...c,
      fontes: ["pci"],
      links: { fonte: c.link },
      status: "ativo",
      atualizadoEm: Timestamp.fromMillis(agora),
    };
    if (!antes) {
      contagem.novos++;
      escritor.set(ref, { ...doc, primeiroVistoEm: Timestamp.fromMillis(agora) }, { merge: true });
      if (!primeiraCarga) {
        escritor.create(ref.collection("eventos").doc(), {
          tipo: "novo",
          resumo: `Novo: ${c.orgao}${c.vagas ? ` · ${c.vagas} vagas` : ""}${c.salarioMax ? ` · até R$ ${c.salarioMax.toLocaleString("pt-BR")}` : ""}`,
          em: Timestamp.fromMillis(agora),
          link: c.link,
        });
      }
    } else if (antes.h !== c.hash || antes.au) {
      contagem.alterados++;
      escritor.set(ref, doc, { merge: true });
      const mudanca = antes.h !== c.hash ? descreverMudanca(antes, linha) : null;
      if (mudanca && mudanca.tipo !== "noticia") {
        const { tipo, resumo } = mudanca;
        escritor.create(ref.collection("eventos").doc(), { tipo, resumo, em: Timestamp.fromMillis(agora), link: c.link });
      }
    } else {
      contagem.iguais++;
    }
  }

  // Sumiram da fonte: marca como ausente; só arquiva depois de alguns dias (ou se já encerrou)
  const hoje = hojeBrasilia();
  for (const l of antigas) {
    if (novos.has(l.i) || linhas.some((x) => x.i === l.i)) continue;
    const ausente = l.au ?? agora;
    const encerrado = l.if !== null && l.if < hoje;
    if (agora - ausente > DIAS_AUSENTE_PARA_ARQUIVAR * 86_400_000 || (encerrado && agora - ausente > 86_400_000)) {
      contagem.arquivados++;
      escritor.set(db.doc(`concursos/${l.i}`), { status: "arquivado", arquivadoEm: Timestamp.fromMillis(agora) }, { merge: true });
    } else {
      linhas.push({ ...l, au: ausente });
    }
  }

  await escritor.close();
  const mudou = contagem.novos + contagem.alterados + contagem.arquivados > 0 || linhas.length !== antigas.length || linhas.some((l) => l.au && !porId.get(l.i)?.au);
  if (mudou || primeiraCarga) await gravarIndice(linhas);
  else indice = { linhas, lidoEm: Date.now() };

  await config.set({ ultimaColeta: Timestamp.fromMillis(agora), total: novos.size, ativos: linhas.length }, { merge: true });
  await registrarSaude("pci", { ok: true, erro: null, itens: novos.size, ...contagem, duracaoMs: Date.now() - inicio });
  return { total: novos.size, ...contagem };
}

// ---------- Ficha do concurso (fase 2) ----------

let detalhando = false;

const NOME_NOTICIA: Record<Ficha["noticia"], string> = {
  abertura: "Nova notícia",
  retificacao: "Retificação",
  prorrogacao: "Prorrogação",
  reabertura: "Reabertura das inscrições",
  suspensao: "Suspensão",
  resultado: "Resultado/convocação",
  outra: "Nova notícia",
};
const TIPOS_PROVA = new Set(["prova_objetiva", "prova_discursiva", "prova_pratica", "taf", "titulos", "avaliacao_psicologica", "prova"]);

/** Próxima prova a partir de hoje (ou a última, se todas já passaram). */
function proximaProva(f: Ficha, hoje: string) {
  const provas = f.cronograma.filter((c) => TIPOS_PROVA.has(c.tipo)).map((c) => c.data).sort();
  return provas.find((d) => d >= hoje) ?? provas.at(-1) ?? null;
}

/**
 * Abre a página de cada concurso (uma vez por notícia, ou de novo quando o extrator melhora),
 * extrai a ficha completa e atualiza banco + índice. Quando a notícia muda (ex.: retificação),
 * compara com a ficha anterior e registra um evento com o que mudou.
 * Segundo plano, 1 página a cada 2,5 s, progresso salvo a cada 25.
 */
export async function detalharConcursos(max = 300) {
  if (detalhando || !indice) return 0;
  detalhando = true;
  let feitos = 0;
  const hoje = hojeBrasilia();
  try {
    const pendentes = indice.linhas
      .filter((l) => !l.au && (l.dl !== l.l || (l.dv ?? 0) < VERSAO_FICHA))
      .sort((a, b) => b.p - a.p) // novos primeiro
      .slice(0, max);
    for (const l of pendentes) {
      try {
        const r = await fetchSeguro(l.l);
        const atual = indice.linhas.find((x) => x.i === l.i);
        if (!atual) continue;
        if (r.status !== 200) {
          Object.assign(atual, { dl: l.l, dv: VERSAO_FICHA });
          continue;
        }
        const ficha = lerFichaPci(r.corpo);
        const ref = db.doc(`concursos/${l.i}`);
        const anterior = (await ref.get()).get("ficha") as Ficha | undefined;
        const nomes = ficha.cargos.map((c) => c.nome);
        await ref.set(
          {
            ficha,
            banca: ficha.banca,
            cronograma: ficha.cronograma,
            ...(nomes.length ? { cargosDetalhe: ficha.cargos, cargos: nomes, variosCargos: false, areas: lerAreas(nomes, l.o) } : {}),
            links: { fonte: l.l, ...(ficha.siteInscricao ? { inscricao: `https://${ficha.siteInscricao}` } : {}) },
            detalhadoEm: Timestamp.now(),
          },
          { merge: true },
        );
        // Notícia nova sobre um concurso já lido: evento com o que mudou
        if (anterior && l.dl && l.dl !== l.l) {
          const mudancas = diferencasFicha(anterior, ficha);
          await ref.collection("eventos").add({
            tipo: ficha.noticia === "abertura" || ficha.noticia === "outra" ? "noticia" : ficha.noticia,
            resumo: [NOME_NOTICIA[ficha.noticia], ...mudancas].join(" · "),
            em: Timestamp.now(),
            link: l.l,
          });
        }
        if (nomes.length) {
          atual.cg = nomes.join(", ").slice(0, 400);
          atual.a = lerAreas(nomes, atual.o);
        }
        atual.bn = ficha.banca;
        atual.pv = proximaProva(ficha, hoje);
        atual.b = tokensDeBusca(atual.o, atual.c, nomes.join(" ") || atual.cg, atual.u, ficha.banca).join(" ");
        atual.dl = l.l;
        atual.dv = VERSAO_FICHA;
        feitos++;
        if (feitos % 25 === 0) await gravarIndice(indice.linhas);
      } catch (e) {
        console.warn(`[Concursos] página de ${l.o}: ${String(e).slice(0, 120)}`);
      }
      await new Promise((ok) => setTimeout(ok, 2_500));
    }
    if (feitos % 25 !== 0) await gravarIndice(indice.linhas);
    if (feitos) console.log(`[Concursos] fichas lidas: ${feitos}`);
  } finally {
    detalhando = false;
  }
  return feitos;
}

// ---------- Agenda ----------

let ultimaColeta: number | null = null;

/** Coleta se já passaram 2 h desde a última (e estamos no horário). Chamada a cada ~1 min pelo motor. */
export async function coletarSeVencido(forcar = false) {
  const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
  if (!forcar && (hora < HORARIO.de || hora > HORARIO.ate)) return null;
  if (ultimaColeta === null) {
    const t = (await db.doc("config/concursos").get()).get("ultimaColeta") as Timestamp | undefined;
    ultimaColeta = t?.toMillis() ?? 0;
  }
  if (!forcar && Date.now() - ultimaColeta < INTERVALO_COLETA_MS) return null;
  ultimaColeta = Date.now(); // mesmo se falhar, tenta de novo só daqui a 2 h
  try {
    const r = await coletarConcursos();
    console.log(`[Concursos] ${r.total} na fonte · ${r.novos} novos · ${r.alterados} alterados · ${r.arquivados} arquivados`);
    void detalharConcursos().catch((e) => console.warn("[Concursos] fichas:", String(e))); // segundo plano
    return r;
  } catch (e) {
    console.warn("[Concursos] coleta falhou:", String(e));
    await registrarSaude("pci", { ok: false, erro: String(e).slice(0, 300) }).catch(() => {});
    return null;
  }
}
