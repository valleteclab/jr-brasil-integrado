# JR Brasil Integrado

Base inicial da plataforma integrada ERP + ecommerce B2B da JR Brasil Peças & Serviços.

## O que já foi criado

- App Next.js com TypeScript.
- Prisma configurado para PostgreSQL.
- Schema inicial cobrindo ERP, ecommerce, estoque, financeiro, fiscal, compras e OS.
- Manual de agentes de IA em `AGENTS.md`.
- Design system em `DESIGN_SYSTEM.md`.
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
4. `README.md`

O projeto será desenvolvido com foco em rastreabilidade, commits pequenos e atualização de status a cada push.

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

## Próximas etapas técnicas

- Criar migrations do banco.
- Adicionar seed dos dados atuais do protótipo.
- Implementar autenticação e permissões.
- Migrar componentes reais do ERP/ecommerce standalone para módulos Next.js.
- Criar APIs para produtos, clientes, estoque, pedidos e orçamentos.
