// Tag do Google Ads: desligada, o site não tem tag, cookie nem aviso. Ligada, o consentimento começa
// negado, o aviso aparece e o clique no WhatsApp vira conversão. Roda o script de verdade com um navegador de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { lerConfig, lerConteudo, validarConfig, montarInicio, montarTexto, TEXTOS } from '../ferramentas/gerar.mjs';

const raiz = new URL('..', import.meta.url);
const config = lerConfig();
const conteudo = lerConteudo();
const comTag = { ...config, googleAds: { id: 'AW-123456789', rotulo: 'abcDEF_12' } };
const paginasNoDisco = ['index.html', 'privacidade/index.html', 'termos/index.html', ...config.links.map((l) => `${l.caminho}/index.html`)];

// Executa o último <script> da página (o do fim do body) e devolve o que ele fez.
function abrir(html, { guardado = {} } = {}) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const r = { eventos: [], dados: { ...guardado }, classes: new Set(), propriedades: {} };
  const elemento = (attrs) => ({
    attrs, ouvintes: {}, hidden: true, offsetHeight: 132,
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); },
    addEventListener(tipo, f) { this.ouvintes[tipo] = f; },
    classList: { add() {}, toggle() {}, remove() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  r.botoes = [...html.matchAll(/<a [^>]*data-whats[^>]*>/g)].map((m) => elemento(Object.fromEntries([...m[0].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].slice(1).map((a) => [a[1], a[2] ?? '']))));
  r.aviso = /data-cookies[\s>]/.test(html) ? elemento({}) : null;
  if (r.aviso) {
    r.respostas = ['nao', 'sim'].map((v) => elemento({ 'data-cookies-resposta': v }));
    r.aviso.querySelectorAll = (sel) => (sel === '[data-cookies-resposta]' ? r.respostas : []);
  }
  const janela = {
    URLSearchParams, JSON, Blob, String, Date,
    location: { search: '', pathname: '/' },
    navigator: {},
    localStorage: { getItem: (k) => (k in r.dados ? r.dados[k] : null), setItem: (k, v) => { r.dados[k] = v; } },
    gtag: (...args) => r.eventos.push(args),
    document: {
      body: { classList: { add: (c) => r.classes.add(c), remove: (c) => r.classes.delete(c) }, style: { setProperty: (k, v) => { r.propriedades[k] = v; } } },
      querySelectorAll: (sel) => (sel === '[data-whats]' ? r.botoes : []),
      querySelector: (sel) => (sel === '[data-cookies]' ? r.aviso : null),
      getElementById: () => null,
    },
  };
  janela.window = janela;
  vm.createContext(janela);
  vm.runInContext(scripts[scripts.length - 1][1], janela);
  return r;
}

test('as páginas no disco seguem a config: a tag fica nas páginas com botão, nunca nos links curtos', () => {
  const g = config.googleAds && config.googleAds.id ? config.googleAds : null;
  for (const p of paginasNoDisco) {
    const html = readFileSync(new URL(p, raiz), 'utf8');
    const curto = !['index.html', 'privacidade/index.html', 'termos/index.html'].includes(p);
    if (!g || curto) {
      // O link curto redireciona na hora: tag ali só atrasaria a ida para o WhatsApp.
      assert.doesNotMatch(html, /googletagmanager|gtag\('config'|<div class="cookies"/, p);
      if (/var CONVERSAO/.test(html)) assert.match(html, /var CONVERSAO = '';/, p);
    } else {
      assert.ok(html.indexOf("gtag('consent', 'default'") < html.indexOf(`googletagmanager.com/gtag/js?id=${g.id}`), p);
      assert.match(html, new RegExp(`var CONVERSAO = '${g.id}/${g.rotulo}';`), p);
      assert.match(html, /<div class="cookies" data-cookies hidden>/, p);
    }
  }
  const privacidade = readFileSync(new URL('privacidade/index.html', raiz), 'utf8');
  assert.match(privacidade, g ? /<li id="cookies"><strong>Tag do Google Ads/ : /Sem cookies de publicidade/);
  assert.doesNotMatch(privacidade, /Atualizada em 26\/10\/2026/, 'mudou o texto dos cookies: muda a data');
});

test('ligada: o consentimento negado vem antes da tag, e quem já aceitou volta com a medição liberada', () => {
  const html = montarInicio(comTag, conteudo);
  const cabeca = html.slice(0, html.indexOf('</head>'));
  const consentimento = cabeca.indexOf("gtag('consent', 'default'");
  assert.ok(consentimento > 0 && consentimento < cabeca.indexOf('googletagmanager.com/gtag/js?id=AW-123456789'));
  const script = cabeca.match(/<script>([\s\S]*?)<\/script>/)[1];
  const rodar = (guardado) => {
    const janela = { localStorage: { getItem: (k) => guardado[k] ?? null }, Date };
    janela.window = janela;
    vm.createContext(janela);
    vm.runInContext(script, janela);
    return JSON.parse(JSON.stringify(janela.dataLayer.map((a) => [...a])));
  };
  const novo = rodar({});
  assert.deepEqual(novo[0], ['consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' }]);
  assert.ok(!novo.some((a) => a[1] === 'update'));
  const voltou = rodar({ cp_cookies: 'sim' });
  assert.deepEqual(voltou[1], ['consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted' }]);
  assert.deepEqual(voltou.at(-1), ['config', 'AW-123456789']);
});

