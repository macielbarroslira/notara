import * as cheerio from "cheerio";
import { lerEscolaridades, normalizarTexto, type Escolaridade } from "./concursos.js";

/**
 * Ficha do concurso a partir da página do concurso no PCI (fase 2).
 * Extração determinística (sem IA) das frases padronizadas da notícia: inscrições, taxa, isenção,
 * provas, banca, jornada, regime, validade, benefícios, etapas e cargos com vagas.
 * Guardamos só os fatos extraídos (datas, valores, nomes) — não o texto da notícia.
 */

export const VERSAO_FICHA = 2;

export type TipoData =
  | "inscricao"
  | "isencao"
  | "pagamento"
  | "prova_objetiva"
  | "prova_discursiva"
  | "prova_pratica"
  | "taf"
  | "titulos"
  | "avaliacao_psicologica"
  | "prova";

export interface DataCronograma {
  tipo: TipoData;
  data: string; // AAAA-MM-DD (início, ou a data única)
  fim?: string; // AAAA-MM-DD (períodos)
  hora?: string; // "23h59" (hora final, quando informada)
}

export interface CargoFicha {
  nome: string;
  vagas: number | null;
  cr: boolean;
}

export interface Ficha {
  versao: number;
  publicadoEm: string | null; // data da notícia
  noticia: "abertura" | "retificacao" | "prorrogacao" | "reabertura" | "suspensao" | "resultado" | "outra";
  banca: string | null;
  siteInscricao: string | null;
  cronograma: DataCronograma[];
  taxa: { min: number; max: number } | null;
  salario: { min: number; max: number } | null;
  jornada: { min: number; max: number } | null;
  regime: "estatutario" | "clt" | "temporario" | null;
  validade: { meses: number; prorrogavel: boolean } | null;
  etapas: string[];
  beneficios: string[];
  escolaridades: Escolaridade[];
  cargos: CargoFicha[];
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const iso = (d: number, m: number, a: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Todas as datas "D de mês de AAAA" de um trecho, em ordem (inclui "nos dias 26 e 27 de outubro de 2026"). */
export function datasDoTexto(trecho: string): string[] {
  const t = normalizarTexto(trecho.replace(/1º/g, "1"));
  const datas: string[] = [];
  const re = /\b(\d{1,2})(?:\s+e\s+(\d{1,2}))?\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/g;
  let m: RegExpExecArray | null;
  const pendentes: Array<[number, number]> = [];
  while ((m = re.exec(t))) {
    const mes = MESES.indexOf(m[3]) + 1;
    if (!m[4]) {
      // "de 10 de outubro a 5 de novembro de 2026": o ano vem na próxima data
      pendentes.push([Number(m[1]), mes]);
      if (m[2]) pendentes.push([Number(m[2]), mes]);
      continue;
    }
    const ano = Number(m[4]);
    for (const [d, mm] of pendentes.splice(0)) datas.push(iso(d, mm, mm > mes ? ano - 1 : ano));
    datas.push(iso(Number(m[1]), mes, ano));
    if (m[2]) datas.push(iso(Number(m[2]), mes, ano));
  }
  return datas;
}

const valores = (s: string) =>
  [...s.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/g)].map((m) => Number(m[1].replace(/\./g, "").replace(",", "."))).filter((n) => n > 0);
const faixa = (ns: number[]) => (ns.length ? { min: Math.min(...ns), max: Math.max(...ns) } : null);

/** Bancas conhecidas: pelo domínio do site de inscrição ou pelo nome citado. */
const BANCAS: Array<[RegExp, string]> = [
  [/cebraspe|cespe/, "Cebraspe"],
  [/fgv|getulio vargas/, "FGV"],
  [/vunesp/, "Vunesp"],
  [/concursosfcc|carlos chagas|\bfcc\b/, "FCC"],
  [/cesgranrio/, "Cesgranrio"],
  [/ibfc/, "IBFC"],
  [/ibade/, "Ibade"],
  [/idecan/, "Idecan"],
  [/aocp/, "Instituto AOCP"],
  [/quadrix/, "Quadrix"],
  [/consulplan/, "Consulplan"],
  [/consulpam/, "Consulpam"],
  [/fundatec/, "Fundatec"],
  [/objetivas? concursos|objetivaconcursos/, "Objetiva Concursos"],
  [/ibgp/, "IBGP"],
  [/institutomais|instituto mais/, "Instituto Mais"],
  [/avancasp|avanca sp/, "Avança SP"],
  [/fepese/, "Fepese"],
  [/idib/, "IDIB"],
  [/selecon/, "Selecon"],
  [/legalle/, "Legalle"],
  [/access/, "Instituto Access"],
  [/gestaodeconcursos|fundep/, "Fundep"],
  [/fadenor|cotec/, "Cotec/Fadenor"],
  [/abconcursos/, "AB Concursos"],
  [/sigmarh|sigma rh/, "Sigma RH"],
  [/ibam/, "Ibam"],
  [/igeduc/, "Igeduc"],
  [/rboconcursos|\brbo\b/, "RBO"],
  [/omniconcursos|omni/, "Omni"],
  [/institutoibdo|ibdo/, "IBDO"],
  [/fafipa/, "Fafipa"],
  [/unesc/, "Unesc"],
  [/amauc/, "Amauc"],
  [/furb/, "Furb"],
  [/cetrede/, "Cetrede"],
  [/upenet|iaupe/, "UPENET/IAUPE"],
  [/nossorumo/, "Nosso Rumo"],
  [/institutoexcelencia|excelencia/, "Instituto Excelência"],
  [/integri/, "Integri"],
  [/shdias/, "SHDias"],
  [/msconcursos|metro capital/, "MS Concursos"],
];

function identificarBanca(texto: string, site: string | null) {
  const alvo = normalizarTexto(`${site ?? ""} ${texto}`);
  for (const [re, nome] of BANCAS) if (re.test(alvo)) return nome;
  if (site) {
    const base = site.replace(/^www\./, "").split(".")[0];
    if (base && !/gov|prefeitura|camara|^pm|tj|sei/.test(base)) return base.toUpperCase().length <= 6 ? base.toUpperCase() : base[0].toUpperCase() + base.slice(1);
  }
  return null;
}

const ETAPAS: Array<[RegExp, string]> = [
  [/prova(s)? objetiva/, "Prova objetiva"],
  [/discursiva/, "Prova discursiva"],
  [/redacao/, "Redação"],
  [/prova(s)? de titulos|analise de titulos|avaliacao de titulos|titulos/, "Títulos"],
  [/prova(s)? pratica/, "Prova prática"],
  [/aptidao fisica|\btaf\b|teste fisico/, "Teste físico (TAF)"],
  [/avaliacao psicologica|exame psicotecnico/, "Avaliação psicológica"],
  [/investigacao social/, "Investigação social"],
  [/curso de formacao/, "Curso de formação"],
  [/entrevista/, "Entrevista"],
  [/analise curricular|analise de curriculo/, "Análise curricular"],
  [/exame medico|exames medicos/, "Exame médico"],
  [/heteroidentificacao/, "Heteroidentificação (cotas)"],
];

const NUMEROS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, doze: 12, dezoito: 18, vinte: 20 };

