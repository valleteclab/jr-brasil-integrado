# JR Brasil Integrado

Base inicial da plataforma integrada ERP + ecommerce B2B da JR Brasil Peças & Serviços.

## O que já foi criado

- App Next.js com TypeScript.
- Prisma configurado para PostgreSQL.
- Schema inicial cobrindo ERP, ecommerce, estoque, financeiro, fiscal, compras e OS.
- Manual de agentes de IA em `AGENTS.md`.
- Design system em `DESIGN_SYSTEM.md`.
- Regras de segurança e multiempresa em `SECURITY_MULTI_TENANCY.md`.
- Acompanhamento de desenvolvimento em `STATUS.md`.
- Páginas iniciais:
  - `/` visão da plataforma.
  - `/loja` vitrine B2B inicial.
  - `/erp` shell inicial do backoffice.

## Leitura obrigatória para agentes de IA

Antes de modificar código, todo agente deve ler:

1. `AGENTS.md`
2. `STATUS.md`
3. `DESIGN_SYSTEM.md`
4. `SECURITY_MULTI_TENANCY.md`
5. `README.md`

O projeto será desenvolvido com foco em rastreabilidade, commits pequenos e atualização de status a cada push.

Toda feature deve considerar multiempresa, isolamento por tenant/company, RBAC, auditoria e proteção contra perda/vazamento de dados.

## Como rodar

1. Instale as dependências:

```bash
npm install
```

2. Copie `.env.example` para `.env` e ajuste `DATABASE_URL`.

3. Gere o client Prisma:

```bash
npm run prisma:generate
```

4. Rode o projeto:

```bash
npm run dev
```

## WhatsApp comercial próprio

O painel `/admin/agente-comercial` pode conectar um número exclusivo pela Evolution API
hospedada na VPS. O administrador gera o QR Code, verifica a conexão, configura a IA e
ativa as respostas aos interessados. A integração é global da plataforma e não acessa
dados operacionais dos clientes. O transporte dos WhatsApps das empresas permanece independente.

O atendimento comercial passa por classificação de escopo, geração e revisão independente
antes do envio. Perguntas alheias ao XERP são redirecionadas; dúvidas sem informação
confirmada ou falhas na validação sinalizam atendimento humano, sem enviar a resposta
livre. A base diferencia CHAT, ERP completo e SPED Fiscal adicional. Instruções
complementares servem apenas como preferências de estilo, não para ampliar o escopo ou
inventar condições comerciais. Respostas pendentes anteriores à proteção são revalidadas.

Uma resposta livre pode consumir três chamadas à IA (escopo, geração e revisão), com
limites de 10s/30s/10s. A classificação e a revisão são probabilísticas: os testes locais
simulam a IA e não substituem a avaliação real após deploy. Não há garantia absoluta
contra desvios. Teste seguro: `npx tsx scripts/test-commercial-delivery.ts`.

Provisionamento, segredos, implantação e limites: `deploy/DEPLOY.md`, seção
“WhatsApp comercial com Evolution”. Não é necessário alterar o schema ou executar seed.

## Próximas etapas técnicas

- Criar migrations do banco.
- Adicionar seed dos dados atuais do protótipo.
- Implementar autenticação e permissões.
- Migrar componentes reais do ERP/ecommerce standalone para módulos Next.js.
- Criar APIs para produtos, clientes, estoque, pedidos e orçamentos.
