import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AREAS,
  dataCurta,
  diasAte,
  ESCOLARIDADES,
  ESFERAS,
  FILTROS_PADRAO,
  filtrar,
  hojeBrasilia,
  situacaoAgora,
  UFS,
  useBancoConcursos,
  type FiltrosConcurso,
  type LinhaConcurso,
} from "../lib/concursos";
import { relativo } from "../lib/tempo";
import { Icone } from "./Icone";
import { Aviso, Botao, classeInput, Selo, Spinner } from "./ui";

const POR_PAGINA = 40;
const SALARIOS = [0, 2000, 3000, 5000, 8000, 10000, 15000, 20000];
const nomeUf = new Map(UFS);
const nomeArea = new Map(AREAS);
const nomeEsc = new Map(ESCOLARIDADES);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const classeSelect =
  "h-10 rounded-full border-0 bg-card px-3 pr-8 text-sm text-ink shadow-ring focus:ring-2 focus:ring-accent focus:outline-none";

function lerFiltros(p: URLSearchParams): FiltrosConcurso {
  return {
    texto: p.get("q") ?? "",
    uf: p.get("uf") ?? "",
    escolaridade: p.get("esc") ?? "",
    area: p.get("area") ?? "",
    esfera: p.get("esfera") ?? "",
    salarioMin: Number(p.get("sal")) || 0,
    todos: p.get("todos") === "1",
    ordenar: (["prazo", "salario", "vagas", "recentes"] as const).find((o) => o === p.get("ordem")) ?? "prazo",
  };
}

function SeloSituacao({ l, hoje }: { l: LinhaConcurso; hoje: string }) {
  const s = situacaoAgora(l, hoje);
  if (s === "suspenso") return <Selo cor="danger">Suspenso</Selo>;
  if (s === "encerrado") return <Selo>Encerrado</Selo>;
  if (s === "em_breve") return <Selo cor="accent">Abre {dataCurta(l.ii)}</Selo>;
  if (s === "sem_data") return <Selo>Sem data</Selo>;
  const d = diasAte(l.if, hoje) ?? 0;
  return <Selo cor={d <= 3 ? "warn" : "ok"}>{d === 0 ? "Termina hoje" : d === 1 ? "Termina amanhã" : `${d} dias`}</Selo>;
}

