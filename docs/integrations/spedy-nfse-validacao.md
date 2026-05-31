# Spedy — NFS-e: validação de emissão (sandbox)

> **Resultado: ✅ NFS-e AUTORIZADA de ponta a ponta no sandbox.** Com o ambiente
> `serviceInvoice.environmentType = simulation` (Spedy), a emissão retorna
> `status: authorized`. O nosso payload é aceito sem rejeições (E0717/E1235/SPD005
> resolvidos). Empresa em Luís Eduardo Magalhães/BA, Ambiente Nacional.

## Combinação que autoriza (confirmada ao vivo)
- **`environmentType: simulation`** (configurado no painel da Spedy / `PUT
  /companies/{id}/settings`). Nesse ambiente a Spedy assina e a autorização é
  simulada com sucesso.
- **Tomador completo**: nome (`xNome`) + documento + endereço. O Ambiente
  Nacional **exige** o nome no bloco `toma` (sua omissão gera E1235 "toma
  incompleto — esperado CAEPF, IM, xNome").
- **`federalServiceCode: "1.01"`** (item LC116). A Spedy deriva o `cTribNac`
  internamente. `cityServiceCode` é opcional para LEM (autoriza com ou sem).
- `effectiveDate` (competência), `total.issBaseTax`, `issRate` (fração) enviados.

```
POST /v1/service-invoices  → HTTP 200, status enqueued
GET  /v1/service-invoices/{id} → status AUTHORIZED ("NFS-e autorizada pelo município.")
```

## Importante: o que "simulation" valida (e o que não valida)
No ambiente `simulation` a Spedy:
- **Aceita e ecoa os nossos dados reais** (description, valores, tomador,
  competência — verificado: enviei amount 7777 e descrição própria, voltaram
  idênticos).
- Retorna **`authorized`** — confirmando que o fluxo POST→enqueue→autorização e
  o nosso payload estão **corretos de ponta a ponta**.
- Porém o **XML/PDF, número e protocolo retornados são de exemplo** (a Spedy
  devolve um DANFSe canned no modo simulação). O **documento fiscal real** só é
  gerado em **produção** (ou no SEFIN Produção Restrita via `development`).

Ou seja: `simulation` valida a **integração** (nosso request está certo);
**produção** gera o documento com valor fiscal.

## Histórico de diagnóstico (como chegamos aqui)
A rejeição variava conforme o `environmentType` e o payload:
- Tomador sem nome → **E1235** "toma incompleto (xNome)". **Corrigido**: enviar
  receiver completo.
- `environmentType: development` → tentava o SEFIN real; rejeições de schema
  (E1235 `cTribMun`) ou E0717 conforme o `cityServiceCode`.
- `environmentType: simulation` + tomador completo → **authorized**.

> Registro de erros meus durante a investigação (corrigidos): cheguei a concluir
> que "o sandbox não autoriza" e que o E0717 era "transitório" — **ambos
> errados**. O print de uma NFS-e autorizada do cliente (nota em LEM) levou à
> descoberta do bug do tomador e à combinação correta.

## O que está correto no nosso código (validado)
- `buildServiceReceiver` agora envia o tomador completo (nome + endereço).
- `buildServiceBody`: `description`, `federalServiceCode`, `taxationType`,
  `effectiveDate`, `total.issBaseTax`/`issRate` (fração)/`issAmount`, retenções.
- `issueType: "annfs"` (Ambiente Nacional), certificado A1 ativo.

## Próximo passo para valor fiscal real
- **Produção**: com a chave de produção da Spedy e a empresa credenciada, a mesma
  emissão gera o XML/DANFSe com valor fiscal. (No sandbox, `production` é
  bloqueado: "Ambiente de produção não está disponível no Sandbox".)
