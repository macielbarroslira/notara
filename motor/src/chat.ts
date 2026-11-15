import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./db.js";
import { conversarComIa, esquecerConversa, iaAtiva, transcreverAudio, type PreferenciaIa } from "./ia.js";

/**
 * Chat com a IA no app (tela Assistente). O app grava a mensagem em users/{uid}/chat com
 * status "pendente"; o motor responde gravando outra mensagem (papel "ia") na mesma coleção.
 * É a mesma IA do Telegram: mesmas ferramentas, mesma escolha de modelo e mesma memória.
 */

let temChat = true;

/** Ouvinte do Firestore: só gasta leitura quando chega mensagem. */
export function ouvirChat() {
  return db
    .collectionGroup("chat")
    .where("status", "==", "pendente")
    .orderBy("criadoEm")
    .limit(1)
    .onSnapshot(
      (s) => {
        if (!s.empty) temChat = true;
      },
      (e) => {
        console.warn("Ouvinte do chat:", String(e));
        temChat = true;
      },
    );
}

export const chatPendente = () => temChat;
/** Reserva: confere a fila mesmo sem aviso do ouvinte (ex.: ouvinte caiu enquanto o índice era criado). */
export const conferirChat = () => {
  temChat = true;
};

export async function atenderChat() {
  temChat = false;
  const snap = await db
    .collectionGroup("chat").where("status", "==", "pendente").orderBy("criadoEm").limit(10).get();
  for (const d of snap.docs) {
    const uid = d.ref.parent.parent!.id;
    // Reserva a mensagem (outra rodada do motor não responde em dobro)
    const minha = await db.runTransaction(async (t) => {
      const atual = await t.get(d.ref);
      if (atual.get("status") !== "pendente") return false;
      t.update(d.ref, { status: "respondendo" });
      return true;
    });
    if (!minha) continue;
    const responder = (dados: Record<string, unknown>) =>
      d.ref.parent.add({ papel: "ia", status: "ok", criadoEm: Timestamp.now(), ...dados });
    try {
      let texto = String(d.get("texto") ?? "").trim();
      const audio = d.get("audio") as string | undefined;
      if (audio) {
        texto = await transcreverAudio({ dados: audio, mime: String(d.get("audioMime") ?? "audio/webm") });
        if (!texto || /^\(sem fala\)$/i.test(texto)) {
          await d.ref.update({ status: "ok", audio: FieldValue.delete(), transcricao: "(sem fala)" });
          await responder({ texto: "Não ouvi nenhuma fala nesse áudio. Pode repetir?" });
          continue;
        }
      }
      if (/^\/(limpar|nova)\b/i.test(texto)) {
        await esquecerConversa(uid);
        await d.ref.update({ status: "ok" });
        await responder({ texto: "🧹 Conversa nova. Pode falar!" });
        continue;
      }
      if (!iaAtiva()) {
        await d.ref.update({ status: "ok" });
        await responder({ texto: "A IA ainda não foi ligada no motor." });
        continue;
      }
      const pref = (await db.doc(`users/${uid}`).get()).get("ia") as PreferenciaIa | undefined;
      const r = await conversarComIa(uid, null, texto, pref);
      await d.ref.update({ status: "ok", ...(audio ? { audio: FieldValue.delete(), transcricao: texto.slice(0, 2000) } : {}) });
      await responder({
        texto: r.texto,
        ...(r.modelo ? { provedor: r.provedor, modelo: r.modelo, trocou: Boolean(r.trocou) } : {}),
      });
      console.log(`[Chat] respondido (${r.modelo ?? "sem IA"})`);
    } catch (e) {
      console.warn("Chat:", String(e));
      await d.ref.update({ status: "erro", audio: FieldValue.delete() }).catch(() => {});
      await responder({ texto: `Não consegui responder agora (${(e as Error).message.slice(0, 160)}).`, erro: true }).catch(() => {});
    }
  }
  return snap.size;
}
