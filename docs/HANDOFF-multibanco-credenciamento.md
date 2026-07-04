# Credenciamento bancário — Sicredi e Itaú (integração multibanco)

Guia para o cliente levar ao **gerente/officer de cada banco** e habilitar boleto + Pix pela API oficial.
Depois de obter as credenciais, cadastre em **ERP → Configurações → Contas financeiras → Integração bancária**
(escolha o banco na conta e preencha os campos abaixo). Segredos ficam **criptografados** no ERP.

> O **mTLS** (exigido no Pix Sicredi/Itaú e no Sicoob de produção) reaproveita o **certificado A1 e-CNPJ da empresa**
> — o mesmo já usado na emissão fiscal. Basta ele estar cadastrado em Configurações → Fiscal.
>
> Enquanto as credenciais de produção não chegam, use **Ambiente = Sandbox/Homologação** para testar o fluxo
> (dados de exemplo, sem mTLS). **Guias/cobranças de ambiente de teste NÃO devem ser pagas.**

---

## 🟢 Sicredi

Duas APIs distintas, com credenciamentos separados.

### Boleto (API Cobrança — "API Parceiros")
1. **Código de acesso (senha):** no Internet Banking PJ → **Cobrança → Código de Acesso → Gerar** (valida por QR no app Sicredi).
   → campo **Código de acesso (senha)**.
2. **Dados do convênio** (o gerente informa): **Código do beneficiário** (convênio de cobrança), **Cooperativa** (4 dígitos) e **Posto** (2 dígitos).
   → campos **Código do beneficiário**, **Cooperativa**, **Posto**.
3. No **Portal do Desenvolvedor** (https://developer.sicredi.com.br/api-portal/pt-br): criar uma APP com as APIs
   **"API AUTH – OPENAPI – PARCEIROS"** + **"API COBRANÇA BOLETO"**.
4. Abrir **chamado no portal** (Suporte → Abrir chamado) pedindo o **Access Token** — um p/ **Homologação**, outro p/ **Produção**.
   Esse token é o **x-api-key**. → campo **x-api-key (token do portal)**.
   > ⚠️ O `client_id`/`client_secret` gerados na APP **NÃO** são usados na cobrança (uso exclusivo Sicredi). A integração usa **x-api-key + código de acesso**.

### Pix (padrão BACEN)
5. No Portal, criar/usar uma APP com a **API Pix**; anotar **client_id** e **client_secret**.
   → campos **client_id (Pix)** e **client_secret (Pix)**.
6. **Certificado mTLS:** solicitar por chamado (enviar CSR com CNPJ + ID de adesão; o Sicredi devolve o certificado).
   No ERP, o mTLS usa o **A1 da empresa** — normalmente basta ele cadastrado.
7. **Homologação Pix:** e-mail para `integracoes_pix@sicredi.com.br` com o CNPJ (recebem a chave de homologação).
8. Cadastrar a **chave Pix recebedora** na conta bancária do ERP.

**Base URLs:** Cobrança `https://api-parceiro.sicredi.com.br` (sandbox `.../sb`) · Pix `https://api-pix.sicredi.com.br` (homolog `api-pix-h.sicredi.com.br`).

---

## 🔵 Itaú

Autenticação única (OAuth2 `client_credentials` + mTLS) para boleto e Pix.
As credenciais de **produção só saem via gerente/officer Cash** do Itaú (chegam cifradas por e-mail).

1. No **Itaú for Developers** (https://devportal.itau.com.br): contratar os produtos e gerar o **certificado dinâmico**
   (chave pública + privada + token temporário — token válido 7 dias, certificado 365 dias). No ERP o mTLS usa o **A1 da empresa**.
2. Pedir ao gerente as credenciais por família (são **client_id/client_secret distintos por produto**):
   - **CASH** → boleto sem QR + retorno; **ou BOLECODE** → boleto com QR Code Pix (bolecode).
   - **Pix Recebimentos** → cobrança Pix.
   → campos **client_id** e **client_secret**.
3. Dados do convênio de cobrança (o gerente informa): **ID do beneficiário** (id_beneficiario), **Agência**, **Conta**, **Carteira**.
   → campos **ID do beneficiário**, **Agência**, **Conta corrente**, **Carteira**.
4. Cadastrar a **chave Pix recebedora** na conta bancária do ERP.

**Base URLs:** Token `https://sts.itau.com.br/api/oauth/token` · Boleto `https://api.itau.com.br/cash_management/v2` · Pix `https://secure.api.itau.com.br/pix_recebimentos/v2`.

> ℹ️ O **schema do payload de boleto v2** do Itaú está atrás de login/contrato. A implementação segue os campos públicos;
> ao credenciar, confira contra a documentação autenticada e ajuste se necessário (é o "validar depois").

---

## ⚫ Sicoob (referência — já em produção)

Configurado na seção **"Cobrança Sicoob"** (não na tela de Integração bancária):
- **client_id** do credenciamento (Sicoob Desenvolvedores) + **nº do cliente/beneficiário**.
- mTLS com o **A1 da empresa**; **extrato** exige o **nº da conta corrente**.
- Webhook de liquidação disponível (baixa em tempo real).

---

## Cobertura por banco (o que a API oferece)

| Operação | Sicoob | Sicredi | Itaú |
|---|:---:|:---:|:---:|
| Boleto (emitir / consultar / baixar / prorrogar) | ✅ | ✅ | ✅ |
| Pix (QR dinâmico / consulta / devolução) | ✅ | ✅ | ✅ |
| Extrato / conciliação por API | ✅ | ❌¹ | ❌² |
| Baixa em tempo real (webhook) | ✅ | — | — |

¹ Sicredi só expõe extrato via **Open Finance** (não há API de parceiros para conta-corrente).
² Itaú tem extrato no Cash Management, mas o endpoint depende de **contrato + documentação autenticada**.

Para **extrato/conciliação unificado de todos os bancos**, o caminho é **Open Finance (Fase 2)** — avaliado como projeto
separado (via agregador certificado tipo Pluggy/Belvo/Klavi), com custo recorrente e fluxo de consentimento do titular.
