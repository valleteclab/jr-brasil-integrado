# Runbook — Alteração de Leiaute Fiscal (NF-e / NFC-e / NFS-e / eventos)

> **Para quem:** qualquer agente (Claude ou outro) ou desenvolvedor que precise **alterar a geração
> de XML fiscal** quando a Receita/SEFAZ/Comitê NFS-e publicar uma **Nota Técnica (NT)** com novos
> campos, grupos ou regras de validação.
>
> **Princípio:** nós geramos o XML fiscal **direto** (sem API paga) em dois provedores — **SEFAZ**
> (NF-e 55) e **NACIONAL** (NFS-e/SEFIN). O leiaute é responsabilidade nossa: **a SEFAZ valida ordem
> de elementos, casas decimais e regras**. Toda mudança de leiaute passa por: **localizar o builder →
> alterar → validar contra o XSD oficial → testar em homologação → liberar em produção com gate**.

---

## 1. Arquitetura: quem gera cada XML

| Documento | Provedor | Builder do XML | Observação |
|---|---|---|---|
| **NF-e 55** | SEFAZ (direto) | `src/domains/fiscal/providers/sefaz/nfe-xml.ts` | SOAP + mTLS com A1 |
| **Eventos NF-e** (cancelar 110111, CC-e 110110, manifestação) | SEFAZ | `src/domains/fiscal/providers/sefaz/eventos.ts` | |
| **NFS-e (DPS)** | NACIONAL (SEFIN) | `src/domains/fiscal/providers/nacional-provider.ts` (`buildDpsXml`) | mTLS + XMLDSig |
| **NF-e/NFC-e/NFS-e via ACBr** | ACBR (API paga) | `src/domains/fiscal/providers/acbr-provider.ts` (payload JSON) | a ACBr monta o XML deles |
| **Cálculo de tributos** (todos) | — | `src/domains/fiscal/tax-engine.ts` + `national-tax-baseline.ts` | valores que alimentam os builders |

- **Provedor é GLOBAL** (escolhido em `/admin/provedor-fiscal`). NF-e/NFC-e usam `config.provider`;
  NFS-e usa `config.providerServicos`. Ver `fiscal-emission-use-cases.ts` (~linha 580). Trocar o
  provedor afeta **todas** as origens (caixa, PDV, vendas, devoluções, OS).
- **NFC-e 65 no SEFAZ direto ainda NÃO existe** (próximo passo: CSC/QR Code + DANFCE). Hoje o cupom
  só sai pelo ACBr.

---

## 2. Validação contra o XSD OFICIAL (passo que NÃO pode ser pulado)

A única fonte de verdade da ordem/obrigatoriedade dos elementos é o **XSD oficial** (não blogs).

- **XSD da NF-e (com Reforma IBS/CBS) já baixados:** `docs/xsd-nt2025002/`
  - `leiauteNFe_v4.00.xsd`, `DFeTiposBasicos_v1.00.xsd`, `tiposBasico_v4.00.xsd` (oficiais, PL_010b)
  - `xmldsig-core-schema_v1.01.xsd` (schema da assinatura, do W3C)
  - `wrap-nfe.xsd` (wrapper nosso: declara `NFe` como elemento global p/ validar uma NF-e isolada)
- **Ferramenta de validação:** `scripts/validate-reforma-xsd.ts` gera uma NF-e assinada e a salva.
  Depois valide com **Python + lxml** (já instalado):

```bash
# gera o XML (use OUT p/ escolher o caminho)
OUT="/tmp/nfe.xml" npx tsx scripts/validate-reforma-xsd.ts
# valida contra o XSD oficial
python -c "from lxml import etree; x=etree.XMLSchema(etree.parse('docs/xsd-nt2025002/wrap-nfe.xsd')); \
print('VALIDO' if x.validate(etree.parse('/tmp/nfe.xml')) else [str(e) for e in x.error_log])"
```

**Como obter um XSD novo** (quando sai uma NT): baixar o "Pacote de Liberação" (ex.: `PL_010`) no
**Portal NF-e → Documentos → Esquemas XML**. Mirror confiável que espelha os XSD: repositório
`akretion/nfelib` no GitHub. Salvar em `docs/xsd-nt2025002/` (ou `docs/xsd-<nt>/`) e, se for validar
uma NF-e isolada, replicar o truque do `wrap-nfe.xsd` (`<xs:include>` do leiaute + `<xs:element
name="NFe" type="TNFe"/>`).

