import { FieldValue } from "firebase-admin/firestore";
import { fetch } from "undici";
import { db } from "./db.js";

/**
 * Alertas no Telegram (opcional). Crie um bot no @BotFather e salve o token no Secret TELEGRAM_TOKEN.
 * Conexão: o app gera um código em users/{uid}.telegramCodigo e abre t.me/<bot>?start=<código>;
 * o motor lê o "/start <código>" e grava users/{uid}.telegramChatId.
 */
const TOKEN = process.env.TELEGRAM_TOKEN?.trim();
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;
const CONFIG = db.doc("config/telegram");

export const telegramAtivo = () => Boolean(API);

async function chamar<T>(metodo: string, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${API}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json()) as { ok: boolean; result: T; description?: string };
  if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description ?? r.status}`);
  return j.result;
}

const escaparHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export async function enviarTelegram(chatId: number | string, titulo: string, corpo: string, link: string) {
  if (!API) return;
  await chamar("sendMessage", {
    chat_id: chatId,
    text: `<b>${escaparHtml(titulo)}</b>\n${escaparHtml(corpo.slice(0, 3500))}`,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: "Abrir no Notara", url: link }]] },
  });
}

/** Publica o @usuário do bot para o app montar o link de conexão. */
export async function publicarBot() {
  if (!API) return;
  const eu = await chamar<{ username: string }>("getMe", {});
  await db.doc("config/publica").set({ telegramBot: eu.username }, { merge: true });
}

interface Atualizacao {
  update_id: number;
  message?: { chat: { id: number }; text?: string; from?: { first_name?: string } };
}

/** Lê mensagens novas do bot: "/start <código>" conecta, "/parar" desconecta. */
export async function processarTelegram() {
  if (!API) return 0;
  const offset = ((await CONFIG.get()).get("offset") as number | undefined) ?? 0;
  const atualizacoes = await chamar<Atualizacao[]>("getUpdates", { offset, timeout: 0, allowed_updates: ["message"] });
  for (const u of atualizacoes) {
    const msg = u.message;
    const texto = msg?.text?.trim() ?? "";
    if (!msg) continue;
    const chatId = msg.chat.id;
    try {
      const codigo = /^\/start\s+([A-Za-z0-9]{6,32})$/.exec(texto)?.[1];
      if (codigo) {
        const achados = await db.collection("users").where("telegramCodigo", "==", codigo).limit(1).get();
        if (achados.empty) {
          await enviarTelegram(chatId, "Código não encontrado", "Gere um novo link em Notara › Ajustes › Conectar Telegram.", "https://notara.web.app/configuracoes");
        } else {
          await achados.docs[0].ref.update({ telegramChatId: chatId, telegramCodigo: FieldValue.delete() });
          await enviarTelegram(chatId, "✅ Conectado ao Notara", "Você vai receber aqui os alertas dos seus monitores. Envie /parar para desconectar.", "https://notara.web.app");
        }
      } else if (/^\/(parar|stop)\b/.test(texto)) {
        const achados = await db.collection("users").where("telegramChatId", "==", chatId).get();
        await Promise.all(achados.docs.map((d) => d.ref.update({ telegramChatId: FieldValue.delete() })));
        await enviarTelegram(chatId, "Desconectado", "Você não vai mais receber alertas aqui.", "https://notara.web.app/configuracoes");
      } else if (texto.startsWith("/start")) {
        await enviarTelegram(chatId, "Olá!", "Para receber alertas, abra Notara › Ajustes › Conectar Telegram.", "https://notara.web.app/configuracoes");
      }
    } catch (e) {
      console.warn("Falha ao processar mensagem do Telegram", String(e));
    }
  }
  if (atualizacoes.length) await CONFIG.set({ offset: atualizacoes[atualizacoes.length - 1].update_id + 1 }, { merge: true });
  return atualizacoes.length;
}
