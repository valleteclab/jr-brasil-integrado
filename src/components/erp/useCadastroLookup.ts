"use client";

import { useState } from "react";
import { isValidCnpj, normalizeDocumento } from "@/lib/fiscal/documento";

export type LookupEndereco = {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  codigoMunicipioIbge: string | null;
};

export type CnpjLookup = {
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  inscricaoEstadual: string | null;
  email: string | null;
  telefone: string | null;
  endereco: LookupEndereco;
};

export type CepLookup = LookupEndereco & { ddd: string | null };

/**
 * Hook compartilhado para autopreencher cadastros (CEP via ViaCEP, CNPJ via BrasilAPI),
 * através das rotas server-side /api/erp/lookup/*. Mantém loading/erro; o componente
 * decide como aplicar o resultado.
 */
export function useCadastroLookup() {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [erro, setErro] = useState("");

  async function buscarCep(cep: string): Promise<CepLookup | null> {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return null;
    setBuscandoCep(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/lookup/cep/${digits}`);
      const data = (await res.json()) as CepLookup & { error?: string };
      if (!res.ok) throw new Error(data.error || "CEP não encontrado.");
      return data;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar o CEP.");
      return null;
    } finally {
      setBuscandoCep(false);
    }
  }

  async function buscarCnpj(cnpj: string): Promise<CnpjLookup | null> {
    const documento = normalizeDocumento(cnpj);
    if (!isValidCnpj(documento)) {
      setErro("Informe um CNPJ válido com 14 caracteres para buscar.");
      return null;
    }
    setBuscandoCnpj(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/lookup/cnpj/${encodeURIComponent(documento)}`);
      const data = (await res.json()) as CnpjLookup & { error?: string };
      if (!res.ok) throw new Error(data.error || "CNPJ não encontrado.");
      return data;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar o CNPJ.");
      return null;
    } finally {
      setBuscandoCnpj(false);
    }
  }

  return { buscarCep, buscarCnpj, buscandoCep, buscandoCnpj, erro, setErro };
}
