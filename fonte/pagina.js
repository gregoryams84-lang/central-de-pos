/* Botões de WhatsApp das páginas da pós ([data-whats]): mensagem com o código de origem e a área,
   origem guardada por 30 dias e selo de campanha que some depois do fim ([data-fim]).
   O gerador embute este arquivo logo depois de link-curto.js. Sem JS, os botões já têm o link "SITE". */
(function () {
  var NUMERO = '{{WHATSAPP}}';
  var REGISTRO = '{{REGISTRO}}';
  var TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;
  var REDE_DA_SIGLA = { IG: 'instagram', FB: 'facebook', TT: 'tiktok', KW: 'kwai', YT: 'youtube' };
  var agora = Date.now();

  function ler(chave) {
    try {
      var v = JSON.parse(localStorage.getItem(chave) || 'null');
      return v && agora - v.em < TRINTA_DIAS ? v : null;
    } catch (e) { return null; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* modo privado: segue sem guardar */ }
  }

  var params = null;
  try { params = new URLSearchParams(location.search); } catch (e) {}
  function parametro(nome) { return params ? String(params.get(nome) || '').slice(0, 100) : ''; }

  // Código da URL > último guardado (de um link curto ou visita anterior) > SITE.
  var daUrl = LINK_CURTO.codigoValido(parametro('c'));
  var ultimo = ler('cp_ultimo_codigo');
  var codigo = daUrl || (ultimo && LINK_CURTO.codigoValido(ultimo.c)) || 'SITE';
  if (daUrl) gravar('cp_ultimo_codigo', { c: daUrl, em: agora });

  // Primeiro toque: de onde a pessoa veio da primeira vez, mesmo que troque de página depois.
  var primeiro = ler('cp_primeiro');
  if (!primeiro) {
    primeiro = {
      c: codigo,
      utm_source: parametro('utm_source') || REDE_DA_SIGLA[codigo.slice(0, 2)] || '',
      utm_medium: parametro('utm_medium'),
      utm_campaign: parametro('utm_campaign'),
      utm_content: parametro('utm_content'),
      gclid: parametro('gclid'),
      fbclid: parametro('fbclid'),
      entrada: location.pathname,
      em: agora
    };
    gravar('cp_primeiro', primeiro);
  }

  function registrar(botao, area) {
    var posicao = botao.getAttribute('data-posicao') || '';
    if (REGISTRO && navigator.sendBeacon) {
      // Não segura a ida para o WhatsApp: se falhar, a pessoa chega lá do mesmo jeito.
      var dados = JSON.stringify({ tipo: 'clique', rede: 'site', codigo: codigo, primeiro: primeiro.c, area: area, posicao: posicao, pagina: location.pathname, quando: new Date().toISOString() });
      try { navigator.sendBeacon(REGISTRO, new Blob([dados], { type: 'text/plain;charset=utf-8' })); } catch (e) {}
    }
    if (typeof window.gtag === 'function') {
      try { window.gtag('event', 'whatsapp_clique', { codigo: codigo, area: area, posicao: posicao }); } catch (e) {}
    }
  }

  var botoes = document.querySelectorAll('[data-whats]');
  for (var i = 0; i < botoes.length; i++) {
    (function (botao) {
      var area = botao.getAttribute('data-area') || '';
      botao.setAttribute('href', 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(LINK_CURTO.mensagem(codigo, area)));
      botao.addEventListener('click', function () { registrar(botao, area); });
    })(botoes[i]);
  }

  // Oferta vencida não fica no ar, nem com a página em cache.
  var selos = document.querySelectorAll('[data-fim]');
  for (var j = 0; j < selos.length; j++) {
    var fimTexto = selos[j].getAttribute('data-fim');
    if (!(agora <= Date.parse(fimTexto))) { selos[j].parentNode.removeChild(selos[j]); continue; }
    var faltam = selos[j].querySelector('[data-faltam]');
    if (faltam) faltam.textContent = textoFaltam(fimTexto);
  }

  // Prazo real, em dias de calendário no horário de Brasília (UTC-3, sem horário de verão).
  function textoFaltam(fimTexto) {
    var hoje = new Date(agora - 3 * 60 * 60 * 1000);
    var p = fimTexto.slice(0, 10).split('-');
    var dias = Math.round((Date.UTC(+p[0], p[1] - 1, +p[2]) - Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())) / (24 * 60 * 60 * 1000));
    var data = p[2] + '/' + p[1];
    if (dias <= 0) return 'termina hoje às 23h59';
    if (dias === 1) return 'termina amanhã, ' + data;
    return 'faltam ' + dias + ' dias, até ' + data;
  }

  // Barra fixa do celular: entra quando o botão do topo sai da tela, para não repetir o mesmo convite.
  // Sem IntersectionObserver, a barra fica sempre visível.
  var barra = document.querySelector('.barra-whats');
  var principal = document.querySelector('.heroi .botao');
  if (barra && principal && 'IntersectionObserver' in window) {
    barra.classList.add('barra-whats--fora');
    new IntersectionObserver(function (registros) {
      barra.classList.toggle('barra-whats--fora', registros[0].isIntersecting);
    }).observe(principal);
  }

  // ?area=saude (vídeo de área): leva direto ao cartão da área.
  var slug = parametro('area').replace(/[^a-z]/g, '');
  var alvo = slug && document.getElementById('area-' + slug);
  if (alvo) {
    alvo.classList.add('area--destaque');
    try { alvo.scrollIntoView({ block: 'center' }); } catch (e) {}
  }
})();
