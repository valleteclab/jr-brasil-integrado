# Design System JR Brasil Integrado

Este documento define o padrão visual e de implementação para todos os devs que trabalharem no ERP + ecommerce B2B da JR Brasil.

## 1. Direção visual

A plataforma mantém a identidade dos protótipos existentes:

- **Marca:** JR Brasil Peças & Serviços.
- **Tom:** técnico, robusto, B2B, confiável e operacional.
- **Cores base:** amarelo JR como destaque, preto/grafite como base institucional e fundos claros para leitura.
- **ERP:** layout denso, sidebar escura, tabelas, KPIs e foco em produtividade.
- **Ecommerce:** layout mais comercial, catálogo limpo, busca forte e CTAs de compra/orçamento.

## 2. Tokens obrigatórios

Usar variáveis CSS globais. Evitar cores soltas no código.

### 2.1 Cores institucionais

| Token | Valor | Uso |
| --- | --- | --- |
| `--jr-yellow` | `#FFC107` | CTA principal, marca, badges positivos de destaque. |
| `--jr-yellow-dk` | `#E0A800` | Hover/active do amarelo. |
| `--jr-orange` | `#FF8A00` | Avisos comerciais, urgência moderada, promoções. |
| `--jr-ink` | `#0E1117` | Texto forte, fundos escuros, sidebar. |
| `--jr-ink-soft` | `#1F2733` | Hover escuro e gradientes. |
| `--jr-slate` | `#475569` | Texto secundário. |
| `--jr-mute` | `#94A3B8` | Texto auxiliar, metadados. |
| `--jr-line` | `#E5E7EB` | Bordas e divisores. |
| `--jr-bg` | `#F7F7F5` | Fundo geral ecommerce. |
| `--jr-card` | `#FFFFFF` | Cards, painéis e tabelas. |

### 2.2 Cores semânticas

| Token | Valor | Uso |
| --- | --- | --- |
| `--jr-success` | `#16A34A` | Pago, autorizado, entregue, estoque OK. |
| `--jr-danger` | `#DC2626` | Vencido, cancelado, erro, estoque zerado. |
| `--jr-warn` | `#D97706` | Atenção, estoque crítico, pendências. |
| `--jr-info` | `#0284C7` | Informação, ecommerce, rastreio. |
| `--jr-violet` | `#7C3AED` | VIP, funil, análise. |

### 2.3 Tokens ERP

O ERP pode usar aliases `--erp-*`, sempre apontando para a mesma identidade:

- `--erp-side`: fundo da sidebar.
- `--erp-top-h`: altura da topbar.
- `--erp-side-w`: largura da sidebar.
- `--erp-radius`: raio padrão denso.

## 3. Tipografia

### 3.1 Fonte padrão

- Usar `Inter`, `system-ui`, `Segoe UI`, `Roboto`, `sans-serif`.
- Evitar Arial puro em novas telas.

### 3.2 Hierarquia

| Elemento | Ecommerce | ERP |
| --- | --- | --- |
| H1 | 40-68px, forte, landing/catálogo | 28-42px, objetivo |
| H2/H3 | 20-28px | 16-22px |
| Corpo | 15-16px | 13-14px |
| Metadados | 12-13px | 10.5-12px |

### 3.3 Títulos condensados

Quando disponível, usar `Barlow Condensed` para marca, KPIs e títulos fortes. Caso a fonte não esteja carregada, cair para `Inter`.

## 4. Layouts padrão

### 4.1 Ecommerce

- Container: `max-width: 1280px`, padding lateral 24px desktop e 20px mobile.
- Header sticky com logo, busca, carrinho, orçamento e conta.
- Navegação por categorias com submenus.
- Cards de produto com SKU, imagem, nome, marca, preço, estoque e CTAs.
- CTA primário: comprar.
- CTA secundário: orçamento.

### 4.2 ERP

- Grid principal com sidebar fixa à esquerda.
- Sidebar escura com grupos: Operação, Suprimentos, Cadastros, Financeiro & Fiscal, Análises.
- Topbar branca com busca global e ações rápidas.
- Conteúdo com KPIs no topo, toolbar de filtros e tabelas densas.
- Drawers laterais para edição/detalhe de registros.
- Modais apenas para confirmações, detalhes pontuais ou ações críticas.

## 5. Componentes obrigatórios

### 5.1 Botões

