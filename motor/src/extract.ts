import * as cheerio from "cheerio";
import { ErroCaptura, fetchSeguro } from "./fetcher.js";
import { renderizar } from "./navegador.js";
import type { ConfigCaptura } from "./types.js";

export interface ResultadoCaptura {
  texto: string;
  titulo: string | null;
  status: number;
  screenshot?: { jpeg: Buffer; largura: number; altura: number };
  /** true quando a página precisou do navegador (JavaScript). */
  usouNavegador?: boolean;
}

const BLOCOS =
  "p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,tr,table,section,article,header,footer,nav,aside,main,blockquote,pre,dt,dd,form,fieldset,figure,figcaption";

/** Limpa espaços e linhas vazias, mantendo uma linha por bloco. */
export function normalizar(texto: string): string {
  return texto
    .split("\n")
    .map((l) => l.replace(/[­​-‍﻿]/g, "").replace(/[\s ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function textoDoHtml($: cheerio.CheerioAPI, alvo: ReturnType<cheerio.CheerioAPI>): string {
  alvo.find("br").replaceWith("\n");
  alvo.find(BLOCOS).each((_, el) => {
    $(el).prepend("\n").append("\n");
  });
  alvo.find("td,th").append(" \t ");
  return alvo
    .map((_, el) => $(el).text())
    .get()
    .join("\n");
}

export function extrairHtml(html: string, cfg: ConfigCaptura): { texto: string; titulo: string | null } {
  const $ = cheerio.load(html);
  const titulo = $("title").first().text().trim() || null;
  $("script,style,noscript,template,svg,iframe,link,meta").remove();
  for (const sel of cfg.excluir ?? []) {
    if (!sel.trim()) continue;
    try {
      $(sel).remove();
    } catch {
      throw new ErroCaptura(`Seletor para excluir inválido: ${sel}`);
    }
  }

  if (cfg.tipo === "elemento") {
    const seletores = (cfg.seletores ?? []).map((s) => s.trim()).filter(Boolean);
    if (seletores.length === 0) throw new ErroCaptura("Informe pelo menos um seletor CSS");
    const blocos: string[] = [];
    for (const sel of seletores) {
      let encontrados;
      try {
        encontrados = $(sel);
      } catch {
        throw new ErroCaptura(`Seletor CSS inválido: ${sel}`);
      }
      if (encontrados.length === 0) continue;
      blocos.push(textoDoHtml($, encontrados.wrap("<div></div>").parent()));
    }
    if (blocos.length === 0) throw new ErroCaptura("O seletor não encontrou nenhum elemento na página");
    return { texto: normalizar(blocos.join("\n")), titulo };
  }

  // Página inteira: menus, cabeçalho e rodapé mudam muito e geram alertas falsos
  $(MENUS).remove();
  const corpo = $("main").length === 1 ? $("main") : $("body").length ? $("body") : $.root();
  return { texto: normalizar(textoDoHtml($, corpo)), titulo };
}

const MENUS =
  "nav, header, footer, [role=navigation], [role=banner], [role=contentinfo], .skip-link, a[href='#main'], a[href='#conteudo']";

function extrairFeed(xml: string): { texto: string; titulo: string | null } {
  const $ = cheerio.load(xml, { xml: true });
  const titulo = $("channel > title, feed > title").first().text().trim() || null;
  const itens = $("item, entry")
    .map((_, el) => {
      const item = $(el);
      const t = item.children("title").first().text().trim();
      const link =
        item.children("link").first().attr("href") || item.children("link").first().text().trim();
      return [t, link].filter(Boolean).join(" — ");
    })
    .get()
    .filter(Boolean);
  if (itens.length === 0) throw new ErroCaptura("Nenhum item encontrado no feed RSS/Atom");
  return { texto: itens.join("\n"), titulo };
}

/** Serialização JSON com chaves ordenadas (para comparar sem falso positivo). */
export function jsonEstavel(v: unknown): string {
  const ordenar = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(ordenar)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x as object)
              .sort()
              .map((k) => [k, ordenar((x as Record<string, unknown>)[k])]),
          )
        : x;
  return JSON.stringify(ordenar(v), null, 2);
}

/** Caminho simples: `dados.itens[0].preco`. */
export function lerCaminho(obj: unknown, caminho?: string): unknown {
  if (!caminho?.trim()) return obj;
  const partes = caminho
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let atual: unknown = obj;
  for (const p of partes) {
    if (atual == null || typeof atual !== "object") {
      throw new ErroCaptura(`Caminho JSON não encontrado: ${caminho}`);
    }
    atual = (atual as Record<string, unknown>)[p];
  }
  if (atual === undefined) throw new ErroCaptura(`Caminho JSON não encontrado: ${caminho}`);
  return atual;
}

async function viaNavegador(cfg: ConfigCaptura, opts: { capturarTela?: boolean }): Promise<ResultadoCaptura> {
  const r = await renderizar(cfg.url, { esperarMs: cfg.esperarMs, capturarTela: opts.capturarTela });
  if (r.status >= 400) throw new ErroCaptura(`O site respondeu HTTP ${r.status}`);
  const { texto, titulo } = extrairHtml(r.html, cfg);
  return { texto, titulo: titulo ?? r.titulo, status: r.status, screenshot: r.screenshot, usouNavegador: true };
}

/** Menos que isso na leitura simples = página provavelmente montada por JavaScript. */
const MIN_TEXTO_ESTATICO = 20;
const MAX_BYTES_PDF = 25 * 1024 * 1024;

const ehPdf = (r: { tipoConteudo: string; bytes: Uint8Array }) =>
  /application\/pdf/i.test(r.tipoConteudo) ||
  (r.bytes[0] === 0x25 && r.bytes[1] === 0x50 && r.bytes[2] === 0x44 && r.bytes[3] === 0x46); // "%PDF"

/** Texto de um PDF (todas as páginas), uma linha por linha do documento. */
export async function textoDoPdf(bytes: Uint8Array): Promise<{ texto: string; titulo: string | null; paginas: number }> {
  const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  } catch {
    throw new ErroCaptura("Não foi possível ler o PDF (arquivo inválido ou protegido)");
  }
  const { totalPages, text } = await extractText(doc, { mergePages: false });
  const meta = await getMeta(doc).catch(() => null);
  const titulo = (meta?.info as { Title?: string } | undefined)?.Title?.trim() || null;
  const texto = normalizar((text as string[]).join("\n"));
  if (!texto) throw new ErroCaptura("O PDF não tem texto (pode ser uma imagem escaneada)");
  return { texto, titulo, paginas: totalPages };
}

async function capturarPdf(url: string): Promise<ResultadoCaptura> {
  const r = await fetchSeguro(url, { maxBytes: MAX_BYTES_PDF });
  if (r.status >= 400) throw new ErroCaptura(`O site respondeu HTTP ${r.status}`);
  if (!ehPdf(r)) throw new ErroCaptura("O endereço não aponta para um arquivo PDF");
  const pdf = await textoDoPdf(r.bytes);
  return { texto: pdf.texto, titulo: pdf.titulo, status: r.status };
}

export async function capturar(cfg: ConfigCaptura, opts: { capturarTela?: boolean } = {}): Promise<ResultadoCaptura> {
  if (cfg.tipo === "pdf") return capturarPdf(cfg.url);

  const html = cfg.tipo === "pagina" || cfg.tipo === "elemento";
  if (html && cfg.usarNavegador) return viaNavegador(cfg, opts);

  if (html) {
    // 1º tenta a leitura simples (rápida e barata); se vier vazia, bloqueada
    // ou sem o elemento, abre num navegador de verdade automaticamente.
    try {
      const r = await fetchSeguro(cfg.url, { maxBytes: MAX_BYTES_PDF });
      // Link de página que na verdade é um PDF: lê o PDF
      if (r.status < 400 && cfg.tipo === "pagina" && ehPdf(r)) {
        const pdf = await textoDoPdf(r.bytes);
        return { texto: pdf.texto, titulo: pdf.titulo, status: r.status };
      }
      // Erro de verdade (404, 500…): não adianta abrir o navegador.
      // 401/403/429/503 costumam ser bloqueio de robô → tenta com navegador.
      if (r.status >= 400 && ![401, 403, 429, 503].includes(r.status)) {
        throw new ErroCaptura(`O site respondeu HTTP ${r.status}`);
      }
      if (r.status < 400) {
        const res = { ...extrairHtml(r.corpo, cfg), status: r.status };
        if (res.texto.trim().length >= MIN_TEXTO_ESTATICO) return res;
      }
    } catch (e) {
      if (!(e instanceof ErroCaptura) || /não permitid|inválid|HTTP (?!401|403|429|503)\d{3}/i.test(e.message)) throw e;
    }
    return viaNavegador(cfg, opts);
  }

  if (cfg.tipo === "uptime") {
    const inicio = Date.now();
    try {
      const r = await fetchSeguro(cfg.url, { maxBytes: 20 * 1024 * 1024 });
      const online = r.status < 400;
      return {
        texto: online ? `Online (HTTP ${r.status})` : `Fora do ar (HTTP ${r.status})`,
        titulo: null,
        status: r.status,
      };
    } catch (e) {
      return { texto: `Fora do ar: ${(e as Error).message} (${Date.now() - inicio} ms)`, titulo: null, status: 0 };
    }
  }

  const r = await fetchSeguro(cfg.url);
  if (r.status >= 400) throw new ErroCaptura(`O site respondeu HTTP ${r.status}`);

  if (cfg.tipo === "json") {
    let dados: unknown;
    try {
      dados = JSON.parse(r.corpo);
    } catch {
      throw new ErroCaptura("A resposta não é um JSON válido");
    }
    const valor = lerCaminho(dados, cfg.jsonPath);
    return { texto: typeof valor === "string" ? valor : jsonEstavel(valor), titulo: null, status: r.status };
  }

  return { ...extrairFeed(r.corpo), status: r.status };
}
