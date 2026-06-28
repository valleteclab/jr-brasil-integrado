# Design — NFC-e (modelo 65) direto na SEFAZ (foco BA)

> Próximo passo após a NF-e 55 direta. Objetivo: emitir **NFC-e (cupom, modelo 65)** direto nos web
> services, sem API paga, reaproveitando a infra de NF-e 55 (SOAP 1.2, mTLS A1, XMLDSig RSA-SHA1).
> Pesquisa técnica completa: ver histórico/levantamento (2026-06-28). Este doc é o plano acionável.

## 1. O que MUDA vs NF-e 55 (e o que reaproveita)

**Reaproveita 100%:** assinatura (`sign.ts` RSA-SHA1), SOAP 1.2 + mTLS (`soap.ts`), montagem da chave
(`chave.ts` — muda só `mod`=65), eventos (cancelamento 110111 / CC-e), numeração por ambiente.

**Muda / é novo:**
- **Autorizador:** a **BA delega NFC-e para a SVRS** (Sefaz Virtual RS) — host `nfce.svrs.rs.gov.br`
  (≠ `nfe.svrs` e ≠ ambiente próprio BA da NF-e 55). Endpoints novos.
- **`ide`:** `mod`=65, `tpImp`=4, `tpEmis`=1 (normal) / 9 (contingência offline), `finNFe`=1,
  `indFinal`=1, `indPres`=1 (presencial) ou 4 (entrega domicílio).
- **`dest` opcional:** omitido na venda sem identificação; **obrigatório** se total > R$ 10.000 ou
  `indPres`=4. **Nunca enviar `IE` do dest**; se houver dest, `indIEDest`=9. (Atenção: vedação de
  NFC-e para CNPJ em 2026 — confirmar no go-live.)
- **Grupos VEDADOS (bloquear no gerador):** interestadual/DIFAL, `transp` com veículo (usar
  `modFrete`=9), `cobr`/`fat`/duplicata, `exporta`, **`IPI`**, `II`.
- **`infNFeSupl` (NOVO, obrigatório):** filho de `<NFe>`, **entre `<infNFe>` e `<Signature>`**.
  Contém `<qrCode>` (CDATA, URL completa) e `<urlChave>` (URL base de consulta).
- **DANFCE:** bobina ~80mm (não A4), com QR Code central. A lib `nfe-danfe-pdf` **já tem**
  `pdf-NFCe` — reaproveitar como fizemos no DANFE.

## 2. QR Code (NT 2015.002 v2) — fórmula

```
qs     = "chNFe=" + CHAVE44 + "&nVersao=2&tpAmb=" + TPAMB + "&cIdToken=" + ID_CSC6   // idCSC c/ zeros à esq.
hash   = UPPER( HEX( SHA1( utf8( qs + CSC ) ) ) )      // CSC = valor secreto, colado no fim; 40 chars
qrUrl  = URL_QRCODE_UF + "?" + qs + "&cHashQRCode=" + hash
```
- **CSC nunca aparece na URL** (só o `cIdToken`/idCSC e o hash).
- Contingência offline (`tpEmis=9`): inserir entre `tpAmb` e `cIdToken` os pares
  `dhEmi`(hex ASCII), `vNF`(dec), `vICMS`(dec), `digVal`(hex ASCII do DigestValue) — e incluí-los no hash.
- **BA — URLs (tratar como configuráveis; reconfirmar no PDF de config do emissor SEFAZ-BA):**
  - `URL_QRCODE` prod: `https://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx`
  - `URL_QRCODE` homolog: `https://hnfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx`
  - `urlChave` prod: `www.sefaz.ba.gov.br/nfce/consulta`
  - `urlChave` homolog: `http://hinternet.sefaz.ba.gov.br/nfce/consulta`

## 3. Endpoints SVRS para NFC-e (host `nfce.svrs.rs.gov.br`)

Produção: `https://nfce.svrs.rs.gov.br/ws/<servico>` · Homologação:
`https://nfce-homologacao.svrs.rs.gov.br/ws/<servico>` — serviços: `NfeAutorizacao/NFeAutorizacao4`,
`NfeRetAutorizacao/NFeRetAutorizacao4`, `NfeConsulta/NfeConsulta4`, `NfeStatusServico/NfeStatusServico4`,
`nfeinutilizacao/nfeinutilizacao4`, `recepcaoevento/recepcaoevento4`. (Sem ConsultaCadastro p/ 65.)

## 4. O que JÁ temos no código

- `endpoints.ts` — SVRS de NF-e (`nfe.svrs`). **Adicionar** mapa SVRS de NFC-e (`nfce.svrs`) por ambiente.
- `ConfiguracaoFiscal` — **já tem `nfceIdCsc` + `nfceCscCriptografado`** (e `cscId`/`cscTokenCriptografado`).
  `getFiscalRuntimeConfig` já expõe `nfceIdCsc` e descriptografa o CSC. Reaproveitar.
- `acbr-provider.ts` — já emite NFC-e via ACBr (referência de regras: `isNfce`, idDest=1, indFinal=1).
- `nfe-xml.ts` — base do XML; adaptar para 65 (ou um `buildNfceXml` irmão).
- Lib `nfe-danfe-pdf` — `pdf-NFCe` para o DANFCE.

## 5. Plano de implementação

1. **endpoints.ts:** `NFCE_SVRS_PROD/HOM` + resolver por modelo (65 → SVRS NFC-e; 55 → atual).
2. **nfce-xml.ts** (ou flag `mod` no `nfe-xml.ts`): `ide` de 65, `dest` opcional, **bloquear grupos
   vedados**, e montar **`infNFeSupl`** com o QR Code.
3. **qrcode-nfce.ts:** função do hash SHA-1 (`qs + CSC`) + URL por UF/ambiente.
4. **sefaz-provider.ts:** rotear `emit` para o caminho 65 (endpoints SVRS, XML 65, CSC do config).
5. **danfce-pdf/** (irmão do `danfe-pdf/`): fork da `pdf-NFCe` da lib, fontes built-in, dados do QR.
6. **Validar** contra XSD 4.00 (mesmo procedimento do RUNBOOK), **testar em homologação SVRS**, depois
   produção controlada.

## 6. PRÉ-REQUISITOS OPERACIONAIS (bloqueiam o go-live — dependem do usuário)

1. **Credenciamento NFC-e** na SEFAZ-BA (separado da NF-e): portal
   `https://efisc.sefaz.ba.gov.br/credenciamento/` (+ requerimento a `suportenfe@sefaz.ba.gov.br`).
2. **Gerar o CSC** (homologação E produção) no portal `https://nfe.sefaz.ba.gov.br/` → "Solicitar CSC",
   e **cadastrar no sistema** (campos `nfceIdCsc` + CSC). **Hoje NENHUMA empresa tem CSC cadastrado** —
   sem CSC não há QR Code, logo não há NFC-e.

## 7. Pontos a reconfirmar no go-live (ver "Ressalvas" do levantamento)

- `nVersao` 2 vs 3 (NT 2025.001 trouxe v3); URLs do `qrcode.aspx`/`urlChave` da BA (mudaram em 2019);
  vedação de NFC-e para CNPJ (2026); posição de `infNFeSupl` no XSD que usarmos.

Fontes no levantamento: Portal NF-e (webServices, Manual DANFCE+QR v6.0), MOC, SVRS, SEFAZ-BA, Oobj
(QR/CSC), FlexDocs. Procedimento de alteração: `docs/RUNBOOK-LEIAUTE-FISCAL.md`.
