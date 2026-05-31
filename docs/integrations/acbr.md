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

## Validado ao vivo (Sandbox, com certificado A1)
- ✅ OAuth `client_credentials` (escopos `nfe nfce nfse empresa cnpj conta`).
- ✅ `testConnection` autenticado (`GET /empresas`).
- ✅ Resolução de provedor NFS-e: Itabuna detectada como **PadrãoNacional → `nacional`**.
- ✅ **NF-e AUTORIZADA pela SEFAZ-BA** (homologação): status 100 "Autorizado o uso da
  NF-e", XML/DANFE baixados. Fluxo de ponta a ponta pelo nosso provider.
- ⏳ **NFS-e (Ambiente Nacional)**: payload aceito (cTribNac e totTrib válidos), mas
  retorna *"IM do emitente prestador não está autorizado a emitir NFS-e ... CNC NFS-e do
  município"* — pendência de **credenciamento municipal** da empresa no Sistema Nacional
  NFS-e (não é problema de código).

## Aprendizados da emissão ao vivo (correções aplicadas)
- **`autXML`**: a SEFAZ-BA exige o Grupo de Autorização de download do XML. Enviamos o
  CNPJ da SEFAZ-BA (`13937073000156`) quando a UF do emitente é BA (`UF_AUTXML_CNPJ`).
- **`indFinal`**: destinatário não-contribuinte (sem IE) exige `indFinal=1` (consumidor
  final) — senão "Operação com não contribuinte deve indicar operação com consumidor final".
- **`totTrib`**: o DPS nacional exige `valores.trib.totTrib` (federal/estadual/municipal).
- **`cTribNac`**: derivado do LC116 como `item(2)+subitem(2)+desdobro(2)` (ex.: `"1.01"`
  → `"010101"`). Best-effort — confirmar desdobros específicos por serviço.

## Pendências / caveats (revisar antes de produção)
- **NFS-e nacional**: credenciar a IM da empresa no Sistema Nacional NFS-e do município.
- **Download de XML/PDF**: os endpoints exigem Bearer; guardamos a URL da API em
  `xmlUrl`/`danfeUrl` e o `providerRef` (id) para download server-side futuro. NFS-e
  também expõe `link_url` público quando disponível.
- **Segurança**: nunca commitar client_secret. Ele fica só no banco, criptografado.
