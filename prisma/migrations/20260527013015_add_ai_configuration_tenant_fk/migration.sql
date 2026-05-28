-- AddForeignKey
ALTER TABLE "ConfiguracaoIa" ADD CONSTRAINT "ConfiguracaoIa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
