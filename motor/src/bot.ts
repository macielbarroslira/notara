import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { executarMonitor } from "./check.js";
import { db, INTERVALO_MINIMO_MIN, URL_APP } from "./db.js";
import { capturar } from "./extract.js";
import { validarUrl } from "./fetcher.js";
import { catalogoIa, conversarComIa, iaAtiva, transcreverAudio, type PreferenciaIa } from "./ia.js";
import { enviarPush } from "./notify.js";
import { baixarArquivo, enviarComBotoes, enviarTexto, indicarDigitando, responderToque, type Botoes } from "./telegram.js";
import type { Monitor, TipoMonitor } from "./types.js";

/**
 * Conversa com o bot do Telegram: comandos rápidos (/lista, /verificar…) e, com GEMINI_API_KEY,
 * conversa livre com uma IA que usa as "ferramentas" abaixo — sempre só nos dados do próprio usuário.
 */

const TIPOS: TipoMonitor[] = ["pagina", "elemento", "feed", "json", "uptime", "pdf"];
const quando = (t?: Timestamp) =>
  t ? t.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca";
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function monitoresDo(uid: string) {
  const snap = await db.collection(`users/${uid}/monitores`).get();
  return snap.docs.filter((d) => d.get("excluido") !== true);
}

/** Acha um monitor pelo nome, endereço ou id (a busca da IA ou do comando). */
async function acharMonitor(uid: string, busca: string): Promise<DocumentSnapshot | string> {
  const todos = await monitoresDo(uid);
  const b = normalizar(busca);
  if (!b) return "Diga qual monitor (parte do nome ou do endereço).";
  const exato = todos.find((d) => d.id === busca || normalizar(d.get("nome") ?? "") === b);
  if (exato) return exato;
  const achados = todos.filter((d) => normalizar(`${d.get("nome")} ${d.get("url")}`).includes(b));
  if (achados.length === 1) return achados[0];
  if (achados.length === 0) return `Nenhum monitor com "${busca}".`;
  return `Mais de um monitor combina com "${busca}": ${achados.map((d) => d.get("nome")).join("; ")}. Seja mais específico.`;
}

// ---------- Ferramentas (usadas pelos comandos e pela IA) ----------

export async function listarMonitores(uid: string) {
  return (await monitoresDo(uid)).map((d) => {
    const m = d.data() as Monitor;
    return {
      nome: m.nome,
      url: m.url,
      tipo: m.tipo,
      ativo: m.ativo,
      status: m.exec?.status ?? "novo",
      erro: m.exec?.status === "erro" ? m.exec?.mensagem : undefined,
      verificadoEm: quando(m.exec?.ultima),
      ultimaAlteracao: quando(m.exec?.ultimaAlteracao),
      aCadaMinutos: m.intervaloMin,
    };
  });
}

export async function ultimasNovidades(uid: string, quantidade = 5, busca?: string) {
  const n = Math.min(Math.max(Math.round(quantidade) || 5, 1), 15);
  const snap = await db.collection(`users/${uid}/alteracoes`).orderBy("criadoEm", "desc").limit(busca ? 60 : n).get();
  let docs = snap.docs;
  if (busca) {
    const b = normalizar(busca);
    docs = docs.filter((d) => normalizar(`${d.get("monitorNome")} ${d.get("url")}`).includes(b));
  }
  return docs.slice(0, n).map((d) => ({
    monitor: d.get("monitorNome") as string,
    quando: quando(d.get("criadoEm") as Timestamp),
    resumo: d.get("resumo") as string,
    novidades: ((d.get("ineditas") as string[] | undefined) ?? []).slice(0, 8),
    adicionado: String(d.get("adicionado") ?? "").slice(0, 600),
    link: `${URL_APP}/alteracoes/${d.id}`,
    lida: d.get("lida") === true,
  }));
}

export async function verificarAgora(uid: string, busca: string) {
  const achado = await acharMonitor(uid, busca);
  if (typeof achado === "string") return { erro: achado };
  const r = await executarMonitor(achado.ref, achado.data() as Monitor);
  const textos: Record<string, string> = {
    primeira: "primeira captura salva",
    igual: "sem mudanças",
    mudou_sem_alerta: "mudou, mas não bateu com as regras de alerta",
    alterou: "mudou — alerta enviado",
    erro: "erro",
  };
  return {
    monitor: achado.get("nome") as string,
    resultado: textos[r.status] ?? r.status,
    mensagem: r.mensagem,
    link: r.alteracaoId ? `${URL_APP}/alteracoes/${r.alteracaoId}` : `${URL_APP}/monitores/${achado.id}`,
  };
}