function tipoDaProva(f: string): TipoData {
  if (/aptidao fisica|\btaf\b|teste fisico/.test(f)) return "taf";
  if (/pratica/.test(f)) return "prova_pratica";
  if (/discursiva|redacao/.test(f) && !/objetiva/.test(f)) return "prova_discursiva";
  if (/titulos/.test(f) && !/objetiva/.test(f)) return "titulos";
  if (/psicologic/.test(f)) return "avaliacao_psicologica";
  if (/objetiva/.test(f)) return "prova_objetiva";
  return "prova";
}

/** Cargo de um item da lista: "Enfermeiro (24 vagas)", "X (4 vagas imediatas + 9 CR)", "Y (CR)". */
export function lerCargo(t: string): CargoFicha | null {
  const m = /^(.{2,160}?)\s*\(([^)]*(?:vaga|cadastro|reserva|\bCR\b)[^)]*)\)\s*$/i.exec(t.replace(/\s+/g, " ").trim());
  if (!m) return null;
  const dentro = m[2];
  const n = /(\d[\d.]*)\s*vagas?/i.exec(dentro);
  return {
    nome: m[1].replace(/[:–-]\s*$/, "").trim(),
    vagas: n ? Number(n[1].replace(/\./g, "")) : null,
    cr: /cadastro|reserva|\bCR\b/i.test(dentro),
  };
}

const PROPAGANDA = /podcast|apostila|material b[aá]sico|escute|d[eê] o play|ou[cç]a|quer se aprofundar|prepare-se|domine os fundamentos/i;

