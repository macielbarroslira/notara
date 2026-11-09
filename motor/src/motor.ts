import { Timestamp } from "firebase-admin/firestore";
import { executarMonitor } from "./check.js";
import { db, LIMITE_MONITORES } from "./db.js";
import { fecharNavegador } from "./navegador.js";
import { limparPedidosAntigos, pedidosPendentes, processarPedido } from "./pedidos.js";
import type { Monitor } from "./types.js";

/**
 * Motor do Notara — roda no GitHub Actions a cada ~10 min (ou no seu computador).
 * Cada rodada:
 *  1. apaga monitores marcados como excluídos;
 *  2. verifica os monitores com horário vencido;
 *  3. fica alguns minutos atendendo pedidos do app (Testar, Escolher na página, Verificar agora);
 *  4. limpa pedidos antigos.
 */
const DURACAO_MS = Number(process.env.NOTARA_DURACAO_MS ?? 5 * 60_000);
const ESPERA_ENTRE_BUSCAS_MS = Number(process.env.NOTARA_INTERVALO_FILA_MS ?? 5_000);
const CONCORRENCIA = 6;
const CONCORRENCIA_NAVEGADOR = 2;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hora = () => new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });

async function emParalelo(tarefas: Array<() => Promise<unknown>>, limite: number) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, tarefas.length) }, async () => {
      while (i < tarefas.length) await tarefas[i++]().catch((e) => console.error("Falha na tarefa", e));
    }),
  );
}

async function limparExcluidos() {
  const snap = await db.collectionGroup("monitores").where("excluido", "==", true).limit(50).get();
  for (const d of snap.docs) {
    const uid = d.ref.parent.parent!.id;
    const alteracoes = await db.collection(`users/${uid}/alteracoes`).where("monitorId", "==", d.id).get();
    const escritor = db.bulkWriter();
    alteracoes.docs.forEach((a) => escritor.delete(a.ref));
    await escritor.close();
    await db.recursiveDelete(d.ref); // monitor + versões + screenshots + memória
  }
  return snap.size;
}

/** Monitores ativos com a próxima verificação vencida. */
async function verificarVencidos() {
  const vencidos = await db
    .collectionGroup("monitores")
    .where("ativo", "==", true)
    .where("exec.proxima", "<=", Timestamp.now())
    .orderBy("exec.proxima")
    .limit(300)
    .get();

  // Respeita o limite de monitores por usuário
  const porUsuario = new Map<string, number>();
  const tarefa = (doc: (typeof vencidos.docs)[number]) => async () => {
    const uid = doc.ref.parent.parent!.id;
    const n = (porUsuario.get(uid) ?? 0) + 1;
    porUsuario.set(uid, n);
    if (n > LIMITE_MONITORES || doc.get("excluido") === true) return;
    const reservado = await db.runTransaction(async (t) => {
      const s = await t.get(doc.ref);
      const proxima = s.get("exec.proxima") as Timestamp | undefined;
      if (!s.exists || s.get("ativo") !== true || !proxima || proxima.toMillis() > Date.now()) return null;
      t.update(doc.ref, { "exec.proxima": Timestamp.fromMillis(Date.now() + 15 * 60_000), "exec.status": "verificando" });
      return s.data() as Monitor;
    });
    if (reservado) {
      const r = await executarMonitor(doc.ref, reservado);
      console.log(`[${hora()}] ${reservado.nome}: ${r.status}${r.mensagem ? ` (${r.mensagem})` : ""}`);
    }
  };
  const comNavegador = vencidos.docs.filter((d) => d.get("usarNavegador") === true);
  const leves = vencidos.docs.filter((d) => d.get("usarNavegador") !== true);
  await Promise.all([emParalelo(leves.map(tarefa), CONCORRENCIA), emParalelo(comNavegador.map(tarefa), CONCORRENCIA_NAVEGADOR)]);
  return vencidos.size;
}

async function atenderPedidos() {
  const pendentes = await pedidosPendentes();
  await emParalelo(pendentes.map((p) => () => processarPedido(p)), CONCORRENCIA_NAVEGADOR);
  return pendentes.length;
}

async function main() {
  const fim = Date.now() + DURACAO_MS;
  console.log(`[${hora()}] Motor do Notara iniciado (atende pedidos por ${Math.round(DURACAO_MS / 60_000)} min)`);
  console.log(`Excluídos: ${await limparExcluidos()}`);
  console.log(`Pedidos atendidos: ${await atenderPedidos()}`);
  console.log(`Monitores verificados: ${await verificarVencidos()}`);
  // Até o fim da janela: atende pedidos do app e verifica quem vencer nesse meio-tempo
  let voltas = 0;
  while (Date.now() < fim) {
    await dormir(ESPERA_ENTRE_BUSCAS_MS);
    const n = await atenderPedidos();
    if (n) console.log(`[${hora()}] Pedidos atendidos: ${n}`);
    if (++voltas % 12 === 0) await verificarVencidos(); // ~1 min
  }
  console.log(`Pedidos antigos apagados: ${await limparPedidosAntigos()}`);
  await fecharNavegador();
  console.log(`[${hora()}] Rodada concluída`);
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("Erro no motor", e);
    await fecharNavegador();
    process.exit(1);
  });
