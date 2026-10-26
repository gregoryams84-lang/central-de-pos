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
  ICONE_RELOGIO: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  ICONE_GLOBO: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  ICONE_PRESENTE: svg('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S9 8 12 8zm0 0c2-4 6-4 6-1.5S15 8 12 8z"/>'),
  ICONE_CARTAO: svg('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>'),
};

// Campanha em duas partes: a etiqueta com o prazo no banner e os itens com as regras na faixa cinza.
// As duas têm data-fim: o gerador não as coloca depois do fim, e o navegador tira se a página ficou em cache.
function montarCampanha(campanha, agora) {
  if (agora.getTime() > Date.parse(campanha.fim)) return { tag: '', oferta: '' };
  const [, mes, dia] = campanha.fim.slice(0, 10).split('-'); // data de Brasília, como está escrita
  const fim = escaparAtributo(campanha.fim);
  const tag = `<div class="selo-tag" data-fim="${fim}"><span class="selo-tag__ponto" aria-hidden="true"></span>${escaparHtml(campanha.nome)} · <span data-faltam>até ${dia}/${mes}</span></div>`;
  const itens = campanha.ofertas.map((o) => `<li>${ICONES['ICONE_' + o.icone.toUpperCase()]}<span><strong>${escaparHtml(o.destaque)}</strong>${escaparHtml(o.resto)}</span></li>`).join('');
  const notas = campanha.notas.map((n) => `<p>${escaparHtml(n)}</p>`).join('');
  const oferta = `<div class="campanha" data-fim="${fim}">
        <ul class="vantagens__lista">${itens}</ul>
        <p class="campanha__prazo">Até ${dia}/${mes}/${campanha.fim.slice(0, 4)}, às ${campanha.fim.slice(11, 13)}h${campanha.fim.slice(14, 16)} (horário de Brasília)</p>
        <div class="campanha__notas">${notas}</div>
      </div>`;
  return { tag, oferta };
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
        contactPoint: { '@type': 'ContactPoint', telephone: `+${w.slice(0, 2)}-${w.slice(2, 4)}-${w.slice(4, -4)}-${w.slice(-4)}`, contactType: 'customer service', availableLanguage: 'Portuguese',
          hoursAvailable: { '@type': 'OpeningHoursSpecification', dayOfWeek: config.atendimento.dias.map((d) => DIAS_SCHEMA[d]), opens: hora(config.atendimento.abre), closes: hora(config.atendimento.fecha) } },
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

// Foto do atendente (manoel.webp na raiz, só o rosto, sem logo). Sem o arquivo, um círculo com a inicial.
function montarFoto(config) {
  const nome = escaparHtml(config.atendimento.nome);
  return existsSync(new URL('manoel.webp', raiz))
    ? `<img class="atendente__foto" src="/manoel.webp" width="52" height="52" alt="${nome}">`
    : `<span class="atendente__foto atendente__foto--letra" aria-hidden="true">${nome.charAt(0)}</span>`;
}

const DIAS_SCHEMA = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hora = (h) => `${String(h).padStart(2, '0')}:00`;

const BARRA = (config) => `<a class="barra-whats" data-whats data-posicao="barra" href="${linkWhats(config, '')}" rel="noopener">${ICONES.ICONE}<span>Falar com um especialista</span></a>`;

function montarBase(config, { caminho, titulo, descricao, conteudo, classe = '', barra = '', jsonld = '' }) {
  const ogImagem = existsSync(new URL('og.png', raiz))
    ? `<meta property="og:image" content="${config.site}/og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">`
    : '<meta name="twitter:card" content="summary">';
  const comuns = {
    ...ICONES,
    WHATS_SITE: linkWhats(config, ''),
    ATENDENTE: escaparHtml(config.atendimento.nome),
    ATENDIMENTO: escaparHtml(config.atendimento.texto),
    FOTO: montarFoto(config),
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
    PAGINA: preencher(ler('fonte/pagina.js').trim(), {
      WHATSAPP: config.whatsapp,
      REGISTRO: config.registroCliques,
      DIAS: JSON.stringify(config.atendimento.dias),
      ABRE: String(config.atendimento.abre),
      FECHA: String(config.atendimento.fecha),
    }),
  });
  const sobrou = pagina.match(/\{\{[A-Z_]+\}\}/);
  if (sobrou) throw new Error(`${caminho || 'index'}: marcador sem valor ${sobrou[0]}`);
  return pagina;
}

export function montarInicio(config, conteudo, agora = new Date()) {
  const campanha = montarCampanha(conteudo.campanha, agora);
  const corpo = preencher(ler('fonte/inicio.html'), {
    SELO: campanha.tag,
    OFERTA: campanha.oferta,
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
