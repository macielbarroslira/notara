import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Icone, type NomeIcone } from "../components/Icone";
import { Cabecalho, Carregando, Cartao, StatusBadge } from "../components/ui";
import { useAlteracoes, useAlteracoesDesde, useAuth, useMonitores } from "../lib/dados";
import { MODELOS } from "../lib/modelos";
import { dominio, relativo } from "../lib/tempo";
import { ListaAlteracoes } from "./Alteracoes";

const DIAS = 14;
const fmtDia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit" });
const fmtLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const chaveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function Numero({ valor, rotulo, destaque, para }: { valor: number; rotulo: string; destaque?: "danger" | "accent"; para: string }) {
  const cor = destaque === "danger" && valor > 0 ? "text-danger" : destaque === "accent" && valor > 0 ? "text-accent" : "text-ink";
  return (
    <Link to={para} className="rounded-card bg-card p-4 shadow-card transition hover:-translate-y-0.5 sm:p-5">
      <p className={`font-mono text-[28px] leading-none sm:text-[34px] ${cor}`}>{valor}</p>
      <p className="mt-2 text-[13px] text-muted">{rotulo}</p>
    </Link>
  );
}

function Grafico({ datas }: { datas: Date[] }) {
  const dias = useMemo(() => {
    const contagem = new Map<string, number>();
    datas.forEach((d) => contagem.set(chaveDia(d), (contagem.get(chaveDia(d)) ?? 0) + 1));
    return Array.from({ length: DIAS }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (DIAS - 1 - i));
      return { d, n: contagem.get(chaveDia(d)) ?? 0 };
    });
  }, [datas]);
  const max = Math.max(1, ...dias.map((x) => x.n));
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5 rounded-inner p-3 shadow-ring sm:gap-2">
        {dias.map(({ d, n }, i) => {
          const hoje = i === dias.length - 1;
          return (
            <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${d.toLocaleDateString("pt-BR")}: ${n} alteração(ões)`}>
              <div
                className={`w-full rounded-[5px] transition-all ${n === 0 ? "bg-frame" : hoje ? "bg-accent" : "bg-ink"}`}
                style={{ height: `${n === 0 ? 6 : Math.max(10, (n / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 px-3 font-mono text-[10px] text-faint sm:gap-2">
        {dias.map(({ d }, i) => (
          <span key={i} className={`flex-1 text-center ${i % 2 ? "max-sm:invisible" : ""}`}>
            {fmtDia.format(d)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Atalho({ para, icone, nome }: { para: string; icone: NomeIcone; nome: string }) {
  return (
    <Link to={para} className="flex items-center gap-3 rounded-inner p-3 shadow-ring transition hover:bg-card-2">
      <span className="grid size-9 place-items-center rounded-sm bg-panel text-ink">
        <Icone nome={icone} className="size-4" />
      </span>
      <span className="flex-1 text-sm font-medium text-ink">{nome}</span>
      <Icone nome="seta" className="size-4 text-faint" />
    </Link>
  );
}

export function Painel() {
  const { user } = useAuth();
  const { dados: monitores, carregando } = useMonitores();
  const { dados: recentes } = useAlteracoesDesde(DIAS);
  const { dados: naoLidas } = useAlteracoes({ naoLidas: true }, 100);

  const ativos = monitores.filter((m) => m.ativo);
  const comErro = ativos.filter((m) => m.exec?.status === "erro");
  const hoje = chaveDia(new Date());
  const novidadesHoje = recentes.filter((a) => a.criadoEm && chaveDia(a.criadoEm.toDate()) === hoje).length;
  const proximas = [...ativos]
    .filter((m) => m.exec?.proxima)
    .sort((a, b) => a.exec!.proxima!.toMillis() - b.exec!.proxima!.toMillis())
    .slice(0, 5);
  const nome = user?.displayName?.split(" ")[0];

  if (carregando) return <Carregando />;

  return (
    <>
      <Cabecalho
        titulo={nome ? `Olá, ${nome}` : "Painel"}
        sub={<span className="first-letter:uppercase">{fmtLongo.format(new Date())}</span>}
      />

      {monitores.length === 0 ? (
        <Cartao className="mb-6">
          <h2 className="text-xl font-medium tracking-[-0.01em]">Comece por um modelo</h2>
          <p className="mt-1 text-[15px] text-muted">Em 1 minuto você tem seu primeiro alerta funcionando.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Atalho para="/concursos" icone="busca" nome="Achar concursos novos" />
            {MODELOS.slice(0, 3).map((m) => (
              <Atalho key={m.id} para={`/monitores/novo?modelo=${m.id}`} icone={m.icone} nome={m.nome} />
            ))}
          </div>
        </Cartao>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero valor={ativos.length} rotulo="Monitores ativos" para="/monitores" />
        <Numero valor={novidadesHoje} rotulo="Novidades hoje" destaque="accent" para="/alteracoes" />
        <Numero valor={naoLidas.length} rotulo="Não lidas" destaque="accent" para="/alteracoes" />
        <Numero valor={comErro.length} rotulo="Com erro" destaque="danger" para="/monitores" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Cartao>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-medium tracking-[-0.01em]">Atividade</h2>
            <span className="font-mono text-xs text-faint">últimos {DIAS} dias · {recentes.length} alterações</span>
          </div>
          <Grafico datas={recentes.map((a) => a.criadoEm?.toDate()).filter((d): d is Date => Boolean(d))} />
        </Cartao>

        <Cartao>
          <h2 className="mb-3 text-[17px] font-medium tracking-[-0.01em]">Precisa de atenção</h2>
          {comErro.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ok">
              <Icone nome="check" className="size-4" /> Tudo funcionando
            </p>
          ) : (
            <ul className="space-y-2">
              {comErro.slice(0, 4).map((m) => (
                <li key={m.id}>
                  <Link to={`/monitores/${m.id}`} className="block rounded-inner p-3 shadow-ring hover:bg-card-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{m.nome}</span>
                      <StatusBadge monitor={m} />
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted">{m.exec?.mensagem}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-6 mb-3 text-[17px] font-medium tracking-[-0.01em]">Próximas verificações</h2>
          {proximas.length === 0 ? (
            <p className="text-sm text-muted">Nenhum monitor ativo.</p>
          ) : (
            <ul className="divide-y divide-line">
              {proximas.map((m) => (
                <li key={m.id}>
                  <Link to={`/monitores/${m.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{m.nome}</span>
                      <span className="block truncate text-xs text-faint">{dominio(m.url)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted">{relativo(m.exec?.proxima)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <div className="mt-8 mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-medium tracking-[-0.02em]">Novidades recentes</h2>
        <Link to="/alteracoes" className="text-sm text-accent hover:underline">
          Ver todas
        </Link>
      </div>
      {recentes.length ? (
        <ListaAlteracoes itens={recentes.slice(0, 6)} />
      ) : (
        <p className="rounded-card bg-card-2 p-6 text-center text-sm text-muted shadow-ring">
          Quando algum site mudar, as novidades aparecem aqui.
        </p>
      )}
    </>
  );
}
