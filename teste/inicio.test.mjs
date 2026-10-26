// Roda o script de verdade da página inicial num navegador de mentira: confere a mensagem de cada
// botão de WhatsApp, a origem guardada, o registro do clique e o selo que vence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { lerConfig, lerConteudo, montarInicio, montarTexto, montarSitemap, TEXTOS } from '../ferramentas/gerar.mjs';

const raiz = new URL('..', import.meta.url);
const config = lerConfig();
const conteudo = lerConteudo();
const REGISTRO = 'https://script.google.com/macros/s/TESTE/exec';
const DIA = 24 * 60 * 60 * 1000;
const ANTES_DO_FIM = Date.parse('2026-10-26T12:00:00-03:00');
const DEPOIS_DO_FIM = Date.parse('2026-11-03T00:00:00-03:00');

const atributos = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].slice(1).map((m) => [m[1], m[2] ?? '']));

// Monta os elementos que o script usa a partir do HTML gerado.
function abrir(html, { search = '', agora = ANTES_DO_FIM, guardado = {}, storage = 'ok', gtag } = {}) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elemento = (tag) => {
    const el = {
      attrs: atributos(tag), ouvintes: {}, removido: false,
      getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
      setAttribute(n, v) { this.attrs[n] = String(v); },
      addEventListener(tipo, f) { this.ouvintes[tipo] = f; },
      classList: { add() {}, toggle() {} },
      faltam: { textContent: '' },
      querySelector(sel) { return sel === '[data-faltam]' ? this.faltam : null; },
    };
    el.parentNode = { removeChild(x) { x.removido = true; } };
    return el;
  };
  const botoes = [...html.matchAll(/<a [^>]*data-whats[^>]*>/g)].map((m) => elemento(m[0]));
  const selos = [...html.matchAll(/<div [^>]*data-fim[^>]*>/g)].map((m) => elemento(m[0]));
  const dados = { ...guardado };
  const classesHorario = [];
  const horario = /data-horario/.test(html)
    ? { textContent: html.match(/<span data-horario>([^<]*)<\/span>/)[1], parentNode: { classList: { add: (c) => classesHorario.push(c) } } }
    : null;
  const r = { botoes, selos, beacons: [], eventos: [], dados, horario, classesHorario };
  class DataFixa extends Date { static now() { return agora; } }
  const janela = {
    URLSearchParams, JSON, Blob, String, Date: DataFixa,
    location: { search, pathname: '/' },
    navigator: { sendBeacon: (url, blob) => { r.beacons.push({ url, blob }); return true; } },
    localStorage: {
      getItem(k) { if (storage === 'erro') throw new Error('modo privado'); return k in dados ? dados[k] : null; },
      setItem(k, v) { if (storage === 'erro') throw new Error('modo privado'); dados[k] = v; },
    },
    document: {
      querySelectorAll: (sel) => (sel === '[data-whats]' ? botoes : sel === '[data-fim]' ? selos : []),
      querySelector: (sel) => (sel === '[data-horario]' ? horario : null),
      getElementById: () => null,
    },
  };
  if (gtag) janela.gtag = (...args) => r.eventos.push(args);
  janela.window = janela;
  vm.createContext(janela);
  vm.runInContext(script, janela);
  return r;
}

const texto = (href) => decodeURIComponent(href.split('?text=')[1]);
const html = montarInicio(config, conteudo, new Date(ANTES_DO_FIM));
const areaDe = (b) => b.getAttribute('data-area');

test('as páginas no disco são as que o gerador monta', () => {
  assert.equal(readFileSync(new URL('index.html', raiz), 'utf8'), montarInicio(config, conteudo), 'rode node ferramentas/gerar.mjs');
  for (const t of TEXTOS) assert.equal(readFileSync(new URL(`${t.caminho}index.html`, raiz), 'utf8'), montarTexto(config, t), t.caminho);
  assert.equal(readFileSync(new URL('sitemap.xml', raiz), 'utf8'), montarSitemap(config));
});

