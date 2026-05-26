import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "jr-brasil" },
    update: {},
    create: {
      nome: "JR Brasil",
      slug: "jr-brasil"
    }
  });

  const empresa = await prisma.empresa.upsert({
    where: { tenantId_cnpj: { tenantId: tenant.id, cnpj: "00.000.000/0001-00" } },
    update: {},
    create: {
      tenantId: tenant.id,
      razaoSocial: "JR Brasil Peças e Serviços Ltda",
      nomeFantasia: "JR Brasil Peças & Serviços",
      cnpj: "00.000.000/0001-00",
      matriz: true
    }
  });

  const perfilAdmin = await prisma.perfil.upsert({
    where: { tenantId_nome: { tenantId: tenant.id, nome: "SUPER_ADMIN" } },
    update: {},
    create: {
      tenantId: tenant.id,
      nome: "SUPER_ADMIN",
      descricao: "Acesso total ao tenant JR Brasil"
    }
  });

  const permissoes = [
    ["usuarios", "gerenciar"],
    ["empresas", "gerenciar"],
    ["produtos", "gerenciar"],
    ["clientes", "gerenciar"],
    ["pedidos", "gerenciar"],
    ["estoque", "gerenciar"],
    ["financeiro", "gerenciar"],
    ["fiscal", "gerenciar"]
  ];

  for (const [modulo, acao] of permissoes) {
    await prisma.permissao.upsert({
      where: {
        tenantId_modulo_acao_perfilId: {
          tenantId: tenant.id,
          modulo,
          acao,
          perfilId: perfilAdmin.id
        }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        perfilId: perfilAdmin.id,
        modulo,
        acao
      }
    });
  }

  const usuarioAdmin = await prisma.usuario.upsert({
    where: { email: "admin@jrbrasilpecas.com.br" },
    update: {},
    create: {
      nome: "Administrador JR Brasil",
      email: "admin@jrbrasilpecas.com.br",
      senhaHash: "change-me"
    }
  });

  await prisma.usuarioVinculo.upsert({
    where: {
      tenantId_empresaId_usuarioId_perfilId: {
        tenantId: tenant.id,
        empresaId: empresa.id,
        usuarioId: usuarioAdmin.id,
        perfilId: perfilAdmin.id
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      usuarioId: usuarioAdmin.id,
      perfilId: perfilAdmin.id
    }
  });

  const categoria = await prisma.produtoCategoria.upsert({
    where: { tenantId_empresaId_slug: { tenantId: tenant.id, empresaId: empresa.id, slug: "pecas-agricolas" } },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      nome: "Peças Agrícolas",
      slug: "pecas-agricolas"
    }
  });

  const marca = await prisma.produtoMarca.upsert({
    where: { tenantId_empresaId_nome: { tenantId: tenant.id, empresaId: empresa.id, nome: "John Deere" } },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      nome: "John Deere"
    }
  });

  const deposito = await prisma.deposito.upsert({
    where: { tenantId_empresaId_nome: { tenantId: tenant.id, empresaId: empresa.id, nome: "Galpão LEM-1 · Estoque geral" } },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      nome: "Galpão LEM-1 · Estoque geral",
      uf: "BA"
    }
  });

  const produto = await prisma.produto.upsert({
    where: { tenantId_empresaId_sku: { tenantId: tenant.id, empresaId: empresa.id, sku: "AXE72011" } },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      sku: "AXE72011",
      nome: "Eixo de Acionamento John Deere AXE72011",
      descricao: "Produto inicial migrado do protótipo ecommerce/ERP.",
      categoriaId: categoria.id,
      marcaId: marca.id,
      precoCusto: 3450,
      precoVenda: 4200,
      quantidadeMinima: 1
    }
  });

  await prisma.estoqueSaldo.upsert({
    where: {
      tenantId_empresaId_produtoId_depositoId: {
        tenantId: tenant.id,
        empresaId: empresa.id,
        produtoId: produto.id,
        depositoId: deposito.id
      }
    },
    update: { quantidade: 12, minimo: 5 },
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      produtoId: produto.id,
      depositoId: deposito.id,
      quantidade: 12,
      minimo: 5
    }
  });

  await prisma.cliente.upsert({
    where: { tenantId_documento: { tenantId: tenant.id, documento: "12.345.678/0001-90" } },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      razaoSocial: "Fazendas Boa Vista Ltda",
      nomeFantasia: "Boa Vista Agro",
      documento: "12.345.678/0001-90",
      status: "ATIVO",
      segmento: "Produtor rural",
      limiteCredito: 50000,
      creditoUsado: 15000,
      condicaoPagamento: "Faturado 30/60/90",
      contatos: {
        create: {
          tenantId: tenant.id,
          empresaId: empresa.id,
          nome: "Carlos Mendes",
          email: "carlos@boavista.agr.br",
          telefone: "(77) 99888-7700",
          principal: true
        }
      },
      enderecos: {
        create: {
          tenantId: tenant.id,
          empresaId: empresa.id,
          apelido: "Fazenda Boa Vista",
          cep: "47850-000",
          logradouro: "BR-242 Km 87",
          cidade: "Luís Eduardo Magalhães",
          uf: "BA",
          padrao: true
        }
      }
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
