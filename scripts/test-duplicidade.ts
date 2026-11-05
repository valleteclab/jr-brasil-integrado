/**
 * Teste do detector de despesa duplicada — SEM REDE, SEM BANCO.
 * Caso real: E R COSTA lançada pelo extrato e depois pela NFS-e.
 */
import { avaliarDuplicidade, palavrasEmComum, LIMITE_SUSPEITA, type CandidataDuplicidade } from "../src/domains/finance/application/duplicidade-despesa";

let falhas = 0;
function conferir(titulo: string, condicao: boolean, detalhe = "") {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? "ok  " : "FALHA"} ${titulo}${!condicao && detalhe ? ` → ${detalhe}` : ""}`);
}

const doExtrato = (over: Partial<CandidataDuplicidade> = {}): CandidataDuplicidade => ({
  id: "c1",
  descricao: "Conciliação: PAGTO E R COSTA LTDA",
  valor: 3600,
  data: new Date(2026, 9, 20),
  origem: "CONCILIACAO",
  fornecedorId: null,
  temNota: false,
  ...over
});

// O caso que aconteceu: mesma despesa, mesmo valor, poucos dias de diferença.
const nfse = { valor: 3600, data: new Date(2026, 9, 22), descricao: "NFS-e 1295 - E R COSTA LTDA", fornecedorId: null };
const caso = avaliarDuplicidade(nfse, doExtrato());
conferir("caso E R COSTA é apontado como suspeito", caso.pontuacao >= LIMITE_SUSPEITA, `pontuação ${caso.pontuacao}`);
conferir("explica o porquê", caso.motivos.length >= 3, caso.motivos.join(", "));

// Valor diferente nunca é duplicata, por mais parecido que seja o resto.
const outroValor = avaliarDuplicidade({ ...nfse, valor: 3600.5 }, doExtrato());
conferir("valor diferente não é duplicata", outroValor.pontuacao === 0);

// Centavos de arredondamento ainda contam como mesmo valor.
const centavo = avaliarDuplicidade({ ...nfse, valor: 3600.01 }, doExtrato());
conferir("1 centavo de diferença ainda casa", centavo.pontuacao >= LIMITE_SUSPEITA);

// Mensalidade: mesmo valor todo mês não pode acusar duplicata.
const mensal = avaliarDuplicidade({ ...nfse, data: new Date(2026, 10, 22) }, doExtrato());
conferir("mesmo valor em outro mês não é duplicata", mensal.pontuacao === 0, `pontuação ${mensal.pontuacao}`);

// Mesmo fornecedor eleva a suspeita.
const comFornecedor = avaliarDuplicidade({ ...nfse, fornecedorId: "f1" }, doExtrato({ fornecedorId: "f1" }));
conferir("mesmo fornecedor pontua mais", comFornecedor.pontuacao > caso.pontuacao);

// Descrições sem nada em comum pontuam menos que descrições parecidas.
const semRelacao = avaliarDuplicidade({ ...nfse, descricao: "Aluguel galpão novembro" }, doExtrato());
conferir("descrição diferente pontua menos", semRelacao.pontuacao < caso.pontuacao, `${semRelacao.pontuacao} vs ${caso.pontuacao}`);

// Comparação de palavras ignora as curtas e os acentos.
conferir("palavras em comum ignora curtas", palavrasEmComum("NFS-e 1295 - E R COSTA LTDA", "Pagto E R Costa Ltda") >= 1);
conferir("acento não atrapalha", palavrasEmComum("Manutenção predial", "manutencao PREDIAL") === 2);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
