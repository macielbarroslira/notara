import { FieldValue } from "firebase-admin/firestore";
import { fetch } from "undici";
import { responderAudio, responderMensagem } from "./bot.js";
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
let offsetAtual: number | undefined;

async function chamar<T>(metodo: string, corpo: Record<string, unknown>, tempoMs = 20_000): Promise<T> {
  const r = await fetch(`${API}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(tempoMs),
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

/** Mensagem simples (respostas do bot), dividida se passar do limite do Telegram. */
export async function enviarTexto(chatId: number | string, texto: string) {
  if (!API) return;
  for (let i = 0; i < texto.length || i === 0; i += 4000) {
    await chamar("sendMessage", { chat_id: chatId, text: texto.slice(i, i + 4000) || "…", link_preview_options: { is_disabled: true } });
  }
}

export const indicarDigitando = (chatId: number) => chamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

/** Publica o @usuário do bot para o app montar o link de conexão. */
export async function publicarBot() {
  if (!API) return;
  const eu = await chamar<{ username: string }>("getMe", {});
  await db.doc("config/publica").set({ telegramBot: eu.username }, { merge: true });
}

interface Atualizacao {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    from?: { first_name?: string };
    voice?: ArquivoTelegram;
    audio?: ArquivoTelegram;
  };
}

interface ArquivoTelegram {
  file_id: string;
  duration?: number;
  mime_type?: string;
  file_size?: number;
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Baixa um arquivo enviado ao bot (ex.: mensagem de voz). */
export async function baixarArquivo(a: ArquivoTelegram) {
  if ((a.file_size ?? 0) > MAX_AUDIO_BYTES) throw new Error("áudio grande demais (máx. 10 MB)");
  const info = await chamar<{ file_path?: string }>("getFile", { file_id: a.file_id });
  if (!info.file_path) throw new Error("o Telegram não liberou o arquivo");
  const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${info.file_path}`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`download do áudio: HTTP ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error("áudio grande demais (máx. 10 MB)");
  const mime = a.mime_type || (info.file_path.endsWith(".oga") || info.file_path.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg");
  return { dados: bytes.toString("base64"), mime };
}

/**
 * Lê mensagens novas do bot: "/start <código>" conecta, "/parar" desconecta, o resto é conversa (bot.ts).
 * esperaSeg > 0 usa "long polling": a chamada fica aberta até chegar mensagem — resposta em segundos.
 */
export async function processarTelegram(esperaSeg = 0) {
  if (!API) return 0;
  // O avanço fica em memória durante a rodada (economiza leituras do Firestore)
  offsetAtual ??= ((await CONFIG.get()).get("offset") as number | undefined) ?? 0;
  const offset = offsetAtual;
  const atualizacoes = await chamar<Atualizacao[]>(
    "getUpdates",
    { offset, timeout: esperaSeg, allowed_updates: ["message"] },
    (esperaSeg + 15) * 1000,
  );
  // Grava o avanço antes de responder: se algo travar, a mesma mensagem não é respondida em loop
  if (atualizacoes.length) {
    offsetAtual = atualizacoes[atualizacoes.length - 1].update_id + 1;
    await CONFIG.set({ offset: offsetAtual }, { merge: true });
  }
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
      } else if (texto) {
        await responderMensagem(chatId, texto);
      } else if (msg.voice || msg.audio) {
        await responderAudio(chatId, (msg.voice ?? msg.audio)!);
      }
    } catch (e) {
      console.warn("Falha ao processar mensagem do Telegram", String(e));
    }
  }
  return atualizacoes.length;
}
