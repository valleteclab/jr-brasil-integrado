import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: {
      name: "Admin",
      description: "Acesso total à plataforma integrada"
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@jrbrasilpecas.com.br" },
    update: {},
    create: {
      name: "Administrador JR Brasil",
      email: "admin@jrbrasilpecas.com.br",
      passwordHash: "change-me",
      roleId: adminRole.id
    }
  });

  const category = await prisma.productCategory.upsert({
    where: { slug: "pecas-agricolas" },
    update: {},
    create: { name: "Peças Agrícolas", slug: "pecas-agricolas" }
  });

  const brand = await prisma.productBrand.upsert({
    where: { name: "John Deere" },
    update: {},
    create: { name: "John Deere" }
  });

  const warehouse = await prisma.warehouse.create({
    data: { name: "Galpão LEM-1 · Estoque geral", state: "BA" }
  });

  const product = await prisma.product.upsert({
    where: { sku: "AXE72011" },
    update: {},
    create: {
      sku: "AXE72011",
      name: "Eixo de Acionamento John Deere AXE72011",
      description: "Produto inicial migrado do protótipo ecommerce/ERP.",
      categoryId: category.id,
      brandId: brand.id,
      costPrice: 3450,
      salePrice: 4200,
      minQuantity: 1
    }
  });

  await prisma.stockBalance.upsert({
    where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    update: { quantity: 12, minimum: 5 },
    create: { productId: product.id, warehouseId: warehouse.id, quantity: 12, minimum: 5 }
  });

  await prisma.customer.upsert({
    where: { document: "12.345.678/0001-90" },
    update: {},
    create: {
      legalName: "Fazendas Boa Vista Ltda",
      tradeName: "Boa Vista Agro",
      document: "12.345.678/0001-90",
      status: "ACTIVE",
      segment: "Produtor rural",
      creditLimit: 50000,
      creditUsed: 15000,
      paymentTerms: "Faturado 30/60/90",
      contacts: {
        create: { name: "Carlos Mendes", email: "carlos@boavista.agr.br", phone: "(77) 99888-7700", isPrimary: true }
      },
      addresses: {
        create: { label: "Fazenda Boa Vista", zipCode: "47850-000", street: "BR-242 Km 87", city: "Luís Eduardo Magalhães", state: "BA", isDefault: true }
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
