// Roda o Web App de verdade (apps-script/Codigo.js) com uma planilha de mentira: confere o que vira
// linha na aba "cliques", o que é descartado, o freio de envio em massa e a limpeza dos 12 meses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { lerConfig, lerConteudo, montarPagina } from '../ferramentas/gerar.mjs';

const codigo = readFileSync(new URL('../apps-script/Codigo.js', import.meta.url), 'utf8');
const config = lerConfig();
const REGISTRO = 'https://script.google.com/macros/s/TESTE/exec';

function aba(nome) {
  return {
    nome, linhas: [], congeladas: 0,
    appendRow(l) { this.linhas.push(l); },
    setFrozenRows(n) { this.congeladas = n; },
    setName(n) { this.nome = n; return this; },
    getLastRow() { return this.linhas.length; },
    getRange(linha, coluna, quantas) {
      const a = this;
      return {
        setFormula(f) { a.formulas = { ...a.formulas, [linha]: f }; },
        // Planilha que só aceita ";" entre os argumentos mostra #ERROR! com a vírgula.
        getDisplayValue: () => (a.soPontoEVirgula && /^=QUERY\(cliques!A:G,/.test(a.formulas[linha]) ? '#ERROR!' : 'Código'),
        getValues: () => a.linhas.slice(linha - 1, linha - 1 + quantas).map((l) => [l[coluna - 1]]),
      };
    },
    deleteRows(inicio, quantas) { this.linhas.splice(inicio - 1, quantas); },
  };
}

// Os arrays criados dentro do vm são de outro realm: o teste os espalha num array daqui antes de comparar.
// Carrega o script num contexto com os serviços do Apps Script simulados.
function carregar({ abas = [aba('cliques')] } = {}) {
  const guardado = {};
  const fixo = Date.now();
  class DataFixa extends Date { static now() { return fixo; } } // o freio conta por minuto: o teste não pode virar o minuto
  const gatilhos = [];
  const planilha = {
    abas, fuso: 'America/Los_Angeles',
    getSpreadsheetTimeZone() { return this.fuso; },
    setSpreadsheetTimeZone(f) { this.fuso = f; },
    getSheetByName: (n) => abas.find((a) => a.nome === n) || null,
    insertSheet: (n) => { const a = aba(n); abas.push(a); return a; },
    getSheets: () => abas,
  };
  const ctx = {
    JSON, Date: DataFixa, Math, Number, String,
    ContentService: { createTextOutput: (t) => ({ texto: t }) },
    CacheService: { getScriptCache: () => ({ get: (k) => guardado[k] ?? null, put: (k, v) => { guardado[k] = v; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha, flush() {} },
    ScriptApp: {
      getProjectTriggers: () => gatilhos,
      deleteTrigger: (t) => gatilhos.splice(gatilhos.indexOf(t), 1),
      newTrigger: (funcao) => ({ timeBased: () => ({ onMonthDay: (dia) => ({ atHour: (hora) => ({
        create: () => gatilhos.push({ funcao, dia, hora, getHandlerFunction: () => funcao }) }) }) }) }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return { ctx, planilha, gatilhos, cliques: () => planilha.getSheetByName('cliques').linhas };
}

const enviar = (app, corpo) => app.ctx.doPost({ postData: { contents: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) } });
const CLIQUE_DO_SITE = { tipo: 'clique', rede: 'site', codigo: 'KW07', primeiro: 'IG00', area: 'Direito', posicao: 'area', pagina: '/?c=KW07&area=direito', quando: '2026-10-27T12:00:00.000Z' };

test('o clique de um botão do site vira uma linha no fim da aba, com a hora do servidor', () => {
  const app = carregar();
  const resposta = enviar(app, CLIQUE_DO_SITE);
  assert.equal(resposta.texto, 'ok');
  assert.equal(app.cliques().length, 1);
  const [quando, ...resto] = app.cliques()[0];
  assert.ok(Math.abs(quando.getTime() - Date.now()) < 5000, 'usa a hora do servidor, não a do celular');
  assert.deepEqual(resto, ['site', 'KW07', 'IG00', 'Direito', 'area', '/?c=KW07&area=direito']);
  assert.equal(app.planilha.fuso, 'America/Sao_Paulo', 'a planilha nova vem no fuso do Pacífico');
});

test('o clique que a página de link curto manda de verdade é aceito', async () => {
  const html = montarPagina({ ...config, registroCliques: REGISTRO }, { caminho: 'kwai', codigo: 'KW00' });
  const beacons = [];
  const janela = {
    URLSearchParams, JSON, Date, Blob,
    location: { search: '?c=KW07', pathname: '/kwai/', replace() {} },
    navigator: { sendBeacon: (url, blob) => { beacons.push(blob); return true; } },
    localStorage: { setItem() {} },
  };
  janela.window = janela;
  vm.createContext(janela);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], janela);
  const app = carregar();
  enviar(app, await beacons[0].text());
  assert.deepEqual([...app.cliques()[0].slice(1)], ['kwai', 'KW07', '', '', '', '/kwai/?c=KW07']);
});

test('envio que não é um clique válido é descartado e a resposta continua ok', () => {
  const app = carregar();
  const ruins = [
    '', 'não é json', 'null', JSON.stringify({ ...CLIQUE_DO_SITE, tipo: 'lead' }),
    JSON.stringify({ ...CLIQUE_DO_SITE, rede: 'orkut' }),
    JSON.stringify({ ...CLIQUE_DO_SITE, codigo: '<script>' }),
    JSON.stringify({ ...CLIQUE_DO_SITE, codigo: 'KW007' }),
    JSON.stringify({ ...CLIQUE_DO_SITE, pagina: '/' + 'x'.repeat(2000) }),
  ];
  for (const corpo of ruins) assert.equal(enviar(app, corpo).texto, 'ok');
  assert.equal(app.ctx.doPost(undefined).texto, 'ok');
  assert.equal(app.cliques().length, 0);
});

test('campo estranho fica vazio e nada vira fórmula na planilha', () => {
  const app = carregar();
  enviar(app, { ...CLIQUE_DO_SITE, primeiro: '=1+1', area: '=HYPERLINK("x")', posicao: 'Topo!', pagina: '=IMPORTXML("x")' });
  enviar(app, { ...CLIQUE_DO_SITE, pagina: 'https://outro.site/' });
  assert.deepEqual(app.cliques().map((l) => [...l.slice(1)]), [
    ['site', 'KW07', '', '', '', ''],
    ['site', 'KW07', 'IG00', 'Direito', 'area', ''],
  ]);
});

test('passou de 300 envios no mesmo minuto, o resto do minuto é descartado', () => {
  const app = carregar();
  for (let i = 0; i < 305; i++) enviar(app, CLIQUE_DO_SITE);
  assert.equal(app.cliques().length, 300);
});

test('sem a aba, o primeiro clique cria "cliques" com o cabeçalho congelado', () => {
  const app = carregar({ abas: [] });
  enviar(app, CLIQUE_DO_SITE);
  const cliques = app.planilha.getSheetByName('cliques');
  assert.deepEqual([...cliques.linhas[0]], ['Data e hora', 'Rede', 'Código', '1º código', 'Área', 'Posição', 'Página']);
  assert.equal(cliques.congeladas, 1);
  assert.equal(cliques.linhas.length, 2);
});

test('prepararPlanilha usa a aba vazia da planilha nova, monta o resumo e um gatilho mensal só', () => {
  const app = carregar({ abas: [aba('Página1')] });
  app.ctx.prepararPlanilha();
  app.ctx.prepararPlanilha();
  assert.deepEqual(app.planilha.abas.map((a) => a.nome), ['cliques', 'resumo']);
  assert.equal(app.planilha.getSheetByName('cliques').linhas.length, 1);
  assert.match(app.planilha.getSheetByName('resumo').formulas.A1, /^=QUERY\(cliques!A:G,"select C, count\(A\) where C is not null group by C order by count\(A\) desc label C 'Código', count\(A\) 'Cliques'",1\)$/);
  assert.equal(app.gatilhos.length, 1);
  assert.deepEqual([app.gatilhos[0].funcao, app.gatilhos[0].dia], ['limparAntigos', 1]);
});

test('se a planilha recusar a vírgula na fórmula do resumo, ela é reescrita com ponto e vírgula', () => {
  const resumo = aba('resumo');
  resumo.soPontoEVirgula = true;
  const app = carregar({ abas: [aba('cliques'), resumo] });
  app.ctx.prepararPlanilha();
  assert.match(resumo.formulas.A1, /^=QUERY\(cliques!A:G;"select C, count\(A\) .*'Cliques'";1\)$/);
  assert.match(resumo.formulas.D1, /^=QUERY\(cliques!A:G;"select B,/);
});

test('a limpeza mensal apaga só os cliques com mais de 12 meses', () => {
  const app = carregar();
  const cliques = app.planilha.getSheetByName('cliques');
  const meses = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };
  cliques.linhas.push(['Data e hora'], [meses(14), 'a'], [meses(13), 'b'], [meses(11), 'c'], [new Date(), 'd']);
  app.ctx.limparAntigos();
  assert.deepEqual(cliques.linhas.map((l) => l[1]), [undefined, 'c', 'd']);
  app.ctx.limparAntigos();
  assert.equal(cliques.linhas.length, 3);
});

test('a planilha aceita exatamente os códigos que o site aceita', () => {
  const contexto = { URLSearchParams };
  vm.createContext(contexto);
  vm.runInContext(readFileSync(new URL('../fonte/link-curto.js', import.meta.url), 'utf8') + '\nthis.LINK_CURTO = LINK_CURTO;', contexto);
  const app = carregar();
  const amostra = ['IG00', 'KW07', 'YT99', 'FBPOS', 'IGCARREIRA', 'AM01', 'AG12', 'TTPOS', 'AX01', 'AM001', 'KW7', 'SITEX', '<script>'];
  for (const c of amostra) assert.equal(app.ctx.CODIGO.test(c), contexto.LINK_CURTO.codigoValido(c) === c, c);
  assert.ok(app.ctx.CODIGO.test('SITE'));
  // Códigos da campanha paga de 28/10 a 02/11 (Gregory, 27/10).
  for (const c of ['AM01', 'AM02', 'AM03', 'AM04', 'AG01', 'AG02', 'AG03', 'AG04', 'AG05', 'AG07', 'AG09']) {
    assert.ok(app.ctx.CODIGO.test(c) && contexto.LINK_CURTO.codigoValido(c) === c, c);
  }
});

test('as redes e as áreas aceitas são as mesmas do site', () => {
  const app = carregar();
  assert.deepEqual([...app.ctx.REDES], ['site', ...config.links.map((l) => l.caminho)]);
  assert.deepEqual([...app.ctx.AREAS], lerConteudo().areas.areas.map((a) => a.nome));
});
