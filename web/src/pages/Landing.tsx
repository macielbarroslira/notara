import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BotaoTema } from "../components/Layout";
import { Icone, type NomeIcone } from "../components/Icone";
import { Marca, Selo } from "../components/ui";

const REPO = "https://github.com/macielbarroslira/notara";

function Botao({ para, children, claro }: { para: string; children: ReactNode; claro?: boolean }) {
  return (
    <Link
      to={para}
      className={`inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[15px] font-[550] ${claro ? "text-ink hover:bg-panel" : "btn-primario"}`}
    >
      {children}
    </Link>
  );
}

function Menu() {
  return (
    <div className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <header className="nav-flutuante mx-auto flex h-[60px] max-w-[1240px] items-center gap-2 rounded-full pr-2 pl-4 sm:pl-5">
        <Link to="/" className="mr-2 flex items-center gap-2.5">
          <Marca />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Notara</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-0.5 md:flex">
          {[
            ["#recursos", "Recursos"],
            ["#como-funciona", "Como funciona"],
            ["#perguntas", "Perguntas"],
          ].map(([href, nome]) => (
            <a key={href} href={href} className="rounded-full px-3.5 py-2 text-[15px] text-muted transition-colors hover:text-ink">
              {nome}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <BotaoTema />
          <Link to="/entrar" className="hidden rounded-full px-3.5 py-2 text-[15px] text-ink hover:bg-panel sm:block">
            Entrar
          </Link>
          <Link to="/entrar?modo=criar" className="btn-primario inline-flex h-10 items-center rounded-full px-4 text-sm font-[550]">
            Começar grátis
          </Link>
        </div>
      </header>
    </div>
  );
}

/** Prévia do app, montada em HTML (sem imagens). */
function Previa() {
  const linhas: [string, string, ReactNode][] = [
    ["Cebraspe · IBAMA", "Novo: Edital nº 16 – Resultado final", <Selo key="a" cor="accent">Novo item</Selo>],
    ["Cafeteira elétrica", "R$ 499,90 → R$ 439,90 (−12%)", <Selo key="b" cor="ok">Caiu de preço</Selo>],
    ["Diário Oficial · Portarias", "Nenhuma mudança desde ontem", <Selo key="c">Sem mudanças</Selo>],
    ["meusite.com.br", "Online (HTTP 200)", <Selo key="d" cor="ok">No ar</Selo>],
  ];
  return (
    <div className="mx-auto max-w-[1100px] rounded-plate bg-frame p-2 text-left shadow-card sm:p-3">
      <div className="grid overflow-hidden rounded-card bg-card md:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-line p-4 md:block">
          <p className="mb-3 font-mono text-[11px] tracking-[0.12em] text-faint uppercase">Seus monitores</p>
          {[
            ["monitores", "Monitores", ""],
            ["sino", "Alterações", "2"],
            ["ajustes", "Ajustes", ""],
          ].map(([ic, nome, n], i) => (
            <div key={nome} className={`mb-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm ${i === 0 ? "bg-panel text-ink" : "text-muted"}`}>
              <Icone nome={ic as NomeIcone} className="size-4" />
              <span className="flex-1">{nome}</span>
              {n && <span className="grid size-5 place-items-center rounded-full bg-ink font-mono text-[10px] text-on-ink">{n}</span>}
            </div>
          ))}
        </aside>
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[17px] font-medium tracking-[-0.01em] text-ink">Concursos e preços</p>
            <Selo cor="ok">Verificando a cada 10 min</Selo>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            {[
              ["12", "", "Monitores ativos"],
              ["3", "", "Alterações hoje"],
              ["10", "min", "Entre verificações"],
            ].map(([n, u, r]) => (
              <div key={r} className="rounded-inner p-3 shadow-ring sm:p-4">
                <p className="font-mono text-xl text-ink sm:text-2xl">
                  {n}
                  {u && <span className="ml-0.5 text-xs text-faint">{u}</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted sm:text-[13px]">{r}</p>
              </div>
            ))}
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {linhas.map(([nome, texto, selo]) => (
              <li key={nome} className="flex items-center gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-panel text-muted">
                  <Icone nome="documento" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{nome}</p>
                  <p className="truncate text-xs text-muted">{texto}</p>
                </div>
                <span className="hidden sm:inline-flex">{selo}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Recurso({ titulo, texto, children, className = "" }: { titulo: string; texto: string; children: ReactNode; className?: string }) {
  return (
    <div className={`border-dashed border-line-3 p-6 sm:p-8 ${className}`}>
      <h3 className="text-[20px] font-medium tracking-[-0.01em] text-ink">{titulo}</h3>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">{texto}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

const PERGUNTAS: [string, string][] = [
  ["É grátis mesmo?", "Sim. O Notara roda em serviços gratuitos (Firebase e GitHub Actions) e o código é aberto. Não pedimos cartão."],
  ["Preciso deixar o computador ligado?", "Não. As verificações rodam na nuvem, a cada cerca de 10 minutos, com o seu celular ou computador desligados."],
  ["Funciona no celular?", "Funciona no celular, tablet e computador. Dá para instalar como app na tela inicial e receber notificações."],
  ["E sites que montam o conteúdo com JavaScript?", "O Notara percebe sozinho e abre a página num navegador de verdade antes de ler — inclusive para tirar um screenshot de cada versão."],
  ["Dá para monitorar editais em PDF?", "Sim. Cole o link do PDF: o Notara lê o texto do documento e avisa quando ele mudar ou quando aparecer um novo item na lista."],
];

export function Landing() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <Menu />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-16 pb-10 text-center sm:pt-24">
        <div className="grade pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="surgir relative mx-auto max-w-[980px]">
          <a href="#recursos" className="selo inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-ink-2">
            Novo: avisar só de itens novos, ideal para editais
            <Icone nome="seta" className="size-3" />
          </a>
          <h1 className="mt-6 text-[44px] leading-[1.04] font-[570] tracking-[-0.035em] text-balance text-ink sm:text-7xl lg:text-[88px]">
            Saiba na hora quando um site mudar
          </h1>
          <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-relaxed text-pretty text-muted sm:text-xl">
            O Notara vigia páginas, PDFs, feeds e APIs por você — e avisa no celular quando sai um edital novo, um preço cai ou um site sai do ar.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Botao para="/entrar?modo=criar">Começar grátis</Botao>
            <a href="#como-funciona" className="inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[15px] font-[550] text-ink hover:bg-panel">
              Ver como funciona <Icone nome="seta" className="size-4" />
            </a>
          </div>
        </div>
        <div className="surgir relative mt-14 sm:mt-20" style={{ animationDelay: "120ms" }}>
          <Previa />
        </div>
      </section>

      {/* Tipos */}
      <section className="px-4 py-10">
        <p className="text-center text-sm text-muted">Funciona com</p>
        <div className="mx-auto mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
          {["Páginas inteiras", "Partes da página", "PDFs e editais", "Feeds RSS", "APIs JSON", "Sites no ar"].map((t) => (
            <span key={t} className="rounded-full bg-card px-3.5 py-1.5 text-sm text-ink-2 shadow-ring">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="scroll-mt-24 px-4 py-[clamp(4rem,9vw,7.5rem)]">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="max-w-2xl text-[36px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[52px]">Tudo para não perder nenhuma mudança</h2>
          <p className="mt-4 max-w-xl text-lg text-muted">Escolha o que vigiar, diga quando avisar e receba só o que importa.</p>

          <div className="mt-12 grid border-t border-l border-dashed border-line-3 md:grid-cols-2 [&>*]:border-r [&>*]:border-b">
            <Recurso titulo="Escolha na página" texto="Abra o site e toque no trecho que quer vigiar — preço, estoque, lista de editais. Sem seletor CSS.">
              <div className="rounded-inner bg-card-2 p-4 shadow-ring">
                <div className="space-y-2">
                  <div className="h-2.5 w-2/3 rounded-full bg-frame" />
                  <div className="rounded-xs bg-accent/15 p-2.5 outline-2 outline-accent">
                    <p className="text-sm text-ink">R$ 439,90</p>
                    <p className="font-mono text-[11px] text-muted">.produto &gt; .preco</p>
                  </div>
                  <div className="h-2.5 w-1/2 rounded-full bg-frame" />
                </div>
              </div>
            </Recurso>
            <Recurso titulo="Só avisa de itens novos" texto="Listas que mudam de ordem não geram alerta. Você só é avisado quando aparece uma linha inédita.">
              <ul className="space-y-1.5 rounded-inner bg-card-2 p-4 text-sm shadow-ring">
                <li className="flex items-center gap-2 text-ink">
                  <span className="size-1.5 rounded-full bg-accent" /> Edital nº 16 – Resultado final
                  <span className="ml-auto font-mono text-[11px] text-accent">novo</span>
                </li>
                <li className="flex items-center gap-2 text-muted">
                  <span className="size-1.5 rounded-full bg-line-3" /> Edital nº 15 – Retificação
                </li>
                <li className="flex items-center gap-2 text-muted">
                  <span className="size-1.5 rounded-full bg-line-3" /> Edital nº 14 – Retificação
                </li>
              </ul>
            </Recurso>
            <Recurso titulo="PDFs, sites com JavaScript e screenshots" texto="Lê o texto de PDFs, abre sites modernos num navegador real e guarda uma imagem de cada versão para comparar.">
              <div className="flex gap-2">
                {["Antes", "Depois"].map((t, i) => (
                  <div key={t} className="flex-1 rounded-inner bg-card-2 p-3 shadow-ring">
                    <p className="font-mono text-[11px] text-faint uppercase">{t}</p>
                    <div className="mt-2 space-y-1.5">
                      <div className="h-2 w-full rounded-full bg-frame" />
                      <div className={`h-2 w-3/4 rounded-full ${i ? "bg-ok/40" : "bg-danger/30"}`} />
                      <div className="h-2 w-5/6 rounded-full bg-frame" />
                    </div>
                  </div>
                ))}
              </div>
            </Recurso>
            <Recurso titulo="Alertas onde você estiver" texto="Notificação no celular, e-mail, Slack, Discord, Teams ou webhook — nos dias e horários que você escolher.">
              <div className="flex flex-wrap gap-2">
                {["Push", "E-mail", "Slack", "Discord", "Teams", "Webhook"].map((c) => (
                  <span key={c} className="rounded-full bg-card px-3 py-1.5 text-sm text-ink-2 shadow-ring">
                    {c}
                  </span>
                ))}
              </div>
            </Recurso>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-24 bg-card-2 px-4 py-[clamp(4rem,9vw,7.5rem)]">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="max-w-2xl text-[36px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[52px]">Do link ao alerta em três passos</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ["01", "Cole o endereço", "Página, PDF, feed ou API. O Notara testa na hora e mostra o que vai vigiar."],
              ["02", "Diga quando avisar", "Qualquer mudança, só itens novos, preço abaixo de um valor, palavra que aparece…"],
              ["03", "Receba o alerta", "Com o que entrou e o que saiu destacados, e o antes e depois lado a lado."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-card bg-card p-6 shadow-card">
                <p className="font-mono text-sm text-faint">{n}</p>
                <h3 className="mt-6 text-[20px] font-medium tracking-[-0.01em]">{t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Perguntas */}
      <section id="perguntas" className="scroll-mt-24 px-4 py-[clamp(4rem,9vw,7.5rem)]">
        <div className="mx-auto grid max-w-[1240px] gap-10 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-[36px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[52px]">Perguntas frequentes</h2>
            <p className="mt-4 text-muted">
              O código é aberto no{" "}
              <a href={REPO} target="_blank" rel="noreferrer noopener" className="text-ink underline decoration-line-3 underline-offset-4 hover:decoration-ink">
                GitHub
              </a>
              .
            </p>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {PERGUNTAS.map(([p, r]) => (
              <details key={p} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium text-ink">
                  {p}
                  <Icone nome="mais" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-45" />
                </summary>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Chamada final */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-[1240px] rounded-plate bg-[#111114] px-6 py-16 text-center text-[#f4f4f6] sm:py-24 dark:bg-card dark:shadow-card">
          <h2 className="mx-auto max-w-2xl text-[36px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[52px]">Comece a vigiar em um minuto</h2>
          <p className="mx-auto mt-4 max-w-md text-[#b7b8c0]">Crie a conta, cole um link e pronto. O resto o Notara faz sozinho.</p>
          <Link
            to="/entrar?modo=criar"
            className="mt-8 inline-flex h-11 items-center gap-1.5 rounded-full bg-[#f4f4f6] px-5 text-[15px] font-[550] text-[#111114] transition hover:bg-white"
          >
            Começar grátis <Icone nome="seta" className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line px-4 py-10">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 text-sm text-muted">
          <div className="flex items-center gap-2.5">
            <Marca className="size-6" />
            <span className="font-medium text-ink">Notara</span>
            <span>· note cada mudança</span>
          </div>
          <div className="flex gap-5">
            <a href={REPO} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
              Código aberto
            </a>
            <Link to="/entrar" className="hover:text-ink">
              Entrar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
