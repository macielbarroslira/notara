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
    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-line">
      {itens.map((a) => (
        <li key={a.id}>
          <Link to={`/alteracoes/${a.id}`} className="flex gap-3 px-4 py-3 hover:bg-panel/50">
            <span className={`mt-2 size-2.5 shrink-0 rounded-full ${a.lida ? "bg-transparent" : "bg-accent"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`truncate ${a.lida ? "text-ink-2" : "font-semibold text-ink"}`}>
                  {semNome ? relativo(a.criadoEm) : a.monitorNome}
                </p>
                {!semNome && <span className="shrink-0 text-xs text-muted">{relativo(a.criadoEm)}</span>}
              </div>
              <p className="line-clamp-2 text-sm text-muted">{a.resumo}</p>
              {!semNome && <p className="mt-0.5 truncate text-xs text-faint">{dominio(a.url)}</p>}
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
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${soNaoLidas === v ? "bg-ink text-on-ink" : "bg-card text-ink-2 ring-1 ring-line-2"}`}
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
