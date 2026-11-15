import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Monitor } from "../types";
import { Icone, type NomeIcone } from "./Icone";

const variantes = {
  primario: "btn-primario",
  secundario: "bg-card text-ink shadow-ring hover:bg-panel",
  perigo: "bg-card text-danger shadow-ring hover:bg-danger-soft",
  fantasma: "text-ink-2 hover:bg-panel",
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
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-[550] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variantes[variante]} ${className}`}
    >
      {carregando ? <Spinner /> : icone ? <Icone nome={icone} className="size-4" /> : null}
      {children}
    </button>
  );
}

export const classeInput =
  "w-full rounded-sm border-0 bg-card px-3 py-2.5 text-base text-ink shadow-ring placeholder:text-faint focus:ring-2 focus:ring-accent focus:outline-none sm:text-sm";

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{rotulo}</span>
      {children}
      {dica && <span className="mt-1.5 block text-xs text-faint">{dica}</span>}
    </label>
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card bg-card p-4 shadow-card sm:p-6 ${className}`}>{children}</section>;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

export function Carregando() {
  return (
    <div className="flex justify-center py-16 text-faint">
      <Spinner className="size-7" />
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-3 bg-card-2 px-6 py-12 text-center">
      <p className="text-lg font-medium text-ink">{titulo}</p>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </div>
  );
}

/** Pílula de status com ponto colorido (ex.: “● Ativo”). */
export function Selo({ cor = "neutro", children }: { cor?: "ok" | "accent" | "danger" | "warn" | "neutro"; children: ReactNode }) {
  const ponto = { ok: "bg-ok", accent: "bg-accent", danger: "bg-danger", warn: "bg-warn", neutro: "bg-faint" }[cor];
  const texto = { ok: "text-ok", accent: "text-accent", danger: "text-danger", warn: "text-warn", neutro: "text-muted" }[cor];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium shadow-ring ${texto}`}>
      <span className={`size-1.5 rounded-full ${ponto}`} />
      {children}
    </span>
  );
}

export function StatusBadge({ monitor }: { monitor: Monitor }) {
  const s = !monitor.ativo ? "pausado" : (monitor.exec?.status ?? "novo");
  const estilos: Record<string, ["ok" | "accent" | "danger" | "neutro", string]> = {
    ok: ["ok", "Ativo"],
    verificando: ["accent", "Verificando"],
    novo: ["accent", "Aguardando"],
    erro: ["danger", "Erro"],
    pausado: ["neutro", "Pausado"],
  };
  const [cor, txt] = estilos[s] ?? estilos.novo;
  return <Selo cor={cor}>{txt}</Selo>;
}

export function Cabecalho({ titulo, sub, acoes }: { titulo: ReactNode; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em] text-ink sm:text-4xl">{titulo}</h1>
        {sub && <div className="mt-1.5 text-[15px] text-muted">{sub}</div>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "erro" | "ok"; children: ReactNode }) {
  const cls = {
    info: "bg-accent-soft text-ink-2",
    erro: "bg-danger-soft text-danger",
    ok: "bg-ok-soft text-ok",
  }[tipo];
  return (
    <div className={`flex gap-2 rounded-inner px-3 py-2.5 text-sm ${cls}`}>
      <Icone nome={tipo === "ok" ? "check" : "alerta"} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** Marca do Notara: quadrado escuro com o radar. */
export function Marca({ className = "size-7" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[8px] bg-ink text-on-ink ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <circle cx="12" cy="12" r="8" opacity=".45" />
        <path d="M12 12 17.5 6.5" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
