import { ErroPedido } from "./pedidos";

/** Mensagem clara para erros de pedidos ao motor e do Firestore. */
export function mensagemErro(e: unknown): string {
  if (e instanceof ErroPedido) return e.message;
  const err = e as { code?: string; message?: string };
  if (err.code === "permission-denied") return "Sem permissão para fazer isso. Entre novamente.";
  if (err.code === "unavailable") return "Sem conexão com a internet.";
  return err.message || "Não foi possível concluir a operação.";
}
