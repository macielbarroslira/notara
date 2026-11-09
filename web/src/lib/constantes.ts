import type { MonitorDados, TipoMonitor, TipoRegra } from "../types";

export const TIPOS: { id: TipoMonitor; nome: string; desc: string }[] = [
  { id: "pagina", nome: "Página inteira", desc: "Conteúdo principal (ignora menus e rodapé)" },
  { id: "elemento", nome: "Parte da página", desc: "Só os elementos de um seletor CSS (preço, estoque…)" },
  { id: "feed", nome: "Feed RSS/Atom", desc: "Novos itens de blogs e notícias" },
  { id: "json", nome: "API / JSON", desc: "Um valor dentro de uma resposta JSON" },
  { id: "pdf", nome: "PDF / documento", desc: "Texto de um arquivo PDF (editais, resultados…)" },
  { id: "uptime", nome: "Site no ar", desc: "Avisa quando o site cai ou volta" },
];

export const INTERVALOS: { min: number; nome: string }[] = [
  { min: 5, nome: "5 minutos" },
  { min: 10, nome: "10 minutos" },
  { min: 15, nome: "15 minutos" },
  { min: 30, nome: "30 minutos" },
  { min: 60, nome: "1 hora" },
  { min: 180, nome: "3 horas" },
  { min: 360, nome: "6 horas" },
  { min: 720, nome: "12 horas" },
  { min: 1440, nome: "1 dia" },
  { min: 10080, nome: "1 semana" },
];

export const REGRAS: { id: TipoRegra; nome: string; dica: string; semValor?: boolean; valorOpcional?: boolean }[] = [
  { id: "nunca_visto", nome: "Linha nunca vista antes", dica: "filtro opcional: ex.: Edital", valorOpcional: true },
  { id: "contem", nome: "Contém o texto", dica: "ex.: Em estoque" },
  { id: "nao_contem", nome: "Não contém o texto", dica: "ex.: Esgotado" },
  { id: "adicionado_contem", nome: "Texto novo contém", dica: "ex.: vaga" },
  { id: "comeca_com", nome: "Começa com", dica: "ex.: Edital" },
  { id: "termina_com", nome: "Termina com", dica: "ex.: abertas" },
  { id: "vazio", nome: "Ficou vazio", dica: "", semValor: true },
  { id: "nao_vazio", nome: "Não está vazio", dica: "", semValor: true },
  { id: "tamanho_menor", nome: "Tamanho do texto menor que", dica: "ex.: 100 caracteres" },
  { id: "tamanho_maior", nome: "Tamanho do texto maior que", dica: "ex.: 100 caracteres" },
  { id: "regex", nome: "Corresponde à regex", dica: "ex.: R\\$\\s?\\d+" },
  { id: "regex_nao", nome: "Não corresponde à regex", dica: "ex.: esgotad[oa]" },
  { id: "num_menor", nome: "Número menor que", dica: "ex.: 1500" },
  { id: "num_maior", nome: "Número maior que", dica: "ex.: 100" },
  { id: "num_queda", nome: "Número caiu pelo menos", dica: "ex.: 50" },
  { id: "num_aumento", nome: "Número subiu pelo menos", dica: "ex.: 50" },
  { id: "pct_queda", nome: "Caiu pelo menos (%)", dica: "ex.: 10" },
  { id: "pct_aumento", nome: "Subiu pelo menos (%)", dica: "ex.: 10" },
];

export const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOMES_DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Texto curto da agenda, ex.: "seg–sex · 08:00–20:00". */
export function descreverAgenda(a?: { dias?: number[]; inicio?: string; fim?: string }): string | null {
  if (!a) return null;
  const dias = [...(a.dias ?? [])].sort();
  const todos = dias.length === 0 || dias.length === 7;
  const horario = (a.inicio && a.inicio !== "00:00") || (a.fim && a.fim !== "24:00" && a.fim !== "23:59") ? `${a.inicio || "00:00"}–${a.fim || "24:00"}` : "";
  const uteis = dias.join() === "1,2,3,4,5";
  const textoDias = todos ? "" : uteis ? "seg–sex" : dias.map((d) => NOMES_DIAS[d]).join(", ");
  const partes = [textoDias, horario].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

export const nomeIntervalo = (min: number) =>
  INTERVALOS.find((i) => i.min === min)?.nome ?? `${min} min`;

export const nomeTipo = (t: TipoMonitor) => TIPOS.find((x) => x.id === t)?.nome ?? t;

export function monitorVazio(email = ""): MonitorDados {
  return {
    nome: "",
    url: "",
    tipo: "pagina",
    seletores: [],
    excluir: [],
    jsonPath: "",
    ignorar: [],
    usarNavegador: false,
    esperarMs: 0,
    intervaloMin: 60,
    ativo: true,
    regras: { operador: "E", itens: [], formatoNumero: "br" },
    acoes: { push: true, email, webhook: "", slack: "", discord: "", teams: "" },
    tags: [],
    agenda: { dias: [], inicio: "00:00", fim: "24:00", aleatorio: false },
    aoErrar: { aposFalhas: 3, avisarRecuperacao: true },
  };
}
