# Spedy API — Resumo de integração (provedor fiscal)

Fonte: https://api.spedy.com.br/llms.txt — referência para implementar o provedor `SPEDY`.

## Ambientes e auth
- Produção: `https://api.spedy.com.br/v1`
- Sandbox/Homologação: `https://sandbox-api.spedy.com.br/v1`
- Header obrigatório: `X-Api-Key: <chave da empresa>` (no nosso sistema = token da ConfiguracaoFiscal, já descriptografado em `ProviderContext.token`).
- Sem envelope: objetos retornam diretamente. Listas: `{ items, totalCount, pageCount, pageSize, hasNext }`.
- Booleano (cancelar/excluir): `{ "success": true }`.
- Rate limit: 60/min, 5/s por chave; 429 quando excede.

## Modelos → endpoints (modo completo)
- NF-e (productInvoice): `POST /v1/product-invoices`
- NFC-e (consumerInvoice): `POST /v1/consumer-invoices`
- NFS-e (serviceInvoice): `POST /v1/service-invoices`
- Consultar: `GET /v1/{model}/{id}` ; Cancelar: `DELETE /v1/{model}/{id}` `{ "justification": ">=15 chars" }`
- Carta de correção (só NF-e): `POST /v1/product-invoices/{id}/corrections` `{ "description": ">=15 chars" }`
- Reemitir (após correção): `POST /v1/{model}/{id}/issue`
- Consultar SEFAZ: `POST /v1/{model}/{id}/check-status`
- XML/PDF (sem X-Api-Key): `GET /v1/{model}/{id}/xml` e `/pdf`

## Emissão é assíncrona
- Resposta inicial traz `status: enqueued|created` e `id` (UUID). Guardar o `id` em `NotaFiscal.providerRef`.
- Estados finais: `authorized`, `rejected`, `canceled`, `denied`.
- Polling: `GET /v1/{model}/{id}` a cada 5-10s até estado final (tempo médio < 10s). Rejeição: `processingDetail.message` + `processingDetail.code` (prefixo `SPD` = validação da Spedy).
- `integrationId` (máx 36): idempotência + correção de rejeitada (reenviar POST com mesmo integrationId). Usar o ID do pedido/OS.

## Cidade
- Por IBGE: `"city": { "code": "3550308" }` (preferir) OU por nome: `"city": { "name": "São Paulo", "state": "SP" }`.

## Regime (company.taxRegime)
- `simplesNacional`, `simplesNacionalExcessoSublimite`, `simplesNacionalMEI`, `regimeNormal` (Lucro Presumido/Real).

## Mapeamento de status (Spedy → nosso StatusNotaFiscal)
- `authorized` → AUTORIZADA ; `rejected` → REJEITADA ; `canceled` → CANCELADA ; `denied` → REJEITADA (denegada) ;
- `created`/`enqueued`/`received`/`inContingent` → PROCESSANDO ; `disabled` → CANCELADA ; `removed` → CANCELADA.

## NF-e / NFC-e — corpo (modo completo)
Campos base: `isFinalCustomer`, `operationType` ("outgoing"), `destination` ("internal"|"interstate"|"international"),
`presenceType` ("presence"|"internet"|...), `operationNature`, `sendEmailToCustomer`, `receiver` (name, federalTaxNumber só dígitos, email, address), `items[]`, `payments[]`, `total`.
NFC-e: `isFinalCustomer:true`, `destination:"internal"` sempre, `presenceType:"presence"|"internet"`, receiver.federalTaxNumber opcional.

Item:
```
{ code, description, ncm, cfop (number, ex 5102), unit, quantity, unitAmount, totalAmount,
  unitTax, quantityTax, unitTaxAmount, makeupTotal:true,
  taxes: { icms, pis, cofins } }
```

### IMPORTANTE — unidade das alíquotas (`rate`)
- `icms.rate` em **percentual** (ex.: `18.0` para 18%).
- `pis.rate` e `cofins.rate` em **fração** (ex.: `0.0065` para 0,65%; `0.03` para 3%).
- `total.issRate` (NFS-e) em **fração** (ex.: `0.05` para 5%).

### taxes.icms
- Simples Nacional → `{ origin, csosn }` (ex.: 102, 400). csosn 101 → `snCreditRate`+`snCreditAmount`; 500 → `stRetentionAmount`+`baseStRetentionAmount`.
- Regime Normal → `{ origin, cst (0,20,40,41,50,60,70), baseTaxModality:3, baseTax, baseTaxReduction, rate (%), amount }`.
- `origin`: 0 nacional, 1 estrangeiro import direta, 2 estrangeiro mercado interno.
### taxes.pis / taxes.cofins
- `{ cst, baseTax, rate (fração), amount }`. Simples: cst 7 (isento). Normal: cst 1 (Presumido) ou 70 (Real). Pode enviar só `rate` (Spedy calcula amount).

`payments[]`: `{ method, amount }` (method ex.: "pix", "creditCard", "billetBank", "cash"...).
`total`: `{ invoiceAmount, productAmount, icmsBaseTax?, icmsAmount?, pisAmount?, cofinsAmount? }`.

## NFS-e — corpo
```
{ effectiveDate, status:"enqueued", sendEmailToCustomer, description (discriminação detalhada),
  federalServiceCode (LC116, ex "1.07"), cityServiceCode, taxationType ("taxationInMunicipality"|...),
  receiver { name, federalTaxNumber, email, address },
  total { invoiceAmount, issRate (fração), issAmount, issWithheld, pisRate?, pisAmount?, cofinsRate?, cofinsAmount?, irRate?, irAmount?, netAmount? } }
```
Antes de emitir NFS-e, consultar `GET /v1/service-invoices/cities?code=<ibge>` para saber campos obrigatórios do município (`provider.options`).

## Webhooks (escopo: conta)
- `POST /v1/webhooks` `{ event:"invoice.status_changed", url }`.
- Payload: `{ id, event, data: { id, status, model, number, accessKey?, issuedOn, amount, authorization:{date,protocol}, processingDetail:{status,message,code}, company:{federalTaxNumber}, order:{...} } }`.
- Eventos: `invoice.status_changed` (cobre tudo), `invoice.authorized`, `invoice.rejected`, `invoice.canceled`.
- Identificar a nota pelo `data.id` (== providerRef salvo na emissão).

## Cancelamento / correção
- `DELETE /v1/{model}/{id}` `{ justification }` (>=15). NFC-e prazo ~30min; NF-e ~24h; NFS-e depende da prefeitura.
- CC-e só NF-e, não altera emitente/destinatário/valores/impostos.
