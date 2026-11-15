import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

/**
 * Banco de concursos — leitura e normalização.
 * Fonte da fase 1: listagem do PCI Concursos (/concursos/), que o robots.txt deles permite.
 * Guardamos só fatos (órgão, UF, vagas, salário, cargos, escolaridade, datas) e o link para a fonte.
 */

export type Escolaridade = "fundamental" | "medio" | "tecnico" | "superior";
export type Esfera = "federal" | "estadual" | "municipal" | "outra";
export type Tipo = "concurso" | "processo_seletivo" | "estagio" | "residencia";
/** Situação vinda da fonte; "aberto/encerrado" é calculado na hora pelas datas. */
export type Situacao = "normal" | "prorrogado" | "reaberto" | "suspenso";

export interface ItemListagem {
  orgao: string;
  titulo: string;
  link: string;
  uf: string; // sigla ou "BR" (nacional)
  cidade: string | null;
  vagas: number | null; // null = só cadastro de reserva
  cadastroReserva: boolean;
  salarioMax: number | null;
  cargos: string[]; // vazio = "Vários Cargos"
  variosCargos: boolean;
  escolaridades: Escolaridade[];
  inscricaoInicio: string | null; // AAAA-MM-DD
  inscricaoFim: string | null;
  situacao: Situacao;
}

export interface Concurso extends ItemListagem {
  id: string;
  chave: string; // órgão normalizado + UF (para reconhecer o mesmo concurso se o link mudar)
  esfera: Esfera;
  tipo: Tipo;
  areas: string[];
  busca: string[];
  hash: string;
}

export const UF_POR_NOME: Record<string, string> = {
  NACIONAL: "BR", ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE",
  "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA", "MATO GROSSO": "MT",
  "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", PARA: "PA", PARAIBA: "PB", PARANA: "PR",
  PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN",
  "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP",
  SERGIPE: "SE", TOCANTINS: "TO",
};
export const SIGLAS_UF = new Set(Object.values(UF_POR_NOME));

