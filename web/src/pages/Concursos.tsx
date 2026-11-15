import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icone } from "../components/Icone";
import { Aviso, Botao, Cabecalho, Campo, Carregando, Cartao, classeInput, Selo, StatusBadge } from "../components/ui";
import { db } from "../firebase";
import { useAlteracoes, useAuth, useMonitores, useUid } from "../lib/dados";
import { mensagemErro } from "../lib/erros";
import { FONTES_CONCURSOS, monitorDeFonte, type FonteConcursos } from "../lib/modelos";
import { dominio, relativo } from "../lib/tempo";
import { ListaAlteracoes } from "./Alteracoes";

/** Seguir bancas e agregadores: avisa quando aparece um concurso novo na lista deles. */
export function Concursos() {
  const uid = useUid();
  const { user } = useAuth();
  const { dados: monitores, carregando } = useMonitores();
  const { dados: alteracoes } = useAlteracoes({}, 100);
  const [filtro, setFiltro] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const seguindo = useMemo(() => {
    const mapa = new Map<string, (typeof monitores)[number]>();
    for (const m of monitores) if (m.tags?.includes("descobrir-concursos")) mapa.set(m.url, m);
    return mapa;
  }, [monitores]);
  const idsSeguidos = new Set([...seguindo.values()].map((m) => m.id));
  const novidades = alteracoes.filter((a) => idsSeguidos.has(a.monitorId));

  async function seguir(f: FonteConcursos) {
    setErro("");
    setOcupado(f.id);
    try {
      await addDoc(collection(db, `users/${uid}/monitores`), {
        ...monitorDeFonte(f, filtro, user?.email ?? ""),
        criadoEm: serverTimestamp(),
        exec: { status: "novo", proxima: serverTimestamp() },
      });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(null);
    }
  }

  async function deixar(f: FonteConcursos) {
    const m = seguindo.get(f.url);
    if (!m) return;
    setOcupado(f.id);
    await updateDoc(doc(db, `users/${uid}/monitores/${m.id}`), { excluido: true, ativo: false }).finally(() => setOcupado(null));
  }

  if (carregando) return <Carregando />;

  return (
    <div className="mx-auto max-w-5xl">
      <Cabecalho
        titulo="Achar concursos novos"
        sub="Siga bancas e agregadores. O Notara avisa só quando aparece um item novo na lista deles."
      />

      <Cartao className="mb-4">
        <Campo
          rotulo="Filtro (opcional)"
          dica="Só avisar quando a novidade contiver este termo — ex.: TI, Brasília, Analista. Vale para as fontes que você seguir agora."
        >
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Ex.: Analista" className={classeInput} />
        </Campo>
      </Cartao>

      {erro && (
        <div className="mb-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {FONTES_CONCURSOS.map((f) => {
          const m = seguindo.get(f.url);
          return (
            <div key={f.id} className="flex flex-col rounded-card bg-card p-5 shadow-card">
              <div className="flex items-start gap-3">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${dominio(f.url)}&sz=64`}
                  alt=""
                  className="size-9 shrink-0 rounded-sm bg-panel"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-medium">{f.nome}</h2>
                    {f.tipo === "agregador" && <Selo cor="accent">Agregador</Selo>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{f.desc}</p>
                  <a href={f.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block truncate text-xs text-faint hover:text-ink">
                    {dominio(f.url)}
                  </a>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                {m ? (
                  <>
                    <Link to={`/monitores/${m.id}`} className="flex items-center gap-2 text-sm text-muted hover:text-ink">
                      <StatusBadge monitor={m} />
                      <span className="font-mono text-xs">{m.exec?.ultima ? `verificado ${relativo(m.exec.ultima)}` : "aguardando"}</span>
                    </Link>
                    <Botao variante="fantasma" carregando={ocupado === f.id} onClick={() => deixar(f)}>
                      Deixar de seguir
                    </Botao>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-faint">Verifica a cada hora</span>
                    <Botao variante="primario" icone="mais" carregando={ocupado === f.id} onClick={() => seguir(f)}>
                      Seguir
                    </Botao>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-medium tracking-[-0.02em]">Concursos que apareceram</h2>
        <span className="font-mono text-xs text-faint">{novidades.length} novidade(s)</span>
      </div>
      {novidades.length ? (
        <ListaAlteracoes itens={novidades} />
      ) : (
        <p className="rounded-card bg-card-2 p-6 text-center text-sm text-muted shadow-ring">
          {seguindo.size
            ? "Nenhum concurso novo ainda. A primeira verificação só registra a lista atual — os próximos itens que surgirem aparecem aqui."
            : "Siga pelo menos uma fonte acima para começar."}
        </p>
      )}
      <p className="mt-6 flex items-center gap-2 text-xs text-faint">
        <Icone nome="alerta" className="size-3.5" /> Cada fonte seguida vira um monitor na sua lista.
      </p>
    </div>
  );
}
