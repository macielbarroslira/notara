import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ComparacaoVisual, ImagemCaptura } from "../components/ComparacaoVisual";
import { DiffView } from "../components/DiffView";
import { Icone } from "../components/Icone";
import { ListaAlteracoes } from "./Alteracoes";
import { Aviso, Botao, Cabecalho, Carregando, Cartao, StatusBadge, Vazio } from "../components/ui";
import { db } from "../firebase";
import { descreverAgenda, nomeIntervalo, nomeTipo } from "../lib/constantes";
import { useAlteracoes, useMonitor, useUid, useVersoes } from "../lib/dados";
import { mensagemErro } from "../lib/erros";
import { fazerPedido, TEXTO_ESPERA } from "../lib/pedidos";
import { dataHora, relativo } from "../lib/tempo";

type Aba = "alteracoes" | "historico" | "atual";

const RESULTADOS: Record<string, string> = {
  primeira: "Primeira captura salva.",
  igual: "Nada mudou desde a última verificação.",
  mudou_sem_alerta: "O conteúdo mudou, mas não atendeu às condições de alerta.",
  alterou: "Mudança detectada! Alerta enviado.",
};

export function MonitorDetalhe() {
  const { id } = useParams();
  const uid = useUid();
  const navegar = useNavigate();
  const { monitor, carregando } = useMonitor(id);
  const { dados: versoes } = useVersoes(id);
  const { dados: alteracoes } = useAlteracoes({ monitorId: id }, 50);
  const [aba, setAba] = useState<Aba>("alteracoes");
  const [verificando, setVerificando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [selA, setSelA] = useState<string | null>(null);
  const [selB, setSelB] = useState<string | null>(null);

  if (carregando) return <Carregando />;
  if (!monitor || !id) return <Vazio titulo="Monitor não encontrado"><Link to="/" className="text-orange-900 underline">Voltar</Link></Vazio>;

  const ref = doc(db, `users/${uid}/monitores/${id}`);

  async function verificar() {
    setVerificando(true);
    setMsg(null);
    try {
      const { resultado: r } = await fazerPedido<{ status: string; mensagem?: string }>(uid, "verificar", { monitorId: id! }, {
        aoMudar: (estado) => setMsg({ tipo: "info", texto: TEXTO_ESPERA[estado] }),
      });
      setMsg(r.status === "erro" ? { tipo: "erro", texto: r.mensagem ?? "Erro" } : { tipo: "ok", texto: RESULTADOS[r.status] ?? "Verificado." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: mensagemErro(e) });
    } finally {
      setVerificando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir o monitor “${monitor!.nome}” e todo o histórico?`)) return;
    // O motor apaga o monitor, o histórico e as alterações na próxima rodada
    await updateDoc(ref, { excluido: true, ativo: false });
    navegar("/");
  }

  // Comparação do histórico: por padrão a mais recente x anterior
  const idB = selB ?? versoes[0]?.id;
  const idA = selA ?? versoes[1]?.id;
  const vA = versoes.find((v) => v.id === idA);
  const vB = versoes.find((v) => v.id === idB);

  const abas: { id: Aba; nome: string }[] = [
    { id: "alteracoes", nome: `Alterações (${alteracoes.length})` },
    { id: "historico", nome: `Histórico (${versoes.length})` },
    { id: "atual", nome: "Conteúdo atual" },
  ];

  return (
    <>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-orange-900">
        <Icone nome="voltar" className="size-4" /> Monitores
      </Link>
      <Cabecalho
        titulo={<span className="break-words">{monitor.nome}</span>}
        sub={
          <a href={monitor.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 break-all text-orange-900 hover:underline">
            {monitor.url} <Icone nome="externo" className="size-3.5 shrink-0" />
          </a>
        }
        acoes={
          <>
            <Botao variante="primario" icone="atualizar" onClick={verificar} carregando={verificando}>Verificar agora</Botao>
            <Botao icone={monitor.ativo ? "pausar" : "retomar"} onClick={() => updateDoc(ref, { ativo: !monitor.ativo })}>
              {monitor.ativo ? "Pausar" : "Retomar"}
            </Botao>
            <Link to={`/monitores/${id}/editar`}><Botao icone="editar">Editar</Botao></Link>
            <Botao variante="perigo" icone="lixo" onClick={excluir} aria-label="Excluir" />
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Status", <StatusBadge key="s" monitor={monitor} />],
          ["Tipo · frequência", [nomeTipo(monitor.tipo), nomeIntervalo(monitor.intervaloMin), descreverAgenda(monitor.agenda)].filter(Boolean).join(" · ")],
          ["Última verificação", relativo(monitor.exec?.ultima)],
          ["Próxima", monitor.ativo ? relativo(monitor.exec?.proxima) : "Pausado"],
        ].map(([rotulo, valor]) => (
          <Cartao key={String(rotulo)} className="!p-3">
            <p className="text-xs text-stone-500">{rotulo}</p>
            <div className="mt-1 text-sm font-medium text-stone-900">{valor}</div>
          </Cartao>
        ))}
      </div>

      <div className="mb-4 space-y-2">
        {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        {monitor.exec?.status === "erro" && monitor.exec.mensagem && (
          <Aviso tipo="erro">
            {monitor.exec.mensagem} {monitor.exec.erros ? `(${monitor.exec.erros} falha(s) seguidas)` : ""}
          </Aviso>
        )}
      </div>

      <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${aba === a.id ? "border-orange-800 text-orange-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {a.nome}
          </button>
        ))}
      </div>

      {aba === "alteracoes" && (
        alteracoes.length ? <ListaAlteracoes itens={alteracoes} semNome /> : <Vazio titulo="Nenhuma alteração ainda">Quando o conteúdo mudar, as alterações aparecem aqui.</Vazio>
      )}

      {aba === "historico" && (
        versoes.length < 2 ? (
          <Vazio titulo="Histórico curto">É preciso ter pelo menos duas versões para comparar.</Vazio>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <Cartao className="!p-2">
              <p className="px-2 py-1 text-xs text-stone-500">Escolha A (antes) e B (depois)</p>
              <ul className="max-h-[60vh] space-y-0.5 overflow-auto">
                {versoes.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50">
                    <span className="flex-1">{dataHora(v.capturadoEm)}</span>
                    <button onClick={() => setSelA(v.id)} className={`size-7 rounded-md text-xs font-bold ${idA === v.id ? "bg-red-600 text-white" : "bg-stone-100 text-stone-600"}`}>A</button>
                    <button onClick={() => setSelB(v.id)} className={`size-7 rounded-md text-xs font-bold ${idB === v.id ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600"}`}>B</button>
                  </li>
                ))}
              </ul>
            </Cartao>
            <Cartao>
              {vA && vB ? (
                <>
                  <p className="mb-3 text-sm text-stone-600">
                    <b className="text-red-700">A</b> {dataHora(vA.capturadoEm)} → <b className="text-emerald-700">B</b> {dataHora(vB.capturadoEm)}
                  </p>
                  <DiffView antigo={vA.texto} novo={vB.texto} />
                  {vA.temCaptura && vB.temCaptura && (
                    <div className="mt-5 border-t border-stone-100 pt-4">
                      <h3 className="mb-3 text-sm font-semibold">Comparação visual</h3>
                      <ComparacaoVisual monitorId={id} antes={vA.id} depois={vB.id} />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-stone-500">Selecione duas versões.</p>
              )}
            </Cartao>
          </div>
        )
      )}

      {aba === "atual" && (
        versoes[0] ? (
          <Cartao>
            <p className="mb-2 text-xs text-stone-500">Capturado em {dataHora(versoes[0].capturadoEm)}</p>
            <div className={versoes[0].temCaptura ? "grid gap-4 lg:grid-cols-2" : ""}>
              <pre className="max-h-[65vh] overflow-auto text-sm whitespace-pre-wrap break-words">{versoes[0].texto}</pre>
              {versoes[0].temCaptura && (
                <div className="max-h-[65vh] overflow-auto">
                  <ImagemCaptura monitorId={id} versaoId={versoes[0].id} />
                </div>
              )}
            </div>
          </Cartao>
        ) : (
          <Vazio titulo="Ainda sem captura">Clique em “Verificar agora”.</Vazio>
        )
      )}
    </>
  );
}
