# ACBr API — provedor fiscal (NF-e, NFC-e e NFS-e)

Implementação dedicada em `src/domains/fiscal/providers/acbr-provider.ts`, registrada
no factory para `ProvedorFiscal.ACBR`. Doc oficial: https://dev.acbr.api.br/docs.

## Configuração (Configurações › Fiscal)
- **Provedor**: `ACBR`.
- **Client ID** → campo "Client ID" (gravado em `cscId`).
- **Client Secret** → campo "Client Secret" (gravado **criptografado** em `tokenCriptografado`).
- **URL base**: opcional — derivada do ambiente:
  - Produção: `https://prod.acbr.api.br`
  - Homologação: `https://hom.acbr.api.br`
- Credenciais **Sandbox** só funcionam em homologação; **Produção** funciona nos dois.
- **Certificado A1**: enviado pela própria tela (botão "Enviar certificado") via
  `PUT /empresas/{cnpj}/certificado`. A empresa precisa estar cadastrada na ACBr.

## Como funciona
- **OAuth 2.0 `client_credentials`**: o provider troca client_id/secret por um
  `access_token` (Bearer), **cacheado em memória** por ambiente+client_id e renovado
  perto do vencimento (~30 dias). O endpoint de token tem limite de 10 req/min.
- **Payload no nível do XML da SEFAZ** (compatível com Nuvem Fiscal):
  - NF-e/NFC-e: `infNFe` (`ide`/`emit`/`dest`/`det[]`/`total`/`pag`), mod 55/65.
  - NFS-e: `infDPS` (`prest`/`toma`/`serv`/`valores`) via `POST /nfse/dps` (padrão
    nacional; `POST /nfse` está descontinuado).
- **Provedor NFS-e** (`nacional` vs `padrao`): resolvido em tempo de emissão consultando
  `GET /nfse/cidades/{ibge}` (PadraoNacional → `nacional`; senão `padrao`).
- **Acompanhamento por status**: após o POST, consulta `GET /{recurso}/{id}` enquanto
  `pendente`/`processando`.
- **Tributos**: Simples → `ICMSSN102` (CSOSN) + PIS/COFINS NT; Normal → `ICMS00` (CST +
  base/alíquota/valor) + PIS/COFINS Aliq.
- **Cota/limite**: trata `402` (créditos/cota) e `429` (Retry-After).

## Status
- NF-e/NFC-e: `autorizado`→AUTORIZADA · `rejeitado`/`erro`→REJEITADA · `denegado`→DENEGADA ·
  `cancelado`→CANCELADA · `pendente`/`processando`→PROCESSANDO.
- NFS-e: `autorizada`→AUTORIZADA · `negada`→DENEGADA · `cancelada`/`substituida`→CANCELADA ·
  `erro`→REJEITADA · `processando`→PROCESSANDO.

## Validado ao vivo (Sandbox)
- ✅ OAuth `client_credentials` (escopos `nfe nfce nfse empresa cnpj conta`).
- ✅ `testConnection` autenticado (`GET /empresas`) — empresa VALLETECLAB já cadastrada.
- ✅ Resolução de provedor NFS-e: Itabuna detectada como **PadrãoNacional → `nacional`**.
- ✅ Shapes dos payloads NF-e (mod 55), NFC-e (mod 65) e NFS-e/DPS.

## Pendências / caveats (revisar antes de produção)
- **Emissão real exige certificado A1** cadastrado na ACBr — não validei autorização de
  documento ao vivo (sem .pfx). Faça o upload e teste em homologação.
- **`cServ.cTribNac`** (código nacional de tributação, 6 dígitos) é derivado do item
  LC116 como best-effort (`"1.01"` → `"101000"`). **Confirmar** o código correto por
  serviço/município antes de emitir em produção.
- **Download de XML/PDF**: os endpoints exigem Bearer; guardamos a URL da API em
  `xmlUrl`/`danfeUrl` e o `providerRef` (id) para download server-side futuro. NFS-e
  também expõe `link_url` público quando disponível.
- **Segurança**: nunca commitar client_secret. Ele fica só no banco, criptografado.