export async function pausarOuRetomar(uid: string, busca: string, ativo: boolean) {
  const achado = await acharMonitor(uid, busca);
  if (typeof achado === "string") return { erro: achado };
  await achado.ref.update(ativo ? { ativo: true, "exec.proxima": Timestamp.now() } : { ativo: false });
  return { monitor: achado.get("nome") as string, ativo };
}

export async function criarMonitor(
  uid: string,
  a: { url: string; nome?: string; tipo?: string; intervaloMin?: number; palavra?: string; soNovidades?: boolean },
) {
  const url = validarUrl(String(a.url ?? "")).toString();
  const total = (await monitoresDo(uid)).length;
  const tipo = TIPOS.includes(a.tipo as TipoMonitor) ? (a.tipo as TipoMonitor) : "pagina";
  const intervalo = Math.min(Math.max(Math.round(Number(a.intervaloMin) || 60), INTERVALO_MINIMO_MIN), 10080);
  const itens = a.palavra?.trim()
    ? [{ tipo: "adicionado_contem", valor: a.palavra.trim().slice(0, 200) }]
    : a.soNovidades
      ? [{ tipo: "nunca_visto", valor: "" }]
      : [];
  const usuario = await db.doc(`users/${uid}`).get();
  const ref = await db.collection(`users/${uid}/monitores`).add({
    nome: (a.nome?.trim() || new URL(url).hostname).slice(0, 120),
    url,
    tipo,
    seletores: [],
    excluir: [],
    jsonPath: "",
    ignorar: [],
    usarNavegador: false,
    esperarMs: 0,
    intervaloMin: intervalo,
    ativo: true,
    regras: { operador: "E", itens, formatoNumero: "br" },
    acoes: { push: true, telegram: true, email: (usuario.get("email") as string | undefined) ?? "", webhook: "", slack: "", discord: "", teams: "" },
    tags: ["telegram"],
    agenda: { dias: [], inicio: "00:00", fim: "24:00", aleatorio: false },
    aoErrar: { aposFalhas: 3, avisarRecuperacao: true },
    criadoEm: Timestamp.now(),
    exec: { status: "novo", proxima: Timestamp.now() },
  });
  return { criado: true, monitores: total + 1, link: `${URL_APP}/monitores/${ref.id}`, aCadaMinutos: intervalo, tipo };
}

/** Lê um endereço agora (sem salvar) — para a IA olhar o conteúdo de uma página. */
export async function lerPagina(url: string, tipo?: string) {
  validarUrl(url);
  const r = await capturar({ url, tipo: TIPOS.includes(tipo as TipoMonitor) ? (tipo as TipoMonitor) : "pagina" });
  return { titulo: r.titulo, status: r.status, texto: r.texto.slice(0, 6000), cortado: r.texto.length > 6000 };
}

export async function alertaDeTeste(uid: string, chatId: number) {
  const aviso = {
    titulo: "🔔 Alerta de teste do Notara",
    corpo: "Se você recebeu isto, os alertas estão funcionando.",
    link: `${URL_APP}/configuracoes`,
  };
  const [push] = await Promise.allSettled([enviarPush(uid, aviso)]);
  const aparelhos = (await db.collection(`users/${uid}/dispositivos`).count().get()).data().count;
  await enviarTexto(chatId, `${aviso.titulo}\n${aviso.corpo}`);
  return {
    telegram: "enviado",
    push: push.status === "rejected" ? `falhou (${String(push.reason).slice(0, 120)})` : aparelhos ? `enviado para ${aparelhos} aparelho(s)` : "nenhum aparelho com notificações ativadas",
  };
}

// ---------- Comandos ----------

const AJUDA = `Comandos do Notara:
/lista — seus monitores e o estado de cada um
/novidades — as últimas mudanças encontradas
/verificar <nome> — verifica um monitor agora
/pausar <nome> e /retomar <nome>
/teste — envia um alerta de teste (Telegram e celular)
/modelo — escolhe qual IA responde (Gemini, Groq, OpenCode)
/parar — desconecta este Telegram`;

const ICONE: Record<string, string> = { ok: "🟢", erro: "🔴", novo: "⚪", verificando: "🔄" };

