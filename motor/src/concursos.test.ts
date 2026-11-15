import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enriquecer,
  lerAreas,
  lerCidade,
  lerDinheiro,
  lerEscolaridades,
  lerEsfera,
  lerListagemPci,
  lerPeriodo,
  lerVagas,
  situacaoAgora,
} from "./concursos.js";
import { filtrarConcursos, linhaDoIndice } from "./banco.js";
import { datasDoTexto, diferencasFicha, lerFichaPci } from "./ficha.js";

// Amostra com a mesma estrutura da listagem do PCI (dados fictícios)
const HTML = `
<div class="ua"><div class="uf">NACIONAL</div><div class="uc">Inscrição até:</div></div>
<div class="da" data-url="https://www.pciconcursos.com.br/noticias/orgao-federal-x">
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/orgao-federal-x" title="Órgão Federal X abre concurso">Ministério do Exemplo</a>
  <div class="cb"></div><div class="cc">&nbsp;</div>
  <div class="cd">1.234 vagas até R$ 12.345,67<br><span>Analista de Tecnologia da Informação, Técnico Administrativo<br><span>Médio / Superior</span></span></div>
  <div class="ce"><span>10/11 a 30/11/2026</span></div></div>
</div>
<div class="ua"><div class="uf">SÃO PAULO</div></div>
<div class="da"><div class="ca"><a href="https://www.pciconcursos.com.br/noticias/prefeitura-de-leme-sp" title="Prefeitura de Leme - SP abre concurso">Prefeitura de Leme</a>
  <div class="cc">SP</div>
  <div class="cd">Cadastro de reserva até R$ 3.000,00<br><span>Vários Cargos<br><span>Fundamental / Médio</span></span></div>
  <div class="ce"><span>Prorrogado até 05/12/2026</span></div></div></div>
<div class="da"><div class="ca"><a href="https://www.pciconcursos.com.br/noticias/camara-de-itu" title="Câmara de Itu - SP abre processo seletivo">Câmara de Itu</a>
  <div class="cc">SP</div>
  <div class="cd">2 vagas até R$ 5.000,00<br><span>Procurador Jurídico<br><span>Superior</span></span></div>
  <div class="ce"><span>Suspenso</span></div></div></div>`;

test("concursos: lê a listagem do PCI", () => {
  const [federal, leme, itu] = lerListagemPci(HTML);
  assert.equal(federal.uf, "BR");
  assert.equal(federal.vagas, 1234);
  assert.equal(federal.salarioMax, 12345.67);
  assert.deepEqual(federal.cargos, ["Analista de Tecnologia da Informação", "Técnico Administrativo"]);
  assert.deepEqual(federal.escolaridades, ["medio", "superior"]);
  assert.equal(federal.inscricaoInicio, "2026-11-10");
  assert.equal(federal.inscricaoFim, "2026-11-30");
  assert.equal(leme.uf, "SP");
  assert.equal(leme.cidade, "Leme");
  assert.equal(leme.vagas, null);
  assert.equal(leme.cadastroReserva, true);
  assert.equal(leme.variosCargos, true);
  assert.equal(leme.situacao, "prorrogado");
  assert.equal(itu.situacao, "suspenso");
  assert.equal(itu.cidade, "Itu");
  assert.throws(() => lerListagemPci("<html>sem nada</html>"));
});

test("concursos: normalização de dinheiro, vagas, datas e escolaridade", () => {
  assert.equal(lerDinheiro("até R$ 32.070,88"), 32070.88);
  assert.equal(lerDinheiro("até R$ 5.565"), 5565);
  assert.equal(lerVagas("27.279 vagas até"), 27279);
  assert.equal(lerVagas("1 vaga até"), 1);
  assert.deepEqual(lerPeriodo("10 a 30/11/2026"), { inicio: "2026-11-10", fim: "2026-11-30", situacao: "normal" });
  assert.deepEqual(lerPeriodo("20/12 a 10/01/2027"), { inicio: "2026-12-20", fim: "2027-01-10", situacao: "normal" });
  assert.deepEqual(lerPeriodo("Reaberto até 01/02/2027"), { inicio: null, fim: "2027-02-01", situacao: "reaberto" });
  assert.deepEqual(lerEscolaridades("Fundamental / Médio / Técnico / Superior"), ["fundamental", "medio", "tecnico", "superior"]);
  assert.deepEqual(lerEscolaridades("Ensino Médio"), ["medio"]);
});

test("concursos: esfera, cidade, áreas e situação", () => {
  assert.equal(lerEsfera("Câmara dos Deputados", "BR"), "federal");
  assert.equal(lerEsfera("Câmara de Boituva", "SP"), "municipal");
  assert.equal(lerEsfera("Tribunal de Justiça de Minas Gerais", "MG"), "estadual");
  assert.equal(lerCidade("Câmara da Estância Turística de Ibiúna", "", "municipal"), "Ibiúna");
  assert.equal(lerCidade("Câmara dos Deputados", "", "federal"), null);
  assert.deepEqual(lerAreas(["Médico", "Professor I"], "Prefeitura de X"), ["saude", "educacao"]);
  assert.ok(lerAreas(["Analista de TI"], "").includes("ti"));
  const base = { inscricaoInicio: "2026-11-10", inscricaoFim: "2026-11-30", situacao: "normal" as const };
  assert.equal(situacaoAgora(base, "2026-11-01"), "em_breve");
  assert.equal(situacaoAgora(base, "2026-11-15"), "aberto");
  assert.equal(situacaoAgora(base, "2026-12-01"), "encerrado");
  assert.equal(situacaoAgora({ ...base, situacao: "suspenso" }, "2026-11-15"), "suspenso");
});

