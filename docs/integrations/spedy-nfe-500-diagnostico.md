# Spedy — NF-e de produto retorna HTTP 500 (diagnóstico)

> **Status:** bloqueio do lado da Spedy (sandbox). Nosso payload está correto e
> conforme o schema. Abrir chamado com a Spedy (texto pronto no final).

## Sintoma observado pelo cliente
Nenhuma NF-e de produto autorizada. Toda emissão termina em rejeição:

```
SPD003 - Campo 'retirada, entrega, autXML, det' é obrigatório ou está fora de
ordem em 'infNFe' (encontrado: 'total').
```

Ou seja, o XML que a Spedy gera **não contém o bloco `det` (os itens)**.

## O que testamos (sandbox `https://sandbox-api.spedy.com.br/v1`)
Empresa `2f467790-ac32-48ce-9f51-b4250022bef4`, CNPJ `15130181000148`
(VALLETECLAB EMPREENDIMENTOS LTDA), `regimeNormal`, IE `100063019`,
certificado A1 **ativo** (validade 2026-09-19), município Luís Eduardo
Magalhães/BA (IBGE 2919553). Settings com `productInvoice` configurado
(série "1", `environmentType` "development", `nextNumber` 1).

| Requisição | Resultado |
|---|---|
| `GET /companies` | 200 (auth OK) |
| `GET /product-invoices` | 200 (leitura OK) |
| `POST /product-invoices` com `items: []` | **200** → nota enfileirada → rejeitada com mensagem de validação real (ex.: "Endereço do cliente é obrigatório" / SPD003 sem `det` por não ter itens) |
| `POST /product-invoices` com **1 item** (qualquer um) | **HTTP 500, corpo vazio, sem `id`** |

Variações testadas que **todas** dão 500 com 1 item:
- Exemplos **A (CSOSN 400)** e **B (CST 00)** verbatim da documentação da Spedy.
- Item mínimo **sem** objeto `taxes`.
- Com/sem `issuedOn`, `makeupTotal`; `cfop` como inteiro e como string.
- Com `status`/`issueType`/`purposeType`/`printingType`/`series` preenchidos.
- CSOSN 102/400 e CST 00; `rate` em percentual e em fração.

## Evidência decisiva de que é falha no servidor (não no payload)
1. **CFOP inválido (`999999`) → HTTP 500, não 400.** Se fosse problema de
   payload/validação, esperaríamos 400 com `errors[]` ou rejeição `SPD###`.
   O servidor falha **antes** de validar o item.
2. **`printingType` inválido → HTTP 400 com mensagem JSON clara** ("Error
   converting value 'noPrint' to type ... PrintingType"). Ou seja, o servidor
   **sabe** retornar 400 para erro de desserialização de campo top-level — mas
   estoura **500 sem corpo** ao processar um item válido (exceção interna).
3. **`items: []` valida normalmente** (retorna o erro de endereço), provando
   que auth, settings, certificado e o pipeline de validação funcionam — a
   falha é isolada ao **processamento de itens**.
4. **Leitura saudável** (`GET /product-invoices` = 200). O 500 é exclusivo do
   caminho de criação com itens.

Trace-ids (x-trace-id) capturados: `ef9b46d1a4913b032cfa95078425f92d`,
`af934657cc0d4c76518459f14ecebc08`, `7bfbf9ee958980c840829e814ba259b1`.

## Não há pré-requisito documentado faltando
A doc lista pré-requisitos onde existem: NFC-e exige `consumerInvoice.tokenId`+`csc`;
NFS-e exige o município em `GET /service-invoices/cities`. Para **NF-e de
produto não há** endpoint de credenciamento, cadastro prévio de CFOP/produto,
`economicActivity` obrigatória, nem flag de settings além do bloco
`productInvoice` (já configurado). `CreateProductInvoiceDto` tem
`required: ['isFinalCustomer']` apenas — que enviamos.

## Correções de payload já aplicadas (necessárias quando o item processar)
Auditoria contra o swagger (`SefazInvoiceItemDto`, `additionalProperties:false`)
encontrou e corrigimos (commit no provider `spedy-provider.ts`):
- `item.unitTax`: era número; é **string** (unidade tributável, ex. "UN").
- `item.unitTaxAmount`: era o tributo; é o **preço unitário** (vUnTrib).
- ICMS-ST: `stRetention`/`baseStRetention` → `stRetentionAmount`/`baseStRetentionAmount`.
- Pagamento NF-e: enum `SefazInvoicePaymentMethod` (`money`/`billetBanking`),
  separado do enum de `/orders` (`cash`/`billetBank`).
- Endereço do destinatário: `zipCode`→`postalCode`, `complement`→`additionalInformation`,
  UF dentro de `city.state`, `city` com code+name+state.

## Texto do chamado para a Spedy (PT-BR)
> **Assunto:** [Sandbox] POST /v1/product-invoices retorna HTTP 500 com corpo vazio para qualquer item — possível defeito no servidor
>
> Olá, equipe Spedy. Estamos integrando a emissão de NF-e de produto no ambiente
> sandbox (`https://sandbox-api.spedy.com.br/v1`) e o endpoint
> `POST /v1/product-invoices` retorna **HTTP 500 com corpo vazio** sempre que o
> array `items` contém **qualquer** item. A conta está corretamente configurada
> e as demais operações funcionam.
>
> **Empresa:** id `2f467790-ac32-48ce-9f51-b4250022bef4`, CNPJ `15130181000148`,
> regime `regimeNormal`, IE `100063019`, certificado A1 ativo (validade
> 2026-09-19), município Luís Eduardo Magalhães/BA (IBGE 2919553). Settings com
> `productInvoice`: série "1", `environmentType` "development", `nextNumber` 1.
>
> **Reprodução mínima e determinística:**
> - `GET /v1/companies` → 200; `GET /v1/product-invoices` → 200.
> - `POST /v1/product-invoices` com `items: []` → 200, nota enfileirada e depois
>   rejeitada normalmente (validação funciona).
> - `POST /v1/product-invoices` com 1 item → **HTTP 500, corpo vazio**, sem `id`.
>
> Testamos os exemplos A (CSOSN 400) e B (CST 00) da própria documentação, item
> mínimo sem `taxes`, com/sem `issuedOn`/`makeupTotal`, `cfop` inteiro e string,
> e com `status`/`issueType`/`purposeType`/`printingType`/`series` preenchidos.
> Todos retornam 500.
>
> **Evidência de que é falha no servidor:** ao enviar um item com `cfop`
> propositalmente inválido (`999999`), esperaríamos 400/rejeição `SPD###`; em vez
> disso recebemos **500** — o servidor falha antes de validar o item. Com
> `items: []` a validação roda normalmente, confirmando que a falha está no
> processamento dos itens.
>
> **Trace-ids (x-trace-id):** `ef9b46d1a4913b032cfa95078425f92d`,
> `af934657cc0d4c76518459f14ecebc08`, `7bfbf9ee958980c840829e814ba259b1`.
>
> Poderiam verificar os logs do servidor para esses trace-ids e confirmar se há
> exceção não tratada no processamento de itens da NF-e de produto neste
> ambiente/empresa? Há algum pré-requisito de habilitação de NF-e específico
> para BA/sandbox não documentado? Obrigado.
