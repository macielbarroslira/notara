import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ComparacaoVisual } from "../components/ComparacaoVisual";
import { DiffView } from "../components/DiffView";
import { Icone } from "../components/Icone";
import { Botao, Cabecalho, Carregando, Cartao, Vazio } from "../components/ui";
import { db } from "../firebase";
import { useUid } from "../lib/dados";
import { dataHora } from "../lib/tempo";
import type { Alteracao } from "../types";

export function AlteracaoDetalhe() {
  const { id } = useParams();
  const uid = useUid();
  const [alt, setAlt] = useState<Alteracao | null | undefined>(undefined);
  const [textos, setTextos] = useState<{ antigo: string; novo: string; telas: boolean } | null>(null);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, `users/${uid}/alteracoes/${id}`), (s) =>
      setAlt(s.exists() ? ({ id: s.id, ...s.data() } as Alteracao) : null),
    );
  }, [uid, id]);

  // Marca como lida ao abrir
  useEffect(() => {
    if (alt && !alt.lida) updateDoc(doc(db, `users/${uid}/alteracoes/${alt.id}`), { lida: true });
  }, [alt, uid]);

  // Carrega as duas versões completas (podem ter sido apagadas pela retenção)
  useEffect(() => {
    if (!alt) return;
    const base = `users/${uid}/monitores/${alt.monitorId}/versoes`;
    Promise.all([getDoc(doc(db, `${base}/${alt.versaoAnterior}`)), getDoc(doc(db, `${base}/${alt.versaoNova}`))])
      .then(([a, b]) => {
        if (a.exists() && b.exists()) {
          setTextos({ antigo: a.get("texto"), novo: b.get("texto"), telas: Boolean(a.get("temCaptura") && b.get("temCaptura")) });
        }
      })
      .catch(() => {});
  }, [alt?.id, alt?.monitorId, alt?.versaoAnterior, alt?.versaoNova, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (alt === undefined) return <Carregando />;
  if (alt === null) return <Vazio titulo="Alteração não encontrada"><Link to="/alteracoes" className="text-orange-900 underline">Voltar</Link></Vazio>;

  const darFeedback = (feedback: "util" | "falso") => updateDoc(doc(db, `users/${uid}/alteracoes/${alt.id}`), { feedback });

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/alteracoes" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-orange-900">
        <Icone nome="voltar" className="size-4" /> Alterações
      </Link>
      <Cabecalho
        titulo={alt.monitorNome}
        sub={dataHora(alt.criadoEm)}
        acoes={
          <>
            <a href={alt.url} target="_blank" rel="noreferrer noopener">
              <Botao icone="externo">Abrir site</Botao>
            </a>
            <Link to={`/monitores/${alt.monitorId}`}>
              <Botao icone="monitores">Monitor</Botao>
            </Link>
          </>
        }
      />

      <Cartao className="mb-4">
        <p className="text-lg font-medium text-stone-900">{alt.resumo}</p>
        {alt.motivos && alt.motivos.length > 0 && (
          <p className="mt-2 text-sm text-stone-600">Condições atendidas: {alt.motivos.join(" · ")}</p>
        )}
      </Cartao>

      {alt.ineditas && alt.ineditas.length > 0 && (
        <Cartao className="mb-4 !bg-amber-50 ring-amber-200">
          <h2 className="mb-2 font-semibold text-amber-950">✨ Novidades ({alt.ineditas.length})</h2>
          <ul className="space-y-1.5 text-sm text-stone-800">
            {alt.ineditas.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="break-words">{l}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao className="mb-4">
        <h2 className="mb-3 font-semibold">O que mudou</h2>
        {textos ? (
          <DiffView antigo={textos.antigo} novo={textos.novo} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-emerald-700">ADICIONADO</p>
              <pre className="max-h-96 overflow-auto rounded-xl bg-emerald-50 p-3 text-sm whitespace-pre-wrap break-words">{alt.adicionado || "—"}</pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-red-700">REMOVIDO</p>
              <pre className="max-h-96 overflow-auto rounded-xl bg-red-50 p-3 text-sm whitespace-pre-wrap break-words">{alt.removido || "—"}</pre>
            </div>
          </div>
        )}
      </Cartao>

      {textos?.telas && (
        <Cartao className="mb-4">
          <h2 className="mb-3 font-semibold">Comparação visual</h2>
          <ComparacaoVisual monitorId={alt.monitorId} antes={alt.versaoAnterior} depois={alt.versaoNova} />
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-600">Este alerta foi útil?</p>
        <div className="flex gap-2">
          <Botao variante={alt.feedback === "util" ? "primario" : "secundario"} onClick={() => darFeedback("util")}>👍 Útil</Botao>
          <Botao variante={alt.feedback === "falso" ? "primario" : "secundario"} onClick={() => darFeedback("falso")}>👎 Alerta falso</Botao>
        </div>
      </Cartao>
      {alt.feedback === "falso" && (
        <p className="mt-3 text-sm text-stone-600">
          Dica: em <Link className="text-orange-900 underline" to={`/monitores/${alt.monitorId}/editar`}>Editar › Opções avançadas</Link>, use
          “Ignorar textos” ou “Excluir elementos” para evitar esse tipo de alerta.
        </p>
      )}
    </div>
  );
}
