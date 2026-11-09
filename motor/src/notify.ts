import { getMessaging } from "firebase-admin/messaging";
import { app, db, URL_APP } from "./db.js";
import { fetchSeguro } from "./fetcher.js";
import type { Monitor } from "./types.js";

export interface Aviso {
  titulo: string;
  corpo: string;
  link: string;
}

async function enviarPush(uid: string, aviso: Aviso) {
  const snap = await db.collection(`users/${uid}/dispositivos`).get();
  const tokens = snap.docs.map((d) => d.get("token") as string).filter(Boolean);
  if (tokens.length === 0) return;
  const resp = await getMessaging(app).sendEachForMulticast({
    tokens,
    webpush: {
      notification: {
        title: aviso.titulo,
        body: aviso.corpo,
        icon: `${URL_APP}/icon-192.png`,
        badge: `${URL_APP}/icon-192.png`,
      },
      fcmOptions: { link: aviso.link },
    },
  });
  // Remove tokens que não valem mais (app desinstalado, permissão revogada…)
  await Promise.all(
    resp.responses.map((r, i) => {
      const codigo = r.error?.code ?? "";
      if (codigo.includes("registration-token-not-registered") || codigo.includes("invalid-argument")) {
        return snap.docs[i].ref.delete();
      }
      return null;
    }),
  );
}

async function postarJson(url: string, corpo: unknown) {
  const r = await fetchSeguro(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
    maxBytes: 256 * 1024,
  });
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
}

/** Dispara push e integrações. O e-mail é enviado pela função `enviarEmailAlteracao`. */
export async function notificar(
  uid: string,
  monitorId: string,
  m: Monitor,
  aviso: Aviso,
  extra: Record<string, unknown> = {},
) {
  const a = m.acoes ?? {};
  const texto = `${aviso.titulo}\n${aviso.corpo}\n${aviso.link}`;
  const tarefas: Array<[string, Promise<unknown>]> = [];

  if (a.push !== false) tarefas.push(["push", enviarPush(uid, aviso)]);
  if (a.webhook)
    tarefas.push([
      "webhook",
      postarJson(a.webhook, { monitorId, nome: m.nome, url: m.url, ...extra, titulo: aviso.titulo, resumo: aviso.corpo, link: aviso.link }),
    ]);
  if (a.slack) tarefas.push(["slack", postarJson(a.slack, { text: texto })]);
  if (a.discord) tarefas.push(["discord", postarJson(a.discord, { content: texto.slice(0, 1900) })]);
  if (a.teams) tarefas.push(["teams", postarJson(a.teams, { text: texto.replace(/\n/g, "<br>") })]);

  const resultados = await Promise.allSettled(tarefas.map(([, p]) => p));
  resultados.forEach((r, i) => {
    if (r.status === "rejected") console.warn(`Falha ao notificar via ${tarefas[i][0]}`, { uid, monitorId, erro: String(r.reason) });
  });
}
