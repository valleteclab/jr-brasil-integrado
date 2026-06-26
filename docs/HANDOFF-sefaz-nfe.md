# HANDOFF — Provedor SEFAZ (NF-e modelo 55 direto, sem API paga)

> **Para o agente da próxima sessão:** este documento resume tudo que foi implementado na branch
> `claude/government-nf-nfse-provider-ngodbz` e diz **exatamente como buildar e validar**. O trabalho
> foi feito num ambiente SEM acesso ao npm (registro bloqueado), então **o typecheck/build NUNCA
> rodou** e **nenhum teste real contra a SEFAZ foi feito** (depende do certificado A1 da empresa).
> A primeira tarefa no desktop é **buildar e corrigir o que o `tsc` apontar**.

- **Branch:** `claude/government-nf-nfse-provider-ngodbz`
- **Stack:** Next.js 14 + TypeScript + Prisma (PostgreSQL)
- **Objetivo:** emitir e gerenciar **NF-e (modelo 55)** direto nos web services da SEFAZ, **sem API
  paga**, reaproveitando a infra de certificado A1 + assinatura XMLDSig já usada na NFS-e nacional.
- **Foco operacional atual:** estado da **Bahia (BA)**.
- **Documento de design (arquitetura + fases):** `docs/provider-sefaz-nfe-design.md`.

---

## 1. Primeiro passo no desktop — BUILD (faça isto antes de tudo)

```bash
npm install
npx prisma generate          # regenera o client com o enum ProvedorFiscal + SEFAZ
npx tsc --noEmit             # TYPECHECK — provavelmente vai apontar ajustes; corrija-os
npm run lint                 # opcional
npm run build                # build do Next (validação final)
```

> **Por que isso é crítico:** todo o código de F0–F6 foi escrito sem nunca compilar (npm bloqueado no
> ambiente de origem). É esperado que o `tsc` aponte alguns ajustes de tipo (imports não usados,
> `Buffer`/tipos opcionais, etc.). **Comece por aí.** A lógica de negócio foi revisada manualmente e
> validada onde possível (ver §5), mas a verificação de tipos é a lacuna real.

### Banco de dados
- Há uma migration nova: `prisma/migrations/20260626140000_nfe_provider_sefaz/` (só
  `ALTER TYPE "ProvedorFiscal" ADD VALUE 'SEFAZ'`).
- Aplicar com: `npx prisma migrate dev` (ou `prisma migrate deploy` em produção).
- **Não houve migration para a Distribuição (F6)** — reusa colunas existentes de
  `DistribuicaoNfeDocumento` (`acbrDocumentoId` recebe o NSU; `payload` guarda o XML).

---

## 2. O que foi implementado (commits nesta branch)

| Commit | Fase | Conteúdo |
|---|---|---|
| `1fa9819` | — | Documento de design (`docs/provider-sefaz-nfe-design.md`) |
| `eee552c` | **F0** | Transporte SOAP + TLS-mútuo; `testConnection` via NFeStatusServico4; enum `SEFAZ`; tabela SVRS |
| `c1ec50c` | **F1** | Emissão síncrona: chave+DV, builder XML 4.00, assinatura, NFeAutorizacao4, nfeProc |
| `a8198d9` | **F2/F3/F4** | UI/config (cred "certificado"); eventos (cancel/CC-e/inutilização/consulta); DANFE (HTML+Code-128) |
| `778524a` | **F5** | Suporte à **Bahia** (endpoints próprios + grupo `autXML` obrigatório) |
| `7129fa9` | **F6** | Distribuição DFe + Manifestação do Destinatário (notas de entrada/compra) |

### Cobertura funcional (tudo direto na SEFAZ, sem API paga)
- ✅ Status do serviço · ✅ Emissão NF-e 55 (síncrona) · ✅ Cancelamento (110111) · ✅ Carta de
  Correção (110110) · ✅ Inutilização de numeração · ✅ Consulta de protocolo · ✅ DANFE · ✅ Bahia ·
  ✅ Distribuição DFe (entradas) + Manifestação (210200/210210/210220/210240).

---

## 3. Inventário de arquivos

