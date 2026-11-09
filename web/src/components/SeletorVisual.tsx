import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useUid } from "../lib/dados";
import { mensagemErro } from "../lib/erros";
import { fazerPedido, imagemDoPedido, TEXTO_ESPERA, type EstadoPedido } from "../lib/pedidos";
import { Icone } from "./Icone";
import { Aviso, Botao, Spinner } from "./ui";

interface Elemento {
  s: string;
  x: number;
  y: number;
  w: number;
  h: number;
  t: string;
}

interface RespostaSeletor {
  imagem: string;
  largura: number;
  altura: number;
  elementos: Elemento[];
  titulo: string | null;
  precisaNavegador: boolean;
}

export interface ResultadoSeletor {
  seletores: string[];
  precisaNavegador: boolean;
  titulo: string | null;
}

const area = (e: Elemento) => e.w * e.h;
const contem = (e: Elemento, x: number, y: number) => x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h;

function Caixa({ e, larg, alt, classe }: { e: Elemento; larg: number; alt: number; classe: string }) {
  return (
    <div
      className={`pointer-events-none absolute rounded-sm ${classe}`}
      style={{ left: `${(e.x / larg) * 100}%`, top: `${(e.y / alt) * 100}%`, width: `${(e.w / larg) * 100}%`, height: `${(e.h / alt) * 100}%` }}
    />
  );
}