async function comando(uid: string, chatId: number, cmd: string, arg: string): Promise<string | null> {
  switch (cmd) {
    case "ajuda":
    case "help":
    case "start":
      return `${AJUDA}${iaAtiva() ? "\n\nOu escreva (ou mande um áudio) normalmente — ex.: “o que mudou hoje?”, “vigie https://… e me avise quando aparecer Analista”." : ""}`;
    case "lista":
    case "monitores": {
      const l = await listarMonitores(uid);
      if (!l.length) return "Você ainda não tem monitores. Crie em notara.web.app ou me mande um endereço.";
      return l
        .map((m) => `${m.ativo ? (ICONE[m.status] ?? "⚪") : "⏸"} ${m.nome}${m.erro ? `\n   ⚠️ ${m.erro}` : ""}\n   verificado: ${m.verificadoEm} · última mudança: ${m.ultimaAlteracao}`)
        .join("\n");
    }
    case "novidades": {
      const l = await ultimasNovidades(uid, 5, arg || undefined);
      if (!l.length) return "Nenhuma mudança encontrada ainda.";
      return l.map((a) => `🔔 ${a.monitor} (${a.quando})\n${a.resumo}\n${a.link}`).join("\n\n");
    }
    case "verificar": {
      if (!arg) return "Use: /verificar <parte do nome do monitor>";
      await enviarTexto(chatId, "🔄 Verificando…");
      const r = await verificarAgora(uid, arg);
      return "erro" in r ? r.erro! : `${r.monitor}: ${r.resultado}${r.mensagem ? ` (${r.mensagem})` : ""}\n${r.link}`;
    }
    case "pausar":
    case "retomar": {
      if (!arg) return `Use: /${cmd} <parte do nome do monitor>`;
      const r = await pausarOuRetomar(uid, arg, cmd === "retomar");
      return "erro" in r ? r.erro! : `${r.ativo ? "▶️ Retomado" : "⏸ Pausado"}: ${r.monitor}`;
    }
    case "modelo":
    case "modelos":
    case "ia":
      await menuModelos(uid, chatId);
      return "";
    case "teste": {
      const r = await alertaDeTeste(uid, chatId);
      return `Push no celular/computador: ${r.push}.`;
    }
    default:
      return null;
  }
}

// ---------- Escolha da IA (/modelo) ----------

