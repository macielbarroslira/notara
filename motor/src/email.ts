import nodemailer from "nodemailer";
import { URL_APP } from "./db.js";

/**
 * E-mails (opcional). Configure o Secret SMTP_URL no GitHub, ex. Gmail com senha de app:
 *   smtps://seu.email%40gmail.com:SENHA_DE_APP@smtp.gmail.com:465
 */
const SMTP_URL = process.env.SMTP_URL?.trim();
const REMETENTE = process.env.EMAIL_REMETENTE?.trim() || "Notara <no-reply@notara.web.app>";
const transporte = SMTP_URL ? nodemailer.createTransport(SMTP_URL) : null;

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const bloco = (titulo: string, txt: string | undefined, cor: string) =>
  txt
    ? `<h3 style="margin:16px 0 4px">${titulo}</h3><pre style="white-space:pre-wrap;background:${cor};padding:12px;border-radius:8px;font-family:inherit">${escapar(txt.slice(0, 4000))}</pre>`
    : "";

const botao = (link: string, texto: string) =>
  `<p><a href="${link}" style="background:#7c2d12;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${texto}</a></p>`;

async function enviar(para: string | undefined, assunto: string, texto: string, html: string) {
  const destino = para?.trim();
  if (!transporte || !destino) return;
  await transporte.sendMail({ from: REMETENTE, to: destino, subject: assunto, text: texto, html });
}

export function emailAlteracao(
  para: string | undefined,
  alt: { id: string; monitorNome: string; url: string; resumo: string; adicionado: string; removido: string; ineditas: string[] },
) {
  const link = `${URL_APP}/alteracoes/${alt.id}`;
  return enviar(
    para,
    `🔔 ${alt.monitorNome} mudou`,
    `${alt.monitorNome}\n${alt.resumo}\n\n${link}`,
    `<div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 4px">${escapar(alt.monitorNome)}</h2>
      <p style="margin:0;color:#57534e"><a href="${escapar(alt.url)}">${escapar(alt.url)}</a></p>
      <p style="font-size:16px">${escapar(alt.resumo)}</p>
      ${alt.ineditas.length ? bloco("Novidades", alt.ineditas.join("\n"), "#fffbeb") : ""}
      ${bloco("Adicionado", alt.adicionado, "#ecfdf5")}
      ${bloco("Removido", alt.removido, "#fef2f2")}
      ${botao(link, "Ver alteração")}
    </div>`,
  );
}

export function emailAviso(
  para: string | undefined,
  av: { monitorId: string; monitorNome: string; url: string; tipo: "erro" | "recuperou"; mensagem: string },
) {
  const link = `${URL_APP}/monitores/${av.monitorId}`;
  const erro = av.tipo === "erro";
  return enviar(
    para,
    erro ? `⚠️ ${av.monitorNome} está com erro` : `✅ ${av.monitorNome} voltou a funcionar`,
    `${av.monitorNome}\n${av.mensagem}\n\n${link}`,
    `<div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 4px">${escapar(av.monitorNome)}</h2>
      <p style="margin:0;color:#57534e"><a href="${escapar(av.url)}">${escapar(av.url)}</a></p>
      <p style="font-size:16px">${erro ? "Não foi possível verificar este site: " : ""}${escapar(av.mensagem)}</p>
      ${botao(link, "Abrir monitor")}
    </div>`,
  );
}