function CartaoConcurso({ l, hoje }: { l: LinhaConcurso; hoje: string }) {
  const novo = Date.now() - l.p < 3 * 86_400_000;
  const local = [l.c, l.u === "BR" ? "Nacional" : nomeUf.get(l.u) ?? l.u].filter(Boolean).join(" · ");
  return (
    <article className="relative flex flex-col gap-2.5 rounded-card bg-card p-4 shadow-card transition-shadow hover:shadow-[0_0_0_1px_var(--line-2),0_8px_24px_-12px_rgba(17,17,22,0.25)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] leading-snug font-medium text-ink">
            <Link to={`/concursos/${l.i}`} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none">
              {l.o}
            </Link>
          </h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {local}
            {l.t === "processo_seletivo" && " · processo seletivo"}
            {l.t === "residencia" && " · residência"}
            {l.bn && ` · ${l.bn}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <SeloSituacao l={l} hoje={hoje} />
          {novo && <Selo cor="accent">Novo</Selo>}
          {l.si === "prorrogado" && <Selo cor="warn">Prorrogado</Selo>}
          {l.si === "reaberto" && <Selo cor="warn">Reaberto</Selo>}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-ink">{l.v ? `${l.v.toLocaleString("pt-BR")} vaga${l.v > 1 ? "s" : ""}` : l.cr ? "Cadastro de reserva" : "Vagas não informadas"}</span>
        {l.s ? <span className="text-ink-2">até {brl(l.s)}</span> : null}
        <span className="text-muted">{l.es.map((e) => nomeEsc.get(e) ?? e).join(" · ")}</span>
      </div>
      {l.cg && l.cg !== "Vários cargos" && <p className="line-clamp-2 text-[13px] text-muted">{l.cg}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="font-mono text-xs text-faint">
          Inscrições {l.ii ? `${dataCurta(l.ii)} a ` : "até "}
          {dataCurta(l.if)}
          {l.pv && l.pv >= hoje && ` · prova ${dataCurta(l.pv)}`}
          {l.a.length > 0 && ` · ${l.a.map((a) => nomeArea.get(a) ?? a).join(", ")}`}
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-accent">
          Ver ficha <Icone nome="seta" className="size-3.5" />
        </span>
      </div>
    </article>
  );
}

export function BancoConcursos() {
  const { linhas, atualizadoEm, erro } = useBancoConcursos();
  const [params, setParams] = useSearchParams();
  const filtros = lerFiltros(params);
  const textoAdiado = useDeferredValue(filtros.texto);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const hoje = hojeBrasilia();

  const resultado = useMemo(
    () => (linhas ? filtrar(linhas, { ...filtros, texto: textoAdiado }, hoje) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas, textoAdiado, filtros.uf, filtros.escolaridade, filtros.area, filtros.esfera, filtros.salarioMin, filtros.todos, filtros.ordenar, hoje],
  );

  function mudar(campo: string, valor: string) {
    setMostrar(POR_PAGINA);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (valor) n.set(campo, valor);
        else n.delete(campo);
        return n;
      },
      { replace: true },
    );
  }
  const temFiltro = ["q", "uf", "esc", "area", "esfera", "sal", "todos"].some((k) => params.get(k));

  if (linhas === null) {
    return (
      <div className="flex justify-center py-16 text-faint">
        <Spinner className="size-7" />
      </div>
    );
  }
  if (!linhas.length) {
    return <Aviso>{erro ? `Não foi possível carregar o banco (${erro}).` : "O banco de concursos ainda está sendo montado. Volte em alguns minutos."}</Aviso>;
  }

  return (
    <div>
      <div className="sticky top-[57px] z-10 -mx-4 bg-bg/90 px-4 pt-1 pb-3 backdrop-blur-lg sm:mx-0 sm:px-0 md:top-[84px]">
        <div className="relative">
          <Icone nome="busca" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
          <input
            value={filtros.texto}
            onChange={(e) => mudar("q", e.target.value)}
            placeholder="Cargo, órgão ou cidade — ex.: enfermeiro, analista ti, campinas"
            className={`${classeInput} rounded-full! pl-10`}
            type="search"
            aria-label="Buscar concursos"
          />
        </div>
        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <select value={filtros.uf} onChange={(e) => mudar("uf", e.target.value)} className={classeSelect} aria-label="Estado">
            <option value="">Todos os estados</option>
            {UFS.map(([s, n]) => (
              <option key={s} value={s}>
                {n}
              </option>
            ))}
          </select>
          <select value={filtros.escolaridade} onChange={(e) => mudar("esc", e.target.value)} className={classeSelect} aria-label="Escolaridade">
            <option value="">Qualquer escolaridade</option>
            {ESCOLARIDADES.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
          <select value={filtros.area} onChange={(e) => mudar("area", e.target.value)} className={classeSelect} aria-label="Área">
            <option value="">Todas as áreas</option>
            {AREAS.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
          <select value={String(filtros.salarioMin)} onChange={(e) => mudar("sal", e.target.value === "0" ? "" : e.target.value)} className={classeSelect} aria-label="Salário mínimo">
            {SALARIOS.map((s) => (
              <option key={s} value={s}>
                {s ? `A partir de ${brl(s)}` : "Qualquer salário"}
              </option>
            ))}
          </select>
          <select value={filtros.esfera} onChange={(e) => mudar("esfera", e.target.value)} className={classeSelect} aria-label="Esfera">
            <option value="">Federal, estadual e municipal</option>
            {ESFERAS.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
          <select value={filtros.ordenar} onChange={(e) => mudar("ordem", e.target.value === "prazo" ? "" : e.target.value)} className={classeSelect} aria-label="Ordenar">
            <option value="prazo">Prazo mais curto</option>
            <option value="salario">Maior salário</option>
            <option value="vagas">Mais vagas</option>
            <option value="recentes">Mais recentes</option>
          </select>
          <button
            onClick={() => mudar("todos", filtros.todos ? "" : "1")}
            className={`h-10 shrink-0 rounded-full px-3.5 text-sm shadow-ring transition-colors ${filtros.todos ? "bg-ink text-on-ink" : "bg-card text-ink-2 hover:bg-panel"}`}
          >
            Incluir encerrados
          </button>
        </div>
      </div>

      <div className="mt-2 mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{resultado.length.toLocaleString("pt-BR")}</span> concurso(s)
          {!filtros.todos && " com inscrição aberta ou em breve"}
          {temFiltro && (
            <button onClick={() => setParams({}, { replace: true })} className="ml-2 text-accent hover:underline">
              limpar filtros
            </button>
          )}
        </p>
        <span className="font-mono text-xs text-faint">
          {linhas.length} no banco · atualizado {relativo(atualizadoEm)}
        </span>
      </div>

      {resultado.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {resultado.slice(0, mostrar).map((l) => (
            <CartaoConcurso key={l.i} l={l} hoje={hoje} />
          ))}
        </div>
      ) : (
        <p className="rounded-card bg-card-2 p-8 text-center text-sm text-muted shadow-ring">Nenhum concurso com esses filtros. Tente tirar algum filtro ou incluir os encerrados.</p>
      )}
      {resultado.length > mostrar && (
        <div className="mt-5 flex justify-center">
          <Botao onClick={() => setMostrar((n) => n + POR_PAGINA)}>Mostrar mais ({resultado.length - mostrar})</Botao>
        </div>
      )}
      <p className="mt-6 text-xs text-faint">
        Fonte: PCI Concursos, atualizada a cada 2 horas. Confira sempre o edital oficial antes de se inscrever.
      </p>
    </div>
  );
}