/** Tela cheia: screenshot da página com os elementos clicáveis por cima. */
export function SeletorVisual({
  url,
  esperarMs,
  iniciais,
  onConcluir,
  onFechar,
}: {
  url: string;
  esperarMs: number;
  iniciais: string[];
  onConcluir: (r: ResultadoSeletor) => void;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<RespostaSeletor | null>(null);
  const [erro, setErro] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>(iniciais);
  const [hover, setHover] = useState<Elemento | null>(null);
  const [candidatos, setCandidatos] = useState<Elemento[]>([]);
  const [nivel, setNivel] = useState(0);
  // No celular a página (1280 px) fica minúscula: começa ampliada para facilitar o toque
  const [zoom, setZoom] = useState(() => (window.innerWidth < 768 ? 2.5 : 1));
  const camada = useRef<HTMLDivElement>(null);

  const uid = useUid();
  const [estado, setEstado] = useState<EstadoPedido>("pendente");

  useEffect(() => {
    const ctrl = new AbortController();
    fazerPedido<Omit<RespostaSeletor, "imagem">>(uid, "seletor", { url, esperarMs }, { aoMudar: setEstado, sinal: ctrl.signal })
      .then(async ({ resultado, pedidoId }) => {
        const imagem = await imagemDoPedido(uid, pedidoId);
        if (!imagem) throw new Error("A imagem da página não chegou. Tente de novo.");
        if (!ctrl.signal.aborted) setDados({ ...resultado, imagem });
      })
      .catch((e) => !ctrl.signal.aborted && setErro(mensagemErro(e)));
    return () => ctrl.abort();
  }, [uid, url, esperarMs]);

  // Esc fecha; trava a rolagem do fundo
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [onFechar]);

  const porSeletor = useMemo(() => new Map((dados?.elementos ?? []).map((e) => [e.s, e])), [dados]);

  function ponto(ev: MouseEvent<HTMLDivElement>) {
    const r = camada.current!.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * dados!.largura,
      y: ((ev.clientY - r.top) / r.height) * dados!.altura,
    };
  }

  function sobre(ev: MouseEvent<HTMLDivElement>) {
    if (!dados) return;
    const { x, y } = ponto(ev);
    let melhor: Elemento | null = null;
    for (const e of dados.elementos) if (contem(e, x, y) && (!melhor || area(e) < area(melhor))) melhor = e;
    setHover(melhor);
  }

  function clicar(ev: MouseEvent<HTMLDivElement>) {
    if (!dados) return;
    const { x, y } = ponto(ev);
    const lista = dados.elementos.filter((e) => contem(e, x, y)).sort((a, b) => area(a) - area(b));
    setCandidatos(lista);
    setNivel(0);
  }

  const atual = candidatos[nivel];
  const jaSelecionado = atual && selecionados.includes(atual.s);

  function alternar() {
    if (!atual) return;
    setSelecionados((s) => (s.includes(atual.s) ? s.filter((x) => x !== atual.s) : [...s, atual.s]));
    setCandidatos([]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-stone-950/70 backdrop-blur-sm md:p-6" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-6xl flex-col overflow-hidden bg-white md:rounded-2xl md:shadow-2xl">
        {/* Topo */}
        <div className="flex items-start gap-3 border-b border-stone-200 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <Icone nome="mira" className="mt-0.5 size-5 shrink-0 text-orange-900" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Escolha o que monitorar</h2>
            <p className="text-xs text-stone-500 sm:hidden">Toque no trecho da página.</p>
            <p className="hidden text-sm text-stone-500 sm:block">
              Toque ou clique no trecho da página (preço, estoque, título…). Use <b>Maior</b>/<b>Menor</b> para ajustar a área.
            </p>
          </div>
          <div className="flex shrink-0 items-center rounded-lg ring-1 ring-stone-300">
            <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} className="px-2.5 py-1 text-lg leading-none disabled:opacity-30" aria-label="Diminuir zoom">−</button>
            <span className="w-11 text-center text-xs text-stone-600 tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom >= 4} className="px-2.5 py-1 text-lg leading-none disabled:opacity-30" aria-label="Aumentar zoom">+</button>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>

        {/* Página */}
        <div className="relative flex-1 overflow-auto bg-stone-100">
          {!dados && !erro && (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-stone-600">
              <Spinner className="size-8 text-orange-900" />
              <p className="max-w-sm px-4 text-center text-sm">{TEXTO_ESPERA[estado]}</p>
            </div>
          )}
          {erro && (
            <div className="p-4">
              <Aviso tipo="erro">{erro}</Aviso>
            </div>
          )}
          {dados && (
            <div
              className="relative mx-auto cursor-crosshair select-none"
              style={zoom > 1 ? { width: `${zoom * 100}%`, maxWidth: dados.largura * 1.5 } : { width: "100%", maxWidth: dados.largura }}
            >
              <img src={dados.imagem} alt={dados.titulo ?? "Página"} className="block w-full" draggable={false} />
              <div ref={camada} className="absolute inset-0" onMouseMove={sobre} onMouseLeave={() => setHover(null)} onClick={clicar}>
                {selecionados.map((s) => {
                  const e = porSeletor.get(s);
                  return e ? <Caixa key={s} e={e} larg={dados.largura} alt={dados.altura} classe="bg-amber-400/25 ring-2 ring-amber-500" /> : null;
                })}
                {hover && !atual && <Caixa e={hover} larg={dados.largura} alt={dados.altura} classe="bg-orange-500/10 outline-2 outline-orange-600 outline-dashed" />}
                {atual && <Caixa e={atual} larg={dados.largura} alt={dados.altura} classe="bg-sky-400/20 ring-[3px] ring-sky-600" />}
              </div>
            </div>
          )}
        </div>

        {/* Painel do elemento tocado */}
        {atual && (
          <div className="border-t border-sky-200 bg-sky-50 px-4 py-3">
            <p className="line-clamp-2 text-sm text-stone-800">{atual.t || "(imagem)"}</p>
            <code className="mt-1 block truncate text-[11px] text-stone-500">{atual.s}</code>
            <div className="mt-2 flex flex-wrap gap-2">
              <Botao variante="primario" icone={jaSelecionado ? "fechar" : "check"} onClick={alternar}>
                {jaSelecionado ? "Remover" : "Selecionar"}
              </Botao>
              <Botao icone="subir" disabled={nivel >= candidatos.length - 1} onClick={() => setNivel(nivel + 1)}>Maior</Botao>
              <Botao icone="descer" disabled={nivel === 0} onClick={() => setNivel(nivel - 1)}>Menor</Botao>
              <Botao variante="fantasma" onClick={() => setCandidatos([])}>Cancelar</Botao>
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div className="flex flex-col gap-3 border-t border-stone-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {selecionados.length === 0 && <span className="text-sm text-stone-500">Nenhum trecho selecionado</span>}
            {selecionados.map((s) => (
              <span key={s} className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-100 py-1 pr-1 pl-2.5 text-xs text-amber-900">
                <span className="truncate">{porSeletor.get(s)?.t.slice(0, 40) || s}</span>
                <button onClick={() => setSelecionados((x) => x.filter((y) => y !== s))} className="rounded-full p-0.5 hover:bg-amber-200" aria-label="Remover">
                  <Icone nome="fechar" className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <Botao
            variante="primario"
            icone="check"
            disabled={!dados || selecionados.length === 0}
            onClick={() => onConcluir({ seletores: selecionados, precisaNavegador: dados!.precisaNavegador, titulo: dados!.titulo })}
          >
            Usar {selecionados.length > 1 ? `${selecionados.length} trechos` : "seleção"}
          </Botao>
        </div>
      </div>
    </div>
  );
}
