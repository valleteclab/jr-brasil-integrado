# Spec de Conformidade Visual (ERP)

Fonte da verdade visual: `mvp/JR Brasil ERP - Standalone.html` e as telas já alinhadas
`src/components/erp/ProductCrud.tsx`, `TaxRulesCrud.tsx` e `CustomersCrud.tsx`.

Objetivo: as telas operacionais devem usar **somente** o vocabulário canônico abaixo
(classes estilizadas em `src/app/globals.css`) e os componentes compartilhados. Não inventar
classes novas, não usar o prefixo `op-*`, `panel`, `form-row/form-title/form-actions`,
`metric-*`, `op-modal`, `op-card`, `op-list`, `op-table`, `op-tabs`, `op-form`, `op-search`,
`op-toolbar`, `op-section-title`, `op-detail*`, `op-inline-form`, `op-container`.

## Regra de ouro
- Mudar **apenas apresentação** (JSX/markup/className e wrappers estruturais).
- **Não** alterar lógica, handlers, `fetch`, estado, props, tipos, imports de serviço/API, nem exports.
- **Não** editar `globals.css`, componentes em `components/shared/*`, serviços, use-cases, rotas de API, prisma.
- Ao terminar: `npx tsc --noEmit` (projeto todo) deve passar e não pode restar nenhuma classe `op-` nos arquivos tocados.

## Componentes compartilhados (use sempre)
- Cabeçalho de página: `import { PageHeader } from "@/components/shared/PageHeader"` →
  `<PageHeader eyebrow="Grupo" title="Título"><p>subtítulo</p></PageHeader>`. (a página já costuma ter; não duplicar)
- Botões: `import { Button } from "@/components/shared/Button"` → `<Button>`, `<Button variant="light">`, `<Button variant="danger">`. Para ação destrutiva inline em tabela use `<button className="danger-link">`.
- Badges de status: `import { StatusBadge } from "@/components/shared/StatusBadge"` → `<StatusBadge tone="success|warn|danger|info|violet|mute">Texto</StatusBadge>`.
- KPIs: `import { KpiCard } from "@/components/shared/KpiCard"` dentro de `<div className="kpi-row">…</div>`; cada `<KpiCard label="" value="" tone="default|success|warn|danger|info" />`.
- Card genérico: `import { Card } from "@/components/shared/Card"` → `<Card>…</Card>` (classe `.card`). Para card com cabeçalho/título use `erp-card` (abaixo).

## Toolbar (busca + filtros + ações)
```tsx
<div className="erp-toolbar">
  <div className="toolbar-search">
    <span aria-hidden="true">⌕</span>
    <input className="search" placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} />
  </div>
  {/* filtros opcionais por status */}
  <div className="stat-pills">
    <button className={filtro === "todos" ? "active" : ""} onClick={() => setFiltro("todos")}>Todos</button>
    <button className={filtro === "abertos" ? "active" : ""} onClick={() => setFiltro("abertos")}>Abertos</button>
  </div>
  <div className="toolbar-grow" />
  <Button onClick={openNew}>+ Novo</Button>
</div>
```

## Tabela operacional
```tsx
<div className="erp-table-wrap">
  <table className="erp-table">
    <thead>
      <tr>
        <th>Coluna</th>
        <th className="num">Valor</th>
        <th>Status</th>
        <th className="actions">Ações</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.id}>
          <td><strong>{row.titulo}</strong><small className="block-muted">{row.sub}</small></td>
          <td className="num">{row.valor}</td>
          <td><StatusBadge tone={row.tone}>{row.statusLabel}</StatusBadge></td>
          <td className="actions">
            <Button variant="light" onClick={() => abrir(row)}>Abrir</Button>
            <button className="danger-link" onClick={() => cancelar(row)}>Cancelar</button>
          </td>
        </tr>
      ))}
      {!rows.length && (
        <tr><td colSpan={4}><div className="empty-st">Nenhum registro.</div></td></tr>
      )}
    </tbody>
  </table>
</div>
```