### Núcleo do provedor — `src/domains/fiscal/providers/`
| Arquivo | Papel |
|---|---|
| `sefaz-provider.ts` | `SefazFiscalProvider` (implementa `FiscalProvider`): emit/cancel/correct/queryStatus/testConnection + método extra `inutilizar()` |
| `sefaz/soap.ts` | Envelope SOAP 1.2 + `postSoap` (TLS-mútuo com A1) + `pickTag`/`pickBlock` |
| `sefaz/endpoints.ts` | Tabela UF→autorizadora (SVRS + **BA própria**) + endpoints do **Ambiente Nacional** (distribuição/evento) + `cUFFromUF` |
| `sefaz/chave.ts` | Chave de acesso (44) + dígito verificador (mód. 11) + `cNF` determinístico |
| `sefaz/nfe-xml.ts` | Builder do leiaute 4.00 (ide/emit/dest/**autXML**/det/total/transp/pag) |
| `sefaz/sign.ts` | `pfxToPem` + `signXml`/`signNfe` (XMLDSig enveloped) |
| `sefaz/eventos.ts` | Cancelamento, CC-e, inutilização, consulta protocolo + **`enviarManifestacao`** |
| `sefaz/distribuicao.ts` | **Distribuição DFe** (NSU + por chave), gunzip dos docZip, classificação |
| `sefaz/danfe.ts` | `buildDanfe(nfeProcXml)` → DANFE em HTML A4 + Code-128C em SVG |
| `index.ts` | `resolveFiscalProvider` (case `SEFAZ`) |
| `types.ts` | `ProviderContext.{certificado,ufEmitente}` + `ProviderEmitter` com endereço |

### Integração / aplicação
| Arquivo | Mudança |
|---|---|
| `src/domains/fiscal/application/fiscal-config-use-cases.ts` | Carrega A1 quando provedor=SEFAZ; `testFiscalConnection` trata SEFAZ (cert, não token); emitter com endereço |
| `src/domains/fiscal/application/fiscal-emission-use-cases.ts` | ctx com cert+UF para SEFAZ; `downloadNotaFiscalDocumento` serve DANFE/XML do `nota.xml` local |
| `src/domains/fiscal/application/plataforma-provedor-use-cases.ts` | `PROVEDORES_FISCAIS` + SEFAZ (`cred: "certificado"`) |
| `src/lib/services/platform-admin.ts` | Provider SEFAZ no painel (autentica por certificado) |
| `src/lib/services/nfe-distribution.ts` | Roteamento **ACBr × SEFAZ** (caminho ACBr intacto) |
| `src/components/admin/ProvedorFiscalForm.tsx` | UI: provedor por certificado A1 |
| `src/components/erp/FiscalSettingsForm.tsx` | UI: SEFAZ como provedor de produtos + certificado |
| `prisma/schema.prisma` | enum `ProvedorFiscal` + `SEFAZ` |

### Scripts de teste/validação — `scripts/`
| Script | O que faz |
|---|---|
| `sefaz-status-test.ts` | Testa conectividade (NFeStatusServico4) — **não emite nada** |
| `sefaz-nfe-poc.ts` | PoC offline: monta NF-e (BA), valida chave+DV+assinatura — **sem rede/A1** |
| `sefaz-distribuicao-test.ts` | Consulta a Distribuição DFe (entradas) com A1 |

---

## 4. Como testar com o certificado A1 real (depois do build OK)

> Passe a senha por variável de ambiente, **nunca** no histórico do shell. Em homologação,
> `tpAmb=2` mas o certificado é o **A1 real** da empresa (não existe certificado "de teste").

```bash
# 1) Mecânica offline (chave + DV + assinatura) — não precisa de A1 nem rede
tsx scripts/sefaz-nfe-poc.ts

# 2) Conectividade real com a SEFAZ-BA (homologação) — cStat 107 = em operação
PFX_PATH=/caminho/cert.pfx PFX_PASS="$SENHA" UF=BA AMBIENTE=HOMOLOGACAO tsx scripts/sefaz-status-test.ts

# 3) Distribuição DFe (notas de ENTRADA) — produção (homologação devolve 137, sem documentos)
PFX_PATH=/caminho/cert.pfx PFX_PASS="$SENHA" UF=BA AMBIENTE=PRODUCAO ULTNSU=0 tsx scripts/sefaz-distribuicao-test.ts
```

