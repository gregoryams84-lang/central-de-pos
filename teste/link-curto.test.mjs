// Testes da regra que monta o link do WhatsApp dos links curtos.
// Rodar: node --test "teste/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url);
const codigoFonte = readFileSync(new URL('fonte/link-curto.js', raiz), 'utf8');
const contexto = { URLSearchParams };
vm.createContext(contexto);
vm.runInContext(codigoFonte + '\nthis.LINK_CURTO = LINK_CURTO;', contexto);
const { destino, codigoValido } = contexto.LINK_CURTO;

const NUMERO = '5519992467847';
const texto = (d) => decodeURIComponent(d.url.split('?text=')[1]);

test('sem ?c= usa o código da bio da rede da página', () => {
  const d = destino(NUMERO, 'KW00', '');
  assert.equal(d.codigo, 'KW00');
  assert.equal(texto(d), 'Oi! Vim pelo Kwai e quero saber da pós (KW00)');
  assert.ok(d.url.startsWith('https://wa.me/5519992467847?text='));
});

test('código de vídeo troca a mensagem para "Vi o vídeo"', () => {
  const d = destino(NUMERO, 'KW00', '?c=KW07');
  assert.equal(d.codigo, 'KW07');
  assert.equal(texto(d), 'Oi! Vi o vídeo no Kwai e quero saber da pós (KW07)');
});

test('código em minúsculas vale', () => {
  assert.equal(destino(NUMERO, 'TT00', '?c=tt12').codigo, 'TT12');
});

test('código de palavra-chave do direct usa "Vim pelo"', () => {
  const d = destino(NUMERO, 'IG00', '?c=IGPOS');
  assert.equal(d.codigo, 'IGPOS');
  assert.equal(texto(d), 'Oi! Vim pelo Instagram e quero saber da pós (IGPOS)');
  assert.equal(destino(NUMERO, 'FB00', '?c=FBCONCURSO').codigo, 'FBCONCURSO');
});

test('a rede da mensagem vem do código, não da página', () => {
  const d = destino(NUMERO, 'YT00', '?c=IG03');
  assert.equal(texto(d), 'Oi! Vi o vídeo no Instagram e quero saber da pós (IG03)');
});

test('código de anúncio pago (AM = Meta, AG = Google) diz "Vi o anúncio", sem prometer a oferta do momento', () => {
  assert.equal(texto(destino(NUMERO, 'IG00', '?c=AM01')), 'Oi! Vi o anúncio e quero saber da pós (AM01)');
  assert.equal(texto(destino(NUMERO, 'IG00', '?c=ag12')), 'Oi! Vi o anúncio e quero saber da pós (AG12)');
});

test('código inválido é ignorado e cai no padrão', () => {
  for (const c of ['XX99', 'KW7', 'KW123', 'TTPOS', 'IG', '', '<script>', 'IGPOSX', 'AX01', 'AM1', 'AM001', 'AMPOS']) {
    assert.equal(destino(NUMERO, 'FB00', '?c=' + encodeURIComponent(c)).codigo, 'FB00', c);
  }
  assert.equal(codigoValido(undefined), '');
});

test('nomes das 5 redes', () => {
  const nomes = { IG: 'Instagram', FB: 'Facebook', TT: 'TikTok', KW: 'Kwai', YT: 'YouTube' };
  for (const [sigla, nome] of Object.entries(nomes)) {
    assert.equal(texto(destino(NUMERO, sigla + '00', '')), `Oi! Vim pelo ${nome} e quero saber da pós (${sigla}00)`);
  }
});

test('mensagem de quem chega pelo site, sem código de rede', () => {
  const { mensagem } = contexto.LINK_CURTO;
  assert.equal(mensagem('SITE'), 'Oi! Vim pelo site e quero saber da pós (SITE)');
  assert.equal(mensagem('SITE', 'Direito'), 'Oi! Vim pelo site e quero saber da pós em Direito (SITE)');
});

test('botão de área põe a área na mensagem', () => {
  const { mensagem } = contexto.LINK_CURTO;
  assert.equal(mensagem('KW07', 'Educação'), 'Oi! Vi o vídeo no Kwai e quero saber da pós em Educação (KW07)');
  assert.equal(mensagem('IG00', 'Negócios e MBA'), 'Oi! Vim pelo Instagram e quero saber da pós em Negócios e MBA (IG00)');
  assert.equal(mensagem('FBMBA', 'Direito'), 'Oi! Vim pelo Facebook e quero saber da pós em Direito (FBMBA)');
});
