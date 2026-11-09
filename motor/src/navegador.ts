import dns from "node:dns/promises";
import net from "node:net";
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core";
import { ErroCaptura, ipPublico, validarUrl } from "./fetcher.js";

/** Navegador real (Chromium headless) para páginas que dependem de JavaScript. */

const LARGURA = 1280;
const ALTURA_JANELA = 900;
const TIMEOUT_NAVEGACAO = 30_000;
const CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let instancia: Promise<Browser> | null = null;

const CHROME_LINUX = "/usr/bin/google-chrome"; // já instalado nos runners do GitHub Actions

async function lancar(): Promise<Browser> {
  const args = ["--disable-dev-shm-usage", "--no-first-run", "--mute-audio", "--lang=pt-BR"];
  // Ubuntu 24.04 (runners do GitHub) bloqueia o sandbox do Chrome via AppArmor.
  // A página roda isolada mesmo assim: contexto próprio e filtro anti-SSRF em todas as requisições.
  if (process.platform === "linux") args.push("--no-sandbox");
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? (process.platform === "linux" ? CHROME_LINUX : CHROME_MAC),
    headless: true,
    args,
    defaultViewport: { width: LARGURA, height: ALTURA_JANELA },
  });
}

/** Fecha o navegador ao terminar a rodada do motor. */
export async function fecharNavegador() {
  const b = instancia ? await instancia.catch(() => null) : null;
  instancia = null;
  await b?.close().catch(() => {});
}

export async function obterNavegador(): Promise<Browser> {
  if (!instancia) {
    instancia = lancar().catch((e) => {
      instancia = null;
      throw new ErroCaptura(`Não foi possível iniciar o navegador: ${(e as Error).message}`);
    });
  }
  const b = await instancia;
  if (!b.connected) {
    instancia = null;
    return obterNavegador();
  }
  return b;
}

/** Verifica se um host resolve apenas para IPs públicos (com cache por página). */
function criarVerificador() {
  const cache = new Map<string, Promise<boolean>>();
  return (urlBruta: string): Promise<boolean> => {
    let url: URL;
    try {
      url = new URL(urlBruta);
    } catch {
      return Promise.resolve(false);
    }
    if (url.protocol === "data:" || url.protocol === "blob:") return Promise.resolve(true);
    if (url.protocol !== "http:" && url.protocol !== "https:") return Promise.resolve(false);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host)) return Promise.resolve(ipPublico(host));
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return Promise.resolve(false);
    if (!cache.has(host)) {
      cache.set(
        host,
        dns
          .lookup(host, { all: true })
          .then((lista) => lista.length > 0 && lista.every((a) => ipPublico(a.address)))
          .catch(() => false),
      );
    }
    return cache.get(host)!;
  };
}

export interface OpcoesRender {
  esperarMs?: number;
}

/** Abre a página com todas as requisições filtradas contra SSRF. O chamador fecha a página. */
export async function abrirPagina(urlBruta: string, opts: OpcoesRender = {}): Promise<{ page: Page; status: number }> {
  validarUrl(urlBruta);
  const navegador = await obterNavegador();
  const contexto = await navegador.createBrowserContext(); // isolado: sem cookies entre monitores
  const page = await contexto.newPage();
  page.on("close", () => contexto.close().catch(() => {}));

  const ua = (await navegador.userAgent()).replace("HeadlessChrome", "Chrome");
  await page.setUserAgent({ userAgent: ua });
  await page.setExtraHTTPHeaders({ "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" });

  const permitido = criarVerificador();
  let bloqueouPrincipal = false;
  await page.setRequestInterception(true);
  page.on("request", (req: HTTPRequest) => {
    if (req.isInterceptResolutionHandled()) return;
    if (req.resourceType() === "media") return void req.abort("blockedbyclient").catch(() => {});
    permitido(req.url())
      .then((ok) => {
        if (ok) return req.continue();
        if (req.isNavigationRequest() && req.frame() === page.mainFrame()) bloqueouPrincipal = true;
        return req.abort("blockedbyclient");
      })
      .catch(() => {});
  });

  let status = 0;
  try {
    const resp = await page.goto(urlBruta, { waitUntil: "networkidle2", timeout: TIMEOUT_NAVEGACAO });
    status = resp?.status() ?? 0;
  } catch (e) {
    if (bloqueouPrincipal) {
      await page.close();
      throw new ErroCaptura("Endereço não permitido");
    }
    // Timeout de "rede ociosa" é comum em sites com anúncios/analytics: segue com o que carregou.
    if (!(e as Error).name?.includes("Timeout")) {
      await page.close();
      throw new ErroCaptura(`Falha ao abrir a página: ${(e as Error).message}`);
    }
    status = 200;
  }
  if (bloqueouPrincipal) {
    await page.close();
    throw new ErroCaptura("Endereço não permitido");
  }
  const espera = Math.min(Math.max(opts.esperarMs ?? 0, 0), 15_000);
  if (espera) await new Promise((r) => setTimeout(r, espera));
  return { page, status };
}