**Emissão real ponta a ponta:** configurar a empresa com provedor de produtos = `SEFAZ`, ambiente
`HOMOLOGACAO`, subir o A1, e emitir uma NF-e de teste pelo app. Resultado esperado: `cStat=100`
(Autorizado). Acompanhar rejeições pelo `cStat`/`xMotivo` retornados.

---

## 5. O que foi validado vs. o que NÃO foi

**Validado (sem npm, via node puro):**
- Dígito verificador da chave (mód. 11) contra exemplo oficial documentado (DV=6 conferiu).
- `cNF` determinístico (estável entre execuções, sempre ≠ nNF).
- Roteamento de UF: BA→endpoints próprios, RJ→SVRS, cUF BA=29, UF inválida lança erro.
- Code-128C do DANFE (tabela 0–106, checksum mód. 103) — conferido pelo agente que o escreveu.
- Coerência dos contratos entre módulos (imports resolvem para exports reais).

**NÃO validado (faça no desktop):**
- ❌ `tsc --noEmit` / `npm run build` — **nunca rodou**.
- ❌ Qualquer chamada real à SEFAZ (autorização, eventos, distribuição) — precisa do A1.
- ❌ Schema XSD 4.00 — o XML não foi validado contra os XSDs oficiais (recomendado validar antes
  de produção; reduz rejeições).

---

## 6. Detalhes que importam (não regrida sem querer)

- **Bahia exige o grupo `autXML`** (CNPJ `13937073000156` da SEFAZ-BA) — a BA **rejeita a NF-e sem
  ele**. Está em `nfe-xml.ts` (`UF_AUTXML_CNPJ`), entre `<dest>` e `<det>`.
- **Homologação:** o `dest/xNome` é forçado para `"NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM
  VALOR FISCAL"` (exigência da SEFAZ). Lógica em `nfe-xml.ts` (`destXml`).
- **`distDFeInt versao="1.35"`** (constante `DIST_VERSAO` em `distribuicao.ts`). É a versão do
  **leiaute**, não do WS. Se a SEFAZ rejeitar com "versão não suportada", ajuste só essa constante.
- **Distribuição = nacional** (Ambiente Nacional), não por UF. Respeita o throttling **656** (consumo
  indevido → aguardar ~1h). Não fica em loop infinito.
- **Idempotência da emissão:** `cNF` é derivado de (CNPJ+mod+série+nNF), então reenvio da MESMA nota
  gera a MESMA chave (a SEFAZ rejeita duplicidade em vez de autorizar duas vezes). A numeração `nNF`
  vem da `SequenciaFiscal`.
- **Certificado:** só A1 (server-side). Guardado criptografado em `CertificadoDigital`
  (`carregarCertificado`/`salvarCertificado`). Nunca logar/persistir em claro.
- **DANFE é HTML** (não há lib de PDF no projeto). Para PDF real depois: rodar puppeteer/pdfkit sobre
  o HTML, reusando `buildDanfe`/`parseNfeProc`/`code128cBars` de `danfe.ts`.

---

## 7. Próximos passos sugeridos

1. **Build + corrigir o `tsc`** (prioridade 1).
2. **Homologação BA:** conectividade (status) → emissão de teste → cancelamento → CC-e.
3. **Validar XSD 4.00** do XML gerado contra os schemas oficiais (antes de produção).
4. **DANFE em PDF** (se necessário p/ impressão "oficial").
5. **F5 — outras UFs** sob demanda (SP, MG, PR, RS, GO, MT, MS, PE, AM; MA via SVAN) — só adicionar
   na tabela `endpoints.ts` (`UF_PROPRIA`) e testar cada uma.
6. **NFC-e (modelo 65)** se for o caso — exige QR Code + CSC + DANFCE (não implementado).
7. **Contingência** (SVC-AN/SVC-RS) quando a autorizadora principal cair.

---

## 8. Pré-requisitos de operação (não-técnicos)
- Empresa **credenciada para NF-e** na SEFAZ da UF (operacional, como foi o E0116 da NFS-e).
- Certificado **A1** válido (ICP-Brasil) carregado na empresa.
- Numeração/série configuradas (`serieNfe`, `SequenciaFiscal`).
