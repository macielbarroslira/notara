import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icone } from "../components/Icone";
import { Botao, Cabecalho, Carregando, classeInput, StatusBadge, Vazio } from "../components/ui";
import { nomeIntervalo, nomeTipo } from "../lib/constantes";
import { useAlteracoes, useMonitores } from "../lib/dados";
import { dominio, relativo } from "../lib/tempo";
import type { Monitor } from "../types";

type Filtro = "todos" | "ativos" | "pausados" | "erro";

const filtros: { id: Filtro; nome: string; teste: (m: Monitor) => boolean }[] = [
  { id: "todos", nome: "Todos", teste: () => true },
  { id: "ativos", nome: "Ativos", teste: (m) => m.ativo && m.exec?.status !== "erro" },
  { id: "pausados", nome: "Pausados", teste: (m) => !m.ativo },
  { id: "erro", nome: "Com erro", teste: (m) => m.ativo && m.exec?.status === "erro" },
];

export function Monitores() {
  const { dados: monitores, carregando } = useMonitores();
  const { dados: naoLidas } = useAlteracoes({ naoLidas: true }, 100);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [tag, setTag] = useState<string | null>(null);

  const porMonitor = useMemo(() => {
    const m = new Map<string, number>();
    naoLidas.forEach((a) => m.set(a.monitorId, (m.get(a.monitorId) ?? 0) + 1));
    return m;
  }, [naoLidas]);

  const tags = useMemo(() => [...new Set(monitores.flatMap((m) => m.tags ?? []))].sort(), [monitores]);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const f = filtros.find((x) => x.id === filtro)!;
    return monitores.filter(
      (m) =>
        f.teste(m) &&
        (!tag || m.tags?.includes(tag)) &&
        (!b || m.nome.toLowerCase().includes(b) || m.url.toLowerCase().includes(b)),
    );
  }, [monitores, busca, filtro, tag]);

  return (
    <>
      <Cabecalho
        titulo="Monitores"
        sub={monitores.length ? `${monitores.length} site(s) monitorado(s)` : undefined}
        acoes={
          <Link to="/monitores/novo" className="hidden md:block lg:hidden">
            <Botao variante="primario" icone="mais">Novo monitor</Botao>
          </Link>
        }
      />

      {monitores.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="relative">
            <Icone nome="busca" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou URL" className={`${classeInput} pl-9`} />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {filtros.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${filtro === f.id ? "bg-orange-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"}`}
              >
                {f.nome}
              </button>
            ))}
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${tag === t ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"}`}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}

      {carregando ? (
        <Carregando />
      ) : monitores.length === 0 ? (
        <Vazio titulo="Nenhum monitor ainda">
          <p>Cadastre um site para ser avisado quando ele mudar. Alguns exemplos:</p>
          <ul className="mx-auto mt-3 max-w-md space-y-1 text-left">
            <li>💰 Queda de preço de um produto</li>
            <li>📦 Produto que voltou ao estoque</li>
            <li>📰 Notícias novas num site ou feed</li>
            <li>🏛️ Editais, concursos e vagas publicados</li>
            <li>🟢 Seu site saiu do ar</li>
          </ul>
          <Link to="/monitores/novo" className="mt-5 inline-block">
            <Botao variante="primario" icone="mais">Criar primeiro monitor</Botao>
          </Link>
        </Vazio>
      ) : lista.length === 0 ? (
        <Vazio titulo="Nada encontrado">Ajuste a busca ou os filtros.</Vazio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((m) => (
            <Link
              key={m.id}
              to={`/monitores/${m.id}`}
              className="group flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 transition hover:shadow-md hover:ring-orange-300"
            >
              <div className="flex items-start gap-3">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${dominio(m.url)}&sz=64`}
                  alt=""
                  className="mt-0.5 size-8 shrink-0 rounded-lg bg-stone-100"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold text-stone-900 group-hover:text-orange-900">{m.nome}</h2>
                    {porMonitor.get(m.id) ? (
                      <span className="rounded-full bg-amber-500 px-1.5 text-[11px] leading-5 font-bold text-white">{porMonitor.get(m.id)}</span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-stone-500">{dominio(m.url)}</p>
                </div>
                <StatusBadge monitor={m} />
              </div>
              <p className="mt-3 line-clamp-2 min-h-10 text-sm text-stone-600">
                {m.exec?.status === "erro" ? <span className="text-red-700">{m.exec.mensagem}</span> : m.exec?.preview || "Aguardando a primeira verificação…"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
                <span>{nomeTipo(m.tipo)}</span>
                <span>⏱ {nomeIntervalo(m.intervaloMin)}</span>
                <span>Verificado {relativo(m.exec?.ultima)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