> ⚠️ **NÃO confie no validador da SEFAZ-RS** (`sefaz.rs.gov.br/nfe/NFE-VAL.aspx`) para campos NOVOS:
> ele roda um schema desatualizado e acusa `invalid child element 'IBSCBS'` em XML correto. Serve só
> para estrutura antiga.

---

## 3. Procedimento passo a passo para alterar um leiaute

1. **Ler a NT** (Portal NF-e / portal NFS-e) e identificar: grupos/campos novos, **ordem** na
   sequence, casas decimais, obrigatoriedade (`minOccurs`), e a **data de obrigatoriedade**.
2. **Baixar o XSD** da NT (seção 2) e colocar em `docs/`.
3. **Localizar o builder** (seção 1) e alterar a string do XML **na ordem exata do XSD**. Casas
   decimais: valores `15v2` = 2 casas; alíquotas `5v2-4` = 2 a 4 casas (helper `fmtAliq` no nfe-xml).
4. **Propagar valores** se necessário: campo novo geralmente nasce no `tax-engine.ts` (cálculo) →
   `ItemTaxResult`/totais (`types.ts`) → builder. Ex.: a Reforma adicionou `cstIbsCbs` ao
   `ItemTaxResult` e `computeReforma`.
5. **Validar contra o XSD** (seção 2) até dar `VALIDO`.
6. **`npx tsc --noEmit`** — sem erros.
7. **Testar em HOMOLOGAÇÃO** (seção 4) → `cStat 100`.
8. **Gate por data** se o campo só vale a partir de uma data (seção 5).
9. **Commit + deploy** (`./deploy/vps.sh deploy`) — o build é Next **standalone**.
10. **Liberar produção** com teste controlado (seção 4).

---

## 4. Como testar (homologação → produção controlada)

- **Homologação (sem risco):** `scripts/sefaz-emit-test.ts` emite uma NF-e de teste na SEFAZ-BA com
  o A1 real. Aceita `AMBIENTE=PRODUCAO` via env. Ex.:
  ```bash
  PFX_PATH="docs/<arquivo>.pfx" PFX_PASS="<senha>" IE="100063019" NUM="99$(date +%H%M%S)" \
    npx tsx scripts/sefaz-emit-test.ts
  ```
  Progressão típica de cStat: 107 (serviço ok) → 215 (schema/assinatura) → 100 (autorizado).
- **Produção controlada (descobrir se a SEFAZ já aceita um campo antes da obrigatoriedade):** emita
  **uma** NF-e real em produção com o campo novo e **CANCELE em seguida** (evento 110111). Foi assim
  que confirmamos que a SEFAZ-BA já aceita IBS/CBS (NF-e 373 → cStat 100 → cancelada). Depois, avance
  a `SequenciaFiscal` (ambiente PRODUCAO) para o número consumido, p/ a próxima real não colidir (539).
- **Credenciais/A1:** o `.pfx` da VALLETECLAB e a senha estão em `docs/` (gitignored, NUNCA commitar).
  Em produção, o A1 e os segredos ficam no banco/env da VPS — preferir rodar testes que precisem de
  segredos **dentro do container** (ver `project_*` na memória).

---

## 5. Gate de ativação por data (mudanças que só valem a partir de uma data)

Quando um campo passa a ser **obrigatório/aceito a partir de uma data**, NÃO ligue direto: use um
gate por ambiente para não quebrar produção antes da hora.

- Exemplo vivo: **Reforma IBS/CBS** em `nfe-xml.ts` → `REFORMA_XML_INICIO = { HOMOLOGACAO, PRODUCAO }`
  + `reformaNoXml(ambiente)`. Compara a data de hoje (Brasília) com a data de início do ambiente.
- Padrão recomendado para qualquer mudança datada: homologação liga assim que o XSD/endpoint
  suportam; **produção liga na data de obrigatoriedade OU antes, se um teste controlado (seção 4)
  confirmar que a SEFAZ já aceita**. Documentar a data e o motivo num comentário no código.

---

## 6. Armadilhas conhecidas (lições já pagas — não repetir)

- **Eventos:** o `detEvento` usa o atributo **`versao`**, NÃO `versaoEvento`. Com o errado, a SEFAZ-BA
  estoura `cStat 215 "Object reference not set"` (mensagem enganosa — parece schema/assinatura). Ver
  `eventos.ts`. (Descoberto comparando nosso XML com um cancelamento do Bling.)
