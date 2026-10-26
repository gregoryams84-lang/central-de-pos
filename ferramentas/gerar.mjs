// Gera as páginas do site a partir de fonte/: links curtos (/instagram, /facebook...), página inicial,
// privacidade, termos e sitemap. Rodar depois de mudar qualquer arquivo de fonte/:
//   node ferramentas/gerar.mjs
// Os HTML gerados vão no commit: o GitHub Pages serve arquivo estático, sem passo de build.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');
const lerJson = (caminho) => JSON.parse(ler(caminho));

export function lerConfig() {
  const config = lerJson('fonte/config.json');
  if (!/^55\d{10,11}$/.test(config.whatsapp)) throw new Error('fonte/config.json: whatsapp inválido');
  if (config.registroCliques && !config.registroCliques.startsWith('https://script.google.com/')) {
    throw new Error('fonte/config.json: registroCliques deve ser a URL do Web App do Apps Script');
  }
  return config;
}

export function lerConteudo() {
  const campanha = lerJson('fonte/campanha.json');
  if (Number.isNaN(Date.parse(campanha.fim))) throw new Error('fonte/campanha.json: fim inválido');
  return { campanha, areas: lerJson('fonte/areas.json'), perguntas: lerJson('fonte/perguntas.json').perguntas };
}

const logica = ler('fonte/link-curto.js').trim();
const modelo = ler('fonte/link-curto.html');

// A URL padrão (sem JS) sai da mesma regra que o navegador usa.
const contexto = { URLSearchParams };
vm.createContext(contexto);
vm.runInContext(logica + '\nthis.LINK_CURTO = LINK_CURTO;', contexto);

const escaparAtributo = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escaparHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linkWhats = (config, area) => escaparAtributo(`https://wa.me/${config.whatsapp}?text=${encodeURIComponent(contexto.LINK_CURTO.mensagem('SITE', area))}`);

// Troca {{CHAVE}} pelos valores. Função no replace para "$" do texto não virar padrão.
function preencher(texto, valores) {
  return texto.replace(/\{\{([A-Z_]+)\}\}/g, (marca, chave) => (chave in valores ? valores[chave] : marca));
}

export function montarPagina(config, { caminho, codigo }) {
  const padrao = contexto.LINK_CURTO.destino(config.whatsapp, codigo, '');
  return modelo
    .replace('{{LOGICA}}', () => logica)
    .replaceAll('{{WHATSAPP}}', config.whatsapp)
    .replaceAll('{{CODIGO}}', codigo)
    .replaceAll('{{CAMINHO}}', caminho)
    .replaceAll('{{REGISTRO}}', config.registroCliques)
    .replaceAll('{{URL_PADRAO}}', escaparAtributo(padrao.url))
    .replaceAll('{{TELEFONE}}', telefone(config));
}

// 5519992467847 -> (19) 99246-7847: o número por extenso, para quando o app não abre o WhatsApp.
const telefone = (config) => `(${config.whatsapp.slice(2, 4)}) ${config.whatsapp.slice(4, -4)}-${config.whatsapp.slice(-4)}`;

// Instituição responsável (Decreto 12.456/2025): enquanto não for confirmada, a página mostra o
// marcador e fica fora da busca. Nada vai ao ar com o marcador.
export const MARCADOR_INSTITUICAO = '[INSTITUIÇÃO A CONFIRMAR]';
const instituicao = (config) => escaparHtml(config.instituicao || MARCADOR_INSTITUICAO);

const svg = (corpo) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
const ICONES = {
  ICONE: svg('<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.4A8.4 8.4 0 1 1 21 11.5z"/>'),
  ICONE_SETA: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  ICONE_ESCUDO: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>'),
  ICONE_CERTO: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  ICONE_PREDIO: svg('<path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/>'),
  ICONE_PESSOA: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
};

function montarSelo(campanha, agora) {
  if (agora.getTime() > Date.parse(campanha.fim)) return '';
  const [, mes, dia] = campanha.fim.slice(0, 10).split('-'); // data de Brasília, como está escrita
  const notas = campanha.notas.map((n) => `<p>${escaparHtml(n)}</p>`).join('');
  return `<div class="selo" data-fim="${escaparAtributo(campanha.fim)}">
        <p class="selo__nome">${escaparHtml(campanha.nome)} · <span data-faltam>até ${dia}/${mes}</span></p>
        <p class="selo__oferta">${escaparHtml(campanha.oferta)}</p>
        <div class="selo__notas">${notas}</div>
      </div>`;
}

function montarAreas(config, areas) {
  return areas.map((a) => `        <a class="area" id="area-${a.slug}" data-whats data-area="${escaparAtributo(a.nome)}" data-posicao="area" href="${linkWhats(config, a.nome)}" rel="noopener">
          <span class="area__topo"><span class="area__nome">${escaparHtml(a.nome)}</span><span class="area__qtd">${a.cursos} cursos</span></span>
          <span class="area__ex">${a.exemplos.map(escaparHtml).join(' · ')}</span>
          <span class="area__cta">Ver cursos no WhatsApp ${ICONES.ICONE_SETA}</span>
        </a>`).join('\n');
}

const textoPergunta = (config, texto) => preencher(escaparHtml(texto), { INSTITUICAO: instituicao(config), RAZAO: config.empresa.razao, CNPJ: config.empresa.cnpj });

function montarPerguntas(config, perguntas) {
  return perguntas.map((p) => `        <details class="pergunta"><summary>${escaparHtml(p.pergunta)}</summary><p>${textoPergunta(config, p.resposta)}</p></details>`).join('\n');
}

