import Link from "next/link";
import s from "./landing.module.css";

const RECURSOS = [
  { icone: "🛒", titulo: "PDV & Caixa", texto: "Venda no balcão ou tela cheia, com abertura/fechamento de caixa, sangria, crediário e recibo — dinheiro, Pix, cartão e boleto na mesma venda." },
  { icone: "🧾", titulo: "Emissão fiscal direto na SEFAZ", texto: "NFC-e, NF-e e NFS-e emitidas direto, sem intermediário caro. Regras tributárias por NCM/UF, GNRE, SPED Fiscal e a Reforma Tributária (IBS/CBS) já prontos." },
  { icone: "🏦", titulo: "Financeiro multibanco", texto: "Boleto e Pix pela API oficial de Sicoob, Sicredi e Itaú, com baixa automática. Contas a pagar/receber, conciliação, fluxo de caixa e DRE." },
  { icone: "📦", titulo: "Estoque & Compras", texto: "Saldo em tempo real, inventário, conversão de embalagem e entrada de nota por XML — o estoque e o custo se atualizam sozinhos." },
  { icone: "🔧", titulo: "Ordem de Serviço", texto: "Da abertura ao faturamento: técnicos, apontamentos, peças, painel na TV da oficina e NFS-e + NF-e das peças num clique." },
  { icone: "🛍️", titulo: "Loja virtual", texto: "Sua vitrine online em /loja com carrinho e pedido do cliente — conectada ao mesmo estoque e catálogo do ERP." }
];

const SEGMENTOS = [
  { ic: "🔩", nome: "Autopeças", desc: "aplicação por veículo, ST e GNRE" },
  { ic: "🏗️", nome: "Material de construção", desc: "balcão + expedição/retirada" },
  { ic: "🏪", nome: "Comércio e varejo", desc: "PDV rápido e NFC-e" },
  { ic: "🛠️", nome: "Serviços & oficina", desc: "OS, NFS-e e técnicos" }
];

