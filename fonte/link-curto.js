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

  function mensagem(codigo) {
    var rede = REDES[codigo.slice(0, 2)];
    var video = CODIGO_VIDEO.exec(codigo);
    if (video && video[2] !== '00') {
      return 'Oi! Vi o vídeo no ' + rede + ' e quero saber da pós (' + codigo + ')';
    }
    return 'Oi! Vim pelo ' + rede + ' e quero saber da pós (' + codigo + ')';
  }

  function destino(numero, codigoPadrao, search) {
    var c = '';
    try { c = codigoValido(new URLSearchParams(search).get('c')); } catch (e) { /* navegador antigo: fica o padrão */ }
    var codigo = c || codigoPadrao;
    return { codigo: codigo, url: 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensagem(codigo)) };
  }

  return { codigoValido: codigoValido, mensagem: mensagem, destino: destino };
})();
