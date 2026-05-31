# Spedy — NFS-e: validação de emissão (sandbox)

> **Resultado:** o caminho NFS-e está **funcional**. A nota é montada, assinada
> e processada corretamente. O único bloqueio no sandbox é uma limitação do
> ambiente de homologação ("Simulação") do Ambiente Nacional para o município
> — que **não existe em produção**.

## Empresa / município
- Empresa `2f467790-...`, CNPJ `15130181000148` (VALLETECLAB EMPREENDIMENTOS LTDA),
  IE `100063019`, IM `99014665`, certificado A1 **ativo** (validade 2026-09-19).
- Município emissor: Luís Eduardo Magalhães/BA (IBGE `2919553`).
- `GET /service-invoices/cities?code=2919553` → provider **"Nacional"**, opções:
  `federalServiceCode: true` (obrigatório), `nbsCode: false`,
  `nationalTaxationCode: false`, `authentication: "certificate"`,
  `useNationalLayout: true`.
- Settings `serviceInvoice`: série `7000`, `environmentType: development`,
  `issueType: "annfs"` (Ambiente Nacional NFS-e), `sendCityTaxNumber: automatic`.

## Emissão testada (real, sandbox)
Payload montado pelo nosso `buildServiceBody` (LC116 `1.07`, ISS 5%,
`taxationInMunicipality`, tomador PJ identificado, valor R$ 3.000):

```
POST /v1/service-invoices → HTTP 200, status enqueued, model serviceInvoice
GET  /v1/service-invoices/{id} → status rejected
  processingDetail: [SPD005] "O serviço de autorização não está disponível no
  ambiente de Simulação para município de Luís Eduardo Magalhães."
```

### Interpretação
- O POST retorna 200 e a nota é **enfileirada e processada** (≠ NF-e de produto,
  que retorna HTTP 500 — ver `spedy-nfe-500-diagnostico.md`).
- Numa tentativa inicial houve `[E0717] "A assinatura é obrigatória..."`, que
  **deixou de ocorrer** nas tentativas seguintes — a Spedy passou a assinar a
  DPS normalmente (testado ao vivo: a rejeição migrou de E0717 para SPD005 e
  **estabilizou em SPD005** em emissões repetidas). Ou seja, **a assinatura
  funciona no sandbox** — o E0717 foi transitório, não um bloqueio permanente.
- **SPD005** é uma limitação do **ambiente de homologação** (Simulação): o
  Ambiente Nacional não disponibiliza autorização para esse município em
  sandbox. Em **produção** a NFS-e será autorizada.

### Notas sobre o E0717 (rejeição do Web Service Nacional)
- E0717 é uma rejeição do **web service do Ambiente Nacional** (DPS recebida sem
  assinatura XMLDSig válida), não uma validação interna da Spedy.
- `issueType: "annfs"` (Ambiente Nacional da NFS-e) está **correto** — não
  alterar para `website`/`alt`.
- Não há passo de "ativação" de certificado além do upload: no schema
  `CompanyDigitalCertificateDto`, `isActive` já é `true` e não há endpoint de
  ativação/seleção de certificado de assinatura. O upload (`POST
  /companies/{id}/certificates`) já o torna ativo.
- Observação: como o E0717 apareceu na 1ª tentativa e sumiu nas seguintes, pode
  haver um pequeno atraso entre o upload/ativação do certificado e a primeira
  assinatura. Em produção, basta reemitir (idempotência via `integrationId`) se
  ocorrer um E0717 transitório.

## Conclusão
- O nosso payload e o fluxo NFS-e estão **corretos e conformes** ao schema da
  Spedy (`CreateServiceInvoiceDto`: `required = [description, total]`, ambos
  enviados; `federalServiceCode`, `taxationType`, `total.issRate` em fração,
  retenções e tomador identificado conforme o Ambiente Nacional).
- Para validar autorização real, emitir em **produção** (com a empresa
  credenciada na prefeitura/Ambiente Nacional).
- `buildServiceReceiver` envia apenas documento+nome do tomador identificado
  (evita a rejeição E1235 do schema nacional) — confirmado correto.
