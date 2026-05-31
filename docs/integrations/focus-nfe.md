# Focus NFe — provedor fiscal (NF-e, NFC-e e NFS-e)

Implementação dedicada em `src/domains/fiscal/providers/focus-nfe-provider.ts`,
registrada no factory para `ProvedorFiscal.FOCUS_NFE`. Codificada conforme a
documentação oficial (https://doc.focusnfe.com.br) — **ainda não validada ao vivo**
(falta token de sandbox).

## Configuração (Configurações › Fiscal)
- **Provedor**: `FOCUS_NFE`.
- **Token**: a chave de API da Focus (gravada criptografada em `tokenCriptografado`).
- **baseUrl**: opcional. Se vazio, usa por ambiente:
  - Produção: `https://api.focusnfe.com.br/v2`
  - Homologação: `https://homologacao.focusnfe.com.br/v2`
- Os dados do **emitente** (endereço, IE, regime) vêm do **cadastro da empresa na
  Focus**; enviamos apenas `cnpj_emitente` para identificá-lo.

## Como funciona
- **Autenticação**: HTTP Basic com o token como usuário e senha em branco.
- **Referência (`ref`)**: cada documento é identificado por uma ref determinística
  `{modelo}-{serie}-{numero}` (idempotente em retentativas), enviada na query string
  e guardada em `NotaFiscal.providerRef` para consulta/cancelamento/correção.
- **NF-e e NFS-e são assíncronas**: o POST retorna `processando_autorizacao` (202) e
  o provider faz **polling** em `GET /v2/{recurso}/{ref}` (5 tentativas, 3s) até o
  estado final.
- **NFC-e é síncrona**: autoriza/rejeita no próprio POST (sem polling). Envia
  `formas_pagamento`, `presenca_comprador` e `local_destino` interno.

## Mapeamento de tributos
- **NF-e/NFC-e** (itens): `icms_origem`, `icms_situacao_tributaria` (CSOSN no Simples;
  CST + base/alíquota/valor no Regime Normal), `pis_*`/`cofins_*` por CST.
- **NFS-e**: blocos `prestador` (cnpj, inscricao_municipal, codigo_municipio),
  `tomador` (cnpj/cpf, razao_social, email, endereco) e `servico`
  (`valor_servicos`, `item_lista_servico`, `aliquota` em fração, `iss_retido`,
  retenções federais `valor_ir/pis/cofins/csll/inss`).

## Status
- `autorizado` → AUTORIZADA · `processando_autorizacao` → PROCESSANDO
- `erro_autorizacao`/`rejeitado` → REJEITADA · `denegado` → DENEGADA · `cancelado` → CANCELADA
- XML/DANFE: paths relativos da Focus são convertidos em URL absoluta.

## Pendente
- Validação ao vivo contra o sandbox da Focus com token real (emitir os três modelos
  e conferir XML/DANFE). O fluxo foi validado apenas com `fetch` mockado.
