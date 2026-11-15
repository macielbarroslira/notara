import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Icone } from "../components/Icone";
import { Aviso, Botao, Cabecalho, Spinner } from "../components/ui";
import { db } from "../firebase";
import { useUid } from "../lib/dados";
import { mensagemErro } from "../lib/erros";

interface Mensagem {
  id: string;
  papel: "usuario" | "ia";
  texto: string;
  status?: "pendente" | "respondendo" | "ok" | "erro";
  criadoEm?: Timestamp | null;
  audio?: string;
  transcricao?: string;
  provedor?: string;
  modelo?: string;
  trocou?: boolean;
  erro?: boolean;
}

interface Catalogo {
  provedor: string;
  modelos: string[];
}

const SUGESTOES = [
  "O que mudou hoje?",
  "Algum monitor está com erro?",
  "Verifica o Cebraspe agora",
  "Quais concursos novos apareceram esta semana?",
];
const MAX_GRAVACAO_S = 120;
const curto = (m: string) => m.replace(/^openai\//, "").replace(/-free$/, "");
const ehLimpar = (t: string) => /^\/(limpar|nova)\b/i.test(t);

/** Texto com links clicáveis (a IA manda links do app e dos sites). */
function ComLinks({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {partes.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target={p.startsWith(location.origin) ? undefined : "_blank"} rel="noreferrer noopener" className="break-all text-accent underline underline-offset-2">
            {p.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Balao({ m }: { m: Mensagem }) {
  const minha = m.papel === "usuario";
  let corpo: ReactNode = <ComLinks texto={m.texto} />;
  if (minha && (m.audio || m.transcricao)) {
    corpo = m.transcricao ? (
      <>
        <span className="mr-1 opacity-70">🎤</span>
        {m.transcricao}
      </>
    ) : (
      <span className="opacity-80">🎤 Áudio enviado — transcrevendo…</span>
    );
  }
  return (
    <div className={`flex ${minha ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap sm:max-w-[75%] ${
          minha ? "rounded-br-md bg-ink text-on-ink" : m.erro ? "rounded-bl-md bg-danger-soft text-danger" : "rounded-bl-md bg-card text-ink shadow-ring"
        }`}
      >
        {corpo}
        {m.modelo && (
          <div className="mt-1.5 font-mono text-[11px] text-faint">
            {m.provedor} · {curto(m.modelo)}
            {m.trocou && " · a escolhida estava no limite"}
          </div>
        )}
      </div>
    </div>
  );
}

function Pensando({ desde }: { desde: number }) {
  const [, setTique] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTique((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const demorando = Date.now() - desde > 60_000;
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-[20px] rounded-bl-md bg-card px-4 py-3 text-sm text-muted shadow-ring">
        <Spinner className="size-3.5" />
        {demorando ? "Ainda pensando… (o motor pode estar reiniciando, leva até 2 min)" : "Pensando…"}
      </div>
    </div>
  );
}

function blobParaBase64(b: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => falha(r.error);
    r.readAsDataURL(b);
  });
}

function formatoDeGravacao() {
  for (const t of ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

export function Assistente() {
  const uid = useUid();
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo[]>([]);
  const [escolha, setEscolha] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState<{ inicio: number } | null>(null);
  const [segundos, setSegundos] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, `users/${uid}/chat`), orderBy("criadoEm", "desc"), limit(80)),
        (s) =>
          setMensagens(
            s.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: "estimate" }) as Omit<Mensagem, "id">) })).reverse(),
          ),
        (e) => setErro(mensagemErro(e)),
      ),
    [uid],
  );
  useEffect(
    () =>
      onSnapshot(doc(db, "config/publica"), (s) => setCatalogo((s.get("iaCatalogo") as Catalogo[] | undefined) ?? []), () => {}),
    [],
  );
  useEffect(
    () =>
      onSnapshot(doc(db, `users/${uid}`), (s) => {
        const ia = s.get("ia") as { provedor?: string | null; modelo?: string | null } | undefined;
        setEscolha(ia?.modelo ? `m:${ia.provedor}|${ia.modelo}` : ia?.provedor ? `p:${ia.provedor}` : "");
      }),
    [uid],
  );
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens?.length, mensagens?.at(-1)?.status]);
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => {
      const s = Math.round((Date.now() - gravando.inicio) / 1000);
      setSegundos(s);
      if (s >= MAX_GRAVACAO_S) gravador.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [gravando]);

  const visiveis = (mensagens ?? []).filter((m) => !(m.papel === "usuario" && ehLimpar(m.texto)));
  const ultima = mensagens?.at(-1);
  const esperando = ultima?.papel === "usuario" && (ultima.status === "pendente" || ultima.status === "respondendo");

  async function enviar(dados: { texto: string; audio?: string; audioMime?: string }) {
    setErro("");
    setEnviando(true);
    try {
      await addDoc(collection(db, `users/${uid}/chat`), {
        papel: "usuario",
        texto: dados.texto.slice(0, 4000),
        status: "pendente",
        criadoEm: serverTimestamp(),
        ...(dados.audio ? { audio: dados.audio, audioMime: dados.audioMime } : {}),
      });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  async function enviarTexto(t = texto) {
    const limpo = t.trim();
    if (!limpo || enviando) return;
    setTexto("");
    await enviar({ texto: limpo });
    campo.current?.focus();
  }

  async function gravar() {
    setErro("");
    if (gravando) {
      gravador.current?.stop();
      return;
    }
    const tipo = formatoDeGravacao();
    if (!navigator.mediaDevices?.getUserMedia || !tipo) {
      setErro("Este navegador não grava áudio. Escreva a mensagem.");
      return;
    }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(fluxo, { mimeType: tipo, audioBitsPerSecond: 32_000 });
      const pedacos: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && pedacos.push(e.data);
      rec.onstop = async () => {
        fluxo.getTracks().forEach((t) => t.stop());
        setGravando(null);
        const blob = new Blob(pedacos, { type: tipo });
        if (blob.size < 1500) return; // toque sem fala
        const base64 = await blobParaBase64(blob);
        if (base64.length > 900_000) {
          setErro("Áudio longo demais. Grave até 2 minutos.");
          return;
        }
        await enviar({ texto: "", audio: base64, audioMime: tipo.split(";")[0] });
      };
      gravador.current = rec;
      rec.start();
      setSegundos(0);
      setGravando({ inicio: Date.now() });
    } catch (e) {
      setErro(/NotAllowed|Permission/i.test(String(e)) ? "Permita o uso do microfone para mandar áudio." : mensagemErro(e));
    }
  }

  async function trocarModelo(v: string) {
    setEscolha(v);
    const [tipo, resto] = [v.slice(0, 2), v.slice(2)];
    const ia =
      tipo === "m:" ? { provedor: resto.split("|")[0], modelo: resto.split("|")[1] } : tipo === "p:" ? { provedor: resto, modelo: null } : { provedor: null, modelo: null };
    await setDoc(doc(db, `users/${uid}`), { ia }, { merge: true }).catch((e) => setErro(mensagemErro(e)));
  }

  async function novaConversa() {
    if (!mensagens?.length) return;
    await Promise.all(mensagens.map((m) => deleteDoc(doc(db, `users/${uid}/chat/${m.id}`)))).catch(() => {});
    await enviar({ texto: "/limpar" });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <Cabecalho
        titulo="Assistente"
        sub="Pergunte sobre seus monitores, peça verificações ou mande vigiar um site. É a mesma IA do Telegram."
        acoes={
          <>
            <select
              value={escolha}
              onChange={(e) => trocarModelo(e.target.value)}
              className="h-10 max-w-[13rem] rounded-full border-0 bg-card px-3 text-sm text-ink shadow-ring focus:ring-2 focus:ring-accent focus:outline-none"
              aria-label="Qual IA responde"
            >
              <option value="">⚡ Automático</option>
              {catalogo.map((c) => (
                <optgroup key={c.provedor} label={c.provedor}>
                  <option value={`p:${c.provedor}`}>Qualquer do {c.provedor}</option>
                  {c.modelos.map((m) => (
                    <option key={m} value={`m:${c.provedor}|${m}`}>
                      {curto(m)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Botao variante="fantasma" icone="atualizar" onClick={novaConversa} disabled={!mensagens?.length}>
              Nova conversa
            </Botao>
          </>
        }
      />

      <div className="flex min-h-[40vh] flex-col gap-3 pb-4">
        {mensagens === null ? (
          <div className="flex justify-center py-16 text-faint">
            <Spinner className="size-6" />
          </div>
        ) : visiveis.length === 0 && !esperando ? (
          <div className="py-10 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-panel text-ink">
              <Icone nome="chat" className="size-6" />
            </div>
            <p className="mt-4 text-[15px] text-muted">Comece com uma pergunta — ou toque no microfone e fale.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <button key={s} onClick={() => enviarTexto(s)} className="rounded-full bg-card px-3.5 py-2 text-sm text-ink-2 shadow-ring transition-colors hover:bg-panel">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          visiveis.map((m) => <Balao key={m.id} m={m} />)
        )}
        {esperando && <Pensando desde={ultima?.criadoEm?.toMillis() ?? Date.now()} />}
        <div ref={fim} />
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
        {erro && (
          <div className="mb-2">
            <Aviso tipo="erro">{erro}</Aviso>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviarTexto();
          }}
          className="flex items-end gap-2 rounded-[26px] bg-card p-2 shadow-card"
        >
          <button
            type="button"
            onClick={gravar}
            className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${gravando ? "bg-danger text-white" : "text-muted hover:bg-panel hover:text-ink"}`}
            aria-label={gravando ? "Parar e enviar áudio" : "Gravar áudio"}
            title={gravando ? "Parar e enviar" : "Gravar áudio"}
          >
            <Icone nome={gravando ? "parar" : "microfone"} className="size-5" />
          </button>
          {gravando ? (
            <div className="flex min-h-10 flex-1 items-center gap-2 px-1 text-sm text-danger">
              <span className="size-2 animate-pulse rounded-full bg-danger" />
              Gravando… {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")} — toque para enviar
            </div>
          ) : (
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void enviarTexto();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Escreva para o assistente…"
              className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-base text-ink placeholder:text-faint focus:outline-none sm:text-[15px]"
            />
          )}
          <button
            type="submit"
            disabled={!texto.trim() || enviando || Boolean(gravando)}
            className="btn-primario grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-40"
            aria-label="Enviar"
          >
            {enviando ? <Spinner /> : <Icone nome="seta" className="size-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
