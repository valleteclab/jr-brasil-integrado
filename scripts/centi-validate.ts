/**
 * Regressão do builder CENTI: gera o GerarNfseEnvio de exemplo, assina com o A1
 * e grava em arquivo para validação XSD local (lxml) — sem tocar na API deles.
 * Uso: PFX_PATH=... PFX_PASS=... OUT=... npx tsx scripts/centi-validate.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildCentiGerarXml, signCentiXml } from "@/domains/fiscal/providers/centi/rps-builder";
import { pfxToPem } from "@/domains/fiscal/providers/pfx-utils";
import type { EmitInput } from "@/domains/fiscal/providers/types";

const input = {
  document: {
    modelo: "NFSE",
    serie: "1",
    informacoesComplementares: "Pedido 123",
    destinatario: {
      nome: "TOMADOR DE TESTE LTDA",
      documento: "11444777000161",
      email: "tomador@teste.com.br",
      endereco: { logradouro: "Rua Um", numero: "10", bairro: "Centro", codigoMunicipioIbge: "5218300", uf: "GO", cep: "73900000" }
    },
    itens: [
      {
        descricao: "Manutencao de equipamentos de informatica",
        servico: true,
        itemListaServico: "140601",
        quantidade: 1,
        valorUnitario: 150,
        valorTotal: 150,
        aliquotaIssInformada: 3
      }
    ]
  },
  emitter: {
    razaoSocial: "EMPRESA POSSE TESTE LTDA",
    cnpj: "15130181000148",
    inscricaoMunicipal: "12345",
    uf: "GO",
    codigoMunicipioIbge: "5218300",
    regime: "SIMPLES_NACIONAL"
  },
  numero: 1
} as unknown as EmitInput;

const { xml, rpsId } = buildCentiGerarXml(input);
const pfx = readFileSync(process.env.PFX_PATH ?? "");
const { privateKeyPem, certPem } = pfxToPem(pfx, process.env.PFX_PASS ?? "");
const assinado = signCentiXml(xml, privateKeyPem, certPem);
writeFileSync(process.env.OUT ?? "centi-out.xml", assinado);
console.log("gerado:", rpsId, "| bytes:", assinado.length);
