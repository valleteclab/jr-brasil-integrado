# Template de Feature

Use este template antes de iniciar uma feature relevante.

## Objetivo

Descreva em uma frase o resultado esperado.

## Contexto obrigatório

- Arquivos lidos:
- Módulos impactados:
- Entidades Prisma envolvidas:
- Dependências externas:

## Segurança e multiempresa

- `tenantId` envolvido:
- `companyId` envolvido:
- Perfil/permissão necessária:
- Dados sensíveis envolvidos:
- Auditoria necessária:
- Risco de vazamento entre empresas:
- Estratégia de validação de acesso:

## Escopo incluído

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

## Fora de escopo

- Item não incluído nesta entrega.

## Critérios de aceite

- [ ] Critério verificável 1
- [ ] Critério verificável 2
- [ ] Critério verificável 3
- [ ] Queries e APIs respeitam isolamento por tenant/company.
- [ ] Permissões/RBAC foram consideradas.
- [ ] Operações sensíveis geram auditoria quando aplicável.

## Validação

Comandos ou verificações esperadas:

```bash
npm run lint
npm run build
```

## Documentação a atualizar

- [ ] `STATUS.md`
- [ ] `README.md`
- [ ] `DESIGN_SYSTEM.md`
- [ ] `AGENTS.md`
- [ ] Outro:
