import type { Timestamp } from "firebase-admin/firestore";

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

export interface Regra {
  tipo: TipoRegra;
  valor: string;
}

export interface ConjuntoRegras {
  operador: "E" | "OU";
  itens: Regra[];
  formatoNumero?: "br" | "us";
}

export interface Acoes {
  push?: boolean;
  email?: string;
  webhook?: string;
  slack?: string;
  discord?: string;
  teams?: string;
}

export interface ConfigCaptura {
  url: string;
  tipo: TipoMonitor;
  seletores?: string[];
  excluir?: string[];
  jsonPath?: string;
  /** Carregar num navegador real (páginas com JavaScript). */
  usarNavegador?: boolean;
  /** Espera extra após carregar (ms), para conteúdo que aparece depois. */
  esperarMs?: number;
}

/** Campos gravados apenas pelo backend. */
export interface Execucao {
  status?: "novo" | "verificando" | "ok" | "erro";
  proxima?: Timestamp;
  ultima?: Timestamp;
  ultimaAlteracao?: Timestamp;
  erros?: number;
  mensagem?: string;
  hash?: string;
  preview?: string;
  titulo?: string | null;
}

/** Quando verificar (fuso de Brasília). Sem agenda = a qualquer hora. */
export interface Agenda {
  /** Dias permitidos: 0 = domingo … 6 = sábado. Vazio = todos. */
  dias?: number[];
  /** "HH:MM" — janela do dia em que pode verificar. */
  inicio?: string;
  fim?: string;
  /** Sorteia um atraso de até 20% do intervalo (parece menos robótico). */
  aleatorio?: boolean;
}

/** O que fazer quando a captura falha. */
export interface AoErrar {
  /** Avisar após N falhas seguidas (1–10). 0 = nunca avisar. */
  aposFalhas?: number;
  /** Avisar quando voltar a funcionar. */
  avisarRecuperacao?: boolean;
}

export interface Monitor extends ConfigCaptura {
  agenda?: Agenda;
  aoErrar?: AoErrar;
  nome: string;
  intervaloMin: number;
  ativo: boolean;
  ignorar?: string[];
  regras?: ConjuntoRegras;
  acoes?: Acoes;
  tags?: string[];
  exec?: Execucao;
}