test('as 9 áreas têm um botão cada, e sem JS o botão já abre o WhatsApp com a área', () => {
  const areas = [...html.matchAll(/<a class="area"[^>]*>/g)].map((m) => atributos(m[0]));
  assert.equal(areas.length, 9);
  for (const a of areas) {
    assert.ok(a.href.startsWith(`https://wa.me/${config.whatsapp}?text=`));
    assert.equal(texto(a.href), `Oi! Vim pelo site e quero saber da pós em ${a['data-area']} (SITE)`);
  }
});

test('sem código, todo botão sai com SITE e a área do botão', () => {
  const r = abrir(html);
  assert.ok(r.botoes.length >= 13);
  for (const b of r.botoes) {
    const area = areaDe(b);
    assert.equal(texto(b.getAttribute('href')), `Oi! Vim pelo site e quero saber da pós${area ? ' em ' + area : ''} (SITE)`);
  }
});

test('?c= de vídeo vai para a mensagem e fica guardado com a origem deduzida', () => {
  const r = abrir(html, { search: '?c=KW07&utm_campaign=pos' });
  const direito = r.botoes.find((b) => areaDe(b) === 'Direito');
  assert.equal(texto(direito.getAttribute('href')), 'Oi! Vi o vídeo no Kwai e quero saber da pós em Direito (KW07)');
  assert.equal(JSON.parse(r.dados.cp_ultimo_codigo).c, 'KW07');
  const primeiro = JSON.parse(r.dados.cp_primeiro);
  assert.equal(primeiro.c, 'KW07');
  assert.equal(primeiro.utm_source, 'kwai');
  assert.equal(primeiro.utm_campaign, 'pos');
});

test('quem passou por um link curto mantém o código; depois de 30 dias, não', () => {
  const recente = { cp_ultimo_codigo: JSON.stringify({ c: 'IG00', em: ANTES_DO_FIM - DIA }) };
  assert.match(texto(abrir(html, { guardado: recente }).botoes[0].getAttribute('href')), /\(IG00\)$/);
  const velho = { cp_ultimo_codigo: JSON.stringify({ c: 'IG00', em: ANTES_DO_FIM - 31 * DIA }) };
  assert.match(texto(abrir(html, { guardado: velho }).botoes[0].getAttribute('href')), /\(SITE\)$/);
});

test('o código da URL vence o guardado, e código inválido é ignorado', () => {
  const guardado = { cp_ultimo_codigo: JSON.stringify({ c: 'IG00', em: ANTES_DO_FIM }) };
  assert.match(texto(abrir(html, { search: '?c=YT03', guardado }).botoes[0].getAttribute('href')), /\(YT03\)$/);
  assert.match(texto(abrir(html, { search: '?c=%3Cscript%3E' }).botoes[0].getAttribute('href')), /\(SITE\)$/);
});

test('com o armazenamento bloqueado, os botões funcionam igual', () => {
  const r = abrir(html, { search: '?c=TT05', storage: 'erro' });
  assert.match(texto(r.botoes[0].getAttribute('href')), /\(TT05\)$/);
});

test('com o registro ligado, o clique vai para a planilha sem dado pessoal', async () => {
  const cfg = { ...config, registroCliques: REGISTRO };
  const r = abrir(montarInicio(cfg, conteudo, new Date(ANTES_DO_FIM)), { search: '?c=FB02&fbclid=abc', gtag: true });
  const saude = r.botoes.find((b) => areaDe(b) === 'Saúde, Esporte e Estética');
  saude.ouvintes.click();
  assert.equal(r.beacons.length, 1);
  assert.equal(r.beacons[0].url, REGISTRO);
  const dados = JSON.parse(await r.beacons[0].blob.text());
  assert.deepEqual(Object.keys(dados).sort(), ['area', 'codigo', 'pagina', 'posicao', 'primeiro', 'quando', 'rede', 'tipo']);
  assert.equal(dados.codigo, 'FB02');
  assert.equal(dados.area, 'Saúde, Esporte e Estética');
  assert.equal(dados.posicao, 'area');
  assert.equal(dados.pagina, '/');
  assert.deepEqual(r.eventos[0].slice(0, 2), ['event', 'whatsapp_clique']);
});

