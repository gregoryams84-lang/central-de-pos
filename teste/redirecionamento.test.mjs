// Roda o script de verdade de cada página de link curto, com o navegador simulado:
// confere para onde a pessoa vai e o que é mandado para a planilha de cliques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { lerConfig, montarPagina } from '../ferramentas/gerar.mjs';

const raiz = new URL('..', import.meta.url);
const config = lerConfig();
const REGISTRO = 'https://script.google.com/macros/s/TESTE/exec';

// Executa o 1º <script> da página (o do redirecionamento) num navegador de mentira.
function abrir(html, search, { beacon = 'ok', storage = 'ok' } = {}) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const r = { destino: null, beacons: [] };
  const janela = {
    URLSearchParams,
    JSON, Date, Blob,
    location: { search, pathname: '/x/', replace: (url) => { r.destino = url; } },
    navigator: {
      sendBeacon: (url, blob) => {
        if (beacon === 'erro') throw new Error('rede caiu');
        r.beacons.push({ url, blob });
        return true;
      },
    },
    localStorage: {
      setItem: () => { if (storage === 'erro') throw new Error('modo privado'); },
    },
  };
  janela.window = janela;
  vm.createContext(janela);
  vm.runInContext(script, janela);
  return r;
}

const texto = (url) => decodeURIComponent(url.split('?text=')[1]);

test('a página gerada no disco é a mesma que o gerador monta', () => {
  for (const link of config.links) {
    const noDisco = readFileSync(new URL(`${link.caminho}/index.html`, raiz), 'utf8');
    assert.equal(noDisco, montarPagina(config, link), `rode node ferramentas/gerar.mjs (${link.caminho})`);
  }
});

test('cada link curto redireciona para o WhatsApp do Manoel com o código da bio', () => {
  for (const link of config.links) {
    const r = abrir(montarPagina(config, link), '');
    assert.ok(r.destino.startsWith(`https://wa.me/${config.whatsapp}?text=`), link.caminho);
    assert.match(texto(r.destino), new RegExp(`^Oi! Vim pelo .+ e quero saber da pós \\(${link.codigo}\\)$`));
  }
});

test('?c= de vídeo chega na mensagem', () => {
  const r = abrir(montarPagina(config, { caminho: 'kwai', codigo: 'KW00' }), '?c=KW07');
  assert.equal(texto(r.destino), 'Oi! Vi o vídeo no Kwai e quero saber da pós (KW07)');
});

test('com o registro ligado, o clique vai para a planilha e o redirecionamento acontece', async () => {
  const cfg = { ...config, registroCliques: REGISTRO };
  const r = abrir(montarPagina(cfg, { caminho: 'tiktok', codigo: 'TT00' }), '?c=TT03');
  assert.equal(r.beacons.length, 1);
  assert.equal(r.beacons[0].url, REGISTRO);
  assert.equal(r.beacons[0].blob.type, 'text/plain;charset=utf-8');
  const dados = JSON.parse(await r.beacons[0].blob.text());
  assert.equal(dados.tipo, 'clique');
  assert.equal(dados.rede, 'tiktok');
  assert.equal(dados.codigo, 'TT03');
  assert.ok(r.destino.includes('TT03'));
});

test('se o registro falhar, a pessoa chega no WhatsApp do mesmo jeito', () => {
  const cfg = { ...config, registroCliques: REGISTRO };
  const r = abrir(montarPagina(cfg, { caminho: 'youtube', codigo: 'YT00' }), '', { beacon: 'erro', storage: 'erro' });
  assert.ok(r.destino.startsWith(`https://wa.me/${config.whatsapp}?text=`));
});

test('com o registro desligado, nada é enviado', () => {
  const r = abrir(montarPagina({ ...config, registroCliques: '' }, { caminho: 'instagram', codigo: 'IG00' }), '');
  assert.equal(r.beacons.length, 0);
  assert.ok(r.destino);
});
