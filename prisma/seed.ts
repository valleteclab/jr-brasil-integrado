import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

// Hash scrypt no MESMO formato de src/lib/security/password.ts ("salt:hash").
function hashPasswordSeed(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Catálogo de módulos (espelha src/lib/auth/modules.ts).
const TODOS_MODULOS = [
  "dashboard", "atendimento", "caixa", "vendas", "orcamentos", "os", "compras",
  "entradas-fiscais", "estoque", "inventarios", "produtos", "clientes", "fornecedores",
  "colaboradores", "regras-tributarias", "financeiro", "fluxo-caixa", "fiscal",
  "relatorios", "assistente", "configuracoes"
] as const;

const PERFIS_PADRAO: Array<{ nome: string; descricao: string; modulos: readonly string[] | "*" }> = [
  { nome: "SUPER_ADMIN", descricao: "Acesso total à plataforma.", modulos: "*" },
  { nome: "COMPANY_ADMIN", descricao: "Administra a empresa (todos os módulos).", modulos: "*" },
  { nome: "SALES", descricao: "Vendas, atendimento, caixa e orçamentos.", modulos: ["dashboard", "atendimento", "caixa", "vendas", "orcamentos", "os", "clientes", "produtos", "assistente"] },
  { nome: "STOCK", descricao: "Estoque, inventários e produtos.", modulos: ["dashboard", "estoque", "inventarios", "produtos", "compras"] },
  { nome: "PURCHASE", descricao: "Compras e fornecedores.", modulos: ["dashboard", "compras", "fornecedores", "produtos", "estoque"] },
  { nome: "WORKSHOP", descricao: "Oficina: ordens de serviço.", modulos: ["dashboard", "os", "clientes", "produtos", "estoque"] },
  { nome: "FINANCE", descricao: "Financeiro, fluxo de caixa e relatórios.", modulos: ["dashboard", "financeiro", "fluxo-caixa", "relatorios", "assistente"] },
  { nome: "FISCAL", descricao: "Notas fiscais, regras tributárias e configuração fiscal.", modulos: ["dashboard", "fiscal", "regras-tributarias", "configuracoes"] }
];

const ADMIN_EMAIL = "admin@jrbrasilpecas.com.br";
// Senha temporária forte do admin. Pode ser sobrescrita por ADMIN_INITIAL_PASSWORD.
// IMPORTANTE: troque após o primeiro login.
const ADMIN_SENHA = process.env.ADMIN_INITIAL_PASSWORD ?? "Jr#Brasil@2026!Adm7qZ";

// Dono da plataforma (SaaS): conta SEPARADA, sem vínculo a nenhum cliente. Acessa
// apenas o painel /admin. Configurável por env; só é criada se PLATFORM_OWNER_EMAIL existir.
const PLATFORM_OWNER_EMAIL = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
const PLATFORM_OWNER_SENHA = process.env.PLATFORM_OWNER_PASSWORD ?? "Plat@2026!Dono9xK";

/**
 * Cria/atualiza o DONO DA PLATAFORMA como conta separada (plataformaAdmin, sem vínculo).
 * Só roda se PLATFORM_OWNER_EMAIL estiver definido, para não criar contas surpresa.
 */
async function seedPlatformOwner() {
  if (!PLATFORM_OWNER_EMAIL) {
    console.log("\n[seed] PLATFORM_OWNER_EMAIL não definido — dono da plataforma não foi criado.");
    console.log("[seed] Para criar: npm run admin-plataforma <email> [senha]\n");
    return;
  }
  await prisma.usuario.upsert({
    where: { email: PLATFORM_OWNER_EMAIL },
    update: { status: "ATIVO", plataformaAdmin: true },
    create: {
      nome: "Dono da Plataforma",
      email: PLATFORM_OWNER_EMAIL,
      senhaHash: hashPasswordSeed(PLATFORM_OWNER_SENHA),
      status: "ATIVO",
      plataformaAdmin: true
    }
  });
  console.log(`\n[seed] Dono da plataforma: ${PLATFORM_OWNER_EMAIL} | Senha: ${PLATFORM_OWNER_SENHA} (troque apos o primeiro login)\n`);
}

/** Cria/atualiza os perfis padrão (com permissões por módulo) e o admin SUPER_ADMIN. */
async function seedPerfisEAdmin(tenantId: string, empresaId: string) {
  let superAdminId = "";
  for (const def of PERFIS_PADRAO) {
    const perfil = await prisma.perfil.upsert({
      where: { tenantId_nome: { tenantId, nome: def.nome } },
      update: { descricao: def.descricao },
      create: { tenantId, nome: def.nome, descricao: def.descricao }
    });
    if (def.nome === "SUPER_ADMIN") superAdminId = perfil.id;

    const modulos = def.modulos === "*" ? [...TODOS_MODULOS] : def.modulos;
    // Recria as permissões (acao = "acessar") do perfil de forma idempotente.
    await prisma.permissao.deleteMany({ where: { perfilId: perfil.id } });
    await prisma.permissao.createMany({
      data: modulos.map((modulo) => ({ tenantId, perfilId: perfil.id, modulo, acao: "acessar" }))
    });
  }

  // Admin do CLIENTE (tenant JR Brasil): é SUPER_ADMIN do cliente, NÃO dono da
  // plataforma. plataformaAdmin:false explícito para desfazer conflação em re-seeds.
  const admin = await prisma.usuario.upsert({
    where: { email: ADMIN_EMAIL },
    update: { status: "ATIVO", plataformaAdmin: false },
    create: { nome: "Administrador", email: ADMIN_EMAIL, senhaHash: hashPasswordSeed(ADMIN_SENHA), status: "ATIVO", plataformaAdmin: false }
  });
  // Garante a senha (caso o usuário já existisse sem a senha correta).
  await prisma.usuario.update({ where: { id: admin.id }, data: { senhaHash: hashPasswordSeed(ADMIN_SENHA) } });

  await prisma.usuarioVinculo.upsert({
    where: { tenantId_empresaId_usuarioId_perfilId: { tenantId, empresaId, usuarioId: admin.id, perfilId: superAdminId } },
    update: { ativo: true },
    create: { tenantId, empresaId, usuarioId: admin.id, perfilId: superAdminId, ativo: true }
  });

  console.log(`\n[seed] Admin: ${ADMIN_EMAIL} | Senha: ${ADMIN_SENHA} (troque apos o primeiro login)\n`);
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "jr-brasil" },
    update: {},
    create: {
      nome: "JR Brasil",
      slug: "jr-brasil"
    }
  });

  const empresaData = {
    razaoSocial: "JR Brasil Peças e Serviços Ltda",
    nomeFantasia: "JR Brasil Peças & Serviços",
    inscricaoEstadual: "123456789",
    inscricaoMunicipal: "987654",
    regimeTributario: "SIMPLES_NACIONAL" as const,
    enderecoLogradouro: "BR-242, Km 87",
    enderecoNumero: "S/N",
    enderecoBairro: "Distrito Industrial",
    enderecoCidade: "Luís Eduardo Magalhães",
    enderecoUf: "BA",
    enderecoCep: "47850-000",
    codigoMunicipioIbge: "2919553",
    telefone: "(77) 3628-0000",
    email: "fiscal@jrbrasilpecas.com.br"
  };
  const empresa = await prisma.empresa.upsert({
    where: { tenantId_cnpj: { tenantId: tenant.id, cnpj: "00.000.000/0001-00" } },
    update: empresaData,
    create: {
      tenantId: tenant.id,
      cnpj: "00.000.000/0001-00",
      matriz: true,
      ...empresaData
    }
  });

  await prisma.configuracaoFiscal.upsert({
    where: { empresaId: empresa.id },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      provedor: "MANUAL",
      ambiente: "HOMOLOGACAO",
      regimeTributario: "SIMPLES_NACIONAL",
      serieNfe: "1",
      serieNfce: "1",
      serieNfse: "1",
      emitirNfe: true,
      emitirNfce: true,
      emitirNfse: true,
      codigoMunicipioIbge: "2919553",
      ativo: true
    }
  });

  await prisma.contaBancaria.upsert({
    where: { tenantId_empresaId_nome: { tenantId: tenant.id, empresaId: empresa.id, nome: "Conta Movimento" } },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      nome: "Conta Movimento",
      banco: "Banco do Brasil",
      agencia: "1234-5",
      conta: "67890-1",
      saldoInicial: 50000,
      saldoAtual: 50000
    }
  });

  const regrasTributarias = [
    { nome: "ICMS Simples - venda interna BA", tributo: "ICMS" as const, operacao: "VENDA" as const, ufDestino: "BA", csosn: "102", aliquota: 18 },
    { nome: "PIS - venda Simples", tributo: "PIS" as const, operacao: "VENDA" as const, cst: "49", aliquota: 0 },
    { nome: "COFINS - venda Simples", tributo: "COFINS" as const, operacao: "VENDA" as const, cst: "49", aliquota: 0 },
    { nome: "ISS - serviços de oficina", tributo: "ISS" as const, operacao: "VENDA" as const, aliquota: 5 }
  ];
  for (const regra of regrasTributarias) {
    const exists = await prisma.regraTributaria.findFirst({
      where: { tenantId: tenant.id, empresaId: empresa.id, nome: regra.nome }
    });
    if (!exists) {
      await prisma.regraTributaria.create({
        data: {
          tenantId: tenant.id,
          empresaId: empresa.id,
          regimeEmpresa: "SIMPLES_NACIONAL",
          ufOrigem: "BA",
          vigenciaInicio: new Date("2024-01-01T00:00:00.000Z"),
          ...regra
        }
      });
    }
  }

  // Perfis padrão (RBAC por módulo) + usuário administrador SUPER_ADMIN do cliente.
  await seedPerfisEAdmin(tenant.id, empresa.id);

  // Dono da plataforma (conta separada, sem vínculo a cliente).
  await seedPlatformOwner();

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
    update: { padrao: true },
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      nome: "Galpão LEM-1 · Estoque geral",
      uf: "BA",
      padrao: true
    }
  });

  const fornecedor = await prisma.fornecedor.upsert({
    where: { tenantId_empresaId_documento: { tenantId: tenant.id, empresaId: empresa.id, documento: "98.765.432/0001-10" } },
    update: {},
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      razaoSocial: "Distribuidora de Peças Agro Ltda",
      nomeFantasia: "AgroPeças Distribuidora",
      documento: "98.765.432/0001-10",
      email: "comercial@agropecas.com.br",
      telefone: "(11) 4002-8922",
      cidade: "São Paulo",
      uf: "SP",
      condicaoPagamento: "30/60 dias"
    }
  });
  void fornecedor;

  const catalogo = [
    { sku: "FLT-2201", nome: "Filtro de Óleo John Deere RE504836", custo: 78.5, venda: 129.9, ncm: "84212300", saldo: 40, minimo: 10 },
    { sku: "COR-3310", nome: "Correia Dentada Massey Ferguson", custo: 145, venda: 239.9, ncm: "40103100", saldo: 18, minimo: 6 },
    { sku: "ROL-5582", nome: "Rolamento de Roda Valtra", custo: 210, venda: 349, ncm: "84821000", saldo: 4, minimo: 8 },
    { sku: "BAT-7700", nome: "Bateria 150Ah Heliar Tratores", custo: 690, venda: 980, ncm: "85071000", saldo: 0, minimo: 3 }
  ];
  for (const p of catalogo) {
    const produtoCatalogo = await prisma.produto.upsert({
      where: { tenantId_empresaId_sku: { tenantId: tenant.id, empresaId: empresa.id, sku: p.sku } },
      update: {},
      create: {
        tenantId: tenant.id,
        empresaId: empresa.id,
        sku: p.sku,
        nome: p.nome,
        categoriaId: categoria.id,
        marcaId: marca.id,
        ncm: p.ncm,
        cfop: "5102",
        origem: "0",
        precoCusto: p.custo,
        ultimoCusto: p.custo,
        custoMedio: p.custo,
        precoVenda: p.venda,
        precoMinimo: p.venda * 0.85,
        quantidadeMinima: 1,
        visivelEcommerce: true
      }
    });
    await prisma.produtoFiscal.upsert({
      where: { produtoId: produtoCatalogo.id },
      update: { ncm: p.ncm },
      create: { tenantId: tenant.id, empresaId: empresa.id, produtoId: produtoCatalogo.id, ncm: p.ncm, origem: "0" }
    });
    await prisma.estoqueSaldo.upsert({
      where: {
        tenantId_empresaId_produtoId_depositoId_controleKey: {
          tenantId: tenant.id,
          empresaId: empresa.id,
          produtoId: produtoCatalogo.id,
          depositoId: deposito.id,
          controleKey: "SEM_CONTROLE"
        }
      },
      update: { quantidade: p.saldo, minimo: p.minimo },
      create: {
        tenantId: tenant.id,
        empresaId: empresa.id,
        produtoId: produtoCatalogo.id,
        depositoId: deposito.id,
        controleKey: "SEM_CONTROLE",
        quantidade: p.saldo,
        minimo: p.minimo
      }
    });
  }

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
      tenantId_empresaId_produtoId_depositoId_controleKey: {
        tenantId: tenant.id,
        empresaId: empresa.id,
        produtoId: produto.id,
        depositoId: deposito.id,
        controleKey: "SEM_CONTROLE"
      }
    },
    update: { quantidade: 12, minimo: 5 },
    create: {
      tenantId: tenant.id,
      empresaId: empresa.id,
      produtoId: produto.id,
      depositoId: deposito.id,
      controleKey: "SEM_CONTROLE",
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
