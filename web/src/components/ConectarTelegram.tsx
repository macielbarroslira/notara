import { deleteField, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { useUid } from "../lib/dados";
import { Icone } from "./Icone";
import { Aviso, Botao, Cartao, Selo } from "./ui";

function codigoAleatorio() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => letras[b % letras.length]).join("");
}

/** Conecta a conta ao bot do Telegram: o app gera um código e abre t.me/<bot>?start=<código>. */
export function ConectarTelegram() {
  const uid = useUid();
  const [bot, setBot] = useState<string | null | undefined>(undefined);
  const [chat, setChat] = useState<number | null>(null);
  const [esperando, setEsperando] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "config/publica"),
        (s) => setBot((s.get("telegramBot") as string | undefined) ?? null),
        () => setBot(null),
      ),
    [],
  );
  useEffect(
    () =>
      onSnapshot(doc(db, `users/${uid}`), (s) => {
        const id = (s.get("telegramChatId") as number | undefined) ?? null;
        setChat(id);
        if (id) setEsperando(false);
      }),
    [uid],
  );

  async function conectar() {
    const codigo = codigoAleatorio();
    await setDoc(doc(db, `users/${uid}`), { telegramCodigo: codigo }, { merge: true });
    setEsperando(true);
    window.open(`https://t.me/${bot}?start=${codigo}`, "_blank", "noopener");
  }

  const desconectar = () => updateDoc(doc(db, `users/${uid}`), { telegramChatId: deleteField() });

  return (
    <Cartao>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Telegram</h2>
          <p className="mt-1 text-sm text-muted">Receba os alertas numa conversa com o bot do Notara — grátis e instantâneo.</p>
        </div>
        {chat ? <Selo cor="ok">Conectado</Selo> : <Selo>Desconectado</Selo>}
      </div>
      <div className="mt-4 space-y-3">
        {bot === undefined ? null : bot === null ? (
          <Aviso>O bot do Telegram ainda não foi configurado no motor (Secret TELEGRAM_TOKEN no GitHub).</Aviso>
        ) : chat ? (
          <Botao variante="fantasma" onClick={desconectar}>
            Desconectar
          </Botao>
        ) : (
          <>
            <Botao variante="primario" onClick={conectar}>
              <Icone nome="externo" className="size-4" /> Conectar Telegram
            </Botao>
            {esperando && (
              <Aviso>
                No Telegram, toque em <b>Iniciar</b> na conversa com @{bot}. A conexão aparece aqui em alguns minutos (na próxima rodada do motor).
              </Aviso>
            )}
          </>
        )}
      </div>
    </Cartao>
  );
}
