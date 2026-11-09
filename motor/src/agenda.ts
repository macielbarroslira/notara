import type { Agenda } from "./types.js";

/** Fuso usado para dias e horários da agenda. */
export const FUSO = "America/Sao_Paulo";
const MIN = 60_000;
const DIA = 24 * 60 * MIN;

/** Diferença (ms) entre o horário local do fuso e UTC naquele instante. */
function deslocamento(ms: number): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const localComoUtc = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
  return localComoUtc - Math.floor(ms / 1000) * 1000;
}

const paraMinutos = (hhmm: string | undefined, padrao: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return padrao;
  return Math.min(24 * 60, Number(m[1]) * 60 + Number(m[2]));
};

/** A agenda limita algo? (sem dias/horários = qualquer hora) */
export function agendaAtiva(a?: Agenda): boolean {
  if (!a) return false;
  const dias = a.dias ?? [];
  const todos = dias.length === 0 || dias.length === 7;
  const inicio = paraMinutos(a.inicio, 0);
  const fim = paraMinutos(a.fim, 24 * 60);
  return !todos || inicio > 0 || fim < 24 * 60;
}

/**
 * Próximo horário de verificação: agora + intervalo (+ sorteio opcional),
 * empurrado para a próxima janela permitida (dias da semana e horário) no fuso de Brasília.
 */
export function proximaExecucao(agoraMs: number, intervaloMs: number, agenda?: Agenda, sorteio = Math.random): number {
  let alvo = agoraMs + intervaloMs;
  if (agenda?.aleatorio) alvo += Math.floor(sorteio() * intervaloMs * 0.2);
  if (!agendaAtiva(agenda)) return alvo;

  const dias = agenda!.dias?.length ? new Set(agenda!.dias) : new Set([0, 1, 2, 3, 4, 5, 6]);
  const inicio = paraMinutos(agenda!.inicio, 0);
  let fim = paraMinutos(agenda!.fim, 24 * 60);
  if (fim <= inicio) fim = 24 * 60; // janela inválida: vai até o fim do dia

  const desloc = deslocamento(alvo);
  const local = alvo + desloc; // "relógio de parede" representado em UTC
  const diaLocal = Math.floor(local / DIA) * DIA;
  const minutoDoDia = Math.floor((local - diaLocal) / MIN);

  for (let i = 0; i < 8; i++) {
    const inicioDia = diaLocal + i * DIA;
    const semana = new Date(inicioDia).getUTCDay();
    if (!dias.has(semana)) continue;
    if (i === 0) {
      if (minutoDoDia >= inicio && minutoDoDia < fim) return alvo; // já está dentro da janela
      if (minutoDoDia < inicio) return inicioDia + inicio * MIN - desloc;
      continue; // passou da janela de hoje
    }
    return inicioDia + inicio * MIN - deslocamento(inicioDia + inicio * MIN - desloc);
  }
  return alvo; // nenhum dia marcado: comporta-se como sem agenda
}
