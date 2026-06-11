import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Erros TRANSITÓRIOS de transação/conexão (comuns em banco remoto instável, ex.: proxy do Railway):
 * a transação perdeu a conexão ou foi fechada no meio. Como a transação é ATÔMICA (rollback total),
 * reexecutar é seguro. Não inclui erros de validação/regra de negócio (esses NÃO são repetidos).
 */
const TRANSIENT_MARKERS = [
  "Transaction not found",
  "Transaction already closed",
  "Transaction API error",
  "Unable to start a transaction",
  "Can't reach database server",
  "Server has closed the connection",
  "Connection reset",
  "ECONNRESET",
  "P2034" // write conflict / deadlock — recomendado reexecutar pela própria Prisma
];

function isTransient(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const code = (error as { code?: string } | null)?.code ?? "";
  return code === "P2034" || TRANSIENT_MARKERS.some((m) => msg.includes(m));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa uma transação interativa com REPETIÇÃO em erros transitórios de conexão/transação.
 * Use no lugar de `prisma.$transaction(fn, options)` em fluxos de escrita sensíveis (venda, estoque).
 */
export async function runInTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; retries?: number }
): Promise<T> {
  // Mais tentativas: o proxy do Railway pode manter VÁRIAS conexões ociosas mortas no pool; cada
  // erro evicta uma, então pode levar algumas tentativas (com intervalo p/ reconectar) até pegar
  // uma conexão viva. O backoff cresce até ~2s.
  const retries = options?.retries ?? 4;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        maxWait: options?.maxWait ?? 15000,
        timeout: options?.timeout ?? 30000
      });
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === retries) throw error;
      await delay(Math.min(2000, 300 * 2 ** attempt)); // 300, 600, 1200, 2000…
    }
  }
  throw lastError;
}
