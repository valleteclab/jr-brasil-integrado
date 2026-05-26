# JR Brasil Integrado

Base inicial da plataforma integrada ERP + ecommerce B2B da JR Brasil Peças & Serviços.

## O que já foi criado

- App Next.js com TypeScript.
- Prisma configurado para PostgreSQL.
- Schema inicial cobrindo ERP, ecommerce, estoque, financeiro, fiscal, compras e OS.
- Páginas iniciais:
  - `/` visão da plataforma.
  - `/loja` vitrine B2B inicial.
  - `/erp` shell inicial do backoffice.

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
