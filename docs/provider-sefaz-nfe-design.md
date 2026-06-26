# Design — Provider SEFAZ (NF-e modelo 55 direto na SEFAZ) — sem API paga

**Status:** estudo / desenho. Decisão de abordagem: **SOAP direto na SEFAZ**, autorizadora
inicial **SVRS** (multi-estado). Reaproveita a infraestrutura de certificado + assinatura já
validada na NFS-e nacional (`scripts/nfse-nacional-poc.ts`, `providers/nacional-provider.ts`).

## Objetivo
Emitir **NF-e (modelo 55) direto nos web services das SEFAZ**, sem intermediário e **sem API
paga**, do mesmo jeito que a NFS-e passou a ser emitida direto na SEFIN Nacional. A NF-e **não
tem** um "Emissor Nacional REST" equivalente ao da NFS-e: cada UF é autorizadora (mais
SVRS/SVAN/SVC de contingência), o protocolo é **SOAP/XML** e o leiaute é o **4.00**.

Convivência com o que já existe:
- **NFS-e** → NACIONAL (direto, como hoje) / ACBr fallback.
- **NF-e (55) e NFC-e (65)** → hoje ACBr. Passam a ter o novo provider **SEFAZ** (direto) como
  alternativa, mantendo ACBr/Focus como fallback configurável.

---

## 1. A diferença em relação à NFS-e nacional (o que muda)

| Aspecto | NFS-e Nacional (feito) | NF-e 55 (este design) |
|---|---|---|
| Protocolo | REST/JSON | **SOAP 1.2 / XML** (endpoints `.asmx`) |
| Endpoint | 1 nacional (SEFIN) | **Por autorizadora** (SVRS, SP, MG, …) |
| Payload | DPS (XML pequeno) | **Leiaute NF-e 4.00** (`infNFe`: ide/emit/dest/det/total/transp/pag/infAdic) |
| Chave | chNFSe (50) — vem da SEFIN | **chNFe (44)** — **montada e validada por nós** (cNF + cDV mod 11) |
| Autenticação | mTLS A1 + XMLDSig | **igual**: cert A1 + XMLDSig no XML + HTTPS com cert cliente |
| Autorização | síncrona | **síncrona** (`indSinc=1`) ou assíncrona (lote + consulta recibo) |
| Eventos | substituição | **cancelamento, CC-e, inutilização** |

**Reaproveitável direto da NFS-e (a parte difícil já está pronta):** guarda criptografada do A1
(`CertificadoDigital`, `carregarCertificado()`), leitura PKCS12 (`node-forge`), assinatura
XMLDSig enveloped + C14N + RSA-SHA256 (`xml-crypto`), HTTPS com cert de cliente
(`https.request` com `pfx`+`passphrase`), motor tributário (`tax-engine.ts` — já calcula ICMS,
ICMS-ST, IPI, PIS/COFINS, FCP **e IBS/CBS/IS** da Reforma), e o modelo normalizado
(`NormalizedFiscalDocument`) que já prevê `modelo: "NFE"`, NCM, CFOP, CEST.

---

## 2. SefazFiscalProvider (implementa `FiscalProvider`)

