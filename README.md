# Central de Pós · Polo Anhanguera

Site estático (GitHub Pages) da Central de Pós.

## Links curtos

`/instagram`, `/facebook`, `/tiktok`, `/kwai` e `/youtube` abrem o WhatsApp do atendimento com a mensagem pronta e o código de origem.

- Sem parâmetro, o código é o da bio da rede (`IG00`, `FB00`, `TT00`, `KW00`, `YT00`).
- `?c=KW07` troca para o código do vídeo. Também valem os códigos de palavra-chave (`IGPOS`, `FBMBA` etc.).
- Com `registroCliques` preenchido em `fonte/config.json`, cada clique é enviado ao Web App do Apps Script sem segurar o redirecionamento.

As páginas são geradas: não edite `*/index.html` dos links à mão.

```
node ferramentas/gerar.mjs          # gera as páginas a partir de fonte/
node --test "teste/*.test.mjs"      # testes
```