## Drawer (criação/edição e modais de ação como "baixar", "receber")
Modais devem virar drawer lateral (mesmo padrão de ProductCrud/TaxRulesCrud).
```tsx
{open && (
  <>
    <div className="drawer-bd" onClick={close} />
    <aside className="drawer">
      <header className="drawer-head">
        <div>
          <span className="section-kicker">Grupo</span>
          <h2>Título do drawer</h2>
          <p>Descrição curta.</p>
        </div>
        <button type="button" onClick={close}>Fechar</button>
      </header>
      {error && <div className="alert danger drawer-error"><strong>Atenção</strong><span>{error}</span></div>}
      <div className="drawer-body">
        <div className="erp-form">
          <label className="full">Campo largo<input value={v} onChange={...} /></label>
          <label>Campo<input /></label>
          <label>Seleção<select>…</select></label>
          <label className="check-row"><input type="checkbox" /> Opção</label>
        </div>
      </div>
      <footer className="drawer-foot">
        <Button variant="light" onClick={close}>Cancelar</Button>
        <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </footer>
    </aside>
  </>
)}
```

## Formulários de página inteira (ex.: nova venda, nova OS)
Envolver em `<div className="erp-card">` com cabeçalho `erp-card-head` e usar `erp-form` para os campos.
```tsx
<div className="erp-card">
  <div className="erp-card-head"><h3>Dados do pedido</h3></div>
  <div className="erp-form">
    <label className="full">…</label>
  </div>
</div>
```
Para linhas de itens (produto/qtd/preço) use `erp-table` dentro do card. Ações finais do
formulário: um `<div className="erp-toolbar">` com `<div className="toolbar-grow" />` e os `<Button>`.

## Cartões de detalhe / resumo (ex.: detalhe da OS, resumo da venda)
- Blocos: `<div className="erp-card"><div className="erp-card-head"><h3>…</h3></div> …conteúdo… </div>`.
- Métricas/resumo de valores: `kpi-row` + `KpiCard`.
- Listas chave/valor ou itens: use `erp-table`.

## Abas
```tsx
<nav className="tabs">
  <button className={tab === "a" ? "active" : ""} onClick={() => setTab("a")}>Aba A</button>
  <button className={tab === "b" ? "active" : ""} onClick={() => setTab("b")}>Aba B</button>
</nav>
```

## Alertas
- Erro: `<div className="alert danger"><strong>Atenção</strong><span>{msg}</span></div>`
- Info/IA: `<div className="alert info"><strong>Info</strong><span>{msg}</span></div>`
- Aviso: `<div className="alert warn"><strong>Aviso</strong><span>{msg}</span></div>`
- Sucesso: `<div className="alert success"><strong>Pronto</strong><span>{msg}</span></div>`
- Erro de carregamento (na página server): `<div className="system-error"><strong>…</strong><span>{loadError}</span></div>` (manter como está).

## Mapa de substituição op-* → canônico
| Classe atual (remover) | Use |
| --- | --- |
| op-toolbar | erp-toolbar |
| op-search / op-search input | toolbar-search + `<input className="search">` |
| op-list / op-table | erp-table-wrap + table.erp-table |
| op-card / op-card-section / op-container / panel | erp-card (+ erp-card-head) ou Card |
| op-section-title | erp-card-head > h3 |
| op-tabs | tabs |
| op-modal / op-modal-overlay / op-modal-title / op-modal-subtitle | drawer / drawer-bd / drawer-head (h2 + p) |
| op-form / op-form-grid / op-form-row / op-form-stack / op-form-card | erp-form (label / label.full / label.check-row) |
| op-form-actions / form-actions | drawer-foot (no drawer) ou erp-toolbar + toolbar-grow (na página) |
| op-form-field | label dentro de erp-form |
| op-detail / op-detail-list | erp-card + erp-table ou kpi-row |
| op-inline-form | erp-form |
| op-toolbar-label | `<span>` dentro do erp-toolbar |
| form-row / form-title | erp-form / erp-card-head h3 |
| metric (cartão de número) | KpiCard dentro de kpi-row |
| link-btn | `<button className="danger-link">` ou `<Button variant="light">` |

## Checklist por arquivo
- [ ] Nenhuma classe `op-*`, `panel`, `form-row/form-title/form-actions`, `op-modal`, etc.
- [ ] Toolbar = erp-toolbar; tabela = erp-table; drawer = drawer; KPIs = kpi-row/KpiCard; abas = tabs.
- [ ] Botões via `<Button>`; status via `<StatusBadge>`.
- [ ] Lógica/handlers/props intactos; `npx tsc --noEmit` passa.
