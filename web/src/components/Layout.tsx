import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAlteracoes, useAuth, useErroBackend } from "../lib/dados";
import { ouvirPrimeiroPlano } from "../lib/push";
import { Icone, type NomeIcone } from "./Icone";
import { Aviso } from "./ui";

const itens: { para: string; nome: string; icone: NomeIcone }[] = [
  { para: "/", nome: "Monitores", icone: "monitores" },
  { para: "/alteracoes", nome: "Alterações", icone: "sino" },
  { para: "/configuracoes", nome: "Ajustes", icone: "ajustes" },
];

function Contador({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-[11px] leading-5 font-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function Layout() {
  const { user } = useAuth();
  const erro = useErroBackend();
  const { dados: naoLidas } = useAlteracoes({ naoLidas: true }, 100);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => ouvirPrimeiroPlano(), []);

  const ativo = (para: string) => (para === "/" ? pathname === "/" || pathname.startsWith("/monitores") : pathname.startsWith(para));

  return (
    <div className="min-h-dvh md:flex">
      {/* Barra lateral: tablet (ícones) e computador (completa) */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-stone-200 bg-white md:flex md:w-20 lg:w-64">
        <Link to="/" className="flex items-center gap-3 px-5 py-6">
          <img src="/icon.svg" alt="" className="size-9 rounded-xl" />
          <span className="hidden text-lg leading-tight font-bold text-orange-950 lg:block">
            Notara
            <span className="block text-xs font-medium text-stone-500">Note cada mudança</span>
          </span>
        </Link>
        <Link
          to="/monitores/novo"
          className="mx-3 mb-4 flex items-center justify-center gap-2 rounded-xl bg-orange-900 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-800"
          title="Novo monitor"
        >
          <Icone nome="mais" />
          <span className="hidden lg:inline">Novo monitor</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {itens.map((i) => (
            <NavLink
              key={i.para}
              to={i.para}
              title={i.nome}
              className={`flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium lg:justify-start ${
                ativo(i.para) ? "bg-orange-50 text-orange-900" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <span className="relative">
                <Icone nome={i.icone} />
                {i.para === "/alteracoes" && naoLidas.length > 0 && (
                  <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500 lg:hidden" />
                )}
              </span>
              <span className="hidden flex-1 lg:inline">{i.nome}</span>
              {i.para === "/alteracoes" && (
                <span className="hidden lg:inline">
                  <Contador n={naoLidas.length} />
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="hidden truncate border-t border-stone-200 px-5 py-4 text-xs text-stone-500 lg:block">{user?.email}</div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Topo no celular */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-white/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <Link to="/" className="flex items-center gap-2 py-3">
            <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
            <span className="font-bold text-orange-950">Notara</span>
          </Link>
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-4 pb-28 sm:px-6 md:px-8 md:pt-8 md:pb-12">
          {erro && (
            <div className="mb-4">
              <Aviso tipo="erro">{erro}</Aviso>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* Abas inferiores no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[itens[0], itens[1]].map((i) => (
          <NavLink key={i.para} to={i.para} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${ativo(i.para) ? "text-orange-900" : "text-stone-500"}`}>
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
        <Link to="/monitores/novo" className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-orange-900">
          <span className="grid size-6 place-items-center rounded-full bg-orange-900 text-white">
            <Icone nome="mais" className="size-4" />
          </span>
          Novo
        </Link>
        <NavLink to="/configuracoes" className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${ativo("/configuracoes") ? "text-orange-900" : "text-stone-500"}`}>
          <Icone nome="ajustes" className="size-6" />
          Ajustes
        </NavLink>
      </nav>
    </div>
  );
}
