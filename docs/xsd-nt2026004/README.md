# Schemas NF-e/NFC-e — NT 2026.004

Pacote oficial `PL_010d_v1.02`, publicado em 26/06/2026 no Portal Nacional da NF-e para a
NT 2026.004 v1.01 (CNPJ alfanumérico).

Fonte: `https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w=`

- `NFe/`: NF-e, consulta de protocolo e inutilização.
- `Evento/`: eventos de NF-e, incluindo cancelamento e CC-e.
- `CadConsultaCadastro/`: consulta ao cadastro de contribuintes.

Os tipos oficiais relevantes aceitam:

- CNPJ: `[0-9A-Z]{12}[0-9]{2}`;
- chave de acesso: `[0-9]{6}[0-9A-Z]{12}[0-9]{26}`.

Para validar uma NF-e isolada, use `NFe/nfe_v4.00.xsd`.
