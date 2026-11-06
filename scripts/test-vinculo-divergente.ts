/**
 * Teste do detector de vínculo errado — SEM REDE, SEM BANCO.
 *
 * O caso real que originou: nota 38361 da Valleteclab, 21 itens de material elétrico todos
 * apontando para "CIMENTO 50 KG CP II". Os casos de NÃO-acusação são tão importantes quanto:
 * um falso positivo manda a pessoa revisar vínculo que estava certo.
 */
import {
  detectarVinculosDivergentes,
  mesmaPosicaoNcm,
  nomeSugerido,
  LIMITE_REVISAO,
  type ItemParaAnalise
} from "../src/domains/products/application/vinculo-divergente";

let falhas = 0;
function conferir(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`);
}

// --- comparação de NCM por posição ------------------------------------------
conferir("NCM idêntico é a mesma posição", mesmaPosicaoNcm("85359090", "85359090"), true);
conferir("subitem diferente na mesma posição não acusa", mesmaPosicaoNcm("85369090", "85362000"), true);
conferir("posição diferente acusa", mesmaPosicaoNcm("25232910", "85359090"), false);
conferir("ponto não atrapalha", mesmaPosicaoNcm("8535.90.90", "85359090"), true);
// Sem NCM confiável o detector se cala: acusar sem dado é pior que não acusar.
conferir("NCM ausente na nota não acusa", mesmaPosicaoNcm(null, "85359090"), true);
conferir("NCM ausente no produto não acusa", mesmaPosicaoNcm("85359090", null), true);
conferir("NCM curto demais não acusa", mesmaPosicaoNcm("853", "85359090"), true);

// --- o caso real -------------------------------------------------------------
const CIMENTO = { produtoId: "p-cimento", produtoNome: "CIMENTO 50 KG CP II", ncmProduto: "85359090" };
const nota38361: ItemParaAnalise[] = [
  { id: "i1", notaId: "n1", descricaoFornecedor: "ABRACADEIRA C/CHAVETA TIPO D 1/2", ncmNota: "73261900", ...CIMENTO },
  { id: "i2", notaId: "n1", descricaoFornecedor: "ISOLADOR EPOXI PARALELO 40X40", ncmNota: "85472090", ...CIMENTO },
  { id: "i3", notaId: "n1", descricaoFornecedor: "CABO COBRE NU 10MM NORMATIZADO", ncmNota: "74130000", ...CIMENTO },
  // Este item tem o MESMO NCM do produto — mas a descrição diferente dentro da nota entrega.
  { id: "i4", notaId: "n1", descricaoFornecedor: "CONECTOR PERFURANTE CDP-6", ncmNota: "85359090", ...CIMENTO }
];
const achados = detectarVinculosDivergentes(nota38361);
conferir("acusa os 4 itens da nota", achados.length, 4);
conferir(
  "item com NCM de outra posição soma os dois sinais",
  achados.find((d) => d.itemId === "i1")!.pontuacao,
  100 // 60 do NCM + 40 do teto de descrições repetidas
);
const i4 = achados.find((d) => d.itemId === "i4")!;
conferir("item com NCM igual ainda é pego pela descrição repetida", i4.pontuacao, 40);
conferir("e o motivo dele é só a descrição", i4.motivos.length, 1);
conferir("abaixo do limite de revisão, para não forçar a mão", i4.pontuacao < LIMITE_REVISAO, true);
conferir("ordena do mais suspeito para o menos", achados[0].pontuacao >= achados[achados.length - 1].pontuacao, true);

// --- os casos que NÃO podem acusar -------------------------------------------
const corretos: ItemParaAnalise[] = [
  {
    id: "ok1", notaId: "n2", descricaoFornecedor: "CIMENTO CP II 50KG", ncmNota: "25232910",
    produtoId: "p1", produtoNome: "CIMENTO 50 KG", ncmProduto: "25232910"
  },
  {
    id: "ok2", notaId: "n2", descricaoFornecedor: "AREIA LAVADA M3", ncmNota: "25051000",
    produtoId: "p2", produtoNome: "AREIA", ncmProduto: "25051000"
  }
];
conferir("nota com vínculos corretos não gera nenhum alerta", detectarVinculosDivergentes(corretos).length, 0);

// Mesmo produto em notas DIFERENTES com descrições diferentes é normal: o fornecedor muda o
// texto entre uma compra e outra. O sinal só vale dentro da mesma nota.
const entreNotas: ItemParaAnalise[] = [
  { id: "a", notaId: "n3", descricaoFornecedor: "CIMENTO CP II 50KG", ncmNota: "25232910", produtoId: "p1", produtoNome: "CIMENTO", ncmProduto: "25232910" },
  { id: "b", notaId: "n4", descricaoFornecedor: "CIMENTO CPII-E-32 SC 50KG", ncmNota: "25232910", produtoId: "p1", produtoNome: "CIMENTO", ncmProduto: "25232910" }
];
conferir("descrição diferente entre notas distintas não acusa", detectarVinculosDivergentes(entreNotas).length, 0);

// O mesmo produto repetido na mesma nota com a MESMA descrição é legítimo (duas linhas do
// mesmo item, lotes ou preços diferentes).
const mesmaDescricao: ItemParaAnalise[] = [
  { id: "c", notaId: "n5", descricaoFornecedor: "CIMENTO CP II 50KG", ncmNota: "25232910", produtoId: "p1", produtoNome: "CIMENTO", ncmProduto: "25232910" },
  { id: "d", notaId: "n5", descricaoFornecedor: "CIMENTO CP II 50KG", ncmNota: "25232910", produtoId: "p1", produtoNome: "CIMENTO", ncmProduto: "25232910" }
];
conferir("mesma descrição repetida na nota não acusa", detectarVinculosDivergentes(mesmaDescricao).length, 0);

// Item ainda sem produto não é "vínculo errado" — é vínculo faltando, outro problema.
const semProduto: ItemParaAnalise[] = [
  { id: "e", notaId: "n6", descricaoFornecedor: "QUALQUER COISA", ncmNota: "25232910", produtoId: null, produtoNome: null, ncmProduto: null }
];
conferir("item sem produto não entra na lista", detectarVinculosDivergentes(semProduto).length, 0);

// --- nome sugerido ------------------------------------------------------------
conferir("nome sugerido limpa espaços", nomeSugerido("  CABO   COBRE  NU 10MM  "), "CABO COBRE NU 10MM");
conferir("nome sugerido corta no limite", nomeSugerido("ABCDEFGHIJ", 5), "ABCDE");

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) com falha.`);
process.exit(falhas === 0 ? 0 : 1);
