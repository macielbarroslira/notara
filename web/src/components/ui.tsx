import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Monitor } from "../types";
import { Icone, type NomeIcone } from "./Icone";

const variantes = {
  primario: "bg-orange-900 text-white hover:bg-orange-800 shadow-sm",
  secundario: "bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-100",
  perigo: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
  fantasma: "text-stone-700 hover:bg-stone-200/60",
};

export function Botao({
  variante = "secundario",
  icone,
  carregando,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: keyof typeof variantes;
  icone?: NomeIcone;
  carregando?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variantes[variante]} ${className}`}
    >
      {carregando ? <Spinner /> : icone ? <Icone nome={icone} className="size-4" /> : null}
      {children}
    </button>
  );
}

export const classeInput =
  "w-full rounded-xl border-0 bg-white px-3 py-2.5 text-base ring-1 ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-orange-700 focus:outline-none sm:text-sm";

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-stone-500">{dica}</span>}
    </label>
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-5 ${className}`}>{children}</section>;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

export function Carregando() {
  return (
    <div className="flex justify-center py-16 text-orange-900">
      <Spinner className="size-8" />
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-300 px-6 py-12 text-center">
      <p className="text-lg font-semibold text-stone-800">{titulo}</p>
      <div className="mt-2 text-sm text-stone-600">{children}</div>
    </div>
  );
}

export function StatusBadge({ monitor }: { monitor: Monitor }) {
  const s = !monitor.ativo ? "pausado" : (monitor.exec?.status ?? "novo");
  const estilos: Record<string, [string, string]> = {
    ok: ["bg-emerald-100 text-emerald-800", "Ativo"],
    verificando: ["bg-sky-100 text-sky-800", "Verificando…"],
    novo: ["bg-sky-100 text-sky-800", "Aguardando"],
    erro: ["bg-red-100 text-red-800", "Erro"],
    pausado: ["bg-stone-200 text-stone-700", "Pausado"],
  };
  const [cls, txt] = estilos[s] ?? estilos.novo;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{txt}</span>;
}

export function Cabecalho({ titulo, sub, acoes }: { titulo: ReactNode; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">{titulo}</h1>
        {sub && <div className="mt-1 text-sm text-stone-600">{sub}</div>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "erro" | "ok"; children: ReactNode }) {
  const cls = {
    info: "bg-amber-50 text-amber-900 ring-amber-200",
    erro: "bg-red-50 text-red-800 ring-red-200",
    ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  }[tipo];
  return (
    <div className={`flex gap-2 rounded-xl px-3 py-2.5 text-sm ring-1 ${cls}`}>
      <Icone nome={tipo === "ok" ? "check" : "alerta"} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
