// Gera as páginas dos links curtos (/instagram, /facebook...) a partir de fonte/.
// Rodar depois de mudar fonte/config.json, fonte/link-curto.js ou fonte/link-curto.html:
//   node ferramentas/gerar.mjs
// Os HTML gerados vão no commit: o GitHub Pages serve arquivo estático, sem passo de build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

export function lerConfig() {
  const config = JSON.parse(ler('fonte/config.json'));
  if (!/^55\d{10,11}$/.test(config.whatsapp)) throw new Error('fonte/config.json: whatsapp inválido');
  if (config.registroCliques && !config.registroCliques.startsWith('https://script.google.com/')) {
    throw new Error('fonte/config.json: registroCliques deve ser a URL do Web App do Apps Script');
  }
  return config;
}

const logica = ler('fonte/link-curto.js').trim();
const modelo = ler('fonte/link-curto.html');

// A URL padrão (sem JS) sai da mesma regra que o navegador usa.
const contexto = { URLSearchParams };
vm.createContext(contexto);
vm.runInContext(logica + '\nthis.LINK_CURTO = LINK_CURTO;', contexto);

const escaparAtributo = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function montarPagina(config, { caminho, codigo }) {
  const padrao = contexto.LINK_CURTO.destino(config.whatsapp, codigo, '');
  return modelo
    .replace('{{LOGICA}}', () => logica)
    .replaceAll('{{WHATSAPP}}', config.whatsapp)
    .replaceAll('{{CODIGO}}', codigo)
    .replaceAll('{{CAMINHO}}', caminho)
    .replaceAll('{{REGISTRO}}', config.registroCliques)
    .replaceAll('{{URL_PADRAO}}', escaparAtributo(padrao.url));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = lerConfig();
  for (const link of config.links) {
    mkdirSync(new URL(`${link.caminho}/`, raiz), { recursive: true });
    writeFileSync(new URL(`${link.caminho}/index.html`, raiz), montarPagina(config, link));
    console.log(`/${link.caminho}/ -> ${link.codigo}`);
  }
}
