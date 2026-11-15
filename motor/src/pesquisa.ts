import { Timestamp } from "firebase-admin/firestore";
import { indiceAtual, salvarIndice, type Linha } from "./banco.js";
import { hojeBrasilia, situacaoAgora } from "./concursos.js";
import { db } from "./db.js";
import { fetchSeguro } from "./fetcher.js";
import { iaAtiva, pesquisarNoGoogle } from "./ia.js";

/**
 * A IA completa o banco pesquisando no Google o que a notícia não trouxe: banca organizadora e
 * site de inscrição (e o edital, se achar). Só aceita um site que abra de verdade e que não seja
 * o próprio agregador. Teto diário para não gastar a cota grátis; cada concurso é pesquisado no
 * máximo uma vez por semana.
 */

const MAX_POR_DIA = 40;
const MAX_POR_RODADA = 12;
const REPESQUISAR_MS = 7 * 86_400_000;

let pesquisando = false;

function extrairJson(texto: string): Record<string, unknown> | null {
  const bloco = /\{[\s\S]*\}/.exec(texto.replace(/```(?:json)?/g, ""));
  if (!bloco) return null;
  try {
    return JSON.parse(bloco[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Aceita só endereços que abrem (403 conta: muitos sites de banca bloqueiam robôs). */
async function siteValido(bruto: unknown): Promise<string | null> {
  if (typeof bruto !== "string" || !bruto.trim()) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//.test(bruto.trim()) ? bruto.trim() : `https://${bruto.trim()}`);
  } catch {
    return null;
  }
  if (/pciconcursos|vertexaisearch|google\.|wikipedia|facebook|instagram|youtube|jcconcursos|folhadirigida|estrategiaconcursos|grancursos|qconcursos/.test(url.hostname)) return null;
  try {
    const r = await fetchSeguro(url.toString());
    return r.status < 400 || r.status === 403 ? r.urlFinal || url.toString() : null;
  } catch {
    return null;
  }
}

async function cotaDoDia() {
  const ref = db.doc("config/ia_pesquisa");
  const hoje = hojeBrasilia();
  const d = (await ref.get()).data() ?? {};
  return { ref, hoje, usados: d.dia === hoje ? Number(d.usados) || 0 : 0 };
}

export async function pesquisarFaltantes() {
  const linhas = indiceAtual();
  if (pesquisando || !linhas || !iaAtiva()) return 0;
  pesquisando = true;
  let feitos = 0;
  try {
    const cota = await cotaDoDia();
    const livre = Math.min(MAX_POR_RODADA, MAX_POR_DIA - cota.usados);
    if (livre <= 0) return 0;
    const hoje = hojeBrasilia();
    const pendentes = linhas
      .filter((l) => {
        if (l.au || (l.sb && l.bn) || (l.ia && Date.now() - l.ia < REPESQUISAR_MS)) return false;
        if (l.pr && !l.sb) return false; // inscrição presencial ou pela própria prefeitura sem site: nada a achar
        const s = situacaoAgora({ inscricaoInicio: l.ii, inscricaoFim: l.if, situacao: l.si }, hoje);
        return s === "aberto" || s === "em_breve";
      })
      .sort((a, b) => (a.if ?? "9999").localeCompare(b.if ?? "9999")) // prazo mais curto primeiro
      .slice(0, livre);

    for (const l of pendentes) {
      const ano = (l.if ?? hoje).slice(0, 4);
      const pergunta = `Pesquise no Google o concurso/processo seletivo abaixo e responda SOMENTE com um JSON.
Órgão: ${l.o}
Local: ${[l.c, l.u === "BR" ? "nacional" : l.u].filter(Boolean).join(" - ")}
Cargos: ${l.cg}
Inscrições até: ${l.if ?? "?"} (${ano})

JSON: {"banca": "nome da banca organizadora, ou \\"propria\\" se o próprio órgão organiza", "site": "URL da página de inscrição ou do concurso no site da banca/órgão", "edital": "URL do edital em PDF, se encontrar"}
Use null no que não encontrar com segurança. Não invente endereços e não use sites de notícias ou cursinhos.`;
      const r = await pesquisarNoGoogle(pergunta);
      feitos++;
      const atual = linhas.find((x) => x.i === l.i);
      if (!atual) continue;
      atual.ia = Date.now();
      if (!r) {
        if (feitos === 1) break; // pesquisa indisponível agora: tenta na próxima rodada
        continue;
      }
      const j = extrairJson(r.texto) ?? {};
      const banca = typeof j.banca === "string" && j.banca.trim() && !/^null$/i.test(j.banca) ? j.banca.trim().slice(0, 60) : null;
      const [site, edital] = await Promise.all([siteValido(j.site), siteValido(j.edital)]);
      const propria = banca ? /^propria|pr[óo]pri[oa]/i.test(banca) : false;
      if (banca && !propria && !atual.bn) {
        atual.bni = banca;
        atual.bn = banca;
      }
      if (site) {
        atual.sbi = site;
        if (!atual.sb) atual.sb = site;
      }
      await db.doc(`concursos/${l.i}`).set(
        {
          iaPesquisa: { banca: propria ? "própria" : banca, site, edital, modelo: r.modelo, fontes: r.fontes.slice(0, 5), em: Timestamp.now() },
          ...(site || edital ? { links: { ...(site ? { inscricao: site } : {}), ...(edital ? { edital } : {}) } } : {}),
        },
        { merge: true },
      );
      console.log(`[IA busca] ${l.o}: banca=${banca ?? "?"} site=${site ?? "—"}${edital ? " +edital" : ""}`);
      await new Promise((ok) => setTimeout(ok, 4_000));
    }
    if (feitos) {
      await cota.ref.set({ dia: cota.hoje, usados: cota.usados + feitos }, { merge: true });
      await salvarIndice(linhas as Linha[]);
    }
  } finally {
    pesquisando = false;
  }
  return feitos;
}
