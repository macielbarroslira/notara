import dns from "node:dns";
import net from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";

/** Erro esperado de captura (mostrado ao usuário). */
export class ErroCaptura extends Error {}

const USER_AGENT =
  "Mozilla/5.0 (compatible; Notara/1.0; +https://notara.web.app)";
const MAX_REDIRECTS = 5;
const MAX_BYTES_PADRAO = 5 * 1024 * 1024;

/** Só aceita endereços unicast públicos (bloqueia localhost, redes privadas, metadata etc.). */
export function ipPublico(ip: string): boolean {
  try {
    return ipaddr.process(ip).range() === "unicast";
  } catch {
    return false;
  }
}

type LookupCb = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/** DNS lookup que recusa IPs internos — evita SSRF inclusive via DNS rebinding. */
function lookupSeguro(hostname: string, options: dns.LookupOptions, callback: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, enderecos) => {
    if (err) return callback(err, "");
    const lista = enderecos as dns.LookupAddress[];
    if (lista.length === 0 || lista.some((a) => !ipPublico(a.address))) {
      return callback(new ErroCaptura(`Endereço não permitido: ${hostname}`), "");
    }
    if (options.all) return callback(null, lista);
    callback(null, lista[0].address, lista[0].family);
  });
}

const agente = new Agent({
  connect: { lookup: lookupSeguro as never, timeout: 10_000 },
  headersTimeout: 20_000,
  bodyTimeout: 20_000,
});

export function validarUrl(bruta: string): URL {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    throw new ErroCaptura("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ErroCaptura("Use uma URL http:// ou https://");
  }
  if (url.username || url.password) throw new ErroCaptura("URL com usuário/senha não é permitida");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !ipPublico(host)) throw new ErroCaptura("Endereço não permitido");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new ErroCaptura("Endereço não permitido");
  }
  return url;
}

export interface RespostaSegura {
  status: number;
  urlFinal: string;
  tipoConteudo: string;
  corpo: string;
  /** Bytes crus (para PDF e outros binários). */
  bytes: Uint8Array;
}

export interface OpcoesFetch {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  maxBytes?: number;
}

function decodificar(bytes: Uint8Array, tipoConteudo: string): string {
  const charset = /charset=([^;]+)/i.exec(tipoConteudo)?.[1]?.trim().replace(/"/g, "");
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** fetch com bloqueio de SSRF, limite de tamanho, timeout e redirects verificados um a um. */
export async function fetchSeguro(urlBruta: string, opts: OpcoesFetch = {}): Promise<RespostaSegura> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES_PADRAO;
  let url = validarUrl(urlBruta);
  let method = opts.method ?? "GET";
  let body = opts.body;

  for (let salto = 0; salto <= MAX_REDIRECTS; salto++) {
    const resp = await fetch(url, {
      method,
      body,
      redirect: "manual",
      dispatcher: agente,
      signal: AbortSignal.timeout(30_000),
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
        ...opts.headers,
      },
    }).catch((e: unknown) => {
      const causa = (e as { cause?: unknown }).cause;
      if (causa instanceof ErroCaptura) throw causa;
      throw new ErroCaptura(`Falha ao acessar o site: ${(causa as Error)?.message ?? (e as Error).message}`);
    });

    if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
      await resp.body?.cancel();
      url = validarUrl(new URL(resp.headers.get("location")!, url).toString());
      if (resp.status === 303 || ((resp.status === 301 || resp.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
      }
      continue;
    }

    const partes: Uint8Array[] = [];
    let total = 0;
    if (resp.body) {
      for await (const pedaco of resp.body) {
        total += pedaco.byteLength;
        if (total > maxBytes) {
          await resp.body.cancel().catch(() => {});
          throw new ErroCaptura(`Página muito grande (> ${Math.round(maxBytes / 1024 / 1024)} MB)`);
        }
        partes.push(pedaco);
      }
    }
    const bytes = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) {
      bytes.set(p, pos);
      pos += p.byteLength;
    }
    const tipoConteudo = resp.headers.get("content-type") ?? "";
    return { status: resp.status, urlFinal: url.toString(), tipoConteudo, corpo: decodificar(bytes, tipoConteudo), bytes };
  }
  throw new ErroCaptura("Redirecionamentos demais");
}
