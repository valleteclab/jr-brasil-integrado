# Spedy — NFS-e: validação de emissão (sandbox)

> **Resultado:** o nosso código monta a NFS-e **corretamente e conforme o schema**
> (POST 200, nota enfileirada e processada). Porém **nenhuma autorização é
> possível no sandbox da Spedy** para este município, porque LEM usa o **Ambiente
> Nacional** e o sandbox não assina/autoriza NFS-e Nacional. A validação real só
> em **produção** — que está **bloqueada no sandbox** pela própria Spedy.

## Empresa / município
- Empresa `2f467790-...`, CNPJ `15130181000148` (VALLETECLAB EMPREENDIMENTOS LTDA),
  IE `100063019`, IM `99014665`, certificado A1 **ativo** (`isActive: true`,
  validade 2026-09-19).
- Município emissor: Luís Eduardo Magalhães/BA (IBGE `2919553`).
- `GET /service-invoices/cities?code=2919553` → provider **"Nacional"**
  (`useNationalLayout: true`), `federalServiceCode: true` (obrigatório),
  `nbsCode: false`, `nationalTaxationCode: false`, `authentication: "certificate"`.

### Por que um XML de NFS-e em homologação de 2021 funcionou e este não
Um XML antigo de homologação que o cliente possui é de **Cuiabá/MT** (IBGE
`5103403`), cujo provider é **"Iss Net" (ABRASF/ISSNet)** — padrão municipal com
ambiente de homologação próprio. Já **Luís Eduardo Magalhães migrou para o
Ambiente Nacional** (gerido por SAATRI/RFB; MEI desde 2023, demais em 2026). São
**provedores diferentes**: ISSNet tem homologação municipal; o Ambiente Nacional
tem homologação só na **Produção Restrita do gov.br**
(`sefin.producaorestrita.nfse.gov.br`), à qual o sandbox da Spedy não dá acesso
de autorização para esta conta. Ou seja, o XML antigo **não contradiz** o
bloqueio atual — é outro município/provedor.

## Emissões testadas (reais, sandbox) — comportamento por ambiente
O `environmentType` do `serviceInvoice` define o destino, e **nenhum** autoriza:

| `environmentType` | Resultado (POST 200, depois) | Significado |
|---|---|---|
| `development` | rejeitada **[E0717]** "A assinatura é obrigatória..." (3/3, persistente) | A Spedy envia ao web service Nacional mas **não assina** a DPS neste ambiente. |
| `simulation` | rejeitada **[SPD005]** "serviço de autorização não disponível no ambiente de Simulação para LEM" | Validação local; nem tenta autorizar. |
| `production` | **HTTP 400** ao configurar: "Ambiente de produção não está disponível no Sandbox." | Produção bloqueada para chave sandbox. |

> **Correção de registro:** numa análise anterior eu afirmei que o E0717 era
> "transitório" e que a assinatura passava a funcionar. **Isso estava errado.** O
> E0717 é **persistente** no ambiente `development` (reproduzido 3/3 com
> certificado ativo). A mudança de mensagem que observei antes foi apenas troca
> de `development` (E0717) para `simulation` (SPD005), não a assinatura
> "resolvendo".

## O que está correto do nosso lado (validado)
- Payload conforme `CreateServiceInvoiceDto` (`required = [description, total]`,
  ambos enviados); `federalServiceCode` "1.07", `taxationType`
  "taxationInMunicipality", `total.issRate` em fração, retenções e tomador
  identificado conforme o Ambiente Nacional.
- `buildServiceReceiver` envia só documento+nome do tomador identificado (evita
  a rejeição E1235 do schema nacional).
- `issueType: "annfs"` (Ambiente Nacional da NFS-e) está **correto**.
- Certificado A1 enviado e `isActive: true`; não há passo de ativação além do
  upload (no swagger `CompanyDigitalCertificateDto` não há endpoint de
  ativação/seleção).

## Conclusão e próximos passos
- O bloqueio **não é do nosso código**: a NFS-e é montada e processada
  corretamente. O sandbox da Spedy **não assina (E0717) nem autoriza (SPD005)**
  NFS-e do Ambiente Nacional para esta conta/município, e **produção está
  bloqueada no sandbox**.
- Caminhos para validar autorização real:
  1. **Conta de produção da Spedy** (chave de produção) com a empresa credenciada
     no Ambiente Nacional — lá a DPS é assinada e autorizada.
  2. **Confirmar com o suporte da Spedy** se o sandbox deles assina NFS-e do
     Ambiente Nacional (Produção Restrita) e por que o `development` retorna
     E0717 com certificado ativo.

### Texto de chamado para a Spedy (PT-BR)
> Assunto: NFS-e Ambiente Nacional — sandbox não assina (E0717) nem autoriza (SPD005)
>
> Empresa `2f467790-ac32-48ce-9f51-b4250022bef4` (CNPJ 15130181000148), município
> Luís Eduardo Magalhães/BA (IBGE 2919553, provider "Nacional"), certificado A1
> `isActive: true` (val. 19/09/2026), `issueType: annfs`.
> `POST /v1/service-invoices` retorna 200 e a nota é processada, mas:
> - com `serviceInvoice.environmentType = development` → rejeição **[E0717]** "A
>   assinatura é obrigatória quando for enviado para o Web Service" (persistente);
> - com `environmentType = simulation` → **[SPD005]** "serviço de autorização não
>   disponível no ambiente de Simulação";
> - configurar `environmentType = production` → **HTTP 400** "Ambiente de produção
>   não está disponível no Sandbox".
>
> O sandbox assina/autoriza NFS-e do Ambiente Nacional (Produção Restrita)? Se
> não, qual o caminho para validar o fluxo Nacional ponta a ponta — precisamos de
> conta de produção? Por que o `development` retorna E0717 com o certificado ativo?