export function Landing() {
  return (
    <div className={s.page}>
      {/* Nav */}
      <div className={s.navInner}>
        <nav className={s.nav}>
          <span className={s.brand}><span className={s.brandMark}>X</span> XERP</span>
          <div className={s.navLinks}>
            <a href="#recursos">Recursos</a>
            <a href="#whatsapp">IA no WhatsApp</a>
            <a href="#segmentos">Para quem</a>
            <Link href="/manual">Manual</Link>
          </div>
          <Link className={`${s.btn} ${s.btnPrimary}`} href="/erp">Acessar o sistema</Link>
        </nav>
      </div>

      {/* Hero */}
      <header className={s.hero}>
        <div className={s.heroInner}>
          <div>
            <span className={s.eyebrow}>ERP · Fiscal · Financeiro · IA</span>
            <h1>Venda, emita a nota e controle o caixa — <em>num sistema só</em>.</h1>
            <p className={s.heroSub}>
              O XERP unifica PDV, estoque, oficina, financeiro e emissão fiscal do jeito brasileiro.
              Emite NFC-e/NF-e/NFS-e direto na SEFAZ, cobra por boleto e Pix, e você ainda opera
              pelo WhatsApp com inteligência artificial.
            </p>
            <div className={s.heroActions}>
              <Link className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} href="/erp">Começar agora →</Link>
              <Link className={`${s.btn} ${s.btnGhost} ${s.btnLg}`} href="/manual">Ver como funciona</Link>
            </div>
            <p className={s.heroNote}>✓ Emissão fiscal <strong>sem mensalidade de terceiros</strong> · ✓ Boleto/Pix <strong>multibanco</strong> · ✓ Multiempresa</p>
          </div>

          {/* Mock de painel */}
          <div className={s.mock} aria-hidden="true">
            <div className={s.mockHead}>
              <span className={s.dot} style={{ background: "#ff5f56" }} />
              <span className={s.dot} style={{ background: "#ffbd2e" }} />
              <span className={s.dot} style={{ background: "#27c93f" }} />
              <span className={s.mockTitle}>XERP · Painel</span>
            </div>
            <div className={s.kpis}>
              <div className={s.kpi}><span>Vendas hoje</span><strong>R$ 18.430</strong><span className={s.up}>▲ 12% vs ontem</span></div>
              <div className={s.kpi}><span>Notas autorizadas</span><strong>47</strong><span className={s.up}>SEFAZ · 100%</span></div>
              <div className={s.kpi}><span>A receber (7 dias)</span><strong>R$ 9.120</strong><span>boleto + Pix</span></div>
              <div className={s.kpi}><span>Itens críticos</span><strong>5</strong><span>repor estoque</span></div>
            </div>
            <div className={s.chatRow}><div className={`${s.chatBubble} ${s.chatBubbleUser}`}>Fatura o pedido PV-0007 com NF-e</div></div>
            <div className={s.chatRow}><div className={s.chatBubble}>PV-0007 · Guilherme · R$ 1.240,00. Responda <b>EMITIR</b> para autorizar.</div></div>
          </div>
        </div>
      </header>

      {/* Faixa de números */}
      <div className={s.stats}>
        <div className={s.statsInner}>
          <div className={s.stat}><strong>3 em 1</strong><span>Vendas · Fiscal · Financeiro</span></div>
          <div className={s.stat}><strong>NFC-e · NF-e · NFS-e</strong><span>direto na SEFAZ</span></div>
          <div className={s.stat}><strong>3 bancos</strong><span>Sicoob · Sicredi · Itaú</span></div>
          <div className={s.stat}><strong>WhatsApp</strong><span>operação com IA</span></div>
        </div>
      </div>

      {/* Recursos */}
      <section className={s.section} id="recursos">
        <div className={s.sectionHead}>
          <span className={s.tag}>Tudo conectado</span>
          <h2>Um sistema, a operação inteira</h2>
          <p>Do balcão à SEFAZ, do estoque ao boleto. Cada área conversa com a outra — sem planilha, sem retrabalho, sem digitar a mesma coisa duas vezes.</p>
        </div>
        <div className={s.features}>
          {RECURSOS.map((r) => (
            <article key={r.titulo} className={s.feature}>
              <div className={s.featureIcon}>{r.icone}</div>
              <h3>{r.titulo}</h3>
              <p>{r.texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Spotlight WhatsApp/IA */}
      <section className={s.spotlight} id="whatsapp">
        <div className={s.spotlightInner}>
          <div>
            <span className={s.tag}>Novidade</span>
            <h2>Opere a empresa pelo WhatsApp</h2>
            <p>
              O gestor conversa com o assistente e resolve na hora — com confirmação antes de qualquer
              emissão. É o ERP trabalhando enquanto você fala.
            </p>
            <ul className={s.checkList}>
              <li><span className={s.checkMark}>✓</span> “Quanto tenho a receber do Fulano?” → resposta na hora</li>
              <li><span className={s.checkMark}>✓</span> “Emite o boleto do título X” → linha digitável pronta</li>
              <li><span className={s.checkMark}>✓</span> “Cobra R$ 250 por Pix” → QR copia-e-cola na conversa</li>
              <li><span className={s.checkMark}>✓</span> “Fatura o pedido com NF-e” → confirma e autoriza na SEFAZ</li>
            </ul>
          </div>
          <div className={s.phone} aria-hidden="true">
            <div className={s.phoneHead}>
              <span className={s.phoneAvatar}>🤖</span>
              <span className={s.phoneName}>Assistente XERP<span>online</span></span>
            </div>
            <div className={`${s.msg} ${s.msgOut}`}>Emite o boleto do Guilherme, R$ 1.240</div>
            <div className={`${s.msg} ${s.msgIn}`}>Boleto registrado ✅<br />Linha digitável: 34191.79001 01043.510047…</div>
            <div className={`${s.msg} ${s.msgOut}`}>Agora fatura o pedido PV-0007 com NF-e</div>
            <div className={`${s.msg} ${s.msgIn}`}>PV-0007 · R$ 1.240,00. Responda <b>EMITIR</b> para autorizar.</div>
            <div className={`${s.msg} ${s.msgOut}`}>EMITIR</div>
            <div className={`${s.msg} ${s.msgIn}`}>NF-e 000123 autorizada 🧾 — PDF enviado ao cliente.</div>
          </div>
        </div>
      </section>

      {/* Diferenciais / Para quem */}
      <section className={s.section} id="segmentos">
        <div className={s.sectionHead}>
          <span className={s.tag}>Feito para o Brasil</span>
          <h2>Do seu segmento, do seu jeito</h2>
          <p>Multiempresa e multi-loja, com as regras fiscais que a sua atividade exige — inclusive ST, GNRE e a Reforma Tributária.</p>
        </div>
        <div className={s.segments}>
          {SEGMENTOS.map((seg) => (
            <div key={seg.nome} className={s.segment}>
              <div className={s.ic}>{seg.ic}</div>
              <strong>{seg.nome}</strong>
              <span>{seg.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className={s.cta}>
        <div className={s.ctaInner}>
          <h2>Pare de perder tempo entre sistemas</h2>
          <p>Venda, emita a nota, receba e controle o caixa em um lugar só — e ganhe a agilidade de operar até pelo WhatsApp.</p>
          <div className={s.ctaActions}>
            <Link className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} href="/erp">Acessar o sistema →</Link>
            <Link className={`${s.btn} ${s.btnLight} ${s.btnLg}`} href="/manual">Ver o manual</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.footerBrand}><span className={s.brandMark}>X</span> XERP</span>
          <span>© {new Date().getFullYear()} XERP · por Valleteclab — ERP de gestão comercial e fiscal.</span>
          <Link href="/manual" style={{ color: "#0e1117", fontWeight: 700, textDecoration: "none" }}>Manual →</Link>
        </div>
      </footer>
    </div>
  );
}
