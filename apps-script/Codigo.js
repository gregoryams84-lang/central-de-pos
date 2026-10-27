/* Web App da planilha "Central de Pós - Cliques": recebe o clique dos botões de WhatsApp do site e dos
   links curtos (sendBeacon em text/plain, porque o Apps Script não responde ao preflight do CORS) e grava
   uma linha no FIM da aba "cliques". O site nunca manda nome, telefone nem IP, e aqui só entra o que passa
   pela validação: o resto é descartado em silêncio, sem atrasar a ida da pessoa para o WhatsApp. */

var ABA = 'cliques';
var CABECALHO = ['Data e hora', 'Rede', 'Código', '1º código', 'Área', 'Posição', 'Página'];
// Iguais a fonte/config.json (links) e fonte/areas.json: o teste confere.
var REDES = ['site', 'instagram', 'facebook', 'tiktok', 'kwai', 'youtube'];
var AREAS = [
  'Negócios e MBA', 'Educação', 'Saúde, Esporte e Estética', 'Engenharia e Arquitetura',
  'Ciências, Exatas e Tecnologia', 'Direito', 'Ciências Sociais, Serviços e Outros',
  'Comunicação, Artes e Humanidades', 'Agricultura e Veterinária'
];
// Mesmos códigos de fonte/link-curto.js, mais SITE (chegou sem código de rede).
var CODIGO = /^(SITE|(IG|FB|TT|KW|YT)\d{2}|(IG|FB)(POS|MBA|CONCURSO|CARREIRA)|A[MG]\d{2})$/;
var POSICAO = /^[a-z-]{1,20}$/;
var TAMANHO_MAXIMO = 2000;
var LIMITE_POR_MINUTO = 300;
var MESES_DE_GUARDA = 12;
var FUSO = 'America/Sao_Paulo';

function doPost(e) {
  var linha = montarLinha(e && e.postData ? e.postData.contents : '', new Date());
  if (linha && dentroDoLimite()) abaCliques().appendRow(linha);
  return ContentService.createTextOutput('ok');
}

// Só para conferir que o Web App está no ar; não grava nada.
function doGet() {
  return ContentService.createTextOutput('ok');
}

// Devolve a linha da planilha, ou null se o envio não for um clique válido.
function montarLinha(corpo, agora) {
  if (typeof corpo !== 'string' || !corpo || corpo.length > TAMANHO_MAXIMO) return null;
  var d;
  try { d = JSON.parse(corpo); } catch (err) { return null; }
  if (!d || d.tipo !== 'clique') return null;
  var rede = String(d.rede || '');
  var codigo = String(d.codigo || '');
  if (REDES.indexOf(rede) < 0 || !CODIGO.test(codigo)) return null;
  var primeiro = CODIGO.test(String(d.primeiro || '')) ? String(d.primeiro) : '';
  var area = AREAS.indexOf(String(d.area || '')) >= 0 ? String(d.area) : '';
  var posicao = POSICAO.test(String(d.posicao || '')) ? String(d.posicao) : '';
  return [agora, rede, codigo, primeiro, area, posicao, pagina(d.pagina)];
}

// Só caminho do próprio site. Como começa com "/", a planilha nunca o lê como fórmula.
function pagina(p) {
  p = String(p || '').replace(/[\u0000-\u001f]/g, '').slice(0, 200);
  return p.charAt(0) === '/' ? p : '';
}

// Freio contra envio em massa: passou do limite no minuto, o resto do minuto é descartado.
function dentroDoLimite() {
  var cache = CacheService.getScriptCache();
  var chave = 'cliques-' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(chave) || 0) + 1;
  cache.put(chave, String(n), 120);
  return n <= LIMITE_POR_MINUTO;
}

function abaCliques() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  // A planilha criada pela API nasce no fuso do Pacífico: a hora tem que aparecer na de Brasília.
  if (planilha.getSpreadsheetTimeZone() !== FUSO) planilha.setSpreadsheetTimeZone(FUSO);
  var aba = planilha.getSheetByName(ABA);
  if (!aba) {
    aba = planilha.insertSheet(ABA);
    aba.appendRow(CABECALHO);
    aba.setFrozenRows(1);
  }
  return aba;
}

// Rodar UMA vez no editor (Executar): é aqui que o Google pede a autorização. Cria a aba "cliques",
// a aba "resumo" com as contagens e o gatilho mensal da limpeza.
function prepararPlanilha() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var primeira = planilha.getSheets()[0];
  if (!planilha.getSheetByName(ABA) && primeira.getLastRow() === 0) {
    primeira.setName(ABA);
    primeira.appendRow(CABECALHO);
    primeira.setFrozenRows(1);
  }
  abaCliques();
  var resumo = planilha.getSheetByName('resumo') || planilha.insertSheet('resumo');
  resumo.getRange('A1').setFormula(contagem('C', 'Código'));
  resumo.getRange('D1').setFormula(contagem('B', 'Rede'));
  resumo.getRange('G1').setFormula(contagem('E', 'Área'));
  var gatilhos = ScriptApp.getProjectTriggers();
  for (var i = 0; i < gatilhos.length; i++) {
    if (gatilhos[i].getHandlerFunction() === 'limparAntigos') ScriptApp.deleteTrigger(gatilhos[i]);
  }
  ScriptApp.newTrigger('limparAntigos').timeBased().onMonthDay(1).atHour(4).create();
}

function contagem(coluna, rotulo) {
  return '=QUERY(cliques!A:G,"select ' + coluna + ', count(A) where ' + coluna + ' is not null group by ' + coluna +
    ' order by count(A) desc label ' + coluna + " '" + rotulo + "', count(A) 'Cliques'\",1)";
}

// Gatilho mensal: apaga os cliques com mais de 12 meses. As linhas entram em ordem de data, então
// basta contar as do começo.
function limparAntigos() {
  var aba = abaCliques();
  if (aba.getLastRow() < 2) return;
  var limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_DE_GUARDA);
  var datas = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues();
  var velhas = 0;
  while (velhas < datas.length && new Date(datas[velhas][0]).getTime() < limite.getTime()) velhas++;
  if (velhas) aba.deleteRows(2, velhas);
}
