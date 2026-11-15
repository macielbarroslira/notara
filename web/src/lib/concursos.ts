import { collection, onSnapshot, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";

/** Linha do índice compacto do banco de concursos (gravado pelo motor; ver motor/src/banco.ts). */
export interface LinhaConcurso {
  i: string;
  o: string; // órgão
  u: string; // UF ou BR
  c: string | null; // cidade
  e: string; // esfera
  t: string; // tipo
  es: string[]; // escolaridades
  a: string[]; // áreas
  cg: string; // cargos
  v: number | null; // vagas
  cr: boolean; // cadastro de reserva
  s: number | null; // salário máximo
  ii: string | null; // inscrição início AAAA-MM-DD
  if: string | null; // inscrição fim
  si: "normal" | "prorrogado" | "reaberto" | "suspenso";
  l: string; // link da fonte
  p: number; // primeira vez visto (ms)
  b: string; // tokens de busca
  au?: number; // ausente da fonte desde
}

export interface FiltrosConcurso {
  texto: string;
  uf: string;
  escolaridade: string;
  area: string;
  esfera: string;
  salarioMin: number;
  todos: boolean; // inclui encerrados/suspensos
  ordenar: "prazo" | "salario" | "vagas" | "recentes";
}

export const FILTROS_PADRAO: FiltrosConcurso = {
  texto: "",
  uf: "",
  escolaridade: "",
  area: "",
  esfera: "",
  salarioMin: 0,
  todos: false,
  ordenar: "prazo",
};

export const UFS: Array<[string, string]> = [
  ["BR", "Nacional"], ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"],
  ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"],
  ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"],
  ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
];

export const ESCOLARIDADES: Array<[string, string]> = [
  ["fundamental", "Fundamental"],
  ["medio", "Médio"],
  ["tecnico", "Técnico"],
  ["superior", "Superior"],
];

export const AREAS: Array<[string, string]> = [
  ["administrativo", "Administrativo"],
  ["assistencia_social", "Assistência social"],
  ["bancario", "Bancário"],
  ["contabil", "Contábil/financeiro"],
  ["educacao", "Educação"],
  ["engenharia", "Engenharia"],
  ["fiscal", "Fiscal/controle"],
  ["juridico", "Jurídico/tribunais"],
  ["legislativo", "Legislativo"],
  ["operacional", "Operacional"],
  ["saude", "Saúde"],
  ["seguranca", "Segurança"],
  ["ti", "Tecnologia (TI)"],
];

export const ESFERAS: Array<[string, string]> = [
  ["federal", "Federal"],
  ["estadual", "Estadual"],
  ["municipal", "Municipal"],
];

export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const hojeBrasilia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export type SituacaoAgora = "aberto" | "em_breve" | "encerrado" | "suspenso" | "sem_data";

export function situacaoAgora(l: LinhaConcurso, hoje = hojeBrasilia()): SituacaoAgora {
  if (l.si === "suspenso") return "suspenso";
  if (l.ii && hoje < l.ii) return "em_breve";
  if (l.if && hoje > l.if) return "encerrado";
  return l.if ? "aberto" : "sem_data";
}

export const diasAte = (iso: string | null, hoje = hojeBrasilia()) =>
  iso ? Math.round((Date.parse(iso) - Date.parse(hoje)) / 86_400_000) : null;

export const dataCurta = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "?");

/** Mesma lógica de motor/src/banco.ts (filtrarConcursos). */
export function filtrar(linhas: LinhaConcurso[], f: FiltrosConcurso, hoje = hojeBrasilia()) {
  const palavras = normalizar(f.texto).split(" ").filter((w) => w.length > 1);
  const lista = linhas.filter((l) => {
    const sit = situacaoAgora(l, hoje);
    if (!f.todos && sit !== "aberto" && sit !== "em_breve") return false;
    if (f.uf && l.u !== f.uf) return false;
    if (f.escolaridade && !l.es.includes(f.escolaridade)) return false;
    if (f.area && !l.a.includes(f.area)) return false;
    if (f.esfera && l.e !== f.esfera) return false;
    if (f.salarioMin && (l.s ?? 0) < f.salarioMin) return false;
    if (palavras.length) {
      const tokens = `${l.b} ${normalizar(l.cg)}`.split(" ");
      if (!palavras.every((p) => tokens.some((t) => t.startsWith(p)))) return false;
    }
    return true;
  });
  lista.sort((a, b) =>
    f.ordenar === "salario"
      ? (b.s ?? 0) - (a.s ?? 0)
      : f.ordenar === "vagas"
        ? (b.v ?? 0) - (a.v ?? 0)
        : f.ordenar === "recentes"
          ? b.p - a.p
          : (a.if ?? "9999").localeCompare(b.if ?? "9999"),
  );
  return lista;
}

/** Índice do banco (1 ou 2 documentos), ao vivo. */
export function useBancoConcursos() {
  const [estado, setEstado] = useState<{ linhas: LinhaConcurso[] | null; atualizadoEm: Timestamp | null; erro: string }>({
    linhas: null,
    atualizadoEm: null,
    erro: "",
  });
  useEffect(
    () =>
      onSnapshot(
        collection(db, "concursos_indice"),
        (s) => {
          const docs = [...s.docs].sort((a, b) => a.id.localeCompare(b.id));
          setEstado({
            linhas: docs.flatMap((d) => (d.get("linhas") as LinhaConcurso[] | undefined) ?? []),
            atualizadoEm: (docs[0]?.get("atualizadoEm") as Timestamp | undefined) ?? null,
            erro: "",
          });
        },
        (e) => setEstado((x) => ({ ...x, linhas: x.linhas ?? [], erro: String(e) })),
      ),
    [],
  );
  return estado;
}
