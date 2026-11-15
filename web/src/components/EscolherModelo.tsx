import { Link } from "react-router-dom";
import { MODELOS } from "../lib/modelos";
import { Icone } from "./Icone";
import { Cabecalho } from "./ui";

/** Primeira tela de "Novo monitor": escolher um modelo pronto. */
export function EscolherModelo() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/monitores" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <Icone nome="voltar" className="size-4" /> Monitores
      </Link>
      <Cabecalho titulo="O que você quer vigiar?" sub="Escolha um modelo pronto — dá para ajustar tudo depois." />

      <Link
        to="/concursos"
        className="mb-4 flex items-center gap-4 rounded-card bg-ink p-5 text-on-ink shadow-card transition hover:opacity-95"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-inner bg-on-ink/10">
          <Icone nome="busca" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-medium">Achar concursos novos</span>
          <span className="block text-sm opacity-70">Siga bancas e agregadores e seja avisado quando surgir um concurso — sem cadastrar um por um.</span>
        </span>
        <Icone nome="seta" className="size-5 shrink-0" />
      </Link>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODELOS.map((m) => (
          <Link
            key={m.id}
            to={`/monitores/novo?modelo=${m.id}`}
            className="group flex flex-col rounded-card bg-card p-5 shadow-card transition hover:-translate-y-0.5"
          >
            <span className="grid size-10 place-items-center rounded-inner bg-panel text-ink">
              <Icone nome={m.icone} className="size-5" />
            </span>
            <span className="mt-4 text-[16px] font-medium text-ink">{m.nome}</span>
            <span className="mt-1 text-sm text-muted">{m.desc}</span>
          </Link>
        ))}
        <Link
          to="/monitores/novo?modelo=zero"
          className="flex flex-col justify-center rounded-card border border-dashed border-line-3 p-5 text-center hover:bg-card-2"
        >
          <span className="text-[16px] font-medium text-ink">Começar do zero</span>
          <span className="mt-1 text-sm text-muted">Todas as opções, sem modelo</span>
        </Link>
      </div>
    </div>
  );
}
