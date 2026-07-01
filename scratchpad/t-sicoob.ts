import { incluirBoleto, consultarBoleto } from "@/domains/finance/providers/sicoob-cobranca";

const auth = {
  sandbox: true,
  clientId: "9b5e603e428cc477a2841e2683c92d21",
  sandboxToken: "1301865f-c6bc-38f3-9f49-666dbcfc59c3",
  certificado: null
};

async function main() {
  const hoje = new Date().toISOString().slice(0, 10);
  const venc = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  console.log("== incluirBoleto (numeroCliente 25546454, exemplo da doc) ==");
  try {
    const b = await incluirBoleto(auth, {
      numeroCliente: 25546454,
      codigoModalidade: 1,
      seuNumero: "TESTE00001",
      valor: 156.23,
      dataVencimento: venc,
      dataEmissao: hoje,
      pagador: {
        numeroCpfCnpj: "98765432185",
        nome: "Cliente Teste ERP",
        endereco: "Rua Madri, 60",
        bairro: "Tropical Ville",
        cidade: "Luis Eduardo Magalhaes",
        cep: "47850000",
        uf: "BA"
      },
      mensagensInstrucao: ["Teste de integracao ERP"]
    });
    console.log("REGISTRADO:", { nossoNumero: b.nossoNumero, linhaDigitavel: b.linhaDigitavel, codigoBarras: b.codigoBarras, temPdf: Boolean(b.pdfBase64) });
    if (b.nossoNumero) {
      console.log("\n== consultarBoleto ==");
      const c = await consultarBoleto(auth, { numeroCliente: 25546454, codigoModalidade: 1, nossoNumero: b.nossoNumero });
      console.log("CONSULTA:", { situacao: c.situacao, valorPago: c.valorPago, dataPagamento: c.dataPagamento });
    }
  } catch (e) {
    console.error("ERRO:", e instanceof Error ? e.message : e);
  }
}

main().finally(() => process.exit(0));