test('com o registro desligado, o clique não manda nada', () => {
  const r = abrir(html);
  r.botoes[0].ouvintes.click();
  assert.equal(r.beacons.length, 0);
});

test('o selo da campanha sai do ar sozinho depois do fim', () => {
  assert.equal(abrir(html, { agora: ANTES_DO_FIM }).selos[0].removido, false);
  assert.equal(abrir(html, { agora: DEPOIS_DO_FIM }).selos[0].removido, true);
  // E o gerador nem coloca o selo se rodar depois do fim.
  assert.doesNotMatch(montarInicio(config, conteudo, new Date(DEPOIS_DO_FIM)), /data-fim="/);
});

test('"grátis" só aparece com a regra de liberação ao lado', () => {
  const selo = html.match(/<div class="campanha"[\s\S]*?<\/div>\s*<\/div>/)[0];
  assert.match(selo, /grátis\*/);
  assert.match(selo, /\* A 2ª pós EAD, de valor igual ou menor, é liberada conforme o regulamento/);
  assert.match(selo, /\*\* Categoria Tradicional/);
});

test('o selo conta os dias que faltam pelo calendário de Brasília', () => {
  const faltam = (quando) => abrir(html, { agora: Date.parse(quando) }).selos[0].faltam.textContent;
  assert.equal(faltam('2026-10-26T12:00:00-03:00'), 'faltam 7 dias');
  assert.equal(faltam('2026-10-26T23:30:00-03:00'), 'faltam 7 dias');
  assert.equal(faltam('2026-11-01T00:10:00-03:00'), 'termina amanhã');
  assert.equal(faltam('2026-11-02T08:00:00-03:00'), 'termina hoje às 23h59');
  assert.equal(faltam('2026-11-02T23:58:00-03:00'), 'termina hoje às 23h59');
});

test('o horário diz se o atendimento está aberto agora ou quando o Manoel volta (Brasília)', () => {
  const situacao = (quando) => abrir(html, { agora: Date.parse(quando) });
  const segundaCedo = situacao('2026-10-26T10:00:00-03:00'); // 26/10/2026 é segunda
  assert.equal(segundaCedo.horario.textContent, 'Atendimento aberto agora, até as 19h');
  assert.deepEqual(segundaCedo.classesHorario, ['atendente__horario--aberto']);
  assert.equal(situacao('2026-10-26T07:30:00-03:00').horario.textContent, 'Pode mandar: responde hoje a partir das 8h');
  const segundaNoite = situacao('2026-10-26T19:00:00-03:00');
  assert.equal(segundaNoite.horario.textContent, 'Pode mandar: responde amanhã a partir das 8h');
  assert.deepEqual(segundaNoite.classesHorario, []);
  assert.equal(situacao('2026-10-31T20:00:00-03:00').horario.textContent, 'Pode mandar: responde na segunda a partir das 8h');
  assert.equal(situacao('2026-11-01T12:00:00-03:00').horario.textContent, 'Pode mandar: responde amanhã a partir das 8h');
});

test('sem JS, o horário sai por extenso e a instituição aparece no topo', () => {
  assert.match(html, /<span data-horario>Atendimento de segunda a sábado, das 8h às 19h<\/span>/);
  assert.match(html, /Curso e certificado da Universidade Anhanguera-Uniderp/);
});

test('o nome do atendente aparece uma vez só no texto da página', () => {
  const visivel = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  assert.equal((visivel.match(/Manoel/g) || []).length, 1);
});

test('o selo da campanha tem a etiqueta com prazo e os itens com a regra e a hora do fim', () => {
  assert.match(html, /<p class="campanha__prazo">Até 02\/11\/2026, às 23h59 \(horário de Brasília\)<\/p>/);
  assert.equal((html.match(/<div class="(selo-tag|campanha)" data-fim="2026-11-02T23:59:00-03:00">/g) || []).length, 2);
});