Classes/padrões recomendados:

- `button primary`: ação principal, amarelo JR.
- `button dark`: ação institucional, fundo escuro.
- `button light/ghost`: ação secundária.
- `button danger`: ação destrutiva.

Regras:

- Um card/painel deve ter no máximo um CTA primário visual.
- Ações destrutivas sempre devem pedir confirmação.
- Botões desabilitados devem ter feedback visual claro.

### 5.2 Cards e painéis

- Fundo branco.
- Borda `--jr-line`.
- Raio entre 10px e 18px conforme contexto.
- ERP usa sombra leve ou nenhuma sombra.
- Ecommerce pode usar sombra média em cards comerciais.

### 5.3 Tabelas ERP

Padrão mínimo:

- Header uppercase pequeno.
- Linhas com hover sutil.
- Colunas numéricas alinhadas à direita.
- IDs/SKUs usando fonte monoespaçada.
- Status sempre com pill/badge semântico.
- Ações no final da linha.

### 5.4 Badges/status

Mapeamento visual:

- `success`: Entregue, Pago, Autorizada, Em estoque.
- `warn`: Aguardando, Crítico, Em análise.
- `danger`: Vencido, Cancelado, Zerado, Rejeitado.
- `info`: Ecommerce, Transporte, NF-e, Rastreio.
- `violet`: VIP, Funil, Vendedor externo.
- `mute`: Rascunho, Inativo, Sem status.

## 6. Padrões de UX por fluxo

### 6.1 Pedido ecommerce

1. Cliente adiciona produtos ao carrinho.
2. Sistema valida quantidade mínima e disponibilidade.
3. Checkout coleta empresa, entrega e pagamento.
4. Pedido entra no ERP com status inicial.
5. Estoque fica reservado ou baixado conforme regra de negócio.

### 6.2 Orçamento

1. Cliente ou vendedor cria orçamento.
2. ERP recebe em fila `Em análise`.
3. Vendedor precifica, define validade e condições.
4. Cliente aprova no portal.
5. Sistema converte orçamento em pedido.

### 6.3 OS/oficina

1. Atendimento abre OS com cliente e equipamento.
2. Técnico aponta diagnóstico, serviços e peças.
3. Se faltar peça, OS muda para `Aguardando peça`.
4. Conclusão gera cobrança/faturamento.
5. Histórico fica auditável.

## 7. Regras para implementação frontend

- Usar componentes reutilizáveis antes de duplicar markup.
- Novos estilos devem usar tokens do `:root`.
- Não usar cores hex inline, exceto quando criando ou alterando tokens.
- Separar componentes por domínio: `erp`, `storefront`, `shared`.
- Evitar lógica de negócio diretamente em componentes visuais.
- Telas devem ser responsivas, mesmo que o ERP seja otimizado para desktop.

## 8. Nomenclatura sugerida

### 8.1 Pastas futuras

```text
src/
  app/
    erp/
    loja/
    portal/
    api/
  components/
    shared/
    erp/
    storefront/
  lib/
    db/
    services/
    formatters/
  styles/
    tokens.css
```

### 8.2 Componentes

- `ErpSidebar`
- `ErpTopbar`
- `PageHeader`
- `KpiCard`
- `DataTable`
- `StatusBadge`
- `Drawer`
- `ProductCard`
- `CheckoutSteps`
- `QuoteSummary`

## 9. Acessibilidade

- Todo botão deve ter texto claro ou `aria-label`.
- Inputs precisam de label visível ou associada.
- Contraste mínimo AA.
- Estados de foco devem ser visíveis.
- Tabelas devem preservar cabeçalhos semânticos.

## 10. Critério para aceitar novas telas

Antes de aprovar uma nova tela, validar:

- Usa tokens e padrões deste documento.
- Está alinhada ao visual dos protótipos JR Brasil.
- Tem estados vazios, loading e erro previstos quando aplicável.
- Não duplica lógica visual que deveria virar componente.
- Não introduz dependência visual sem necessidade.
- Atualiza `STATUS.md` quando fizer parte de uma entrega relevante.

## 11. Próximas ações de design system

- Extrair tokens CSS para `src/styles/tokens.css`.
- Criar componentes base compartilhados.
- Migrar classes atuais para nomes consistentes.
- Adicionar exemplos reais de `Button`, `Card`, `DataTable` e `StatusBadge`.
