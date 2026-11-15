import type { NomeIcone } from "../components/Icone";
import type { MonitorDados, TipoMonitor } from "../types";
import { monitorVazio } from "./constantes";

/** Modelos prontos: preenchem o formulário com o tipo, a frequência e as condições certas. */
export interface Modelo {
  id: string;
  nome: string;
  desc: string;
  icone: NomeIcone;
  /** Texto de ajuda no campo de URL. */
  dicaUrl: string;
  /** Abre o seletor visual logo depois de informar a URL. */
  escolherNaPagina?: boolean;
  aplicar: (base: MonitorDados) => MonitorDados;
}

const regras = (itens: MonitorDados["regras"]["itens"]) => ({ operador: "E" as const, itens, formatoNumero: "br" as const });

export const MODELOS: Modelo[] = [
  {
    id: "concurso",
    nome: "Página de concurso",
    desc: "Avisa quando sai edital, comunicado ou resultado novo.",
    icone: "documento",
    dicaUrl: "Cole a página do concurso na banca (Cebraspe, FGV, Cesgranrio…) ou no órgão.",
    aplicar: (b) => ({ ...b, tipo: "pagina", intervaloMin: 60, regras: regras([{ tipo: "nunca_visto", valor: "" }]), tags: ["concursos"] }),
  },
  {
    id: "edital_pdf",
    nome: "Edital em PDF",
    desc: "Lê o PDF e avisa quando o documento muda.",
    icone: "documento",
    dicaUrl: "Cole o link do arquivo .pdf do edital.",
    aplicar: (b) => ({ ...b, tipo: "pdf", intervaloMin: 360, tags: ["concursos"] }),
  },
  {
    id: "preco",
    nome: "Queda de preço",
    desc: "Escolha o preço na página e seja avisado quando baixar.",
    icone: "raio",
    dicaUrl: "Cole a página do produto e toque no preço.",
    escolherNaPagina: true,
    aplicar: (b) => ({ ...b, tipo: "elemento", intervaloMin: 180, regras: regras([{ tipo: "num_queda", valor: "0,01" }]), tags: ["preços"] }),
  },
  {
    id: "estoque",
    nome: "Voltou ao estoque",
    desc: "Avisa quando o produto deixar de estar esgotado.",
    icone: "check",
    dicaUrl: "Cole a página do produto e toque no aviso de disponibilidade.",
    escolherNaPagina: true,
    aplicar: (b) => ({ ...b, tipo: "elemento", intervaloMin: 60, regras: regras([{ tipo: "regex_nao", valor: "esgotad|indispon|sem estoque" }]), tags: ["compras"] }),
  },
  {
    id: "palavra",
    nome: "Palavra-chave em publicação",
    desc: "Diário Oficial, nomeações, listas: avisa quando aparecer o termo.",
    icone: "busca",
    dicaUrl: "Cole a página de publicações e digite o termo nas condições (ex.: seu nome).",
    aplicar: (b) => ({
      ...b,
      tipo: "pagina",
      intervaloMin: 1440,
      regras: regras([{ tipo: "adicionado_contem", valor: "" }]),
      agenda: { ...b.agenda, dias: [1, 2, 3, 4, 5] },
    }),
  },
  {
    id: "noticias",
    nome: "Notícias de um site",
    desc: "Feed RSS: avisa de cada matéria nova.",
    icone: "sino",
    dicaUrl: "Cole o endereço do feed RSS/Atom do site.",
    aplicar: (b) => ({ ...b, tipo: "feed", intervaloMin: 60, regras: regras([{ tipo: "nunca_visto", valor: "" }]) }),
  },
  {
    id: "no_ar",
    nome: "Site no ar",
    desc: "Avisa quando o site cair e quando voltar.",
    icone: "monitores",
    dicaUrl: "Cole o endereço do site.",
    aplicar: (b) => ({ ...b, tipo: "uptime", intervaloMin: 10, aoErrar: { aposFalhas: 1, avisarRecuperacao: true } }),
  },
];

export function aplicarModelo(id: string | null, email = ""): MonitorDados {
  const base = monitorVazio(email);
  const m = MODELOS.find((x) => x.id === id);
  return m ? m.aplicar(base) : base;
}

/** Páginas de bancas e agregadores testadas para descobrir concursos novos. */
export interface FonteConcursos {
  id: string;
  nome: string;
  desc: string;
  url: string;
  tipo?: "agregador" | "banca";
  /** Como ler a fonte (padrão: página inteira). */
  leitura?: TipoMonitor;
  /** Site oficial, para ícone e link (quando a URL lida é outra, ex.: um feed). */
  site?: string;
}

export const FONTES_CONCURSOS: FonteConcursos[] = [
  { id: "pci", nome: "PCI Concursos", desc: "Agregador nacional, atualizado todos os dias", url: "https://www.pciconcursos.com.br/concursos/", tipo: "agregador" },
  { id: "cebraspe", nome: "Cebraspe", desc: "Concursos e seleções do Cebraspe", url: "https://www.cebraspe.org.br/concursos/", tipo: "banca" },
  { id: "fgv", nome: "FGV Conhecimento", desc: "Concursos organizados pela FGV", url: "https://conhecimento.fgv.br/concursos", tipo: "banca" },
  // O site da Cesgranrio bloqueia servidores (HTTP 403); seguimos as notícias sobre a banca.
  {
    id: "cesgranrio",
    nome: "Cesgranrio",
    desc: "Notícias sobre concursos da Cesgranrio",
    url: "https://news.google.com/rss/search?q=%22Cesgranrio%22+concurso&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    leitura: "feed",
    site: "https://www.cesgranrio.org.br/concursos/",
    tipo: "banca",
  },
  { id: "fcc", nome: "FCC", desc: "Fundação Carlos Chagas — inscrições abertas", url: "https://www.concursosfcc.com.br/", tipo: "banca" },
  { id: "vunesp", nome: "Vunesp", desc: "Concursos da Vunesp", url: "https://www.vunesp.com.br/", tipo: "banca" },
  { id: "fundatec", nome: "Fundatec", desc: "Concursos abertos da Fundatec", url: "https://www.fundatec.org.br/portal/concursos/concursos_abertos.php", tipo: "banca" },
];

/** Monitor de uma fonte de concursos: só avisa de itens novos (com filtro opcional, ex.: "TI" ou "Brasília"). */
export function monitorDeFonte(f: FonteConcursos, filtro: string, email = ""): MonitorDados {
  const base = monitorVazio(email);
  return {
    ...base,
    nome: `Concursos novos · ${f.nome}`,
    url: f.url,
    tipo: f.leitura ?? "pagina",
    intervaloMin: 60,
    regras: regras([{ tipo: "nunca_visto", valor: filtro.trim() }]),
    tags: ["descobrir-concursos"],
  };
}