test("concursos: busca no índice com filtros", () => {
  const linhas = lerListagemPci(HTML).map((i) => linhaDoIndice(enriquecer(i), Date.now()));
  const hoje = "2026-11-15";
  assert.equal(filtrarConcursos(linhas, { texto: "tecnologia" }, hoje).length, 1);
  assert.equal(filtrarConcursos(linhas, { uf: "SP", apenasAbertos: false }, hoje).length, 2);
  assert.equal(filtrarConcursos(linhas, { uf: "são paulo", apenasAbertos: false }, hoje).length, 2);
  assert.equal(filtrarConcursos(linhas, { escolaridade: "fundamental" }, hoje).length, 1); // Leme (prorrogado, aberto)
  assert.equal(filtrarConcursos(linhas, { salarioMin: 10000 }, hoje).length, 1);
  assert.equal(filtrarConcursos(linhas, { area: "ti" }, hoje)[0].o, "Ministério do Exemplo");
  // suspenso não aparece entre os abertos
  assert.equal(filtrarConcursos(linhas, { texto: "itu" }, hoje).length, 0);
  assert.equal(filtrarConcursos(linhas, { texto: "itu", apenasAbertos: false }, hoje).length, 1);
});

test("ficha: extrai cronograma, taxa, salário, banca, regime, validade e cargos", () => {
  const html = `<article id="noticia"><h1>Prefeitura de Exemplo - MG retifica concurso público</h1>
    <p>Quarta-feira, 4 de novembro de 2026</p>
    <p>A Prefeitura de Exemplo abriu concurso. Segundo o edital, as oportunidades são para os cargos de:</p>
    <ul><li>Enfermeiro (24 vagas)</li><li>Analista - Área: TI (4 vagas imediatas + 9 CR)</li><li>Professor (CR)</li></ul>
    <p>A jornada é de 30 horas semanais para Enfermeiro e de 40 horas semanais para os demais. As remunerações variam de R$ 2.500,00 a R$ 7.950,00. Os benefícios previstos são auxílio-alimentação de R$ 600,00 e vale-transporte.</p>
    <p>As inscrições serão realizadas pelo site www.vunesp.com.br, das 10h do dia 10 de novembro de 2026 até às 23h59 de 10 de dezembro de 2026. A taxa é de R$ 80,00 para nível médio e de R$ 120,00 para nível superior, com pagamento até 11 de dezembro de 2026. Candidatos do CadÚnico poderão solicitar isenção nos dias 10 e 11 de novembro de 2026.</p>
    <p>A prova objetiva está prevista para o dia 17 de janeiro de 2027. O teste de aptidão física está previsto para 21 de fevereiro de 2027. O regime será estatutário. O concurso terá validade de dois anos, podendo ser prorrogado por igual período.</p>
    <p>Dê o play e acompanhe esta notícia no formato podcast.</p></article>`;
  const f = lerFichaPci(html);
  assert.equal(f.noticia, "retificacao");
  assert.equal(f.publicadoEm, "2026-11-04");
  assert.equal(f.banca, "Vunesp");
  assert.equal(f.siteInscricao, "www.vunesp.com.br");
  assert.deepEqual(f.cronograma, [
    { tipo: "inscricao", data: "2026-11-10", fim: "2026-12-10", hora: "23h59" },
    { tipo: "isencao", data: "2026-11-10", fim: "2026-11-11" },
    { tipo: "pagamento", data: "2026-12-11" },
    { tipo: "prova_objetiva", data: "2027-01-17" },
    { tipo: "taf", data: "2027-02-21" },
  ]);
  assert.deepEqual(f.taxa, { min: 80, max: 120 });
  assert.deepEqual(f.salario, { min: 2500, max: 7950 });
  assert.deepEqual(f.jornada, { min: 30, max: 40 });
  assert.equal(f.regime, "estatutario");
  assert.deepEqual(f.validade, { meses: 24, prorrogavel: true });
  assert.ok(f.etapas.includes("Prova objetiva") && f.etapas.includes("Teste físico (TAF)"));
  assert.deepEqual(f.beneficios, ["auxílio-alimentação", "vale-transporte"]);
  assert.deepEqual(f.cargos, [
    { nome: "Enfermeiro", vagas: 24, cr: false },
    { nome: "Analista - Área: TI", vagas: 4, cr: true },
    { nome: "Professor", vagas: null, cr: true },
  ]);
});

test("ficha: datas em português e diferenças entre versões", () => {
  assert.deepEqual(datasDoTexto("de 20 de dezembro a 10 de janeiro de 2027"), ["2026-12-20", "2027-01-10"]);
  assert.deepEqual(datasDoTexto("nos dias 26 e 27 de outubro de 2026"), ["2026-10-26", "2026-10-27"]);
  assert.deepEqual(datasDoTexto("até 1º de março de 2027"), ["2027-03-01"]);
  const base = lerFichaPci(`<article id="noticia"><ul><li>Cargo A (2 vagas)</li></ul><p>As inscrições vão de 1 de novembro de 2026 a 30 de novembro de 2026. A prova objetiva está prevista para 10 de janeiro de 2027.</p></article>`);
  const nova = lerFichaPci(`<article id="noticia"><ul><li>Cargo A (5 vagas)</li></ul><p>As inscrições foram prorrogadas até o dia 15 de dezembro de 2026. A prova objetiva está prevista para 24 de janeiro de 2027.</p></article>`);
  assert.deepEqual(diferencasFicha(base, nova), ["Inscrições: 30/11/2026 → 15/12/2026", "Prova objetiva: 10/01/2027 → 24/01/2027", "Vagas: 2 → 5"]);
});
