// Varredura das páginas publicadas: regras de marca e de negócio que não podem quebrar.
// Rodar: node ferramentas/gerar.mjs && node --test "teste/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raiz = new URL('..', import.meta.url);
const config = JSON.parse(readFileSync(new URL('fonte/config.json', raiz), 'utf8'));
const paginas = ['index.html', ...config.links.map((l) => `${l.caminho}/index.html`)];
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
// Texto que a pessoa vê: sem tags, sem script/style.
const visivel = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');

for (const pagina of paginas) {
  test(`${pagina}: sem link para a Anhanguera nacional`, () => {
    // Matrícula pelo site nacional conta como captação deles, não do polo.
    assert.doesNotMatch(ler(pagina), /anhanguera\.com|cogna|kroton|unopar\.com/i);
  });

  test(`${pagina}: sem "Campinas" e sem cara de canal oficial`, () => {
    const texto = visivel(ler(pagina));
    assert.doesNotMatch(texto, /campinas/i);
    assert.doesNotMatch(texto, /site oficial|0800|Central de Pós Anhanguera/i);
  });

  test(`${pagina}: só o WhatsApp do Manoel`, () => {
    const numeros = [...ler(pagina).matchAll(/wa\.me\/(\d+)/g)].map((m) => m[1]);
    assert.ok(numeros.length > 0);
    for (const n of numeros) assert.equal(n, config.whatsapp);
  });

  test(`${pagina}: fora da busca por enquanto`, () => {
    assert.match(ler(pagina), /<meta name="robots" content="noindex">/);
  });
}

for (const { caminho, codigo } of config.links) {
  test(`/${caminho}/: sem JS cai no link da bio (${codigo})`, () => {
    const html = ler(`${caminho}/index.html`);
    assert.match(html, new RegExp(`<noscript><meta http-equiv="refresh" content="0; url=https://wa\\.me/${config.whatsapp}\\?text=[^"]*\\(${codigo}\\)"></noscript>`));
    assert.match(html, new RegExp(`destino\\('${config.whatsapp}', '${codigo}', location\\.search\\)`));
  });
}
