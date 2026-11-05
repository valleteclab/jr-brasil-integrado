/**
 * Teste das regras de vínculo automático de item da NF-e — SEM REDE, SEM BANCO.
 * O caso que originou tudo: "mini pc" vinculado a "brita" por colisão de código curto.
 */
import { avaliarMatchPorSku, MIN_CARACTERES_CODIGO_CONFIAVEL } from "../src/domains/products/application/match-produto-regras";

let falhas = 0;
function conferir(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`);
}
const resumo = (a: ReturnType<typeof avaliarMatchPorSku>) => ({ aceitar: a.aceitar, revisar: a.revisar, confianca: a.confianca });

// O caso real: código curto não pode casar sozinho.
conferir("código '7' não casa", resumo(avaliarMatchPorSku({ codigoFornecedor: "7", vinculadoAOutroFornecedor: false })), { aceitar: false, revisar: true, confianca: 0 });
conferir("código '001' não casa", resumo(avaliarMatchPorSku({ codigoFornecedor: "001", vinculadoAOutroFornecedor: false })), { aceitar: false, revisar: true, confianca: 0 });
conferir("código '123' não casa", resumo(avaliarMatchPorSku({ codigoFornecedor: "123", vinculadoAOutroFornecedor: false })), { aceitar: false, revisar: true, confianca: 0 });

// No limite do tamanho mínimo já pode casar.
const noLimite = "9".repeat(MIN_CARACTERES_CODIGO_CONFIAVEL);
conferir("código no tamanho mínimo casa", resumo(avaliarMatchPorSku({ codigoFornecedor: noLimite, vinculadoAOutroFornecedor: false })), { aceitar: true, revisar: false, confianca: 100 });

// Código longo, produto livre: casa com confiança total.
conferir("código longo casa", resumo(avaliarMatchPorSku({ codigoFornecedor: "MPC-2040-X", vinculadoAOutroFornecedor: false })), { aceitar: true, revisar: false, confianca: 100 });

// Produto já é de outro fornecedor: é coincidência, não casa.
conferir("produto de outro fornecedor não casa", resumo(avaliarMatchPorSku({ codigoFornecedor: "MPC-2040-X", vinculadoAOutroFornecedor: true })), { aceitar: false, revisar: true, confianca: 0 });

// Espaços não podem burlar o tamanho mínimo.
conferir("espaços não contam no tamanho", resumo(avaliarMatchPorSku({ codigoFornecedor: "  7  ", vinculadoAOutroFornecedor: false })), { aceitar: false, revisar: true, confianca: 0 });

// Toda recusa explica o porquê — a mensagem aparece na conferência.
const recusa = avaliarMatchPorSku({ codigoFornecedor: "7", vinculadoAOutroFornecedor: false });
conferir("recusa traz motivo", recusa.motivo.length > 20, true);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