/** Minúsculas, sem acento e sem pontuação — para comparar e buscar. */
export const normalizarTexto = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "R$ 10.354,29" → 10354.29 */
export function lerDinheiro(s: string): number | null {
  const m = /R\$\s*([\d.]+(?:,\d{1,2})?)/.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "27.279 vagas" → 27279 */
export function lerVagas(s: string): number | null {
  const m = /([\d.]+)\s+vagas?\b/i.exec(s);
  return m ? Number(m[1].replace(/\./g, "")) : null;
}

const ESCOLARIDADES: Array<[RegExp, Escolaridade]> = [
  [/fundamental|alfabetizad/, "fundamental"],
  [/medio/, "medio"],
  [/tecnic/, "tecnico"],
  [/superior|graduac|pos /, "superior"],
];
export function lerEscolaridades(s: string): Escolaridade[] {
  const n = normalizarTexto(s);
  return ESCOLARIDADES.filter(([re]) => re.test(n)).map(([, e]) => e);
}

const iso = (d: number, m: number, a: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Período de inscrição da coluna de datas do PCI:
 * "30/11/2026" · "10/11 a 30/11/2026" · "10 a 30/11/2026" · "Prorrogado até 05/12/2026" · "Suspenso".
 */
export function lerPeriodo(s: string): { inicio: string | null; fim: string | null; situacao: Situacao } {
  const t = s.replace(/\s+/g, " ").trim();
  const situacao: Situacao = /suspens/i.test(t) ? "suspenso" : /prorrog/i.test(t) ? "prorrogado" : /reabert/i.test(t) ? "reaberto" : "normal";
  const fimM = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(t);
  if (!fimM) return { inicio: null, fim: null, situacao };
  const [dF, mF, aF] = [Number(fimM[1]), Number(fimM[2]), Number(fimM[3])];
  const fim = iso(dF, mF, aF);
  const antes = t.slice(0, fimM.index);
  let inicio: string | null = null;
  const comMes = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*a\s*$/.exec(antes);
  const soDia = /(?:^|\s)(\d{1,2})\s*a\s*$/.exec(antes);
  if (comMes) {
    const [d, m] = [Number(comMes[1]), Number(comMes[2])];
    const a = comMes[3] ? Number(comMes[3]) : m > mF ? aF - 1 : aF; // "20/12 a 10/01/2027"
    inicio = iso(d, m, a);
  } else if (soDia) {
    inicio = iso(Number(soDia[1]), mF, aF);
  }
  return { inicio, fim, situacao };
}

/** Cidade (só de órgãos municipais): do órgão ("Prefeitura de Leme", "Câmara Municipal de Itu") ou do título ("IPREJUN de Jundiaí - SP …"). */
export function lerCidade(orgao: string, titulo: string, esfera: Esfera): string | null {
  if (esfera !== "municipal") return null;
  const doOrgao = /^(?:Prefeitura|C[âa]mara)(?:\s+Municipal)?(?:\s+da\s+Est[âa]ncia(?:\s+Tur[íi]stica|\s+Hidromineral|\s+Balne[áa]ria)?)?\s+(?:de|do|da)\s+(.+)$/i.exec(orgao.trim());
  if (doOrgao) return doOrgao[1].replace(/\s+-\s+[A-Z]{2}$/, "").trim();
  const doTitulo = [...titulo.matchAll(/\b(?:de|do|da|em)\s+([A-ZÀ-Ú][\wÀ-ú'.]*(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][\wÀ-ú'.]*)*)\s+-\s+[A-Z]{2}\b/g)].at(-1);
  return doTitulo ? doTitulo[1].trim() : null;
}

const FEDERAL = /\b(federal|minist[eé]rio|ibge|inss|ibama|icmbio|anvisa|anatel|aneel|ana\b|incra|funai|fiocruz|embrapa|banco do brasil|caixa econ|petrobras|correios|ex[eé]rcito|marinha|aeron[aá]utica|for[çc]a a[eé]rea|trf\b|trt\b|tre\b|tst\b|stj\b|stf\b|tse\b|tcu\b|cgu\b|agu\b|pol[ií]cia federal|pol[ií]cia rodovi[aá]ria federal|receita federal|senado|c[aâ]mara dos deputados|dpu\b|mpu\b|mpf\b|bndes|bacen|banco central|ebserh|universidade federal|instituto federal|cefet)/i;
const MUNICIPAL = /\b(prefeitura|c[aâ]mara municipal|c[aâ]mara (?:da est[aâ]ncia|de|do|da)\b(?! deputados)|municipal|munic[ií]pio|saae|semae|daae|cons[oó]rcio intermunicipal|guarda civil)/i;
const ESTADUAL = /\b(estado d[eoa]|estadual|governo d[eoa]|secretaria de estado|assembleia legislativa|pol[ií]cia (militar|civil|penal)|corpo de bombeiros|tribunal de justi[çc]a|tj[a-z]{2}\b|tce\b|mpe\b|minist[eé]rio p[uú]blico d[eoa] |defensoria p[uú]blica d[eoa]|detran|seduc|sesa|universidade estadual|uerj|usp\b|unicamp|unesp)/i;

export function lerEsfera(orgao: string, uf: string): Esfera {
  if (MUNICIPAL.test(orgao)) return "municipal";
  if (FEDERAL.test(orgao) || uf === "BR") return "federal";
  if (ESTADUAL.test(orgao)) return "estadual";
  return "outra";
}

export function lerTipo(titulo: string): Tipo {
  const t = normalizarTexto(titulo);
  if (/residencia/.test(t)) return "residencia";
  if (/estagi/.test(t)) return "estagio";
  if (/processo seletivo|selecao simplificada|contratacao temporaria|psicologic? seletivo|chamamento/.test(t)) return "processo_seletivo";
  return "concurso";
}

/** Áreas por palavras-chave nos cargos e no órgão (pode ter mais de uma). */
const AREAS: Array<[string, RegExp]> = [
  ["ti", /\b(tecnologia da informacao|informatica|\bti\b|sistemas|programador|desenvolvedor|analista de dados|ciencia de dados|suporte tecnico|redes|seguranca da informacao|infraestrutura de ti)\b/],
  ["saude", /\b(medic|enferm|farmac|odont|dentista|fisioterap|psicolog|nutricion|fonoaudiolog|biomedic|agente comunitario de saude|agente de saude|radiolog|hospital|saude|veterinari|terapeuta)\w*/],
  ["educacao", /\b(professor|docente|pedagog|educador|monitor escolar|auxiliar de classe|coordenador pedagogico|supervisor escolar|orientador educacional|secretario escolar|educacao)\w*/],
  ["seguranca", /\b(soldado|policia|policial|guarda|bombeiro|agente penitenciario|policial penal|agente de seguranca|vigilante|investigador|delegado|escrivao|perito)\w*/],
  ["juridico", /\b(procurador|advogad|juridic|analista judiciario|tecnico judiciario|oficial de justica|escrevente|tribunal|defensor|promotor|magistrat|juiz|cartorio|notari)\w*/],
  ["fiscal", /\b(auditor|fiscal|tributo|tributari|receita|arrecadacao|controlador interno|controle interno)\w*/],
  ["administrativo", /\b(assistente administrativo|auxiliar administrativo|agente administrativo|tecnico administrativo|oficial administrativo|secretari[oa]|recepcionista|escriturario|almoxarif|administrador|analista administrativo)\w*/],
  ["contabil", /\b(contador|contabil|contabilidade|economista|financeir|orcament)\w*/],
  ["engenharia", /\b(engenheir|arquitet|agronom|geolog|topograf|agrimensor)\w*/],
  ["assistencia_social", /\b(assistente social|servico social|cuidador|educador social|conselheiro tutelar|psicossocial)\w*/],
  ["operacional", /\b(servente|motorista|gari|auxiliar de servicos|limpeza|operario|pedreiro|eletricista|mecanico|operador de maquinas|vigia|merendeir|cozinheir|zelador|jardineiro|coveiro|braçal|bracal)\w*/],
  ["legislativo", /\b(camara|assembleia|legislativ|senado)\w*/],
  ["bancario", /\b(banco|bancari|caixa economica|escriturario)\w*/],
];

export function lerAreas(cargos: string[], orgao: string): string[] {
  const t = normalizarTexto(`${cargos.join(" ")} ${orgao}`);
  return AREAS.filter(([, re]) => re.test(t)).map(([a]) => a);
}

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "para", "com", "i", "ii", "iii"]);
export function tokensDeBusca(...partes: Array<string | null | undefined>) {
  const t = new Set<string>();
  for (const p of partes) for (const w of normalizarTexto(p ?? "").split(" ")) if (w.length > 1 && !PALAVRAS_VAZIAS.has(w)) t.add(w);
  return [...t].slice(0, 120);
}

