import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, db } from "../firebase";
import type { Alteracao, Monitor, Versao } from "../types";

// ---------- Autenticação ----------
const AuthCtx = createContext<{ user: User | null; carregando: boolean }>({ user: null, carregando: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{ user: User | null; carregando: boolean }>({ user: null, carregando: true });
  useEffect(() => onAuthStateChanged(auth, (user) => setEstado({ user, carregando: false })), []);
  return <AuthCtx.Provider value={estado}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function useUid(): string {
  const { user } = useAuth();
  if (!user) throw new Error("Usuário não autenticado");
  return user.uid;
}

// ---------- Erro global do backend (ex.: banco ainda não criado) ----------
let ouvintesErro: Array<(m: string | null) => void> = [];
let erroAtual: string | null = null;

function reportarErro(e: { code?: string; message?: string }) {
  const msg =
    e.code === "not-found" || /database .* does not exist/i.test(e.message ?? "")
      ? "O banco de dados do Notara não foi encontrado. Tente novamente em instantes."
      : e.code === "permission-denied"
        ? "Sem permissão para ler os dados. As regras do banco ainda não foram publicadas."
        : `Erro ao carregar dados: ${e.message ?? e.code}`;
  erroAtual = msg;
  ouvintesErro.forEach((f) => f(msg));
}

export function useErroBackend() {
  const [erro, setErro] = useState<string | null>(erroAtual);
  useEffect(() => {
    ouvintesErro.push(setErro);
    return () => {
      ouvintesErro = ouvintesErro.filter((f) => f !== setErro);
    };
  }, []);
  return erro;
}

// ---------- Leitura em tempo real ----------
function useConsulta<T>(q: Query<DocumentData> | null, chave: string): { dados: T[]; carregando: boolean } {
  const [estado, setEstado] = useState<{ dados: T[]; carregando: boolean }>({ dados: [], carregando: true });
  useEffect(() => {
    if (!q) return;
    setEstado((s) => ({ ...s, carregando: true }));
    return onSnapshot(
      q,
      (snap) => setEstado({ dados: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), carregando: false }),
      (e) => {
        reportarErro(e);
        setEstado({ dados: [], carregando: false });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return estado;
}

export function useMonitores() {
  const uid = useUid();
  const r = useConsulta<Monitor>(query(collection(db, `users/${uid}/monitores`), orderBy("nome")), `m-${uid}`);
  // Excluídos somem na hora; o motor apaga de vez na próxima rodada
  return { ...r, dados: r.dados.filter((m) => !(m as { excluido?: boolean }).excluido) };
}

export function useMonitor(id: string | undefined) {
  const uid = useUid();
  const [estado, setEstado] = useState<{ monitor: Monitor | null; carregando: boolean }>({ monitor: null, carregando: true });
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, `users/${uid}/monitores/${id}`),
      (s) => setEstado({ monitor: s.exists() && !s.get("excluido") ? ({ id: s.id, ...s.data() } as Monitor) : null, carregando: false }),
      (e) => {
        reportarErro(e);
        setEstado({ monitor: null, carregando: false });
      },
    );
  }, [uid, id]);
  return estado;
}

export function useAlteracoes(filtro: { monitorId?: string; naoLidas?: boolean } = {}, max = 100) {
  const uid = useUid();
  const base = collection(db, `users/${uid}/alteracoes`);
  const restricoes = [
    ...(filtro.monitorId ? [where("monitorId", "==", filtro.monitorId)] : []),
    ...(filtro.naoLidas ? [where("lida", "==", false)] : []),
    orderBy("criadoEm", "desc"),
    limit(max),
  ];
  return useConsulta<Alteracao>(query(base, ...restricoes), `a-${uid}-${filtro.monitorId}-${filtro.naoLidas}-${max}`);
}

export function useVersoes(monitorId: string | undefined, max = 50) {
  const uid = useUid();
  return useConsulta<Versao>(
    monitorId ? query(collection(db, `users/${uid}/monitores/${monitorId}/versoes`), orderBy("capturadoEm", "desc"), limit(max)) : null,
    `v-${uid}-${monitorId}-${max}`,
  );
}
