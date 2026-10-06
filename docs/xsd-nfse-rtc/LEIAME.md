# XSD oficial da NFS-e nacional — leiaute 1.01 (RTC / IBS-CBS)

Pacote `NFSe-ESQUEMAS_XSD-v1.01-20260209` baixado do portal oficial em 06/10/2026:
<https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual>
(pasta `Schemas/1.01` do zip). É o schema que a SEFIN valida hoje.

## Como validar um DPS nosso

```bash
OUT=/tmp npx tsx scripts/test-dps-ibscbs.ts     # gera /tmp/dps-com-grupo.xml
python -c "
import re, shutil, pathlib
from lxml import etree
# O libxml2 nao aceita lookahead em xs:pattern e trata ^/\$ como literais: ajusta uma COPIA local.
dst = pathlib.Path('/tmp/xsd-val'); shutil.rmtree(dst, ignore_errors=True)
shutil.copytree('docs/xsd-nfse-rtc', dst)
for f in dst.glob('*.xsd'):
    t = f.read_text(encoding='utf-8')
    t = re.sub(r'<xs:pattern value=\"([^\"]*)\"',
               lambda m: '<xs:pattern value=\"%s\"' % re.sub(r'\(\?[=!][^)]*\)', '', m.group(1)).strip('^\$'), t)
    f.write_text(t, encoding='utf-8')
s = etree.XMLSchema(etree.parse(str(dst/'DPS_v1.01.xsd')))
print('VALIDO' if s.validate(etree.parse('/tmp/dps-com-grupo.xml')) else [e.message for e in s.error_log])
"
```

## O que o XSD exige no grupo IBSCBS do DPS (tipo `TCRTCInfoIBSCBS`)

| Campo | Ocor. | Observação |
|---|---|---|
| `finNFSe` | 1-1 | único valor hoje: `0` (NFS-e regular) |
| `indFinal` | 0-1 | uso/consumo pessoal (art. 57) |
| `cIndOp` | 1-1 | 6 dígitos — Anexo VII/VIII (temos a correlação em `src/domains/fiscal/indop-data.ts`) |
| `indDest` | 1-1 | `0` = o destinatário é o próprio tomador |
| `valores/trib/gIBSCBS/CST` | 1-1 | 3 dígitos — padrão `000` (tributação integral) |
| `valores/trib/gIBSCBS/cClassTrib` | 1-1 | 6 dígitos — já coletado na tela da NFS-e |

Alíquotas e valores de IBS/CBS **não vão no DPS**: são calculados pela Calculadora do Sistema
Nacional e voltam em `infNFSe/IBSCBS`.

> ⚠️ O **Anexo VI v1.04.01 da NT 009** (out/2026) descreve um leiaute diferente deste (por exemplo,
> `CST`/`cClassTrib` direto em `valores/trib`, sem `gIBSCBS`, e `indFinal`/`tpOper` no lugar de
> `finNFSe`). O XSD correspondente **ainda não foi publicado**. Implementamos conforme o XSD
> VIGENTE, que é o que a SEFIN valida hoje; quando o XSD da NT 009 sair, revisar `grupoIbsCbsDps`
> em `nacional-provider.ts` e revalidar.
