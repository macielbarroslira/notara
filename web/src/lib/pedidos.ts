import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, type Bytes } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Pedidos ao "motor" do Notara (roda no GitHub Actions a cada ~10 min, ou no seu computador).
 * O app grava o pedido e espera a resposta aparecer no mesmo documento.
 */
export type TipoPedido = "testar" | "seletor" | "verificar";
export type EstadoPedido = "pendente" | "processando";

export class ErroPedido extends Error {}

export interface OpcoesPedido {
  /** Avisa a tela quando o pedido muda de estado (na fila → processando). */
  aoMudar?: (estado: EstadoPedido) => void;
  /** Cancela a espera (ex.: o usuário fechou a tela). */
  sinal?: AbortSignal;
}

export function fazerPedido<T>(
  uid: string,
  tipo: TipoPedido,
  dados: Record<string, unknown>,
  opts: OpcoesPedido = {},
): Promise<{ resultado: T; pedidoId: string }> {
  return new Promise((resolver, rejeitar) => {
    let cancelar: (() => void) | undefined;
    addDoc(collection(db, `users/${uid}/pedidos`), { tipo, dados, status: "pendente", criadoEm: serverTimestamp() })
      .then((ref) => {
        if (opts.sinal?.aborted) return;
        cancelar = onSnapshot(
          ref,
          (s) => {
            const status = s.get("status") as string | undefined;
            if (status === "pendente" || status === "processando") opts.aoMudar?.(status);
            if (status === "feito") {
              cancelar?.();
              resolver({ resultado: s.get("resultado") as T, pedidoId: ref.id });
            } else if (status === "erro") {
              cancelar?.();
              rejeitar(new ErroPedido((s.get("mensagem") as string) || "Não foi possível concluir."));
            }
          },
          (e) => rejeitar(e),
        );
        opts.sinal?.addEventListener("abort", () => cancelar?.());
      })
      .catch(rejeitar);
  });
}

/** Imagem anexada a um pedido do seletor visual. */
export async function imagemDoPedido(uid: string, pedidoId: string): Promise<string | null> {
  const s = await getDoc(doc(db, `users/${uid}/pedidos/${pedidoId}/anexos/imagem`));
  const jpeg = s.get("jpeg") as Bytes | undefined;
  return jpeg ? `data:image/jpeg;base64,${jpeg.toBase64()}` : null;
}

export const TEXTO_ESPERA: Record<EstadoPedido, string> = {
  pendente: "Na fila — o motor atende em instantes se estiver rodando, ou na próxima rodada (até ~10 min).",
  processando: "Abrindo a página…",
};
