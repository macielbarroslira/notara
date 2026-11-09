import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icone } from "../components/Icone";
import { SeletorVisual, type ResultadoSeletor } from "../components/SeletorVisual";
import { Aviso, Botao, Cabecalho, Campo, Carregando, Cartao, classeInput } from "../components/ui";
import { db } from "../firebase";
import { DIAS_SEMANA, INTERVALOS, monitorVazio, REGRAS, TIPOS } from "../lib/constantes";
import { useAuth, useMonitor, useUid } from "../lib/dados";
import { mensagemErro } from "../lib/erros";
import { fazerPedido, TEXTO_ESPERA, type EstadoPedido } from "../lib/pedidos";
import type { MonitorDados, Regra, TipoRegra } from "../types";

interface Previa {
  texto: string;
  tamanho: number;
  titulo: string | null;
  status: number;
  usouNavegador?: boolean;
}

/** Campo que ocupa só o tamanho do conteúdo (para selects em linha). */
const classeCompacta = classeInput.replace("w-full", "w-auto");

const HORAS = Array.from({ length: 25 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

const linhas = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <Cartao>
      <h2 className="font-semibold text-stone-900">{titulo}</h2>
      {sub && <p className="mb-1 text-sm text-stone-500">{sub}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Cartao>
  );
}

function normalizarUrl(u: string) {
  const t = u.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function MonitorForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const uid = useUid();
  const { user } = useAuth();
  const navegar = useNavigate();
  const { monitor, carregando } = useMonitor(id);

  const [m, setM] = useState<MonitorDados>(() => monitorVazio(user?.email ?? ""));
  const [seletoresTxt, setSeletoresTxt] = useState("");
  const [excluirTxt, setExcluirTxt] = useState("");
  const [ignorarTxt, setIgnorarTxt] = useState("");
  const [tagsTxt, setTagsTxt] = useState("");
  const [avancado, setAvancado] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [testando, setTestando] = useState(false);
  const [estadoTeste, setEstadoTeste] = useState<EstadoPedido | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [carregado, setCarregado] = useState(!editando);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [avisoNavegador, setAvisoNavegador] = useState("");

  function abrirSeletorVisual() {
    setErro("");
    const url = normalizarUrl(m.url);
    if (!url) return setErro("Informe a URL antes de escolher na página.");
    set("url", url);
    setSeletorAberto(true);
  }

  function usarSelecao(r: ResultadoSeletor) {
    setSeletorAberto(false);
    setSeletoresTxt(r.seletores.join("\n"));
    setPrevia(null);
    setM((x) => ({
      ...x,
      tipo: "elemento",
      usarNavegador: x.usarNavegador || r.precisaNavegador,
      nome: x.nome || (r.titulo ?? "").slice(0, 120),
    }));
    setAvisoNavegador(
      r.precisaNavegador && !m.usarNavegador
        ? "Esta página monta o conteúdo com JavaScript, então ativamos “Carregar como navegador”."
        : "",
    );
  }

  useEffect(() => {
    if (!editando || !monitor || carregado) return;
    const base = monitorVazio();
    const { id: _id, exec: _exec, criadoEm: _c, ...dados } = monitor;
    const completo: MonitorDados = {
      ...base,
      ...dados,
      regras: { ...base.regras, ...dados.regras },
      acoes: { ...base.acoes, ...dados.acoes },
      agenda: { ...base.agenda, ...dados.agenda },
      aoErrar: { ...base.aoErrar, ...dados.aoErrar },
    };
    setM(completo);
    setSeletoresTxt((completo.seletores ?? []).join("\n"));
    setExcluirTxt((completo.excluir ?? []).join("\n"));
    setIgnorarTxt((completo.ignorar ?? []).join("\n"));
    setTagsTxt((completo.tags ?? []).join(", "));
    setAvancado(Boolean(completo.excluir?.length || completo.ignorar?.length));
    setCarregado(true);
  }, [editando, monitor, carregado]);

  const set = <K extends keyof MonitorDados>(k: K, v: MonitorDados[K]) => setM((x) => ({ ...x, [k]: v }));
  const setAcao = (k: keyof MonitorDados["acoes"], v: string | boolean) => setM((x) => ({ ...x, acoes: { ...x.acoes, [k]: v } }));
  const setAgenda = (parte: Partial<MonitorDados["agenda"]>) => setM((x) => ({ ...x, agenda: { ...x.agenda, ...parte } }));
  const setRegras = (itens: Regra[]) => setM((x) => ({ ...x, regras: { ...x.regras, itens } }));

  async function testar() {
    setErro("");
    setPrevia(null);
    const url = normalizarUrl(m.url);
    if (!url) return setErro("Informe a URL.");
    set("url", url);
    setTestando(true);
    try {
      const { resultado } = await fazerPedido<Previa>(uid, "testar", {
        url,
        tipo: m.tipo,
        seletores: linhas(seletoresTxt),
        excluir: linhas(excluirTxt),
        jsonPath: m.jsonPath,
        usarNavegador: m.usarNavegador,
        esperarMs: m.esperarMs,
      }, { aoMudar: setEstadoTeste });
      const r = { data: resultado };
      setPrevia(r.data);
      if (r.data.usouNavegador && !m.usarNavegador) {
        set("usarNavegador", true);
        setAvisoNavegador("Esta página monta o conteúdo com JavaScript, então ativamos “Carregar como navegador”.");
      }
      if (!m.nome && r.data.titulo) set("nome", r.data.titulo.slice(0, 120));
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setTestando(false);
      setEstadoTeste(null);
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const url = normalizarUrl(m.url);
    const dados: MonitorDados = {
      ...m,
      url,
      nome: (m.nome.trim() || new URL(url).hostname).slice(0, 120),
      seletores: linhas(seletoresTxt).slice(0, 20),
      excluir: linhas(excluirTxt).slice(0, 20),
      ignorar: linhas(ignorarTxt).slice(0, 20),
      tags: tagsTxt.split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean).slice(0, 20),
      regras: {
        ...m.regras,
        itens: m.regras.itens
          .filter((r) => {
            const def = REGRAS.find((x) => x.id === r.tipo);
            return def?.semValor || def?.valorOpcional || r.valor.trim();
          })
          .slice(0, 10),
      },
    };
    if (dados.tipo === "elemento" && dados.seletores.length === 0) return setErro("Informe pelo menos um seletor CSS.");
    if (dados.agenda.fim <= dados.agenda.inicio) return setErro("Nos dias e horários, o horário final precisa ser depois do inicial.");
    setSalvando(true);
    try {
      if (editando && id) {
        await updateDoc(doc(db, `users/${uid}/monitores/${id}`), { ...dados, atualizadoEm: serverTimestamp() });
        navegar(`/monitores/${id}`);
      } else {
        // exec.proxima = agora: o motor faz a 1ª verificação na próxima rodada
        const ref = await addDoc(collection(db, `users/${uid}/monitores`), {
          ...dados,
          criadoEm: serverTimestamp(),
          exec: { status: "novo", proxima: serverTimestamp() },
        });
        navegar(`/monitores/${ref.id}`);
      }
    } catch (e2) {
      setErro(`Não foi possível salvar: ${(e2 as Error).message}`);
      setSalvando(false);
    }
  }

  if (editando && (carregando || !carregado)) return <Carregando />;

  return (
    <>
    {seletorAberto && (
      <SeletorVisual
        url={m.url}
        esperarMs={m.esperarMs}
        iniciais={m.tipo === "elemento" ? linhas(seletoresTxt) : []}
        onConcluir={usarSelecao}
        onFechar={() => setSeletorAberto(false)}
      />
    )}
    <form onSubmit={salvar} className="mx-auto max-w-3xl">
      <Link to={editando ? `/monitores/${id}` : "/"} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-orange-900">
        <Icone nome="voltar" className="size-4" /> Voltar
      </Link>
      <Cabecalho titulo={editando ? "Editar monitor" : "Novo monitor"} />

      <div className="space-y-4">
        <Secao titulo="1. O que monitorar">
          <Campo rotulo="Endereço (URL)">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                required
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="https://www.site.com.br/produto"
                value={m.url}
                onChange={(e) => set("url", e.target.value)}
                onBlur={() => set("url", normalizarUrl(m.url))}
                className={classeInput}
              />
              <Botao type="button" onClick={testar} carregando={testando} icone="busca" className="shrink-0">
                Testar
              </Botao>
            </div>
          </Campo>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-stone-700">Tipo</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TIPOS.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => set("tipo", t.id)}
                  className={`rounded-xl p-3 text-left ring-1 transition ${m.tipo === t.id ? "bg-orange-50 ring-2 ring-orange-700" : "bg-white ring-stone-300 hover:ring-stone-400"}`}
                >
                  <span className="block text-sm font-semibold">{t.nome}</span>
                  <span className="block text-xs text-stone-500">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {(m.tipo === "elemento" || m.tipo === "pagina") && (
            <button
              type="button"
              onClick={abrirSeletorVisual}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/60 p-3 text-left hover:bg-orange-50"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-900 text-white">
                <Icone nome="mira" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-orange-950">Escolher na página</span>
                <span className="block text-xs text-stone-600">Veja a página e toque no trecho que quer monitorar — sem precisar de seletor CSS.</span>
              </span>
            </button>
          )}

          {m.tipo === "elemento" && (
            <Campo
              rotulo="Seletores CSS (um por linha)"
              dica={<>Preenchido pelo “Escolher na página”, ou digite: <code>.preco</code>, <code>#estoque</code>, <code>h1.titulo</code>.</>}
            >
              <textarea rows={3} value={seletoresTxt} onChange={(e) => setSeletoresTxt(e.target.value)} className={`${classeInput} font-mono text-xs`} placeholder=".product-price" />
            </Campo>
          )}

          {(m.tipo === "elemento" || m.tipo === "pagina") && (
            <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={m.usarNavegador}
                  onChange={(e) => set("usarNavegador", e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-orange-800"
                />
                <span>
                  <span className="font-medium">Carregar como navegador</span>
                  <span className="block text-xs text-stone-500">
                    Para sites que montam o conteúdo com JavaScript (lojas, apps). Também salva um <b>screenshot</b> de cada versão para comparação visual.
                  </span>
                </span>
              </label>
              {m.usarNavegador && (
                <div className="mt-3 pl-8">
                  <Campo rotulo="Esperar depois de carregar">
                    <select value={m.esperarMs} onChange={(e) => set("esperarMs", Number(e.target.value))} className={`${classeInput} sm:w-48`}>
                      {[0, 2000, 5000, 10000].map((ms) => (
                        <option key={ms} value={ms}>{ms ? `${ms / 1000} segundos` : "Não esperar"}</option>
                      ))}
                    </select>
                  </Campo>
                </div>
              )}
              {avisoNavegador && <div className="mt-3"><Aviso>{avisoNavegador}</Aviso></div>}
            </div>
          )}

          {m.tipo === "json" && (
            <Campo rotulo="Caminho no JSON (opcional)" dica="Ex.: dados.itens[0].preco — vazio monitora a resposta inteira.">
              <input value={m.jsonPath} onChange={(e) => set("jsonPath", e.target.value)} className={`${classeInput} font-mono`} />
            </Campo>
          )}

          {testando && estadoTeste && (
            <Aviso>{TEXTO_ESPERA[estadoTeste]}</Aviso>
          )}

          {previa && (
            <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
              <p className="mb-2 text-xs text-stone-500">
                Prévia · HTTP {previa.status} · {previa.tamanho.toLocaleString("pt-BR")} caracteres{previa.titulo ? ` · ${previa.titulo}` : ""}
              </p>
              <pre className="max-h-64 overflow-auto text-sm whitespace-pre-wrap break-words text-stone-800">{previa.texto || "(vazio)"}</pre>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <input value={m.nome} maxLength={120} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Preço da cafeteira" className={classeInput} />
            </Campo>
            <Campo rotulo="Verificar a cada">
              <select value={m.intervaloMin} onChange={(e) => set("intervaloMin", Number(e.target.value))} className={classeInput}>
                {INTERVALOS.map((i) => (
                  <option key={i.min} value={i.min}>{i.nome}</option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <span className="block text-sm font-medium text-stone-700">Dias e horários (horário de Brasília)</span>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
              {DIAS_SEMANA.map((d, i) => {
                const dias = m.agenda.dias;
                const ligado = dias.length === 0 || dias.includes(i);
                return (
                  <button
                    type="button"
                    key={i}
                    aria-pressed={ligado}
                    onClick={() => {
                      const atuais = dias.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : dias;
                      const novos = ligado ? atuais.filter((x) => x !== i) : [...atuais, i].sort();
                      setAgenda({ dias: novos.length === 7 ? [] : novos });
                    }}
                    className={`size-9 rounded-full text-sm font-semibold ${ligado ? "bg-orange-900 text-white" : "bg-white text-stone-500 ring-1 ring-stone-300"}`}
                  >
                    {d}
                  </button>
                );
              })}
              <button type="button" onClick={() => setAgenda({ dias: [1, 2, 3, 4, 5] })} className="ml-1 rounded-full px-3 text-xs font-medium text-orange-900 ring-1 ring-orange-200 hover:bg-orange-50">
                Dias úteis
              </button>
              <button type="button" onClick={() => setAgenda({ dias: [] })} className="rounded-full px-3 text-xs font-medium text-orange-900 ring-1 ring-orange-200 hover:bg-orange-50">
                Todos
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span>Das</span>
              <select value={m.agenda.inicio} onChange={(e) => setAgenda({ inicio: e.target.value })} className={classeCompacta} aria-label="Hora de início">
                {HORAS.slice(0, -1).map((h) => <option key={h}>{h}</option>)}
              </select>
              <span>às</span>
              <select value={m.agenda.fim} onChange={(e) => setAgenda({ fim: e.target.value })} className={classeCompacta} aria-label="Hora de fim">
                {HORAS.slice(1).map((h) => <option key={h}>{h}</option>)}
              </select>
            </div>
            {m.agenda.fim <= m.agenda.inicio && <p className="mt-2 text-xs text-red-700">O horário final precisa ser depois do inicial.</p>}
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={m.agenda.aleatorio} onChange={(e) => setAgenda({ aleatorio: e.target.checked })} className="size-4 accent-orange-800" />
              Variar o horário um pouco (até +20% do intervalo)
            </label>
          </div>

          <Campo rotulo="Tags (separadas por vírgula)">
            <input value={tagsTxt} onChange={(e) => setTagsTxt(e.target.value)} placeholder="preços, trabalho" className={classeInput} />
          </Campo>

          {m.tipo !== "uptime" && m.tipo !== "json" && (
            <div>
              <button type="button" onClick={() => setAvancado(!avancado)} className="text-sm font-medium text-orange-900 hover:underline">
                {avancado ? "− Ocultar opções avançadas" : "+ Opções avançadas (excluir partes, ignorar ruído)"}
              </button>
              {avancado && (
                <div className="mt-3 space-y-4">
                  <Campo rotulo="Excluir elementos (seletores CSS, um por linha)" dica="Remove menus, anúncios, rodapés… antes de comparar.">
                    <textarea rows={2} value={excluirTxt} onChange={(e) => setExcluirTxt(e.target.value)} className={`${classeInput} font-mono`} placeholder={"nav\nfooter\n.anuncio"} />
                  </Campo>
                  <Campo rotulo="Ignorar textos (regex, uma por linha)" dica="Evita alertas falsos com relógios, contadores, datas.">
                    <textarea rows={2} value={ignorarTxt} onChange={(e) => setIgnorarTxt(e.target.value)} className={`${classeInput} font-mono`} placeholder={"\\d{2}:\\d{2}\n\\d+ visualizações"} />
                  </Campo>
                </div>
              )}
            </div>
          )}
        </Secao>

        <Secao titulo="2. Quando avisar" sub="Sem condições, você recebe um alerta a cada mudança.">
          {m.regras.itens.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200 sm:flex-row sm:items-center">
              <select
                value={r.tipo}
                onChange={(e) => setRegras(m.regras.itens.map((x, j) => (j === i ? { ...x, tipo: e.target.value as TipoRegra } : x)))}
                className={`${classeInput} sm:w-60`}
              >
                {REGRAS.map((op) => (
                  <option key={op.id} value={op.id}>{op.nome}</option>
                ))}
              </select>
              {!REGRAS.find((x) => x.id === r.tipo)?.semValor && (
                <input
                  value={r.valor}
                  onChange={(e) => setRegras(m.regras.itens.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                  placeholder={REGRAS.find((x) => x.id === r.tipo)?.dica}
                  className={classeInput}
                />
              )}
              <Botao type="button" variante="fantasma" icone="lixo" onClick={() => setRegras(m.regras.itens.filter((_, j) => j !== i))} aria-label="Remover condição" />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Botao type="button" icone="mais" disabled={m.regras.itens.length >= 10} onClick={() => setRegras([...m.regras.itens, { tipo: "contem", valor: "" }])}>
              Adicionar condição
            </Botao>
            {!m.regras.itens.some((r) => r.tipo === "nunca_visto") && (
              <button
                type="button"
                disabled={m.regras.itens.length >= 10}
                onClick={() => setRegras([...m.regras.itens, { tipo: "nunca_visto", valor: "" }])}
                className="rounded-full bg-amber-50 px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                title="Ideal para listas de editais e notícias: ignora mudanças de ordem"
              >
                ✨ Só avisar de itens novos
              </button>
            )}
            {m.regras.itens.length > 1 && (
              <select value={m.regras.operador} onChange={(e) => setM((x) => ({ ...x, regras: { ...x.regras, operador: e.target.value as "E" | "OU" } }))} className={classeCompacta}>
                <option value="E">Todas as condições (E)</option>
                <option value="OU">Qualquer condição (OU)</option>
              </select>
            )}
            {m.regras.itens.some((r) => r.tipo.startsWith("num") || r.tipo.startsWith("pct")) && (
              <select value={m.regras.formatoNumero} onChange={(e) => setM((x) => ({ ...x, regras: { ...x.regras, formatoNumero: e.target.value as "br" | "us" } }))} className={classeCompacta}>
                <option value="br">Números: 1.234,56</option>
                <option value="us">Números: 1,234.56</option>
              </select>
            )}
          </div>
        </Secao>

        <Secao titulo="3. Como avisar">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={m.acoes.push} onChange={(e) => setAcao("push", e.target.checked)} className="size-5 accent-orange-800" />
            Notificação push nos meus aparelhos <Link to="/configuracoes" className="text-orange-900 underline">(ativar)</Link>
          </label>
          <Campo rotulo="E-mail" dica="Deixe vazio para não receber por e-mail.">
            <input type="email" value={m.acoes.email} onChange={(e) => setAcao("email", e.target.value)} className={classeInput} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Slack (webhook)">
              <input type="url" value={m.acoes.slack} onChange={(e) => setAcao("slack", e.target.value)} placeholder="https://hooks.slack.com/…" className={classeInput} />
            </Campo>
            <Campo rotulo="Discord (webhook)">
              <input type="url" value={m.acoes.discord} onChange={(e) => setAcao("discord", e.target.value)} placeholder="https://discord.com/api/webhooks/…" className={classeInput} />
            </Campo>
            <Campo rotulo="Microsoft Teams (webhook)">
              <input type="url" value={m.acoes.teams} onChange={(e) => setAcao("teams", e.target.value)} className={classeInput} />
            </Campo>
            <Campo rotulo="Webhook próprio (POST JSON)">
              <input type="url" value={m.acoes.webhook} onChange={(e) => setAcao("webhook", e.target.value)} className={classeInput} />
            </Campo>
          </div>
          <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <span className="block text-sm font-medium text-stone-700">Se o site falhar</span>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span>Avisar após</span>
              <select
                value={m.aoErrar.aposFalhas}
                onChange={(e) => setM((x) => ({ ...x, aoErrar: { ...x.aoErrar, aposFalhas: Number(e.target.value) } }))}
                className={classeCompacta}
                aria-label="Falhas seguidas antes de avisar"
              >
                {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} falha{n > 1 ? "s" : ""} seguida{n > 1 ? "s" : ""}</option>)}
                <option value={0}>Nunca avisar</option>
              </select>
            </div>
            {m.aoErrar.aposFalhas > 0 && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.aoErrar.avisarRecuperacao}
                  onChange={(e) => setM((x) => ({ ...x, aoErrar: { ...x.aoErrar, avisarRecuperacao: e.target.checked } }))}
                  className="size-4 accent-orange-800"
                />
                Avisar também quando voltar a funcionar
              </label>
            )}
            <p className="mt-2 text-xs text-stone-500">Os avisos de erro usam os mesmos canais acima (push, e-mail, Slack…).</p>
          </div>
        </Secao>

        <Cartao className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={m.ativo} onChange={(e) => set("ativo", e.target.checked)} className="size-5 accent-orange-800" />
            Monitor ativo
          </label>
          <Botao type="submit" variante="primario" icone="check" carregando={salvando} className="sm:w-48">
            {editando ? "Salvar alterações" : "Criar monitor"}
          </Botao>
        </Cartao>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </form>
    </>
  );
}
