import { collection, doc, limit, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Icone } from "../components/Icone";
import { Aviso, Carregando, Selo } from "../components/ui";
import { db } from "../firebase";
import { AREAS, diasAte, ESCOLARIDADES, hojeBrasilia, situacaoAgora, UFS, type LinhaConcurso } from "../lib/concursos";
import { mensagemErro } from "../lib/erros";

interface DataCronograma {
  tipo: string;
  data: string;
  fim?: string;
  hora?: string;
}
interface Ficha {
  publicadoEm: string | null;
  banca: string | null;
  siteBanca?: string | null;
  siteInscricao: string | null;
  inscricaoModo?: "online" | "presencial" | "online_e_presencial" | null;
  organizacaoPropria?: boolean;
  taxa: { min: number; max: number } | null;
  salario: { min: number; max: number } | null;
  jornada: { min: number; max: number } | null;
  regime: "estatutario" | "clt" | "temporario" | null;
  validade: { meses: number; prorrogavel: boolean } | null;
  etapas: string[];
  beneficios: string[];
}
interface Concurso {
  orgao: string;
  titulo: string;
  uf: string;
  cidade: string | null;
  esfera: string;
  tipo: string;
  vagas: number | null;
  cadastroReserva: boolean;
  salarioMax: number | null;
  cargos: string[];
  variosCargos: boolean;
  cargosDetalhe?: Array<{ nome: string; vagas: number | null; cr?: boolean }>;
  escolaridades: string[];
  areas: string[];
  inscricaoInicio: string | null;
  inscricaoFim: string | null;
  situacao: LinhaConcurso["si"];
  link: string;
  links?: { fonte?: string; inscricao?: string; banca?: string; edital?: string };
  iaPesquisa?: { banca: string | null; site: string | null; edital: string | null; modelo: string };
  ficha?: Ficha;
  cronograma?: DataCronograma[];
  banca?: string | null;
  status?: string;
  atualizadoEm?: Timestamp;
  detalhadoEm?: Timestamp;
}
interface Evento {
  id: string;
  tipo: string;
  resumo: string;
  em: Timestamp;
  link?: string;
}

const NOME_DATA: Record<string, string> = {
  inscricao: "Inscrições",
  isencao: "Pedido de isenção da taxa",
  pagamento: "Pagamento do boleto",
  prova_objetiva: "Prova objetiva",
  prova_discursiva: "Prova discursiva / redação",
  prova_pratica: "Prova prática",
  taf: "Teste de aptidão física",
  titulos: "Prova de títulos",
  avaliacao_psicologica: "Avaliação psicológica",
  prova: "Provas",
};
const ICONE_EVENTO: Record<string, string> = {
  novo: "🆕",
  retificacao: "📝",
  prorrogacao: "⏩",
  prorrogado: "⏩",
  reabertura: "🔓",
  reaberto: "🔓",
  suspensao: "⛔",
  suspenso: "⛔",
  resultado: "🏁",
  inscricoes_alteradas: "📅",
  noticia: "📰",
  atualizado: "✏️",
};
const nomeUf = new Map(UFS);
const nomeEsc = new Map(ESCOLARIDADES);
const nomeArea = new Map(AREAS);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: n % 1 ? 2 : 0 });
const faixaBrl = (f: { min: number; max: number }) => (f.min === f.max ? brl(f.max) : `${brl(f.min)} a ${brl(f.max)}`);
const dataLonga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");

function quando(iso: string, hoje: string) {
  const d = diasAte(iso, hoje) ?? 0;
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  return d > 0 ? `em ${d} dias` : `há ${-d} dias`;
}

function Fato({ rotulo, children, destaque }: { rotulo: string; children: ReactNode; destaque?: boolean }) {
  return (
    <div className={`rounded-inner p-3.5 ${destaque ? "bg-accent-soft" : "bg-card-2 shadow-ring"}`}>
      <div className="text-xs text-muted">{rotulo}</div>
      <div className="mt-1 text-[15px] leading-snug font-medium text-ink">{children}</div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-card p-4 shadow-card sm:p-6">
      <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{titulo}</h2>
      {children}
    </section>
  );
}

