import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icone } from "../components/Icone";
import { Aviso, Botao, Campo, classeInput, Marca } from "../components/ui";
import { auth } from "../firebase";

function traduzir(codigo: string): string {
  const m: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/email-already-in-use": "Este e-mail já tem conta. Use “Entrar”.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/popup-closed-by-user": "Login cancelado.",
    "auth/popup-blocked": "O navegador bloqueou a janela de login. Libere pop-ups para este site.",
    "auth/operation-not-allowed": "Este método de login não está ativado no Firebase.",
    "auth/unauthorized-domain": "Este domínio ainda não foi autorizado no Firebase Authentication.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco.",
    "auth/network-request-failed": "Sem conexão com a internet.",
  };
  return m[codigo] ?? `Não foi possível entrar (${codigo}).`;
}

export function Login() {
  const [busca] = useSearchParams();
  const [modo, setModo] = useState<"entrar" | "criar">(busca.get("modo") === "criar" ? "criar" : "entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<unknown>) {
    setErro("");
    setInfo("");
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      setErro(traduzir((e as { code?: string }).code ?? "desconhecido"));
    } finally {
      setOcupado(false);
    }
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    executar(() =>
      modo === "entrar" ? signInWithEmailAndPassword(auth, email, senha) : createUserWithEmailAndPassword(auth, email, senha),
    );
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="grade pointer-events-none absolute inset-x-0 top-0 h-[70vh]" aria-hidden="true" />
      <Link to="/" className="absolute top-5 left-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <Icone nome="voltar" className="size-4" /> Início
      </Link>
      <div className="surgir relative w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <Marca className="mb-5 size-11" />
          <h1 className="text-[32px] leading-tight font-medium tracking-[-0.03em] text-ink">
            {modo === "entrar" ? "Entrar no Notara" : "Criar sua conta"}
          </h1>
          <p className="mt-2 text-[15px] text-muted">Note cada mudança nos sites que importam para você.</p>
        </div>
        <div className="rounded-plate bg-card p-6 shadow-card sm:p-7">

        <Botao
          variante="secundario"
          className="w-full"
          carregando={ocupado}
          onClick={() => executar(() => signInWithPopup(auth, new GoogleAuthProvider()))}
        >
          <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continuar com Google
        </Botao>

        <div className="my-5 flex items-center gap-3 text-xs text-faint">
          <span className="h-px flex-1 bg-frame" /> ou <span className="h-px flex-1 bg-frame" />
        </div>

        <form onSubmit={enviar} className="space-y-3">
          <Campo rotulo="E-mail">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={classeInput} />
          </Campo>
          <Campo rotulo="Senha">
            <input
              type="password"
              required
              minLength={6}
              autoComplete={modo === "entrar" ? "current-password" : "new-password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={classeInput}
            />
          </Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {info && <Aviso tipo="ok">{info}</Aviso>}
          <Botao type="submit" variante="primario" className="w-full" carregando={ocupado}>
            {modo === "entrar" ? "Entrar" : "Criar conta"}
          </Botao>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          <button className="text-accent hover:underline" onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}>
            {modo === "entrar" ? "Criar conta" : "Já tenho conta"}
          </button>
          {modo === "entrar" && (
            <button
              className="text-muted hover:underline"
              onClick={() => {
                if (!email) return setErro("Digite seu e-mail acima para receber o link.");
                executar(async () => {
                  await sendPasswordResetEmail(auth, email);
                  setInfo("Enviamos um link para redefinir a senha.");
                });
              }}
            >
              Esqueci a senha
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
