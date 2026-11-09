import { createHash } from "node:crypto";
import { diffLines } from "diff";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { db, INTERVALO_MINIMO_MIN, URL_APP } from "./db.js";
import { proximaExecucao } from "./agenda.js";
import { emailAlteracao, emailAviso } from "./email.js";
import { capturar } from "./extract.js";
import { notificar } from "./notify.js";
import { atualizarMemoria, avaliarRegras, linhasInéditas } from "./rules.js";
import type { Monitor } from "./types.js";

const MAX_TEXTO = 200_000;
const MAX_DIFF = 20_000;
const MAX_VERSOES = 50;

export interface ResultadoExecucao {
  status: "primeira" | "igual" | "mudou_sem_alerta" | "alterou" | "erro";
  mensagem?: string;
  alteracaoId?: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Remove trechos voláteis (datas, contadores…) definidos pelo usuário antes de comparar. */
export function aplicarIgnorar(texto: string, padroes: string[] = []): string {
  let saida = texto;
  for (const p of padroes) {
    if (!p.trim()) continue;
    try {
      saida = saida.replace(new RegExp(p, "gi"), "");
    } catch {
      /* regex inválida: ignora */
    }
  }
  return saida;
}

function resumir(adicionado: string, removido: string): string {
  const linha = (s: string) => s.split("\n").find((l) => l.trim())?.trim() ?? "";
  const add = linha(adicionado);
  const rem = linha(removido);
  if (add && rem) return `“${rem.slice(0, 80)}” → “${add.slice(0, 80)}”`;
  if (add) return `Novo: ${add.slice(0, 160)}`;
  if (rem) return `Removido: ${rem.slice(0, 160)}`;
  return "O conteúdo mudou";
}

async function podarVersoes(ref: DocumentReference) {
  const antigas = await ref.collection("versoes").orderBy("capturadoEm", "desc").offset(MAX_VERSOES).limit(100).get();
  if (antigas.empty) return;
  const lote = db.batch();
  antigas.docs.forEach((d) => {
    lote.delete(d.ref);
    lote.delete(ref.collection("capturas").doc(d.id)); // screenshot da mesma versão
  });
  await lote.commit();
}

/** Após quantas falhas seguidas avisar (0 = nunca). */
const limiteAviso = (m: Monitor) => Math.min(Math.max(m.aoErrar?.aposFalhas ?? 3, 0), 10);

/** E-mail de erro/recuperação (se o e-mail estiver configurado no monitor e no motor). */
async function registrarAviso(_uid: string, monitorId: string, m: Monitor, tipo: "erro" | "recuperou", mensagem: string) {
  await emailAviso(m.acoes?.email, { monitorId, monitorNome: m.nome, url: m.url, tipo, mensagem: mensagem.slice(0, 500) }).catch((e) =>
    console.warn("Falha ao enviar e-mail de aviso", String(e)),
  );
}

export async function executarMonitor(ref: DocumentReference, m: Monitor): Promise<ResultadoExecucao> {
  const agora = Timestamp.now();
  const intervaloMs = Math.max(INTERVALO_MINIMO_MIN, m.intervaloMin || 60) * 60_000;
  const uid = ref.parent.parent!.id;
  const limite = limiteAviso(m);

  let resultado: ResultadoExecucao;
  try {
    resultado = await processar(ref, m, uid, agora, intervaloMs);
  } catch (e) {
    const mensagem = (e as Error).message || "Erro desconhecido";
    const erros = (m.exec?.erros ?? 0) + 1;
    // Backoff exponencial: intervalo, 2x, 4x… até 24 h (respeitando a agenda)
    const espera = Math.min(intervaloMs * 2 ** Math.min(erros - 1, 8), 24 * 3600_000);
    await ref.update({
      "exec.ultima": agora,
      "exec.proxima": Timestamp.fromMillis(proximaExecucao(Date.now(), espera, m.agenda)),
      "exec.erros": erros,
      "exec.status": "erro",
      "exec.mensagem": mensagem.slice(0, 500),
    });
    if (limite > 0 && erros === limite) {
      await notificar(uid, ref.id, m, {
        titulo: `⚠️ ${m.nome} está com erro`,
        corpo: `${erros} falha(s) seguida(s): ${mensagem.slice(0, 180)}`,
        link: `${URL_APP}/monitores/${ref.id}`,
      });
      await registrarAviso(uid, ref.id, m, "erro", mensagem);
    }
    return { status: "erro", mensagem };
  }

  // Voltou a funcionar depois de um aviso de erro
  if (limite > 0 && (m.exec?.erros ?? 0) >= limite && m.aoErrar?.avisarRecuperacao !== false) {
    await notificar(uid, ref.id, m, {
      titulo: `✅ ${m.nome} voltou a funcionar`,
      corpo: "A verificação foi concluída normalmente.",
      link: `${URL_APP}/monitores/${ref.id}`,
    });
    await registrarAviso(uid, ref.id, m, "recuperou", "A verificação voltou a funcionar.");
  }
  return resultado;
}

async function processar(
  ref: DocumentReference,
  m: Monitor,
  uid: string,
  agora: Timestamp,
  intervaloMs: number,
): Promise<ResultadoExecucao> {
  {
    // Screenshot só é tirado quando o navegador é usado (configurado ou automático)
    const r = await capturar(m, { capturarTela: true });
    const texto = r.texto.slice(0, MAX_TEXTO);
    const comparavel = aplicarIgnorar(texto, m.ignorar);
    const hash = sha(comparavel);
    const base = {
      // Página precisou de JavaScript: lembra disso para as próximas verificações
      ...(r.usouNavegador && !m.usarNavegador ? { usarNavegador: true } : {}),
      "exec.ultima": agora,
      "exec.proxima": Timestamp.fromMillis(proximaExecucao(Date.now(), intervaloMs, m.agenda)),
      "exec.erros": 0,
      "exec.status": "ok",
      "exec.mensagem": FieldValue.delete(),
      "exec.titulo": r.titulo,
    };

    if (m.exec?.hash === hash) {
      await ref.update(base);
      return { status: "igual" };
    }

    const memoriaRef = ref.collection("interno").doc("linhas");
    const [ultima, memoria] = await Promise.all([
      ref.collection("versoes").orderBy("capturadoEm", "desc").limit(1).get(),
      memoriaRef.get(),
    ]);
    const anterior = ultima.docs[0];
    const novaRef = ref.collection("versoes").doc();
    if (r.screenshot) {
      // Screenshot fica num doc separado para não pesar a leitura do histórico
      await ref.collection("capturas").doc(novaRef.id).set({
        capturadoEm: agora,
        jpeg: r.screenshot.jpeg,
        largura: r.screenshot.largura,
        altura: r.screenshot.altura,
      });
    }
    await novaRef.set({ capturadoEm: agora, hash, texto, titulo: r.titulo, status: r.status, temCaptura: Boolean(r.screenshot) });
    const atualizacao = { ...base, "exec.hash": hash, "exec.preview": texto.slice(0, 280) };

    if (!anterior || !m.exec?.hash) {
      await memoriaRef.set({ d: atualizarMemoria([], comparavel) });
      await ref.update(atualizacao);
      return { status: "primeira" };
    }

    const textoAntigo = (anterior.get("texto") as string) ?? "";
    // Memória de linhas já vistas (monitores antigos começam pela versão anterior)
    const vistas: string[] = memoria.exists
      ? ((memoria.get("d") as string[]) ?? [])
      : atualizarMemoria([], aplicarIgnorar(textoAntigo, m.ignorar));
    const ineditas = linhasInéditas(comparavel, vistas);
    await memoriaRef.set({ d: atualizarMemoria(vistas, comparavel) });

    const partes = diffLines(textoAntigo, texto);
    const adicionado = partes.filter((p) => p.added).map((p) => p.value).join("").trim();
    const removido = partes.filter((p) => p.removed).map((p) => p.value).join("").trim();
    const avaliacao = avaliarRegras(m.regras, { antigo: textoAntigo, novo: texto, adicionado, ineditas });

    if (!avaliacao.passou) {
      await ref.update(atualizacao);
      await podarVersoes(ref);
      return { status: "mudou_sem_alerta" };
    }

    const resumo = ineditas.length
      ? `Novo: ${ineditas[0].slice(0, 150)}${ineditas.length > 1 ? ` (+${ineditas.length - 1})` : ""}`
      : resumir(adicionado, removido);
    const altRef = db.collection(`users/${uid}/alteracoes`).doc();
    await altRef.set({
      monitorId: ref.id,
      monitorNome: m.nome,
      url: m.url,
      criadoEm: agora,
      lida: false,
      resumo,
      adicionado: adicionado.slice(0, MAX_DIFF),
      removido: removido.slice(0, MAX_DIFF),
      versaoAnterior: anterior.id,
      versaoNova: novaRef.id,
      motivos: avaliacao.detalhes,
      ineditas: ineditas.slice(0, 50).map((l) => l.slice(0, 300)),
    });
    await ref.update({ ...atualizacao, "exec.ultimaAlteracao": agora });
    await notificar(uid, ref.id, m, {
      titulo: `🔔 ${m.nome}`,
      corpo: resumo,
      link: `${URL_APP}/alteracoes/${altRef.id}`,
    }, { alteracaoId: altRef.id, adicionado: adicionado.slice(0, 2000), removido: removido.slice(0, 2000) });
    await emailAlteracao(m.acoes?.email, {
      id: altRef.id,
      monitorNome: m.nome,
      url: m.url,
      resumo,
      adicionado,
      removido,
      ineditas: ineditas.slice(0, 50),
    }).catch((e) => console.warn("Falha ao enviar e-mail de alteração", String(e)));
    await podarVersoes(ref);
    return { status: "alterou", alteracaoId: altRef.id };
  }
}
