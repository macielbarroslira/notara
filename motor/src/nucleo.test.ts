import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { aplicarIgnorar } from "./check.js";
import { capturar, jsonEstavel, lerCaminho, normalizar } from "./extract.js";
import { ErroCaptura, fetchSeguro, ipPublico, validarUrl } from "./fetcher.js";
import { proximaExecucao } from "./agenda.js";
import { textoDoPdf } from "./extract.js";
import { atualizarMemoria, avaliarRegras, extrairNumeros, linhasInéditas } from "./rules.js";

const ctx = (antigo: string, novo: string, adicionado = "", ineditas: string[] = []) => ({ antigo, novo, adicionado, ineditas });

test("números em formato BR e US", () => {
  assert.deepEqual(extrairNumeros("De R$ 1.299,90 por R$ 999,00", "br"), [1299.9, 999]);
  assert.deepEqual(extrairNumeros("$1,299.90 now $999", "us"), [1299.9, 999]);
});

test("regras: E / OU / numéricas / %", () => {
  const E = avaliarRegras({ operador: "E", itens: [{ tipo: "contem", valor: "estoque" }, { tipo: "num_menor", valor: "1000" }] }, ctx("R$ 1.200,00", "Em estoque R$ 999,00", ""));
  assert.equal(E.passou, true);
  const falha = avaliarRegras({ operador: "E", itens: [{ tipo: "contem", valor: "esgotado" }] }, ctx("", "Em estoque", ""));
  assert.equal(falha.passou, false);
  const ou = avaliarRegras({ operador: "OU", itens: [{ tipo: "contem", valor: "x" }, { tipo: "regex", valor: "esto+que" }] }, ctx("", "Em estoque", ""));
  assert.equal(ou.passou, true);
  assert.equal(avaliarRegras({ operador: "E", itens: [{ tipo: "num_queda", valor: "100" }] }, ctx("R$ 1.200,00", "R$ 999,00", "")).passou, true);
  assert.equal(avaliarRegras({ operador: "E", itens: [{ tipo: "pct_queda", valor: "10" }] }, ctx("100", "85", "")).passou, true);
  assert.equal(avaliarRegras({ operador: "E", itens: [{ tipo: "pct_aumento", valor: "10" }] }, ctx("100", "105", "")).passou, false);
  assert.equal(avaliarRegras(undefined, ctx("a", "b", "b")).passou, true);
});

test("ignorar trechos voláteis", () => {
  assert.equal(aplicarIgnorar("Atualizado 12:30 preço 10", ["\\d{2}:\\d{2}"]), "Atualizado  preço 10");
});