- **Assinatura NF-e 4.00:** é **RSA-SHA1 / SHA-1** (o XSD FIXA o algoritmo). SHA-256 → `cStat 215`. Ver
  `sefaz/sign.ts`. (A NFS-e nacional, ao contrário, usa SHA-256.)
- **TLS:** os web services da SEFAZ usam cert de servidor ICP-Brasil ausente do Node → `unable to get
  local issuer certificate`. Raiz v10 embutida em `sefaz/icp-brasil-ca.ts` e usada em `soap.ts`. Outra
  UF que não envie a intermediária precisará dela adicionada.
- **Ordem dos elementos é validada.** Inserir um grupo fora de ordem → rejeição de schema. Sempre
  conferir a sequence no XSD. Ex.: `IBSCBS` é o ÚLTIMO grupo de `det/imposto` (após IS); `IBSCBSTot`
  vem após `ICMSTot` no `total`.
- **Totalizador IBS/CBS da NF-e** usa o tipo **`TIBSCBSMonoTot`** (não `TIBSCBSTot`): tem `vCredPres`
  e `vCredPresCondSus` OBRIGATÓRIOS em `gIBS` e `gCBS`. Blogs erram isso.
- **`dhSaiEnt`** (data/hora de saída/entrada) deve ser preenchido (= `dhEmi`), senão a DANFE sai com
  "DATA/HORA SAÍDA" em branco. Vale NF-e 55 (não NFC-e). Ver `nfe-xml.ts` e `acbr-provider.ts`.
- **BA exige o grupo `autXML`** (CNPJ SEFAZ-BA) senão rejeita. Ver `UF_AUTXML_CNPJ` em `nfe-xml.ts`.
- **ICMSSN201 exige `pCredSN`/`vCredICMSSN` SEMPRE** (obrigatórios no XSD, mesmo zerados) — só o
  ICMSSN202/203 não os tem. Blogs tratam como opcionais. Já o grupo FCP-ST (vBCFCPST/pFCPST/vFCPST)
  é uma `sequence minOccurs=0` (opcional em bloco). Conferido no XSD local em 2026-07 (ST
  interestadual, Conv. 142/2018). O cStat **234 (IE não vinculada ao CNPJ)** em teste de
  homologação significa que o SCHEMA passou — é validação cadastral, vem depois do 215/225.
- **Numeração por AMBIENTE:** homologação e produção têm sequências separadas (`SequenciaFiscal` com
  `ambiente`). Retry automático em `cStat 539` (duplicidade). Ver `lib/numbering.ts`.
- **DANFE em PDF (lib `nfe-danfe-pdf`)** usa **fontes built-in do PDFKit** e exige
  `serverComponentsExternalPackages: ["pdfkit","nfe-danfe-pdf"]` + `outputFileTracingIncludes` no
  `next.config.mjs` (build standalone). Quadro IBS/CBS = `danfe-pdf/get-imposto-reforma.ts`. Ver
  `[[project_provedor-sefaz-nfe]]` na memória.

---

## 7. NFS-e nacional (DPS) — pendência de leiaute em aberto

A Reforma na NFS-e nacional está nas **NT SE/CGNFS-e 007/2026 e 009/2026** (grupo IBSCBS num leiaute
NOVO do DPS, Anexo VI v1.04). **Cronograma de obrigatoriedade ainda não publicado.** Nosso DPS usa
`versao="1.00"` (sem IBSCBS). **Não mexer até sair o XSD final + cronograma** (mudar a versão quebraria
a emissão atual). Quando sair: aplicar este runbook (baixar XSD do portal NFS-e, alterar `buildDpsXml`,
validar, gate). Ponto de entrada do grupo: dentro de `<valores><trib>` em `nacional-provider.ts`.

---

## 8. Recursos externos

- Portal NF-e (schemas, NTs): https://www.nfe.fazenda.gov.br/portal/
- Portal NFS-e nacional (NTs RTC): https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica
- Mirror dos XSD (GitHub): `akretion/nfelib`
- Transcrição campo-a-campo (conferir, não é normativo): `flexdocs.net/guiaNFe`
- Tabela CST/cClassTrib IBS-CBS (IT 2025.002): blog.tecnospeed.com.br/tabela-cclasstrib
- Documentos relacionados no repo: `docs/HANDOFF-sefaz-nfe.md`, `docs/provider-sefaz-nfe-design.md`,
  `docs/provider-nacional-design.md`, `docs/HANDOFF-fiscal-acbr.md`.
