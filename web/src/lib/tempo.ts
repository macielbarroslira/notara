import type { Timestamp } from "firebase/firestore";

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const dtf = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function relativo(ts?: Timestamp | null): string {
  if (!ts) return "—";
  const seg = Math.round((ts.toMillis() - Date.now()) / 1000);
  const abs = Math.abs(seg);
  if (abs < 45) return seg <= 0 ? "agora" : "em instantes";
  if (abs < 3600) return rtf.format(Math.round(seg / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seg / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seg / 86400), "day");
  return dtf.format(ts.toDate());
}

export const dataHora = (ts?: Timestamp | null) => (ts ? dtf.format(ts.toDate()) : "—");

export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