`id = "SEFAZ"` (novo valor do enum `ProvedorFiscal`). Só NF-e/NFC-e (NFSE → erro "provider
emite apenas NF-e/NFC-e"). Implementa o contrato existente em `providers/types.ts` —
`emit/cancel/correct/queryStatus/testConnection/downloadDocument` — então o roteamento e a
camada de emissão **não mudam de contrato**.

- **emit** (NF-e 55, síncrono):
  1. `buildChaveAcesso(input)` — monta a chave de 44 dígitos: `cUF + AAMM + CNPJ + mod(55) +
     série + nNF + tpEmis + cNF(8) + cDV(mod 11)`. `cNF` aleatório por nota; `cDV` calculado.
  2. `buildNfeXml(input, computed)` — serializa `infNFe` 4.00 a partir do `NormalizedFiscalDocument`
     + tributos por item (`ComputedItemTax` já vem pronto do `tax-engine`). Grupos: `ide`
     (com `cUF`, `cNF`, `natOp`, `mod=55`, `serie`, `nNF`, `dhEmi`, `tpNF`, `idDest`, `cMunFG`,
     `tpImp`, `tpEmis`, `cDV`, `tpAmb`, `finNFe`, `indFinal`, `indPres`), `emit`, `dest`,
     `det[]` (`prod` + `imposto`: ICMS/IPI/PIS/COFINS, e o grupo **IBSCBS** da Reforma quando
     vigente), `total` (`ICMSTot`), `transp`, `pag`, `infAdic`.
  3. `assinarNfe(xml, cert)` — XMLDSig enveloped, reference `#<infNFe.Id>` (Id = `"NFe"+chave`),
     C14N + RSA-SHA256. **Mesma pipeline da PoC**, mudando só o XPath da reference para
     `infNFe`. Assinatura como filha de `<NFe>`, após `<infNFe>`.
  4. `enviarNFe` — monta o envelope SOAP `nfeAutorizacaoLote` com `enviNFe` (`indSinc=1`) e faz
     **POST HTTPS com cert de cliente** ao `NFeAutorizacao4` da autorizadora.
  5. parse → se `cStat=100` (Autorizada): extrai `protNFe` (nProt), monta o **nfeProc**
     (NFe + protNFe) e devolve `EmitResult { status: AUTORIZADO, chaveAcesso, protocolo, xml }`.
     `103/104` (lote recebido/processado) trata o assíncrono via `NFeRetAutorizacao4`.
     Demais `cStat` → `REJEITADO`/`ERRO` com `motivo = xMotivo`.
- **cancel**: evento **110111** (Cancelamento) via `RecepcaoEvento4` (XML de evento assinado,
  exige `nProt` e `xJust` ≥ 15 chars). `cStat=135/155` = homologado.
- **correct**: evento **110110** (Carta de Correção / CC-e) via `RecepcaoEvento4` — diferente
  da NFS-e, a NF-e **tem** CC-e (`sequencia` + texto da correção ≥ 15 chars). Implementar de fato
  (não retornar não-suportado).
- **queryStatus**: `NFeConsultaProtocolo4` (consChNFe) → status atual + protocolo.
- **testConnection**: `NFeStatusServico4` (`consStatServ`) → `cStat=107` (em operação). Leve,
  não emite nada — encaixa no `testConnection?` opcional do contrato.
- **downloadDocument**: `"xml"` = devolve o `nfeProc` armazenado; `"pdf"` = **DANFE** gerado por
  nós (ver §6). NF-e não tem "URL pública" da SEFAZ, então o download é server-side.
- **inutilização** (numeração pulada): `NFeInutilizacao4`. Não está no contrato `FiscalProvider`
  atual — expor como método extra do provider e chamar a partir de um use-case fiscal dedicado.

---

## 3. Roteamento e configuração

O roteamento por família já existe no design da NFS-e (`provedorProdutos` × `provedorServicos`).
NF-e/NFC-e usam `provedorProdutos`. Basta o enum aceitar `SEFAZ` e o `resolveFiscalProvider`
instanciar `SefazFiscalProvider` (em `providers/index.ts`, junto dos demais `case`).

```
resolveProviderParaModelo(modelo, config):
  se modelo == NFSE: provedorServicos (NACIONAL direto / ACBr fallback)   ← já desenhado
  senão (NFE/NFCE):  provedorProdutos  (SEFAZ direto / ACBr|FOCUS fallback) ← novo
```

**Autorizadora por UF.** Diferente da SEFIN (URL única), a NF-e precisa de uma **tabela
UF → autorizadora → URLs**. Começamos com **SVRS** (cobre AC, AL, AP, CE, DF, ES, PA, PB, PI,
RJ, RN, RO, RR, SC, SE, TO). A UF emitente vem de `emitter.uf` / `cUF` da chave.

```ts
// providers/sefaz/endpoints.ts (novo)
type SefazEndpoints = {
  autorizacao: string; retAutorizacao: string; consultaProtocolo: string;
  statusServico: string; inutilizacao: string; recepcaoEvento: string;
  consultaCadastro?: string;
};
// SVRS — Produção
const SVRS_PROD: SefazEndpoints = {
  autorizacao:       "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  retAutorizacao:    "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  consultaProtocolo: "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  statusServico:     "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  inutilizacao:      "https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
  recepcaoEvento:    "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
  consultaCadastro:  "https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx",
};
// SVRS — Homologação
const SVRS_HOM: SefazEndpoints = {
  autorizacao:       "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  retAutorizacao:    "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  consultaProtocolo: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  statusServico:     "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  inutilizacao:      "https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
  recepcaoEvento:    "https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
};
// Mapa UF → autorizadora (SVRS para os estados acima; SP/MG/PR/RS/… autorizadoras próprias — depois)
```

> Endpoints verificados no portal SVRS em jun/2026. `NFeDistribuicaoDFe` é nacional (AN),
> fora do escopo inicial. Demais UFs com autorizadora própria (SP, MG, PR, RS, BA, GO, MT, MS,
> PE, AM) entram em fase posterior — mesmo contrato, só outra entrada na tabela.

---

## 4. Certificado e transporte (reuso direto da NFS-e)

- **Sem mudança de segurança**: o `CertificadoDigital` (pfx + senha criptografados) e
  `carregarCertificado()` já existem. `ProviderContext.certificado` já carrega `{ pfx, senha }`
  quando o provider resolvido precisa — basta `getFiscalRuntimeConfig` passar a carregar também
  quando `provedorProdutos == SEFAZ` (hoje só carrega para NACIONAL).
- **Transporte**: SOAP 1.2 sobre HTTPS com cert de cliente. Reusar o padrão de `https.request`
  com `pfx`+`passphrase` do `nacional-provider.ts` (sem GZip — NF-e envia o XML do envelope SOAP
  direto; `Content-Type: application/soap+xml; charset=utf-8`).
- **A1 obrigatório** (A3/hardware não serve server-side) — igual à NFS-e.

---

## 5. Assinatura e chave (cuidados de NF-e)

- **Reference** aponta para `#NFe<chave>` (atributo `Id="NFe"+chave` em `infNFe`). Eventos
  assinam `infEvento` (`Id="ID"+tpEvento+chave+seq`). Inutilização assina `infInut`.
- **C14N + RSA-SHA256 + enveloped** — idênticos à PoC; muda só o XPath/`Id`.
- **cDV (dígito verificador)** por módulo 11 sobre os 43 primeiros dígitos — implementar e testar
  com vetores conhecidos (rejeição **228/502** = chave/dDV inconsistente é o erro clássico).
- **Homologação**: `tpAmb=2` e `dest/xNome = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM
  VALOR FISCAL"` (rejeição se faltar). Lembrar de zerar/ajustar em produção.

---

## 6. DANFE (geração própria)

A SEFAZ não devolve PDF — o DANFE é responsabilidade do emitente. Gerar a partir do `nfeProc`
autorizado: layout retrato A4 com **código de barras Code-128C da chave (44)**, dados do
emitente/destinatário, itens, totais e o **protocolo de autorização**. Avaliar lib de PDF já no
projeto (ou `pdfkit`/`@react-pdf`). Pode ser F-posterior — emitir/autorizar primeiro, DANFE
depois.

---

## 7. Mudanças de schema/dados (migrações)

- enum `ProvedorFiscal`: **+ SEFAZ**.
- `ConfiguracaoFiscal`: usar `provedor`/`provedorProdutos` = `SEFAZ` para NF-e. Reusar
  `serieNfe`/`serieNfce` e a `SequenciaFiscal` para numeração (`nNF`) — **crítico** para evitar
  duplicidade/quebra de numeração.
- Persistir, na `NotaFiscal`: `chaveAcesso` (44), `protocolo` (nProt), `xml` (nfeProc autorizado),
  e a sequência de evento (para CC-e). Conferir se os campos atuais bastam.
- URLs por autorizadora **não** são configuráveis pela empresa — derivadas de `uf` + `ambiente`.

---

## 8. Fases

- **F0 — fundação** ✅ feito: `testConnection` via `NFeStatusServico4` no SVRS homologação. Valida
  ponta a ponta o transporte SOAP + cert de cliente **sem** montar NF-e. (`providers/sefaz/soap.ts`,
  `providers/sefaz/endpoints.ts`, `scripts/sefaz-status-test.ts`.)
- **F1 — emissão síncrona** ✅ feito (código): `montarChave`/`calcDV` (`sefaz/chave.ts`),
  `buildNfeXml` 4.00 (`sefaz/nfe-xml.ts`), `signNfe` (`sefaz/sign.ts`), envelope `NFeAutorizacao4`
  `indSinc=1`, parse do `protNFe` (`cStat=100`) e montagem do `nfeProc` (`sefaz-provider.ts`). DV
  validado contra exemplo oficial; PoC offline em `scripts/sefaz-nfe-poc.ts`. **Pendente:** teste de
  autorização real em homologação SVRS (precisa do A1 da empresa).
- **F2 — roteamento + config** ✅ feito: `SEFAZ` no enum + `case` em `resolveFiscalProvider`,
  `getFiscalRuntimeConfig` carrega cert quando `provedorProdutos==SEFAZ`, tabela UF→endpoints, e o
  provedor exposto na UI/admin como provedor de PRODUTOS por **certificado A1** (novo `cred:
  "certificado"`; `PROVEDORES_FISCAIS`, `platform-admin`, `ProvedorFiscalForm`, `FiscalSettingsForm`).
- **F3 — eventos** ✅ feito: cancelamento (110111), CC-e (110110) via `RecepcaoEvento4`; inutilização
  via `NFeInutilizacao4`; `queryStatus` via `NFeConsultaProtocolo4` (`sefaz/eventos.ts`,
  `sefaz/sign.ts#signXml`, métodos `cancel/correct/queryStatus/inutilizar` em `sefaz-provider.ts`).
- **F4 — DANFE** ✅ feito (HTML+SVG): `buildDanfe(nfeProcXml)` (`sefaz/danfe.ts`) gera o DANFE em
  HTML A4 com Code-128C da chave em SVG (sem lib de PDF no projeto), servido por
  `downloadNotaFiscalDocumento` direto do `nota.xml` local. PDF real pode ser adicionado depois
  (puppeteer/pdfkit) reusando `parseNfeProc`/`code128cBars`.
- **F5 — multi-UF** (pendente): autorizadoras próprias (SP, MG, PR, RS, BA, GO, MT, MS, PE, AM) na
  tabela; contingência (SVC-AN/SVC-RS).

> **Pendência transversal:** nenhum teste real contra a SEFAZ foi executado (precisa do A1 da
> empresa) e o `tsc` não rodou no ambiente de desenvolvimento (registro npm bloqueado). Rodar
> `npm install && npx tsc --noEmit` + um teste de autorização em homologação SVRS antes de produção.

---

## 9. Riscos / decisões em aberto

- **Manutenção do leiaute**: a cada Nota Técnica a SEFAZ muda o schema — passa a ser nossa
  responsabilidade (vs ACBr atualizar por nós). **Reforma Tributária**: o grupo **IBS/CBS** está
  entrando na NF-e via NT — alinhar a versão de leiaute alvo com a NT vigente na data da F1.
- **Numeração** (`nNF`/série): controlar por empresa com `SequenciaFiscal`; reenvio após timeout
  deve reusar o mesmo número + consultar recibo, não gerar novo (evita duplicidade 539).
- **Contingência**: queda da autorizadora → SVC. Fora do escopo inicial; documentar como F5.
- **Validação de schema (XSD)** antes de enviar reduz rejeição — avaliar validar o XML 4.00
  localmente contra os XSDs oficiais no build do payload.
- **Homologação ≠ produção**: credenciamento de NF-e da empresa na SEFAZ da UF é operacional
  (como foi o E0116 da NFS-e). Garantir empresa habilitada antes dos testes em produção.

---

## 10. Resumo

NF-e direto na SEFAZ é **gratuito** e **reaproveita ~70% do que já foi feito na NFS-e nacional**
(certificado, assinatura XMLDSig, transporte com cert de cliente, motor tributário, modelo
normalizado). O trabalho novo é: **cliente SOAP**, **builder do XML 4.00 + chave/cDV**, **tabela
UF→autorizadora** (começando por SVRS) e **DANFE**. Mantém o contrato `FiscalProvider` intacto —
é mais um provider plugável, sem mexer nas regras de negócio.