const sha = (s: string, n = 16) => createHash("sha256").update(s).digest("hex").slice(0, n);

/** Lê a listagem do PCI. Lança erro se a página não tiver a estrutura esperada. */
export function lerListagemPci(html: string): ItemListagem[] {
  const $ = cheerio.load(html);
  const itens: ItemListagem[] = [];
  let uf = "BR";
  $(".uf, .ca").each((_, el) => {
    const e = $(el);
    if (e.hasClass("uf")) {
      uf = UF_POR_NOME[normalizarTexto(e.text()).toUpperCase()] ?? uf;
      return;
    }
    const a = e.children("a").first();
    const href = a.attr("href") ?? e.closest("[data-url]").attr("data-url") ?? "";
    const orgao = a.text().replace(/\s+/g, " ").trim();
    if (!orgao || !/^https:\/\/www\.pciconcursos\.com\.br\//.test(href)) return;
    const titulo = (a.attr("title") ?? orgao).replace(/\s+/g, " ").trim();
    const ufItem = e.find(".cc").text().trim();
    const cd = e.find(".cd");
    const resumo = cd.clone().children().remove().end().text().replace(/\s+/g, " ").trim(); // "29 vagas até R$ 13.359,44"
    const spans = cd.find("span");
    const escolaridadeTxt = spans.find("span").last().text().trim() || "";
    const cargosTxt = spans.first().clone().children().remove().end().text().replace(/\s+/g, " ").trim();
    const variosCargos = /v[áa]rios cargos/i.test(cargosTxt);
    const cargos = variosCargos ? [] : cargosTxt.split(/\s*,\s*/).map((c) => c.trim()).filter(Boolean);
    const periodo = lerPeriodo(e.find(".ce").text());
    const ufFinal = SIGLAS_UF.has(ufItem) ? ufItem : uf;
    itens.push({
      orgao,
      titulo,
      link: href,
      uf: ufFinal,
      cidade: lerCidade(orgao, titulo, lerEsfera(orgao, ufFinal)),
      vagas: lerVagas(resumo),
      cadastroReserva: /cadastro\s+(de\s+)?reserva/i.test(resumo),
      salarioMax: lerDinheiro(resumo),
      cargos,
      variosCargos,
      escolaridades: lerEscolaridades(escolaridadeTxt),
      inscricaoInicio: periodo.inicio,
      inscricaoFim: periodo.fim,
      situacao: periodo.situacao,
    });
  });
  if (!itens.length) throw new Error("listagem do PCI sem concursos (mudou o layout?)");
  return itens;
}

/** Completa o item com id, chave, esfera, tipo, áreas, tokens e hash do conteúdo. */
export function enriquecer(item: ItemListagem, desempate = false): Concurso {
  const chave = `${normalizarTexto(item.orgao)}|${item.uf}`;
  const assinaturaCargos = normalizarTexto(item.cargos.join(" ") || item.escolaridades.join(" ")).slice(0, 60);
  // Dois processos do mesmo órgão com os mesmos cargos: desempata pelo link
  const id = sha(`${chave}|${assinaturaCargos}${desempate ? `|${item.link}` : ""}`);
  const conteudo = [
    item.vagas, item.cadastroReserva, item.salarioMax, item.cargos.join(";"), item.escolaridades.join(";"),
    item.inscricaoInicio, item.inscricaoFim, item.situacao, item.link,
  ].join("|");
  return {
    ...item,
    id,
    chave,
    esfera: lerEsfera(item.orgao, item.uf),
    tipo: lerTipo(item.titulo),
    areas: lerAreas(item.cargos, item.orgao),
    busca: tokensDeBusca(item.orgao, item.cidade, item.cargos.join(" "), item.uf, item.titulo),
    hash: sha(conteudo, 12),
  };
}

/** Situação calculada na hora: inscrições abertas, em breve, encerradas… */
export function situacaoAgora(c: { inscricaoInicio: string | null; inscricaoFim: string | null; situacao: Situacao }, hoje = hojeBrasilia()) {
  if (c.situacao === "suspenso") return "suspenso";
  if (c.inscricaoInicio && hoje < c.inscricaoInicio) return "em_breve";
  if (c.inscricaoFim && hoje > c.inscricaoFim) return "encerrado";
  if (c.inscricaoFim) return "aberto";
  return "sem_data";
}

export const hojeBrasilia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD

/** Cargos da página do concurso no PCI: itens "Enfermeiro (24 vagas)" / "Professor (cadastro reserva)". */
export function lerCargosDaNoticia(html: string): Array<{ nome: string; vagas: number | null }> {
  const $ = cheerio.load(html);
  const artigo = $("article#noticia").first();
  const cargos: Array<{ nome: string; vagas: number | null }> = [];
  const vistos = new Set<string>();
  (artigo.length ? artigo : $("body")).find("li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    const m = /^(.{2,120}?)\s*\((?:\s*(\d[\d.]*)\s*vagas?|[^)]*(?:cadastro|reserva|CR)[^)]*)[^)]*\)/i.exec(t);
    if (!m) return;
    const nome = m[1].replace(/[:–-]\s*$/, "").trim();
    const chave = normalizarTexto(nome);
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    cargos.push({ nome, vagas: m[2] ? Number(m[2].replace(/\./g, "")) : null });
  });
  return cargos.slice(0, 120);
}