export function lerFichaPci(html: string): Ficha {
  const $ = cheerio.load(html);
  const artigo = $("article#noticia").first().length ? $("article#noticia").first() : $("body");
  const titulo = normalizarTexto(artigo.find("h1").first().text() || $("title").text());

  // Cargos: itens de lista no formato "Cargo (N vagas)"
  const cargos: CargoFicha[] = [];
  const vistos = new Set<string>();
  artigo.find("li").each((_, el) => {
    const c = lerCargo($(el).text());
    if (!c) return;
    const k = normalizarTexto(c.nome);
    if (k && !vistos.has(k)) {
      vistos.add(k);
      cargos.push(c);
    }
  });

  // Frases dos parágrafos (sem a lista de cargos e sem propaganda)
  const frases: string[] = [];
  artigo.find("p").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t || PROPAGANDA.test(t)) return;
    for (const f of t.split(/(?<=[.;])\s+(?=[A-ZÀ-Ú0-9])/)) if (f.length > 8) frases.push(f);
  });
  const texto = frases.join(" ");

  const publicado = /(?:segunda|terca|quarta|quinta|sexta)(?:-feira)?|sabado|domingo/.test(normalizarTexto(artigo.text()))
    ? datasDoTexto(/(Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo)[^,]*,\s*\d{1,2} de \w+ de \d{4}/i.exec(artigo.text())?.[0] ?? "")[0] ?? null
    : null;

  const noticia: Ficha["noticia"] = /retifica/.test(titulo)
    ? "retificacao"
    : /prorroga/.test(titulo)
      ? "prorrogacao"
      : /reabre|reabert/.test(titulo)
        ? "reabertura"
        : /suspen/.test(titulo)
          ? "suspensao"
          : /resultado|gabarito|homolog|convoca|classifica/.test(titulo)
            ? "resultado"
            : /abre|publica edital|oferece|lanca|divulga edital|inscricoes abertas/.test(titulo)
              ? "abertura"
              : "outra";

  const cronograma: DataCronograma[] = [];
  let taxa: number[] = [];
  let salarios: number[] = [];
  let site: string | null = null;
  const horas = (f: string) => [...f.matchAll(/(\d{1,2})h(\d{2})?/g)].map((m) => `${m[1]}h${m[2] ?? ""}`);

  for (const f of frases) {
    const n = normalizarTexto(f);
    const datas = datasDoTexto(f);

    const s = /\b(?:site|portal|endere[cç]o)\s+(?:eletr[oô]nico\s+)?(?:da\s+|do\s+)?(?:https?:\/\/)?((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i.exec(f);
    if (s && !site && /inscri/.test(n)) site = s[1].toLowerCase();

    if (/isencao|reducao/.test(n) && datas.length && !/inscricoes? (?:serao|poderao|devem|estarao|estao)/.test(n)) {
      cronograma.push({ tipo: "isencao", data: datas[0], ...(datas.length > 1 ? { fim: datas.at(-1) } : {}) });
    } else if (/inscri/.test(n) && datas.length && !/isencao|reducao/.test(n)) {
      const h = horas(f);
      if (/prorrogad|ate o dia|ate \d/.test(n) && datas.length === 1) cronograma.push({ tipo: "inscricao", data: datas[0], fim: datas[0], ...(h.length ? { hora: h.at(-1) } : {}) });
      else cronograma.push({ tipo: "inscricao", data: datas[0], ...(datas.length > 1 ? { fim: datas.at(-1) } : {}), ...(h.length ? { hora: h.at(-1) } : {}) });
    }
    if (/pagamento|boleto|recolhimento/.test(n) && datas.length && !/isencao/.test(n)) {
      cronograma.push({ tipo: "pagamento", data: datas.at(-1)! });
    }
    if (/prova|aplicacao|exame|avaliacao|teste/.test(n) && /previst|realizad|ocorrer|aplicad|marcad|agendad|sera no dia|serao no dia/.test(n) && datas.length) {
      const tipo = tipoDaProva(n);
      for (const d of datas) if (!cronograma.some((c) => c.tipo === tipo && c.data === d)) cronograma.push({ tipo, data: d });
    }
    if (/\btaxa\b|valor da inscricao/.test(n) && !/reducao de \d+%/.test(n)) taxa = taxa.concat(valores(f));
    if (/remunera|salario|vencimento|ganhos|subsidio/.test(n) && !/^(os )?beneficios|^sao oferecidos|^os (servidores|contratados)/.test(n) && !/\btaxa\b/.test(n)) {
      salarios = salarios.concat(valores(f.replace(/(aux[ií]lio|vale|abono|adicional)[^,;.]*R\$\s*[\d.,]+/gi, "")));
    }
  }

  const jornadas = [...normalizarTexto(texto).matchAll(/(\d{1,2})\s*horas semanais/g)].map((m) => Number(m[1]));
  const nt = normalizarTexto(texto);
  const regime: Ficha["regime"] = /\bclt\b|consolidacao das leis do trabalho|celetista/.test(nt)
    ? "clt"
    : /estatutari/.test(nt)
      ? "estatutario"
      : /temporari|contrato por tempo determinado/.test(nt)
        ? "temporario"
        : null;
  const val = /validade de (\d+|um|uma|dois|duas|tres|quatro|seis|doze|dezoito|vinte) (anos?|meses)/.exec(nt);
  const validade = val
    ? {
        meses: (Number(val[1]) || NUMEROS[val[1]] || 0) * (val[2].startsWith("ano") ? 12 : 1),
        prorrogavel: /prorroga/.test(nt.slice(nt.indexOf(val[0]), nt.indexOf(val[0]) + 300)),
      }
    : null;
  const beneficios = [
    ...new Set(
      [...texto.matchAll(/\b(aux[ií]lio[- ][a-zà-ú/-]+(?:[- ][a-zà-ú]+)?|vale[- ](?:alimenta[çc][aã]o|refei[çc][aã]o|transporte)|abono [a-zà-ú ]{3,25}?(?= de| e |,|\.)|adicional de [a-zà-ú]+|plano de sa[uú]de|cesta b[aá]sica)/gi)].map(
        (m) => {
          let b = m[1].toLowerCase().replace(/\s+/g, " ").trim();
          while (/\s(de|em|no|na|do|da|um|uma|para|e|ao|aos)$/.test(b)) b = b.replace(/\s\S+$/, "");
          return b;
        },
      ),
    ),
  ]
    .filter((b) => b.length >= 8 && !/^adicional( de)?$/.test(b))
    .slice(0, 12);
  const etapas = ETAPAS.filter(([re]) => re.test(nt)).map(([, e]) => e);

  // Período de inscrição: fica só o mais completo
  const inscricoes = cronograma.filter((c) => c.tipo === "inscricao");
  if (inscricoes.length > 1) {
    const melhor = inscricoes.reduce((a, b) => ((b.fim ?? b.data) >= (a.fim ?? a.data) ? b : a));
    for (const c of inscricoes) if (c !== melhor) cronograma.splice(cronograma.indexOf(c), 1);
  }
  cronograma.sort((a, b) => a.data.localeCompare(b.data));

  return {
    versao: VERSAO_FICHA,
    publicadoEm: publicado,
    noticia,
    banca: identificarBanca(texto, site),
    siteInscricao: site,
    cronograma,
    taxa: faixa(taxa.filter((v) => v < 1000)),
    salario: faixa(salarios.filter((v) => v >= 300)),
    jornada: faixa(jornadas.filter((h) => h > 0 && h <= 60)),
    regime,
    validade,
    etapas,
    beneficios,
    escolaridades: lerEscolaridades(texto.split(/cargos? de:/i)[0] ?? ""),
    cargos: cargos.slice(0, 150),
  };
}

/** O que mudou entre duas fichas — resumo do evento (ex.: retificação). */
export function diferencasFicha(a: Ficha | null, b: Ficha): string[] {
  if (!a) return [];
  const out: string[] = [];
  const data = (s?: string) => (s ? s.split("-").reverse().join("/") : "?");
  const tipos: Partial<Record<TipoData, string>> = {
    inscricao: "Inscrições",
    isencao: "Isenção",
    pagamento: "Pagamento",
    prova_objetiva: "Prova objetiva",
    prova_discursiva: "Prova discursiva",
    prova_pratica: "Prova prática",
    taf: "Teste físico",
    titulos: "Títulos",
    prova: "Prova",
  };
  for (const [tipo, nome] of Object.entries(tipos)) {
    const x = a.cronograma.find((c) => c.tipo === tipo);
    const y = b.cronograma.find((c) => c.tipo === tipo);
    if (!y) continue;
    const fx = x ? (x.fim ?? x.data) : null;
    const fy = y.fim ?? y.data;
    if (fx !== fy) out.push(x ? `${nome}: ${data(fx ?? undefined)} → ${data(fy)}` : `${nome}: ${data(fy)}`);
  }
  const vagas = (f: Ficha) => f.cargos.reduce((s, c) => s + (c.vagas ?? 0), 0);
  if (vagas(a) !== vagas(b) && vagas(b)) out.push(`Vagas: ${vagas(a)} → ${vagas(b)}`);
  const novos = b.cargos.filter((c) => !a.cargos.some((x) => normalizarTexto(x.nome) === normalizarTexto(c.nome)));
  if (novos.length && a.cargos.length) out.push(`Cargo(s) novo(s): ${novos.map((c) => c.nome).slice(0, 3).join(", ")}`);
  if (a.taxa?.max !== b.taxa?.max && b.taxa) out.push(`Taxa até R$ ${b.taxa.max.toLocaleString("pt-BR")}`);
  return out;
}
