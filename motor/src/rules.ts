import { createHash } from "node:crypto";
import type { ConjuntoRegras, Regra } from "./types.js";

/** Extrai números do texto. `br` = 1.234,56 · `us` = 1,234.56 */
export function extrairNumeros(texto: string, formato: "br" | "us" = "br"): number[] {
  const achados = texto.match(/-?\d+(?:[.,\s]\d+)*/g) ?? [];
  const nums: number[] = [];
  for (const bruto of achados) {
    const limpo =
      formato === "br"
        ? bruto.replace(/[.\s]/g, "").replace(",", ".")
        : bruto.replace(/[,\s]/g, "");
    const n = Number.parseFloat(limpo);
    if (!Number.isNaN(n)) nums.push(n);
  }
  return nums;
}

function numero(v: string): number {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isNaN(n) ? NaN : n;
}

// ---------- Memória de linhas ("nunca visto antes") ----------

/** Máximo de linhas lembradas por monitor (as mais recentes ficam). */
export const MAX_LINHAS_LEMBRADAS = 5000;

const normalizarLinha = (l: string) => l.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();

/** Impressão digital curta de uma linha (ignora maiúsculas e espaços). */
export const digitalLinha = (l: string) => createHash("sha1").update(normalizarLinha(l)).digest("hex").slice(0, 12);

export const linhasDe = (texto: string) => texto.split("\n").map((l) => l.trim()).filter(Boolean);

/** Linhas do texto novo que nunca apareceram em nenhuma versão anterior. */
export function linhasInéditas(texto: string, vistas: Iterable<string>): string[] {
  const conjunto = new Set(vistas);
  const novas: string[] = [];
  const nestaVersao = new Set<string>();
  for (const l of linhasDe(texto)) {
    const d = digitalLinha(l);
    if (!conjunto.has(d) && !nestaVersao.has(d)) novas.push(l);
    nestaVersao.add(d);
  }
  return novas;
}

/** Junta as linhas da versão nova à memória, mantendo as mais recentes. */
export function atualizarMemoria(vistas: string[], texto: string): string[] {
  const novas = linhasDe(texto).map(digitalLinha);
  const juntas = [...new Set([...vistas.filter((d) => !novas.includes(d)), ...novas])];
  return juntas.slice(-MAX_LINHAS_LEMBRADAS);
}

// ---------- Avaliação ----------

export interface ContextoRegras {
  antigo: string;
  novo: string;
  adicionado: string;
  /** Linhas nunca vistas em versões anteriores. */
  ineditas: string[];
}

function avaliar(r: Regra, c: ContextoRegras, formato: "br" | "us"): { ok: boolean; motivo: string } {
  const v = r.valor ?? "";
  const baixo = (s: string) => s.toLocaleLowerCase("pt-BR");
  const novo = c.novo.trim();
  const nNovo = extrairNumeros(c.novo, formato)[0];
  const nAntigo = extrairNumeros(c.antigo, formato)[0];
  const alvo = numero(v);
  const regex = (padrao: string) => {
    try {
      return new RegExp(padrao, "i");
    } catch {
      return null;
    }
  };

  switch (r.tipo) {
    case "nunca_visto": {
      const linhas = v.trim() ? c.ineditas.filter((l) => baixo(l).includes(baixo(v))) : c.ineditas;
      return {
        ok: linhas.length > 0,
        motivo: linhas.length ? `novo: “${linhas[0].slice(0, 80)}”${linhas.length > 1 ? ` (+${linhas.length - 1})` : ""}` : "nada inédito",
      };
    }
    case "contem":
      return { ok: baixo(novo).includes(baixo(v)), motivo: `contém “${v}”` };
    case "nao_contem":
      return { ok: !baixo(novo).includes(baixo(v)), motivo: `não contém “${v}”` };
    case "adicionado_contem":
      return { ok: baixo(c.adicionado).includes(baixo(v)), motivo: `texto novo contém “${v}”` };
    case "comeca_com":
      return { ok: baixo(novo).startsWith(baixo(v)), motivo: `começa com “${v}”` };
    case "termina_com":
      return { ok: baixo(novo).endsWith(baixo(v)), motivo: `termina com “${v}”` };
    case "vazio":
      return { ok: novo.length === 0, motivo: "ficou vazio" };
    case "nao_vazio":
      return { ok: novo.length > 0, motivo: "tem conteúdo" };
    case "tamanho_menor":
      return { ok: novo.length < alvo, motivo: `${novo.length} caracteres < ${alvo}` };
    case "tamanho_maior":
      return { ok: novo.length > alvo, motivo: `${novo.length} caracteres > ${alvo}` };
    case "regex": {
      const re = regex(v);
      return re ? { ok: re.test(c.novo), motivo: `corresponde a /${v}/` } : { ok: false, motivo: `regex inválida /${v}/` };
    }
    case "regex_nao": {
      const re = regex(v);
      return re ? { ok: !re.test(c.novo), motivo: `não corresponde a /${v}/` } : { ok: false, motivo: `regex inválida /${v}/` };
    }
    case "num_menor":
      return { ok: nNovo !== undefined && nNovo < alvo, motivo: `número ${nNovo} < ${alvo}` };
    case "num_maior":
      return { ok: nNovo !== undefined && nNovo > alvo, motivo: `número ${nNovo} > ${alvo}` };
    case "num_aumento":
      return {
        ok: nNovo !== undefined && nAntigo !== undefined && nNovo - nAntigo >= alvo,
        motivo: `subiu ${nAntigo} → ${nNovo} (mín. ${alvo})`,
      };
    case "num_queda":
      return {
        ok: nNovo !== undefined && nAntigo !== undefined && nAntigo - nNovo >= alvo,
        motivo: `caiu ${nAntigo} → ${nNovo} (mín. ${alvo})`,
      };
    case "pct_aumento":
    case "pct_queda": {
      if (nNovo === undefined || nAntigo === undefined || nAntigo === 0) {
        return { ok: false, motivo: "sem número para comparar" };
      }
      const pct = ((nNovo - nAntigo) / Math.abs(nAntigo)) * 100;
      const ok = r.tipo === "pct_aumento" ? pct >= alvo : -pct >= alvo;
      return { ok, motivo: `variação de ${pct.toFixed(1)}% (mín. ${alvo}%)` };
    }
    default:
      return { ok: false, motivo: "regra desconhecida" };
  }
}

/** Sem regras = qualquer mudança gera alerta. */
export function avaliarRegras(
  regras: ConjuntoRegras | undefined,
  contexto: ContextoRegras,
): { passou: boolean; detalhes: string[] } {
  const itens = (regras?.itens ?? []).filter((r) => r && r.tipo);
  if (itens.length === 0) return { passou: true, detalhes: [] };
  const formato = regras?.formatoNumero ?? "br";
  const resultados = itens.map((r) => avaliar(r, contexto, formato));
  const passou =
    regras?.operador === "OU" ? resultados.some((r) => r.ok) : resultados.every((r) => r.ok);
  return { passou, detalhes: resultados.filter((r) => r.ok).map((r) => r.motivo) };
}
