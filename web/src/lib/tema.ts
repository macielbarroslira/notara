import { useEffect, useState } from "react";

/** Tema claro/escuro: segue o sistema por padrão; a escolha manual fica no aparelho. */
export type Tema = "claro" | "escuro" | "sistema";

const CHAVE = "notara-tema";
const consulta = () => window.matchMedia("(prefers-color-scheme: dark)");

function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === "claro" || t === "escuro" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

export function aplicarTema(tema: Tema = lerTema()) {
  const escuro = tema === "escuro" || (tema === "sistema" && consulta().matches);
  document.documentElement.classList.toggle("dark", escuro);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", escuro ? "#0b0b0e" : "#ffffff");
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(lerTema);
  useEffect(() => {
    aplicarTema(tema);
    try {
      if (tema === "sistema") localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, tema);
    } catch {
      /* armazenamento indisponível: só não lembra a escolha */
    }
    if (tema !== "sistema") return;
    const mq = consulta();
    const mudou = () => aplicarTema("sistema");
    mq.addEventListener("change", mudou);
    return () => mq.removeEventListener("change", mudou);
  }, [tema]);
  const escuro = tema === "escuro" || (tema === "sistema" && consulta().matches);
  /** Alterna entre claro e escuro. */
  const alternar = () => setTema(escuro ? "claro" : "escuro");
  return { tema, escuro, alternar, setTema };
}