const curto = (m: string) => m.replace(/^openai\//, "").replace(/-free$/, "");

/** Menu de botões: Automático + provedores; ao tocar num provedor, mostra os modelos dele. */
async function menuModelos(uid: string, chatId: number, editarId?: number, abrir?: string) {
  const pref = ((await db.doc(`users/${uid}`).get()).get("ia") as PreferenciaIa | undefined) ?? {};
  const catalogo = catalogoIa();
  if (!catalogo.length) {
    await enviarTexto(chatId, "Nenhuma IA configurada no motor.");
    return;
  }
  const atual = pref.modelo ? `${pref.provedor} · ${curto(pref.modelo)}` : pref.provedor ? `${pref.provedor} (qualquer modelo)` : "Automático";
  const marca = (ok: boolean) => (ok ? "✅ " : "");
  let botoes: Botoes;
  let texto = `🤖 IA atual: ${atual}\nSe a escolhida estiver no limite, eu passo para outra sozinho.`;
  const grupo = abrir ? catalogo.find((c) => c.provedor === abrir) : undefined;
  if (grupo) {
    texto += `\n\nModelos do ${grupo.provedor} (⏳ = no limite agora):`;
    botoes = [
      [{ text: `${marca(pref.provedor === grupo.provedor && !pref.modelo)}Qualquer do ${grupo.provedor}`, callback_data: `ia:p:${grupo.provedor}` }],
      ...grupo.modelos.map((m) => [
        { text: `${marca(pref.modelo === m.modelo)}${m.fora ? "⏳ " : ""}${curto(m.modelo)}`.slice(0, 60), callback_data: `ia:m:${m.modelo}`.slice(0, 64) },
      ]),
      [{ text: "⬅️ Voltar", callback_data: "ia:menu" }],
    ];
  } else {
    botoes = [
      [{ text: `${marca(!pref.provedor && !pref.modelo)}⚡ Automático`, callback_data: "ia:auto" }],
      catalogo.map((c) => ({
        text: `${marca(pref.provedor === c.provedor)}${c.provedor}${c.modelos.every((m) => m.fora) ? " ⏳" : ""}`,
        callback_data: `ia:abrir:${c.provedor}`,
      })),
    ];
  }
  await enviarComBotoes(chatId, texto, botoes, editarId);
}

/** Toque num botão do menu /modelo. */
export async function responderBotao(chatId: number, mensagemId: number, dados: string, toqueId: string) {
  const usuarios = await db.collection("users").where("telegramChatId", "==", chatId).limit(1).get();
  if (usuarios.empty) return responderToque(toqueId, "Conecte este Telegram no app primeiro.");
  const uid = usuarios.docs[0].id;
  const ref = usuarios.docs[0].ref;
  const [, acao, valor] = /^ia:(auto|menu|abrir|p|m):?(.*)$/.exec(dados) ?? [];
  if (!acao) return responderToque(toqueId);
  const catalogo = catalogoIa();
  if (acao === "auto") {
    await ref.update({ ia: { provedor: null, modelo: null } });
    await responderToque(toqueId, "Automático");
  } else if (acao === "p" && catalogo.some((c) => c.provedor === valor)) {
    await ref.update({ ia: { provedor: valor, modelo: null } });
    await responderToque(toqueId, valor);
  } else if (acao === "m") {
    const grupo = catalogo.find((c) => c.modelos.some((m) => m.modelo === valor));
    if (!grupo) return responderToque(toqueId, "Modelo indisponível agora");
    await ref.update({ ia: { provedor: grupo.provedor, modelo: valor } });
    await responderToque(toqueId, curto(valor));
  } else {
    await responderToque(toqueId);
  }
  const abrir = acao === "abrir" ? valor : acao === "p" || acao === "m" ? (catalogo.find((c) => c.provedor === valor || c.modelos.some((m) => m.modelo === valor))?.provedor) : undefined;
  await menuModelos(uid, chatId, mensagemId, abrir);
}

/** Mensagem de voz: transcreve com a IA e responde como se fosse texto. */
export async function responderAudio(chatId: number, arquivo: Parameters<typeof baixarArquivo>[0]) {
  const usuarios = await db.collection("users").where("telegramChatId", "==", chatId).limit(1).get();
  if (usuarios.empty) {
    await enviarTexto(chatId, "Este Telegram ainda não está ligado a uma conta. Abra notara.web.app › Ajustes › Conectar Telegram.");
    return;
  }
  if (!iaAtiva()) {
    await enviarTexto(chatId, "Para entender áudio, a IA precisa estar ligada no motor. Por enquanto, mande por escrito.");
    return;
  }
  await indicarDigitando(chatId);
  let transcricao: string;
  try {
    transcricao = await transcreverAudio(await baixarArquivo(arquivo));
  } catch (e) {
    console.warn("Áudio:", String(e));
    await enviarTexto(chatId, `Não consegui entender o áudio (${(e as Error).message}). Pode mandar por escrito?`);
    return;
  }
  if (!transcricao || /^\(sem fala\)$/i.test(transcricao)) {
    await enviarTexto(chatId, "Não ouvi nenhuma fala nesse áudio. Pode repetir?");
    return;
  }
  await responderMensagem(chatId, transcricao, `🎤 “${transcricao.slice(0, 300)}”\n\n`);
}

/** Responde uma mensagem de um chat já conectado a uma conta do Notara. */
export async function responderMensagem(chatId: number, texto: string, prefixo = "") {
  const usuarios = await db.collection("users").where("telegramChatId", "==", chatId).limit(1).get();
  if (usuarios.empty) {
    await enviarTexto(chatId, "Este Telegram ainda não está ligado a uma conta. Abra notara.web.app › Ajustes › Conectar Telegram.");
    return;
  }
  const uid = usuarios.docs[0].id;
  const m = /^\/([a-zA-Z]+)(?:@\w+)?\s*([\s\S]*)$/.exec(texto);
  if (m) {
    const resposta = await comando(uid, chatId, m[1].toLowerCase(), m[2].trim());
    if (resposta !== "") await enviarTexto(chatId, prefixo + (resposta ?? `Não conheço esse comando.\n\n${AJUDA}`));
    return;
  }
  if (!iaAtiva()) {
    await enviarTexto(chatId, `${AJUDA}\n\n(A conversa livre com IA ainda não foi ligada no motor.)`);
    return;
  }
  // "digitando…" some após ~5 s no Telegram: renova enquanto a IA pensa
  await indicarDigitando(chatId);
  const digitando = setInterval(() => void indicarDigitando(chatId), 4_500);
  try {
    const pref = usuarios.docs[0].get("ia") as PreferenciaIa | undefined;
    await enviarTexto(chatId, prefixo + (await conversarComIa(uid, chatId, texto, pref)));
  } finally {
    clearInterval(digitando);
  }
}
