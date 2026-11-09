import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { executarMonitor } from "./check.js";
import { db } from "./db.js";
import { capturar, extrairHtml } from "./extract.js";
import { ErroCaptura, fetchSeguro, validarUrl } from "./fetcher.js";
import { abrirPagina, mapearElementos, screenshotCompacto } from "./navegador.js";
import type { Monitor, TipoMonitor } from "./types.js";

/**
 * Pedidos feitos pelo app (users/{uid}/pedidos/{id}) e processados pelo motor:
 *  - testar   → prévia do texto capturado
 *  - seletor  → screenshot + mapa de elementos para o seletor visual
 *  - verificar → roda um monitor agora
 */
const TIPOS: TipoMonitor[] = ["pagina", "elemento", "feed", "json", "uptime", "pdf"];
const MAX_ELEMENTOS = 1500; // cabe no documento (limite de 1 MB do Firestore)

const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 20) : []);
const espera = (v: unknown) => Math.min(Math.max(Number(v) || 0, 0), 15_000);

async function testar(d: Record<string, unknown>) {
  const tipo = TIPOS.includes(d.tipo as TipoMonitor) ? (d.tipo as TipoMonitor) : "pagina";
  validarUrl(String(d.url ?? ""));
  const r = await capturar({
    url: String(d.url),
    tipo,
    seletores: lista(d.seletores),
    excluir: lista(d.excluir),
    jsonPath: d.jsonPath ? String(d.jsonPath) : undefined,
    usarNavegador: d.usarNavegador === true,
    esperarMs: espera(d.esperarMs),
  });
  return { texto: r.texto.slice(0, 5000), tamanho: r.texto.length, titulo: r.titulo, status: r.status, usouNavegador: Boolean(r.usouNavegador) };
}

async function seletor(d: Record<string, unknown>, pedido: DocumentSnapshot) {
  const url = String(d.url ?? "");
  validarUrl(url);
  const [render, estatico] = await Promise.all([
    (async () => {
      const { page } = await abrirPagina(url, { esperarMs: espera(d.esperarMs) });
      try {
        const tela = await screenshotCompacto(page);
        const elementos = await mapearElementos(page);
        return { tela, elementos, html: await page.content(), titulo: (await page.title()) || null };
      } finally {
        await page.close().catch(() => {});
      }
    })(),
    // HTML "cru" (sem JavaScript) para saber se a página precisa do navegador
    fetchSeguro(url).catch(() => null),
  ]);
  const tamanho = (html: string) => {
    try {
      return extrairHtml(html, { url, tipo: "pagina" }).texto.length;
    } catch {
      return 0;
    }
  };
  const textoRenderizado = tamanho(render.html);
  const textoEstatico = estatico && estatico.status < 400 ? tamanho(estatico.corpo) : 0;
  // A imagem vai num documento separado (até ~900 KB) para não estourar o limite de 1 MB
  await pedido.ref.collection("anexos").doc("imagem").set({ jpeg: render.tela.jpeg });
  return {
    largura: render.tela.largura,
    altura: render.tela.altura,
    elementos: render.elementos.filter((el) => el.y < render.tela.altura).slice(0, MAX_ELEMENTOS),
    titulo: render.titulo,
    precisaNavegador: textoEstatico < textoRenderizado * 0.6,
  };
}

async function verificar(uid: string, d: Record<string, unknown>) {
  const monitorId = String(d.monitorId ?? "");
  if (!/^[A-Za-z0-9]{1,64}$/.test(monitorId)) throw new ErroCaptura("Monitor inválido");
  const ref = db.doc(`users/${uid}/monitores/${monitorId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get("excluido") === true) throw new ErroCaptura("Monitor não encontrado");
  return executarMonitor(ref, snap.data() as Monitor);
}

/** Reserva o pedido (evita duas rodadas do motor processarem o mesmo). */
async function reservar(pedido: DocumentSnapshot): Promise<boolean> {
  return db.runTransaction(async (t) => {
    const s = await t.get(pedido.ref);
    if (!s.exists || s.get("status") !== "pendente") return false;
    t.update(pedido.ref, { status: "processando", iniciadoEm: Timestamp.now() });
    return true;
  });
}

export async function processarPedido(pedido: DocumentSnapshot) {
  if (!(await reservar(pedido))) return;
  const uid = pedido.ref.parent.parent!.id;
  const tipo = pedido.get("tipo") as string;
  const dados = (pedido.get("dados") ?? {}) as Record<string, unknown>;
  try {
    const resultado =
      tipo === "testar" ? await testar(dados) : tipo === "seletor" ? await seletor(dados, pedido) : tipo === "verificar" ? await verificar(uid, dados) : null;
    if (resultado === null) throw new ErroCaptura("Pedido desconhecido");
    await pedido.ref.update({ status: "feito", resultado, concluidoEm: Timestamp.now() });
  } catch (e) {
    const mensagem = e instanceof ErroCaptura ? e.message : "Não foi possível concluir. Tente de novo.";
    if (!(e instanceof ErroCaptura)) console.error(`Pedido ${tipo} falhou`, e);
    await pedido.ref.update({ status: "erro", mensagem, concluidoEm: Timestamp.now() });
  }
}

/** Pedidos pendentes de todos os usuários, mais antigos primeiro. */
export async function pedidosPendentes(limite = 20) {
  const snap = await db.collectionGroup("pedidos").where("status", "==", "pendente").orderBy("criadoEm").limit(limite).get();
  return snap.docs;
}

/** Apaga pedidos com mais de 1 dia (e a imagem anexada). */
export async function limparPedidosAntigos() {
  const limite = Timestamp.fromMillis(Date.now() - 24 * 3600_000);
  const antigos = await db.collectionGroup("pedidos").where("criadoEm", "<", limite).limit(200).get();
  for (const d of antigos.docs) await db.recursiveDelete(d.ref);
  return antigos.size;
}

export const marcadorServidor = FieldValue.serverTimestamp;