/** Ajusta a janela para a altura da página (até um limite) para screenshot e coordenadas baterem. */
export async function expandirJanela(page: Page, alturaMax: number): Promise<{ largura: number; altura: number }> {
  const alturaDoc = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
  );
  const altura = Math.min(Math.max(alturaDoc, ALTURA_JANELA), alturaMax);
  await page.setViewport({ width: LARGURA, height: altura });
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 300));
  return { largura: LARGURA, altura };
}

/** Screenshot JPEG que cabe num documento do Firestore (< ~900 KB). */
export async function screenshotCompacto(page: Page): Promise<{ jpeg: Buffer; largura: number; altura: number }> {
  for (const [alturaMax, qualidade] of [
    [3000, 55],
    [2000, 40],
    [1200, 30],
  ] as const) {
    const { largura, altura } = await expandirJanela(page, alturaMax);
    const jpeg = Buffer.from(await page.screenshot({ type: "jpeg", quality: qualidade }));
    if (jpeg.byteLength < 900_000) return { jpeg, largura, altura };
  }
  throw new ErroCaptura("Screenshot grande demais");
}

export interface Renderizado {
  html: string;
  status: number;
  titulo: string | null;
  screenshot?: { jpeg: Buffer; largura: number; altura: number };
}

export async function renderizar(url: string, opts: OpcoesRender & { capturarTela?: boolean } = {}): Promise<Renderizado> {
  const { page, status } = await abrirPagina(url, opts);
  try {
    const screenshot = opts.capturarTela ? await screenshotCompacto(page) : undefined;
    const html = await page.content();
    const titulo = (await page.title()) || null;
    return { html, status, titulo, screenshot };
  } finally {
    await page.close().catch(() => {});
  }
}

export interface ElementoPagina {
  s: string; // seletor CSS
  x: number;
  y: number;
  w: number;
  h: number;
  t: string; // trecho do texto
}

/** Lista elementos visíveis com seletor único e posição — usado pelo seletor visual. */
export async function mapearElementos(page: Page): Promise<ElementoPagina[]> {
  return page.evaluate(() => {
    const MAX = 2500;
    const gerada = /^(css|sc|jsx|emotion|styled|tw|svelte)-|[0-9a-f]{6,}|\d{3,}|__[a-z0-9]{4,}$/i;
    const esc = (s: string) => CSS.escape(s);
    const idEstavel = (id: string) => id && !/\d{3,}|[:]/.test(id) && !gerada.test(id);

    function seletorUnico(el: Element): string {
      if (idEstavel(el.id) && document.querySelectorAll(`#${esc(el.id)}`).length === 1) return `#${esc(el.id)}`;
      const partes: string[] = [];
      let atual: Element | null = el;
      while (atual && atual !== document.documentElement) {
        if (atual !== el && idEstavel(atual.id)) {
          partes.unshift(`#${esc(atual.id)}`);
        } else {
          let parte = atual.tagName.toLowerCase();
          const classes = [...atual.classList].filter((c) => !gerada.test(c)).slice(0, 2);
          if (classes.length) parte += classes.map((c) => `.${esc(c)}`).join("");
          const pai: Element | null = atual.parentElement;
          if (pai) {
            const tag = atual.tagName;
            const irmaos = [...pai.children].filter((c) => c.tagName === tag);
            if (irmaos.length > 1) parte += `:nth-of-type(${irmaos.indexOf(atual) + 1})`;
          }
          partes.unshift(parte);
        }
        const s = partes.join(" > ");
        try {
          if (document.querySelectorAll(s).length === 1) return s;
        } catch {
          /* continua subindo */
        }
        if (partes[0].startsWith("#")) break;
        atual = atual.parentElement;
      }
      return partes.join(" > ");
    }

    const saida: { s: string; x: number; y: number; w: number; h: number; t: string }[] = [];
    const todos = document.body ? document.body.querySelectorAll("*") : [];
    for (const el of todos) {
      if (saida.length >= MAX) break;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "BR", "META", "LINK", "SVG", "PATH"].includes(el.tagName.toUpperCase())) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) continue;
      const texto = ((el as HTMLElement).innerText ?? "").trim();
      if (!texto && el.tagName !== "IMG") continue;
      saida.push({
        s: seletorUnico(el),
        x: Math.round(r.left + window.scrollX),
        y: Math.round(r.top + window.scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
        t: texto.replace(/\s+/g, " ").slice(0, 100),
      });
    }
    return saida;
  });
}
