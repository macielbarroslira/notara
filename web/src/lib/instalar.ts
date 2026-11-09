/** Guarda o evento do navegador que permite mostrar o botão "Instalar app". */
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
}

export const pedidoInstalacao: { evento: EventoInstalacao | null } = { evento: null };

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  pedidoInstalacao.evento = e as EventoInstalacao;
  window.dispatchEvent(new Event("pedido-instalacao"));
});