export function ConcursoFicha() {
  const { id } = useParams();
  const [c, setC] = useState<Concurso | null | undefined>(undefined);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [erro, setErro] = useState("");
  const hoje = hojeBrasilia();

  useEffect(() => {
    if (!id) return;
    const a = onSnapshot(
      doc(db, `concursos/${id}`),
      (s) => setC(s.exists() ? (s.data() as Concurso) : null),
      (e) => setErro(mensagemErro(e)),
    );
    const b = onSnapshot(query(collection(db, `concursos/${id}/eventos`), orderBy("em", "desc"), limit(30)), (s) =>
      setEventos(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Evento, "id">) }))),
    );
    return () => {
      a();
      b();
    };
  }, [id]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (c === undefined) return <Carregando />;
  if (c === null) return <Aviso>Concurso não encontrado no banco.</Aviso>;

  const f = c.ficha;
  const linha = { ii: c.inscricaoInicio, if: c.inscricaoFim, si: c.situacao } as LinhaConcurso;
  const sit = situacaoAgora(linha, hoje);
  const local = [c.cidade, c.uf === "BR" ? "Nacional" : (nomeUf.get(c.uf) ?? c.uf)].filter(Boolean).join(" · ");
  const cronograma = [...(c.cronograma ?? [])];
  // Garante o período de inscrição da listagem (a fonte mais atual) mesmo sem ficha
  if (c.inscricaoFim && !cronograma.some((d) => d.tipo === "inscricao")) {
    cronograma.push({ tipo: "inscricao", data: c.inscricaoInicio ?? c.inscricaoFim, fim: c.inscricaoFim });
  }
  cronograma.sort((a, b) => a.data.localeCompare(b.data));
  const proxima = cronograma.find((d) => (d.fim ?? d.data) >= hoje);
  const cargos = c.cargosDetalhe?.length ? c.cargosDetalhe : c.cargos.map((nome) => ({ nome, vagas: null as number | null, cr: false }));
  const fimInscricao = c.inscricaoFim;
  const dias = diasAte(fimInscricao, hoje);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/concursos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <Icone nome="voltar" className="size-4" /> Concursos
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          {sit === "aberto" && <Selo cor={dias !== null && dias <= 3 ? "warn" : "ok"}>Inscrições abertas</Selo>}
          {sit === "em_breve" && <Selo cor="accent">Inscrições em breve</Selo>}
          {sit === "encerrado" && <Selo>Inscrições encerradas</Selo>}
          {sit === "suspenso" && <Selo cor="danger">Suspenso</Selo>}
          {c.situacao === "prorrogado" && <Selo cor="warn">Prorrogado</Selo>}
          {c.situacao === "reaberto" && <Selo cor="warn">Reaberto</Selo>}
          {c.status === "arquivado" && <Selo>Arquivado</Selo>}
        </div>
        <h1 className="mt-3 text-[26px] leading-tight font-medium tracking-[-0.03em] text-ink sm:text-[34px]">{c.orgao}</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {local} · {c.esfera === "outra" ? "órgão público" : c.esfera}
          {c.tipo === "processo_seletivo" ? " · processo seletivo" : c.tipo === "residencia" ? " · residência" : " · concurso público"}
          {(f?.banca ?? c.banca ?? (c.iaPesquisa?.banca && c.iaPesquisa.banca !== "própria" ? c.iaPesquisa.banca : null)) &&
            ` · banca ${f?.banca ?? c.banca ?? c.iaPesquisa?.banca}`}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Fato rotulo="Vagas">{c.vagas ? c.vagas.toLocaleString("pt-BR") : c.cadastroReserva ? "Cadastro de reserva" : "Não informado"}{c.vagas && c.cadastroReserva ? " + CR" : ""}</Fato>
        <Fato rotulo="Salário">{f?.salario ? faixaBrl(f.salario) : c.salarioMax ? `até ${brl(c.salarioMax)}` : "—"}</Fato>
        <Fato rotulo="Inscrições" destaque={sit === "aberto"}>
          {fimInscricao ? (
            <>
              {c.inscricaoInicio ? `${dataLonga(c.inscricaoInicio)} a ` : "até "}
              {dataLonga(fimInscricao)}
              {sit === "aberto" && dias !== null && <span className="block text-xs font-normal text-muted">{dias === 0 ? "termina hoje" : `faltam ${dias} dia${dias > 1 ? "s" : ""}`}</span>}
              {sit === "em_breve" && c.inscricaoInicio && <span className="block text-xs font-normal text-muted">abre {quando(c.inscricaoInicio, hoje)}</span>}
            </>
          ) : (
            "—"
          )}
        </Fato>
        <Fato rotulo="Taxa">{f?.taxa ? faixaBrl(f.taxa) : "—"}</Fato>
      </div>

      {c.status === "arquivado" && <Aviso>Este concurso saiu da fonte e foi arquivado. Os dados abaixo são do último registro.</Aviso>}

      <Secao titulo="Datas importantes">
        {cronograma.length ? (
          <ol className="relative space-y-0">
            {cronograma.map((d, i) => {
              const passou = (d.fim ?? d.data) < hoje;
              const atual = d === proxima;
              return (
                <li key={i} className="relative flex gap-3.5 pb-4 last:pb-0">
                  {i < cronograma.length - 1 && <span className="absolute top-3 left-[5px] h-full w-px bg-line-2" />}
                  <span className={`relative mt-1.5 size-[11px] shrink-0 rounded-full ${atual ? "bg-accent ring-4 ring-accent-soft" : passou ? "bg-line-3" : "bg-card shadow-ring"}`} />
                  <div className={`min-w-0 flex-1 ${passou ? "opacity-55" : ""}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-[15px] font-medium text-ink">{NOME_DATA[d.tipo] ?? d.tipo}</span>
                      <span className="font-mono text-xs text-faint">{quando(d.fim && d.fim >= hoje && d.data <= hoje ? d.fim : d.data, hoje)}</span>
                    </div>
                    <div className="text-sm text-muted">
                      {d.fim && d.fim !== d.data ? `${dataLonga(d.data)} a ${dataLonga(d.fim)}` : dataLonga(d.data)}
                      {d.hora && ` · até ${d.hora}`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted">As datas ainda não foram lidas da página deste concurso.</p>
        )}
        {f?.validade && (
          <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
            Validade do concurso: <span className="text-ink">{f.validade.meses % 12 ? `${f.validade.meses} meses` : `${f.validade.meses / 12} ano${f.validade.meses > 12 ? "s" : ""}`}</span>
            {f.validade.prorrogavel && ", prorrogável por igual período"}
          </p>
        )}
      </Secao>

      <Secao titulo={`Cargos${cargos.length ? ` (${cargos.length})` : ""}`}>
        {cargos.length ? (
          <ul className="divide-y divide-line">
            {cargos.map((g, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <span className="text-[15px] text-ink">{g.nome}</span>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {g.vagas ? `${g.vagas.toLocaleString("pt-BR")} vaga${g.vagas > 1 ? "s" : ""}` : g.cr ? "" : "—"}
                  {g.cr ? `${g.vagas ? " + " : ""}CR` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">A fonte ainda não detalhou os cargos ({c.variosCargos ? "vários cargos" : "não informado"}).</p>
        )}
      </Secao>

      <Secao titulo="Detalhes">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {[
            ["Escolaridade", c.escolaridades.map((e) => nomeEsc.get(e) ?? e).join(", ")],
            ["Jornada", f?.jornada ? (f.jornada.min === f.jornada.max ? `${f.jornada.max} h semanais` : `${f.jornada.min} a ${f.jornada.max} h semanais`) : ""],
            ["Regime", f?.regime ? { estatutario: "Estatutário", clt: "CLT", temporario: "Temporário" }[f.regime] : ""],
            ["Áreas", c.areas.map((a) => nomeArea.get(a) ?? a).join(", ")],
            ["Etapas", f?.etapas?.join(", ") ?? ""],
            ["Benefícios", f?.beneficios?.join(", ") ?? ""],
            [
              "Inscrição",
              f?.inscricaoModo === "presencial"
                ? "Presencial"
                : f?.inscricaoModo === "online_e_presencial"
                  ? "Pela internet ou presencial"
                  : f?.organizacaoPropria
                    ? "Pelo site do próprio órgão"
                    : f?.inscricaoModo === "online"
                      ? "Pela internet"
                      : "",
            ],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 text-ink first-letter:uppercase">{v}</dd>
              </div>
            ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          {c.links?.inscricao && (
            <a href={c.links.inscricao} target="_blank" rel="noreferrer noopener" className="btn-primario inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-[550]">
              Site de inscrição <Icone nome="externo" className="size-4" />
            </a>
          )}
          {c.links?.banca && c.links.banca !== c.links.inscricao && (
            <a href={c.links.banca} target="_blank" rel="noreferrer noopener" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-4 text-sm font-[550] text-ink shadow-ring hover:bg-panel">
              Site da banca{f?.banca ? ` (${f.banca})` : ""} <Icone nome="externo" className="size-4" />
            </a>
          )}
          {c.links?.edital && (
            <a href={c.links.edital} target="_blank" rel="noreferrer noopener" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-4 text-sm font-[550] text-ink shadow-ring hover:bg-panel">
              Edital <Icone nome="documento" className="size-4" />
            </a>
          )}
          <a href={c.links?.fonte ?? c.link} target="_blank" rel="noreferrer noopener" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-4 text-sm font-[550] text-ink shadow-ring hover:bg-panel">
            Notícia na fonte <Icone nome="externo" className="size-4" />
          </a>
        </div>
      </Secao>

      <Secao titulo="Linha do tempo">
        {eventos.length ? (
          <ul className="space-y-3">
            {eventos.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="w-5 shrink-0 text-center">{ICONE_EVENTO[e.tipo] ?? "•"}</span>
                <div className="min-w-0">
                  <div className="text-ink">{e.resumo}</div>
                  <div className="font-mono text-xs text-faint">{e.em.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Sem mudanças desde que o concurso entrou no banco. Retificações, prorrogações e novas datas aparecem aqui.</p>
        )}
      </Secao>

      <p className="pb-4 text-xs text-faint">
        {c.iaPesquisa && (c.iaPesquisa.site || c.iaPesquisa.edital || c.iaPesquisa.banca) && (
          <span className="mb-1 block">
            🤖 Banca/site/edital completados por pesquisa da IA no Google ({c.iaPesquisa.modelo}) — confira antes de se inscrever.
          </span>
        )}
        Dados extraídos automaticamente da notícia do PCI Concursos{f?.publicadoEm ? ` (publicada em ${dataLonga(f.publicadoEm)})` : ""}. Confira sempre o edital oficial.
      </p>
    </div>
  );
}