test('ligada: o aviso aparece, sobe a barra e guarda a resposta; "Aceitar" libera só a medição', () => {
  const r = abrir(montarInicio(comTag, conteudo));
  assert.equal(r.aviso.hidden, false);
  assert.ok(r.classes.has('com-cookies'));
  assert.equal(r.propriedades['--altura-cookies'], '132px');
  r.respostas[1].ouvintes.click.call(r.respostas[1]);
  assert.equal(r.dados.cp_cookies, 'sim');
  assert.deepEqual(JSON.parse(JSON.stringify(r.eventos.at(-1))), ['consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted' }]);
  assert.equal(r.aviso.hidden, true);
  assert.ok(!r.classes.has('com-cookies'));
});

test('ligada: "Recusar" guarda a resposta e não libera nada; quem já respondeu não vê o aviso de novo', () => {
  const r = abrir(montarInicio(comTag, conteudo));
  r.respostas[0].ouvintes.click.call(r.respostas[0]);
  assert.equal(r.dados.cp_cookies, 'nao');
  assert.ok(!r.eventos.some((e) => e[0] === 'consent'));
  for (const resposta of ['sim', 'nao']) assert.equal(abrir(montarInicio(comTag, conteudo), { guardado: { cp_cookies: resposta } }).aviso.hidden, true);
});

test('ligada: o toque no WhatsApp vira a conversão do Google Ads', () => {
  const r = abrir(montarInicio(comTag, conteudo));
  r.botoes.find((b) => b.getAttribute('data-posicao') === 'topo').ouvintes.click();
  const eventos = JSON.parse(JSON.stringify(r.eventos));
  assert.deepEqual(eventos.map((e) => e[1]), ['whatsapp_clique', 'conversion']);
  assert.deepEqual(eventos[1], ['event', 'conversion', { send_to: 'AW-123456789/abcDEF_12' }]);
});

test('ligada: a privacidade explica o cookie do Google e não diz mais que não há cookie', () => {
  const privacidade = montarTexto(comTag, TEXTOS.find((t) => t.caminho === 'privacidade/'));
  assert.match(privacidade, /<li id="cookies"><strong>Tag do Google Ads:<\/strong>/);
  assert.doesNotMatch(privacidade, /Sem cookies de publicidade/);
  assert.match(privacidade, /<div class="cookies" data-cookies hidden>/, 'o aviso também aparece na privacidade');
  assert.doesNotMatch(montarInicio(comTag, conteudo), /fbq\(|connect\.facebook\.net/, 'sem Pixel da Meta');
});

test('id ou rótulo fora do formato do Google Ads não gera o site', () => {
  for (const googleAds of [{ id: 'G-123456', rotulo: 'abcd' }, { id: 'AW-123456789', rotulo: '' }, { id: 'AW-123"><script>', rotulo: 'abcd' }, { id: 'AW-123456789', rotulo: "a'b c" }]) {
    assert.throws(() => validarConfig({ ...config, googleAds }), /googleAds/, JSON.stringify(googleAds));
  }
  assert.doesNotThrow(() => validarConfig(comTag));
  assert.doesNotThrow(() => validarConfig({ ...config, googleAds: { id: '', rotulo: 'sobrou' } }));
});
