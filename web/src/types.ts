import type { Timestamp } from "firebase/firestore";

export type TipoMonitor = "pagina" | "elemento" | "feed" | "json" | "uptime" | "pdf";

export type TipoRegra =
  | "nunca_visto"
  | "contem"
  | "nao_contem"
  | "adicionado_contem"
  | "comeca_com"
  | "termina_com"
  | "vazio"
  | "nao_vazio"
  | "tamanho_menor"
  | "tamanho_maior"
  | "regex"
  | "regex_nao"
  | "num_menor"
  | "num_maior"
  | "num_aumento"
  | "num_queda"
  | "pct_aumento"
  | "pct_queda";

/** Quando verificar (horário de Brasília). */
export interface Agenda {
  /** 0 = domingo … 6 = sábado. Vazio = todos os dias. */
  dias: number[];
  inicio: string; // "HH:MM"
  fim: string; // "HH:MM"
  aleatorio: boolean;
}

export interface AoErrar {
  /** Avisar após N falhas seguidas (0 = nunca). */
  aposFalhas: number;
  avisarRecuperacao: boolean;
}

export interface Regra {
  tipo: TipoRegra;
  valor: string;
}

export interface ConjuntoRegras {
  operador: "E" | "OU";
  itens: Regra[];
  formatoNumero: "br" | "us";
}

export interface Acoes {
  push: boolean;
  email: string;
  webhook: string;
  slack: string;
  discord: string;
  teams: string;
}

export interface Execucao {
  status?: "novo" | "verificando" | "ok" | "erro";
  proxima?: Timestamp;
  ultima?: Timestamp;
  ultimaAlteracao?: Timestamp;
  erros?: number;
  mensagem?: string;
  preview?: string;
  titulo?: string | null;
}

export interface MonitorDados {
  nome: string;
  url: string;
  tipo: TipoMonitor;
  seletores: string[];
  excluir: string[];
  jsonPath: string;
  ignorar: string[];
  /** Carregar num navegador real (páginas com JavaScript) e salvar screenshots. */
  usarNavegador: boolean;
  esperarMs: number;
  intervaloMin: number;
  ativo: boolean;
  regras: ConjuntoRegras;
  acoes: Acoes;
  tags: string[];
  agenda: Agenda;
  aoErrar: AoErrar;
}

export interface Monitor extends MonitorDados {
  id: string;
  exec?: Execucao;
  criadoEm?: Timestamp;
}

export interface Versao {
  id: string;
  capturadoEm: Timestamp;
  texto: string;
  titulo: string | null;
  status: number;
  temCaptura?: boolean;
}

export interface Alteracao {
  id: string;
  monitorId: string;
  monitorNome: string;
  url: string;
  criadoEm: Timestamp;
  lida: boolean;
  resumo: string;
  adicionado: string;
  removido: string;
  versaoAnterior: string;
  versaoNova: string;
  motivos?: string[];
  /** Linhas que nunca tinham aparecido antes. */
  ineditas?: string[];
  feedback?: "util" | "falso";
}
