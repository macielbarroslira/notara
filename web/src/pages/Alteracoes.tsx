import { doc, writeBatch } from "firebase/firestore";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Botao, Cabecalho, Carregando, Vazio } from "../components/ui";
import { db } from "../firebase";
import { useAlteracoes, useUid } from "../lib/dados";
import { dominio, relativo } from "../lib/tempo";
import type { Alteracao } from "../types";

export function ListaAlteracoes({ itens, semNome }: { itens: Alteracao[]; semNome?: boolean }) {
  return (
    <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
      {itens.map((a) => (
        <li key={a.id}>
          <Link to={`/alteracoes/${a.id}`} className="flex gap-3 px-4 py-3 hover:bg-orange-50/50">
            <span className={`mt-2 size-2.5 shrink-0 rounded-full ${a.lida ? "bg-transparent" : "bg-amber-500"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`truncate ${a.lida ? "text-stone-700" : "font-semibold text-stone-900"}`}>
                  {semNome ? relativo(a.criadoEm) : a.monitorNome}
                </p>
                {!semNome && <span className="shrink-0 text-xs text-stone-500">{relativo(a.criadoEm)}</span>}
              </div>
              <p className="line-clamp-2 text-sm text-stone-600">{a.resumo}</p>
              {!semNome && <p className="mt-0.5 truncate text-xs text-stone-400">{dominio(a.url)}</p>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Alteracoes() {
  const uid = useUid();
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const { dados, carregando } = useAlteracoes({ naoLidas: soNaoLidas || undefined }, 100);
  const { dados: naoLidas } = useAlteracoes({ naoLidas: true }, 100);
  const [marcando, setMarcando] = useState(false);

  async function marcarTodas() {
    setMarcando(true);
    const lote = writeBatch(db);
    naoLidas.forEach((a) => lote.update(doc(db, `users/${uid}/alteracoes/${a.id}`), { lida: true }));
    await lote.commit().finally(() => setMarcando(false));
  }

  return (
    <>
      <Cabecalho
        titulo="Alterações"
        sub={naoLidas.length ? `${naoLidas.length} não lida(s)` : "Tudo em dia"}
        acoes={naoLidas.length > 0 && <Botao icone="check" onClick={marcarTodas} carregando={marcando}>Marcar todas como lidas</Botao>}
      />
      <div className="mb-4 flex gap-2">
        {[
          [false, "Todas"],
          [true, "Não lidas"],
        ].map(([v, nome]) => (
          <button
            key={String(v)}
            onClick={() => setSoNaoLidas(v as boolean)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${soNaoLidas === v ? "bg-orange-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"}`}
          >
            {nome as string}
          </button>
        ))}
      </div>
      {carregando ? (
        <Carregando />
      ) : dados.length === 0 ? (
        <Vazio titulo={soNaoLidas ? "Nenhuma alteração não lida" : "Nenhuma alteração ainda"}>
          Quando um site monitorado mudar, você verá aqui o que entrou e o que saiu.
        </Vazio>
      ) : (
        <ListaAlteracoes itens={dados} />
      )}
    </>
  );
}
