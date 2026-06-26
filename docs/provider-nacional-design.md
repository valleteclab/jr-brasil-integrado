# Design — Provider NACIONAL (NFS-e direto na SEFIN) + roteamento 2 APIs

**Status:** desenho (PoC de viabilidade concluída — assinatura XMLDSig + mTLS + schema do DPS
validados na produção restrita com certificado real). Ver `scripts/nfse-nacional-poc.ts`.

## Objetivo
Emitir **NFS-e direto no Sistema Nacional (SEFIN)**, sem intermediário, **convivendo** com o ACBr:
- **NF-e (55) e NFC-e (65)** → **ACBr** (como hoje).
- **NFS-e** → **NACIONAL** (direto) quando o município é aderente; **ACBr** como fallback nos não-aderentes.

Base do produto: **módulo MEI simplificado** que só emite NFS-e.

---

## 1. Roteamento por tipo de documento (peça central)
Hoje `emitFiscalDocument` faz `resolveFiscalProvider(config.provider)` — **um** provedor por empresa.
Passa a **rotear pelo `document.modelo`**:

```
resolveProviderParaModelo(modelo, config, municipioAderente):
  se modelo == NFSE e config.provedorServicos == NACIONAL e municipioAderente: NACIONAL
  se modelo == NFSE: provedorServicos (fallback ACBr quando não-aderente)
  senão (NFE/NFCE): provedorProdutos (ACBr)
```

**Config (decisão):** separar a escolha por família — `provedorProdutos` (NF-e/NFC-e) e
`provedorServicos` (NFS-e). Mapeia o modelo mental "2 APIs juntas". Mantém o provedor global
(/admin/provedor-fiscal), agora com 2 campos. Adesão do município já é detectada hoje
(`resolveNfseProvider` consulta `/nfse/cidades/{ibge}`).

## 2. NacionalFiscalProvider (implementa `FiscalProvider`)
`id = "NACIONAL"`. Só NFS-e (NFE/NFCE → erro "provider emite apenas NFS-e").

- **emit**:
  1. `buildDpsXml(input)` — **porta o `buildNfseBody` do ACBr (JSON) para XML** do schema nacional.
     Reusa TODA a regra que já temos: `cServ` (cTribNac, cNBS, xDescServ sanitizado), `valores/trib`
     (tribISSQN, tpRetISSQN, `tribFed` com **vRetCP/INSS**, `totTrib/vTotTrib`), **obra**, **infoCompl**,
     **subst** (substituição), retenções, material→INSS. Muda só a **serialização e a ordem dos
     elementos** — a PoC já mapeou as pegadinhas (prólogo UTF-8; `cServ`: cTribNac→xDescServ;
     `tribMun` sem `pAliq`; `totTrib` envolve `<vTotTrib>`; `dhEmi` em -03:00 real; `prest` com `IM`).
  2. `assinarDps(xml, cert)` — XMLDSig enveloped + C14N + RSA-SHA256, reference `#<infDPS.Id>`
     (pipeline da PoC, `xml-crypto` + `node-forge`).
  3. GZip + Base64.
  4. **mTLS POST** `/SefinNacional/nfse` (cert = A1 da empresa).
  5. parse → `EmitResult` (chaveAcesso = chNFSe; providerRef; status; `motivo` = erros[].Descricao).
- **cancel**: evento → `POST /nfse/{chave}/eventos` (XML de evento assinado).
- **correct**: NFS-e nacional não tem CC-e; correção = **substituição** (já implementada). Retorna não-suportado.
- **queryStatus**: `GET /nfse/{chave}` (ou distribuição `/DFe/{NSU}`).
- **downloadDocument**: `GET /danfse/{chave}` (PDF), `GET /nfse/{chave}` (XML GZip+Base64 → descompacta).

## 3. Certificado (mudança de segurança — atenção)
Hoje **não armazenamos** o A1 (repassamos ao ACBr). Para o NACIONAL ele é necessário server-side
(assinar **e** mTLS). Então:
- **Armazenar o .pfx criptografado + senha criptografada** (reusar `encryptSecret`/`decryptSecret`).
  Sugestão: tabela `CertificadoEmpresa { empresaId @unique, pfx (bytes, criptografado), senha
  (criptografada), titularCnpj, validade, criadoEm }`.
- Decriptar **em memória** só na emissão; nunca logar/persistir em claro.
- `ProviderContext` ganha `certificado?: { pfx: Buffer; senha: string } | null`.
- `getFiscalRuntimeConfig` carrega/decripta o cert quando o provider resolvido for NACIONAL.
- A3 (token/hardware) **não serve** em servidor → exigir **A1**.

## 4. Mudanças de schema/dados (migrações)
- enum `ProvedorFiscal`: **+ NACIONAL**.
- `ConfiguracaoFiscal` (ou `PlataformaConfiguracao`): `provedorProdutos` + `provedorServicos`
  (ou um flag "NFS-e via nacional"). Default retrocompatível: ambos = provedor ativo atual.
- Guarda do certificado (tabela acima).
- URLs SEFIN fixas por ambiente (produção `sefin.nfse.gov.br`, restrita
  `sefin.producaorestrita.nfse.gov.br`) — derivadas do ambiente, não configuráveis pela empresa.

## 5. Fases
- **F1 — núcleo de emissão** (reusa a PoC): `NacionalFiscalProvider.emit` (buildDpsXml + assinar +
  enviar + parse). Testar contra a produção restrita até autorizar.
- **F2 — roteamento por modelo** em `emitFiscalDocument` (NFSE→NACIONAL, resto→ACBr) + config `provedorServicos`.
- **F3 — guarda criptografada do A1** + UI de upload (mudar o fluxo atual que repassa ao ACBr).
- **F4 — eventos**: cancelamento, substituição (evento), download DANFSE/XML, queryStatus.
- **F5 — módulo MEI**: cadastro mínimo (CNPJ/IM/certificado/município) + 1 tela "emitir serviço".

## Riscos / decisões em aberto
- **Credenciamento** da empresa no CNC NFS-e do município (IM correta) — operacional, não técnico
  (foi onde a PoC parou: E0116).
- Idempotência: `idDps` é determinístico (cMun+CNPJ+série+nDPS) — controlar série/número por empresa
  (reusar `SequenciaFiscal`); reenvio deve reusar o mesmo número (evita E de duplicidade).
- Confirmar se a **substituição** no nacional é via grupo `subst` no DPS (como montamos) ou via
  **evento** — validar na produção restrita.
- Manutenção do leiaute por nossa conta a cada Nota Técnica (vs ACBr atualizar).
