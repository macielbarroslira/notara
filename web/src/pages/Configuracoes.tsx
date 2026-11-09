import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { Aviso, Botao, Cabecalho, Cartao } from "../components/ui";
import { auth } from "../firebase";
import { useAuth, useUid } from "../lib/dados";
import { ativarPush, ehIOS, instaladoComoApp, pushDisponivel } from "../lib/push";
import { pedidoInstalacao } from "../lib/instalar";

export function Configuracoes() {
  const uid = useUid();
  const { user } = useAuth();
  const [suportado, setSuportado] = useState<boolean | null>(null);
  const [permissao, setPermissao] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [podeInstalar, setPodeInstalar] = useState(Boolean(pedidoInstalacao.evento));

  useEffect(() => {
    pushDisponivel().then(setSuportado);
    const f = () => setPodeInstalar(Boolean(pedidoInstalacao.evento));
    window.addEventListener("pedido-instalacao", f);
    return () => window.removeEventListener("pedido-instalacao", f);
  }, []);

  async function ligarPush() {
    setOcupado(true);
    setMsg(null);
    try {
      await ativarPush(uid);
      setPermissao("granted");
      setMsg({ tipo: "ok", texto: "Notificações ativadas neste aparelho." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  async function instalar() {
    const ev = pedidoInstalacao.evento;
    if (!ev) return;
    await ev.prompt();
    pedidoInstalacao.evento = null;
    setPodeInstalar(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Cabecalho titulo="Ajustes" />

      <Cartao>
        <h2 className="font-semibold">Conta</h2>
        <p className="mt-1 text-sm text-stone-600">{user?.email}</p>
        <Botao className="mt-4" icone="sair" onClick={() => signOut(auth)}>Sair</Botao>
      </Cartao>

      <Cartao>
        <h2 className="font-semibold">Notificações neste aparelho</h2>
        <p className="mt-1 text-sm text-stone-600">Receba um alerta no celular, tablet ou computador quando um site mudar — mesmo com o app fechado.</p>
        <div className="mt-4 space-y-3">
          {permissao === "granted" && <Aviso tipo="ok">Permissão concedida. Toque abaixo para registrar novamente se não estiver recebendo.</Aviso>}
          {suportado === false && ehIOS() && !instaladoComoApp() && (
            <Aviso>No iPhone/iPad: toque em Compartilhar › <b>Adicionar à Tela de Início</b>, abra o app por lá e volte aqui.</Aviso>
          )}
          <Botao variante="primario" icone="sino" onClick={ligarPush} carregando={ocupado}>
            Ativar notificações
          </Botao>
          {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        </div>
      </Cartao>

      <Cartao>
        <h2 className="font-semibold">Instalar o app</h2>
        {instaladoComoApp() ? (
          <p className="mt-1 text-sm text-stone-600">O app já está instalado neste aparelho. ✅</p>
        ) : podeInstalar ? (
          <Botao className="mt-3" icone="baixar" onClick={instalar}>Instalar Notara</Botao>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-stone-600">
            <li><b>iPhone/iPad (Safari):</b> Compartilhar › Adicionar à Tela de Início</li>
            <li><b>Android (Chrome):</b> menu ⋮ › Instalar app</li>
            <li><b>Computador (Chrome/Edge):</b> ícone de instalar na barra de endereço</li>
          </ul>
        )}
      </Cartao>

      <Cartao>
        <h2 className="font-semibold">Limites</h2>
        <ul className="mt-2 space-y-1 text-sm text-stone-600">
          <li>Até 50 monitores por conta</li>
          <li>Intervalo mínimo de 5 minutos</li>
          <li>Histórico das últimas 50 versões de cada monitor</li>
        </ul>
      </Cartao>
    </div>
  );
}