function montarJsonLd(config, perguntas) {
  const w = config.whatsapp;
  const dados = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EducationalOrganization',
        name: 'Central de Pós · Polo Anhanguera',
        legalName: config.empresa.razao,
        taxID: config.empresa.cnpj,
        url: config.site + '/',
        areaServed: 'BR',
        contactPoint: { '@type': 'ContactPoint', telephone: `+${w.slice(0, 2)}-${w.slice(2, 4)}-${w.slice(4, -4)}-${w.slice(-4)}`, contactType: 'customer service', availableLanguage: 'Portuguese' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: perguntas.map((p) => ({
          '@type': 'Question',
          name: p.pergunta,
          acceptedAnswer: { '@type': 'Answer', text: preencher(p.resposta, { INSTITUICAO: config.instituicao || MARCADOR_INSTITUICAO, RAZAO: config.empresa.razao, CNPJ: config.empresa.cnpj }) },
        })),
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(dados).replace(/</g, '\\u003c')}</script>`;
}

const BARRA = (config) => `<a class="barra-whats" data-whats data-posicao="barra" href="${linkWhats(config, '')}" rel="noopener">${ICONES.ICONE}<span>Falar com o Manoel no WhatsApp</span></a>`;

function montarBase(config, { caminho, titulo, descricao, conteudo, classe = '', barra = '', jsonld = '' }) {
  const ogImagem = existsSync(new URL('og.png', raiz))
    ? `<meta property="og:image" content="${config.site}/og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">`
    : '<meta name="twitter:card" content="summary">';
  const comuns = {
    ...ICONES,
    WHATS_SITE: linkWhats(config, ''),
    INSTITUICAO: instituicao(config),
    RAZAO: config.empresa.razao,
    CNPJ: config.empresa.cnpj,
  };
  const pagina = preencher(ler('fonte/base.html'), {
    ...comuns,
    TITULO: escaparHtml(titulo),
    DESCRICAO: escaparHtml(descricao),
    URL: `${config.site}/${caminho}`,
    ROBOTS: config.instituicao ? '' : '<meta name="robots" content="noindex">',
    OG_IMAGEM: ogImagem,
    ESTILO: ler('fonte/estilo.css').trim(),
    JSONLD: jsonld,
    CLASSE: classe,
    CONTEUDO: preencher(conteudo, comuns).trim(),
    BARRA: barra,
    LOGICA: logica,
    PAGINA: preencher(ler('fonte/pagina.js').trim(), { WHATSAPP: config.whatsapp, REGISTRO: config.registroCliques }),
  });
  const sobrou = pagina.match(/\{\{[A-Z_]+\}\}/);
  if (sobrou) throw new Error(`${caminho || 'index'}: marcador sem valor ${sobrou[0]}`);
  return pagina;
}

export function montarInicio(config, conteudo, agora = new Date()) {
  const corpo = preencher(ler('fonte/inicio.html'), {
    SELO: montarSelo(conteudo.campanha, agora),
    AREAS: montarAreas(config, conteudo.areas.areas),
    PERGUNTAS: montarPerguntas(config, conteudo.perguntas),
    TOTAL_CURSOS: escaparHtml(conteudo.areas.totalCursos),
  });
  return montarBase(config, {
    caminho: '',
    titulo: 'Pós-graduação 100% online | Central de Pós · Polo Anhanguera',
    descricao: 'Especialização e MBA 100% online, para todo o Brasil. Escolha sua área e fale com o Manoel no WhatsApp: atendimento humano do primeiro oi à matrícula.',
    conteudo: corpo,
    classe: 'com-barra',
    barra: BARRA(config),
    jsonld: montarJsonLd(config, conteudo.perguntas),
  });
}

export const TEXTOS = [
  { caminho: 'privacidade/', fonte: 'fonte/privacidade.html', titulo: 'Política de privacidade | Central de Pós · Polo Anhanguera', descricao: 'Como a Central de Pós · Polo Anhanguera trata os dados de quem visita o site e conversa no WhatsApp.' },
  { caminho: 'termos/', fonte: 'fonte/termos.html', titulo: 'Termos de uso | Central de Pós · Polo Anhanguera', descricao: 'Termos de uso do site da Central de Pós · Polo Anhanguera.' },
];

export function montarTexto(config, texto) {
  return montarBase(config, { caminho: texto.caminho, titulo: texto.titulo, descricao: texto.descricao, conteudo: ler(texto.fonte) });
}

export function montarSitemap(config) {
  const urls = ['', ...TEXTOS.map((t) => t.caminho)].map((c) => `  <url><loc>${config.site}/${c}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = lerConfig();
  const conteudo = lerConteudo();
  const gravar = (caminho, html) => {
    if (caminho.includes('/')) mkdirSync(new URL(caminho.slice(0, caminho.lastIndexOf('/') + 1), raiz), { recursive: true });
    writeFileSync(new URL(caminho, raiz), html);
    console.log(caminho);
  };
  for (const link of config.links) gravar(`${link.caminho}/index.html`, montarPagina(config, link));
  gravar('index.html', montarInicio(config, conteudo));
  for (const texto of TEXTOS) gravar(`${texto.caminho}index.html`, montarTexto(config, texto));
  gravar('sitemap.xml', montarSitemap(config));
  if (!config.instituicao) console.warn(`\nATENÇÃO: falta a instituição responsável em fonte/config.json. As páginas saem com ${MARCADOR_INSTITUICAO} e fora da busca: não publicar assim.`);
}