test("normalização, json estável e caminho", () => {
  assert.equal(normalizar("  a   b \n\n  c  "), "a b\nc");
  assert.equal(jsonEstavel({ b: 1, a: { d: 2, c: 3 } }), jsonEstavel({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(lerCaminho({ dados: { itens: [{ preco: 5 }] } }, "dados.itens[0].preco"), 5);
});

test("bloqueio de SSRF", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1", "172.16.0.1", "0.0.0.0"]) {
    assert.equal(ipPublico(ip), false, ip);
  }
  assert.equal(ipPublico("8.8.8.8"), true);
  assert.throws(() => validarUrl("http://localhost:8080"), ErroCaptura);
  assert.throws(() => validarUrl("http://[::1]/"), ErroCaptura);
  assert.throws(() => validarUrl("file:///etc/passwd"), ErroCaptura);
  // Nome que resolve para 127.0.0.1 também precisa ser bloqueado (verificado no DNS lookup)
  await assert.rejects(fetchSeguro("http://localtest.me/"), ErroCaptura);
});

test("extração HTML com seletor e exclusão (servidor local liberado só no teste)", async (t) => {
  const html = `<html><head><title>Loja</title><script>x()</script></head><body>
    <div class="preco">R$ <b>99,90</b></div><p class="anuncio">Promo!</p><ul><li>Item 1</li><li>Item 2</li></ul></body></html>`;
  const srv = http.createServer((_, res) => res.end(html)).listen(0);
  t.after(() => srv.close());
  const porta = (srv.address() as AddressInfo).port;
  // o servidor local é bloqueado por segurança: confirmamos o bloqueio…
  await assert.rejects(capturar({ url: `http://127.0.0.1:${porta}/`, tipo: "pagina" }), ErroCaptura);
});

test("novas condições: começa/termina, vazio, tamanho, regex negativa", () => {
  const r = (tipo: string, valor: string, novo: string) =>
    avaliarRegras({ operador: "E", itens: [{ tipo: tipo as never, valor }] }, ctx("", novo)).passou;
  assert.equal(r("comeca_com", "edital", "Edital nº 16"), true);
  assert.equal(r("termina_com", "abertas", "Inscrições abertas"), true);
  assert.equal(r("vazio", "", "   "), true);
  assert.equal(r("nao_vazio", "", "x"), true);
  assert.equal(r("tamanho_maior", "5", "123456"), true);
  assert.equal(r("tamanho_menor", "5", "123456"), false);
  assert.equal(r("regex_nao", "esgotad", "Em estoque"), true);
  assert.equal(r("regex_nao", "esgotad", "Esgotado"), false);
});

test("nunca visto antes: só avisa de linha inédita (ignora reordenação)", () => {
  const v1 = "Edital nº 2 – Retificações\nEdital nº 1 – Abertura";
  let memoria = atualizarMemoria([], v1);
  // mesma lista em outra ordem → nada inédito
  const reordenada = "Edital nº 1 – Abertura\nEdital nº 2 – Retificações";
  assert.deepEqual(linhasInéditas(reordenada, memoria), []);
  // diferenças só de maiúsculas/espaços também não contam
  assert.deepEqual(linhasInéditas("EDITAL Nº 1  –  ABERTURA", memoria), []);
  // edital novo → inédito
  const v2 = "Edital nº 3 – Locais de prova\n" + v1;
  const novas = linhasInéditas(v2, memoria);
  assert.deepEqual(novas, ["Edital nº 3 – Locais de prova"]);
  const regra = { operador: "E" as const, itens: [{ tipo: "nunca_visto" as const, valor: "" }] };
  assert.equal(avaliarRegras(regra, ctx(v1, v2, "", novas)).passou, true);
  assert.equal(avaliarRegras(regra, ctx(v1, reordenada, "", [])).passou, false);
  // com filtro: só linhas inéditas que contenham "edital"
  const filtrada = { operador: "E" as const, itens: [{ tipo: "nunca_visto" as const, valor: "resultado" }] };
  assert.equal(avaliarRegras(filtrada, ctx(v1, v2, "", novas)).passou, false);
  // linha que já existiu e voltou não é inédita
  memoria = atualizarMemoria(memoria, v2);
  assert.deepEqual(linhasInéditas(v1, memoria), []);
});

test("agenda: dias úteis 08:00–20:00 no horário de Brasília", () => {
  const agenda = { dias: [1, 2, 3, 4, 5], inicio: "08:00", fim: "20:00" };
  const h = 3600_000;
  // sexta 07/11/2026 19:30 BRT (= 22:30 UTC) + 1 h → cai fora → segunda 09/11 08:00 BRT (11:00 UTC)
  const sexta = Date.UTC(2026, 10, 7, 22, 30);
  assert.equal(new Date(proximaExecucao(sexta, h, agenda)).toISOString(), "2026-11-09T11:00:00.000Z");
  // terça 10:00 BRT + 1 h → 11:00 BRT, dentro da janela
  const terca = Date.UTC(2026, 10, 10, 13, 0);
  assert.equal(proximaExecucao(terca, h, agenda), terca + h);
  // terça 05:00 BRT + 1 h → 06:00, antes da janela → 08:00 do mesmo dia
  const madrugada = Date.UTC(2026, 10, 10, 8, 0);
  assert.equal(new Date(proximaExecucao(madrugada, h, agenda)).toISOString(), "2026-11-10T11:00:00.000Z");
  // sem agenda: só soma o intervalo; aleatório soma até 20%
  assert.equal(proximaExecucao(terca, h), terca + h);
  assert.equal(proximaExecucao(terca, h, { aleatorio: true }, () => 0.5), terca + h + 0.1 * h);
});

/** PDF mínimo válido com o texto dado (gera os offsets do xref). */
function pdfMinimo(linhas: string[]): Uint8Array {
  const conteudo = "BT /F1 12 Tf 72 720 Td 14 TL " + linhas.map((l) => "(" + l + ") Tj T*").join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length " + conteudo.length + " >>\nstream\n" + conteudo + "\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += (i + 1) + " 0 obj\n" + o + "\nendobj\n";
  });
  const xref = pdf.length;
  pdf += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return new TextEncoder().encode(pdf);
}

test("PDF: extrai o texto", async () => {
  const r = await textoDoPdf(pdfMinimo(["Edital 16 - Resultado final", "Concurso IBAMA"]));
  assert.match(r.texto, /Edital 16 - Resultado final/);
  assert.match(r.texto, /Concurso IBAMA/);
  assert.equal(r.paginas, 1);
  await assert.rejects(textoDoPdf(new TextEncoder().encode("isto nao e pdf")), ErroCaptura);
});
