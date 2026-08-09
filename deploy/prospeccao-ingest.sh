#!/usr/bin/env bash
# Ingestão da base de prospecção (dados abertos CNPJ/RFB) — roda NA VPS.
# Uso: ./prospeccao-ingest.sh DF            (uma ou mais UFs: DF,GO,BA)
# Fonte: espelho CDN da Casa dos Dados (cópia fiel dos zips mensais da RFB).
# Estratégia: streaming (curl | funzip | filtro) — nada de zip em disco.
set -euo pipefail

UFS="${1:?Informe a(s) UF(s), ex.: DF ou DF,GO}"
BASE="https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos"
UA="Mozilla/5.0"

PASTA=$(curl -sS "$BASE/" -H "User-Agent: $UA" | grep -oE 'href="20[0-9-]+/"' | tr -d 'href="/' | sort | tail -1)
echo ">> pasta mais recente: $PASTA"
PG() { docker exec -i "$(docker ps -qf name=erp_erp_postgres | head -1)" psql -U erp -d erp "$@"; }

# Municípios (código TOM -> nome) — pequeno, sempre atualiza
echo ">> municipios..."
curl -sS "$BASE/$PASTA/Municipios.zip" -H "User-Agent: $UA" | funzip | iconv -f latin1 -t utf8 \
  | sed 's/"//g' | awk -F';' '{print $1";"$2}' \
  | PG -c "CREATE TEMP TABLE m(codigo TEXT, nome TEXT); COPY m FROM STDIN WITH (FORMAT csv, DELIMITER ';'); INSERT INTO \"ProspeccaoMunicipio\"(codigo, nome) SELECT codigo, nome FROM m ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome;"

# Estabelecimentos 0..9 — filtra UF + situação ATIVA (02) + matriz/filial, campos essenciais
UF_REGEX=$(echo "$UFS" | sed 's/,/|/g')
for i in 0 1 2 3 4 5 6 7 8 9; do
  echo ">> Estabelecimentos$i.zip (filtrando $UFS)..."
  # zip64 (arquivos grandes) quebra o funzip — baixa em /tmp e descompacta com unzip -p
  curl -sS "$BASE/$PASTA/Estabelecimentos$i.zip" -H "User-Agent: $UA" -o /tmp/estab.zip
  unzip -p /tmp/estab.zip | iconv -f latin1 -t utf8 -c \
    | sed 's/"//g' \
    | awk -F';' -v ufs="^(${UF_REGEX})$" 'NF == 30 && $6 == "02" && $20 ~ ufs && $1 ~ /^[0-9]{8}$/ {
        tel = ($22 != "" && $23 != "") ? $22 $23 : "";
        cnpj = $1 $2 $3;
        print cnpj ";" $5 ";" $12 ";" $20 ";" $21 ";" tel ";" $28 ";" $11 ";" (($4=="1") ? "t" : "f");
      }' \
    | PG -c "CREATE TEMP TABLE e(cnpj TEXT, nome TEXT, cnae TEXT, uf TEXT, mun TEXT, tel TEXT, email TEXT, ini TEXT, matriz BOOLEAN); COPY e FROM STDIN WITH (FORMAT csv, DELIMITER ';'); INSERT INTO \"ProspeccaoEmpresa\"(cnpj, \"nomeFantasia\", cnae, uf, \"municipioTom\", telefone, email, \"dataInicio\", matriz) SELECT cnpj, NULLIF(nome,''), cnae, uf, NULLIF(mun,''), NULLIF(tel,''), NULLIF(lower(email),''), NULLIF(ini,''), matriz FROM e ON CONFLICT (cnpj) DO UPDATE SET \"nomeFantasia\" = EXCLUDED.\"nomeFantasia\", cnae = EXCLUDED.cnae, telefone = EXCLUDED.telefone, email = EXCLUDED.email;"
  rm -f /tmp/estab.zip
done

echo ">> total na base:"
PG -t -c "SELECT uf, COUNT(*) FROM \"ProspeccaoEmpresa\" GROUP BY uf ORDER BY 2 DESC;"
echo ">> ingestão concluída."
