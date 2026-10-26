/* Monta o link do WhatsApp do Manoel a partir do código da página e do ?c= da URL.
   O gerador embute este arquivo em cada página de link curto, para o redirecionamento
   não esperar o download de outro arquivo. */
var LINK_CURTO = (function () {
  var REDES = { IG: 'Instagram', FB: 'Facebook', TT: 'TikTok', KW: 'Kwai', YT: 'YouTube' };
  // Vídeo: rede + número com 2 dígitos (00 = bio). Palavra-chave: resposta automática do direct/Messenger.
  var CODIGO_VIDEO = /^(IG|FB|TT|KW|YT)(\d{2})$/;
  var CODIGO_PALAVRA = /^(IG|FB)(POS|MBA|CONCURSO|CARREIRA)$/;

  function codigoValido(c) {
    c = String(c || '').trim().toUpperCase();
    return CODIGO_VIDEO.test(c) || CODIGO_PALAVRA.test(c) ? c : '';
  }

  // codigo 'SITE' = chegou sem código de rede. area: nome de exibição, nos botões das áreas.
  function mensagem(codigo, area) {
    var video = CODIGO_VIDEO.exec(codigo);
    var origem = codigo === 'SITE' ? 'Vim pelo site'
      : video && video[2] !== '00' ? 'Vi o vídeo no ' + REDES[video[1]]
      : 'Vim pelo ' + REDES[codigo.slice(0, 2)];
    return 'Oi! ' + origem + ' e quero saber da pós' + (area ? ' em ' + area : '') + ' (' + codigo + ')';
  }

  function destino(numero, codigoPadrao, search) {
    var c = '';
    try { c = codigoValido(new URLSearchParams(search).get('c')); } catch (e) { /* navegador antigo: fica o padrão */ }
    var codigo = c || codigoPadrao;
    return { codigo: codigo, url: 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensagem(codigo)) };
  }

  return { codigoValido: codigoValido, mensagem: mensagem, destino: destino };
})();
