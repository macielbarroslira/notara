import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAlteracoes, useErroBackend } from "../lib/dados";
import { ouvirPrimeiroPlano } from "../lib/push";
import { useTema } from "../lib/tema";
import { Icone, type NomeIcone } from "./Icone";
import { Aviso, Marca } from "./ui";

const itens: { para: string; nome: string; icone: NomeIcone }[] = [
  { para: "/", nome: "Painel", icone: "raio" },
  { para: "/monitores", nome: "Monitores", icone: "monitores" },
  { para: "/concursos", nome: "Concursos", icone: "busca" },
  { para: "/alteracoes", nome: "Alterações", icone: "sino" },
  { para: "/assistente", nome: "Assistente", icone: "chat" },
  { para: "/configuracoes", nome: "Ajustes", icone: "ajustes" },
];

function Contador({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="min-w-5 rounded-full bg-accent px-1.5 text-center font-mono text-[10px] leading-5 font-medium text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function BotaoTema({ className = "" }: { className?: string }) {
  const { escuro, alternar } = useTema();
  return (
    <button
      onClick={alternar}
      className={`grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink ${className}`}
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
      title={escuro ? "Tema claro" : "Tema escuro"}
    >
      <Icone nome={escuro ? "sol" : "lua"} className="size-[18px]" />
    </button>
  );
}

export function Layout() {
  const erro = useErroBackend();
  const { dados: naoLidas } = useAlteracoes({ naoLidas: true }, 100);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => ouvirPrimeiroPlano(), []);

  const ativo = (para: string) => (para === "/" ? pathname === "/" : pathname.startsWith(para));

  return (
    <div className="min-h-dvh">
      {/* Menu flutuante (tablet e computador) */}
      <div className="sticky top-0 z-30 hidden px-4 pt-3 md:block">
        <header className="nav-flutuante mx-auto flex h-[60px] max-w-6xl items-center gap-2 rounded-full pr-2 pl-5">
          <Link to="/" className="mr-3 flex items-center gap-2.5">
            <Marca />
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Notara</span>
          </Link>
          <nav className="flex flex-1 items-center gap-0.5">
            {itens.map((i) => (
              <NavLink
                key={i.para}
                to={i.para}
                className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[15px] transition-colors ${
                  ativo(i.para) ? "bg-panel text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {i.nome}
                {i.para === "/alteracoes" && <Contador n={naoLidas.length} />}
              </NavLink>
            ))}
          </nav>
          <BotaoTema />
          <Link to="/monitores/novo" className="btn-primario inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-[550]">
            <Icone nome="mais" className="size-4" />
            Novo monitor
          </Link>
        </header>
      </div>

      {/* Topo no celular */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-lg md:hidden">
        <Link to="/" className="flex items-center gap-2 py-3">
          <Marca />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Notara</span>
        </Link>
        <BotaoTema />
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5 pb-28 sm:px-6 md:px-8 md:pt-10 md:pb-16">
        {erro && (
          <div className="mb-4">
            <Aviso tipo="erro">{erro}</Aviso>
          </div>
        )}
        <Outlet />
      </main>

      {/* Abas inferiores no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
        {[itens[0], itens[1]].map((i) => (
          <NavLink key={i.para} to={i.para} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${ativo(i.para) ? "text-ink" : "text-faint"}`}>
            <span className="relative">
              <Icone nome={i.icone} className="size-6" />
              {i.para === "/alteracoes" && naoLidas.length > 0 && (
                <span className="absolute -top-1.5 -right-2.5">
                  <Contador n={naoLidas.length} />
                </span>
              )}
            </span>
            {i.nome}
          </NavLink>
        ))}
        <Link to="/monitores/novo" className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-ink">
          <span className="btn-primario grid size-6 place-items-center rounded-full">
            <Icone nome="mais" className="size-4" />
          </span>
          Novo
        </Link>
        {[itens[4], itens[3], itens[5]].map((i) => (
          <NavLink key={i.para} to={i.para} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${ativo(i.para) ? "text-ink" : "text-faint"}`}>
            <span className="relative">
              <Icone nome={i.icone} className="size-6" />
              {i.para === "/alteracoes" && naoLidas.length > 0 && (
                <span className="absolute -top-1.5 -right-2.5">
                  <Contador n={naoLidas.length} />
                </span>
              )}
            </span>
            {i.para === "/assistente" ? "IA" : i.nome}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
