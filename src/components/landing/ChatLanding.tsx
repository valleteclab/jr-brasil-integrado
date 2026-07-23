import Link from "next/link";
import s from "./landing.module.css";

/**
 * Landing de divulgação do PLANO CHAT (/chat): página de vendas do "funcionário de IA" —
 * empresa operada pelo WhatsApp/Telegram (emitir nota, cobrar, lançar gasto por foto).
 * Nome, preço, trial e franquia de IA vêm do PlataformaPlano (editável em /admin/planos).
 * CTA → /cadastro?plano=chat.
 */

export type ChatLandingProps = {
  nomePlano: string;
  precoMensal: number | null;
  trialDias: number;
  franquiaIaMes: number | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const RECURSOS = [
  { icone: "🧾", titulo: "Nota fiscal pelo chat", texto: "\"Emite uma NFS-e de R$ 450 para a Maria\" — o assistente resume, você responde EMITIR e o PDF chega na conversa. NF-e, NFC-e e NFS-e." },
  { icone: "💸", titulo: "Cobrança na conversa", texto: "Boleto e Pix (QR + copia-e-cola) gerados pelo chat e enviados direto ao seu cliente. Sem abrir tela nenhuma." },
  { icone: "📸", titulo: "Gasto por foto do cupom", texto: "Tirou foto do cupom da despesa, mandou pro assistente, gasto lançado e categorizado. Fim do caderninho." },
  { icone: "🛒", titulo: "Venda completa por mensagem", texto: "Orçamento, pré-venda, confirmação com baixa de estoque e financeiro — o fluxo inteiro por texto, com o assistente puxando os preços do cadastro." },
  { icone: "👥", titulo: "Cliente novo? Só o CNPJ", texto: "O assistente busca os dados na Receita e cadastra na hora, sem travar a venda. CPF também funciona." },
  { icone: "🏢", titulo: "Feito para contadores", texto: "Um mesmo número atende várias empresas: o assistente pergunta qual CNPJ você quer, e cada resposta mostra a empresa ativa. Troque com uma palavra." }
];

const PASSOS = [
  { n: "1", titulo: "Crie sua conta", texto: "CNPJ, e-mail e senha — buscamos os dados na Receita e preenchemos tudo. Sem cartão para testar." },
  { n: "2", titulo: "Conecte seu chat", texto: "Telegram ou WhatsApp, você escolhe (ou os dois). O certificado A1 dá até para enviar pelo próprio chat." },
  { n: "3", titulo: "Converse", texto: "\"Quanto vendi hoje?\", \"cobra o João por Pix\", \"emite a nota do serviço\" — sua empresa responde." }
];

export function ChatLanding({ nomePlano, precoMensal, trialDias, franquiaIaMes }: ChatLandingProps) {
  const preco = precoMensal && precoMensal > 0 ? brl(precoMensal) : null;

  return (
    <div className={s.page}>
      {/* Nav */}
      <div className={s.navInner}>
        <nav className={s.nav}>
          <span className={s.brand}><span className={s.brandMark}>X</span> XERP <span style={{ fontWeight: 600, fontSize: 13, color: "#ffc107" }}>· {nomePlano}</span></span>
          <div className={s.navLinks}>
            <a href="#recursos">O que ele faz</a>
            <a href="#preco">Preço</a>
            <a href="#como-funciona">Como funciona</a>
            <Link href="/emissor">Emissor de Notas</Link>
          </div>
          <Link className={`${s.btn} ${s.btnPrimary}`} href="/cadastro?plano=chat">Testar grátis</Link>
        </nav>
      </div>

      {/* Hero */}
      <header className={s.hero}>
        <div className={s.heroInner}>
          <div>
            <span className={s.eyebrow}>Sua empresa no WhatsApp e Telegram</span>
            <h1>Um <em>funcionário de IA</em> que emite nota, cobra e organiza seus gastos.</h1>
            <p className={s.heroSub}>
              Sem tela, sem planilha, sem sistema difícil: você manda mensagem e ele emite a
              nota fiscal, gera o Pix ou boleto do cliente e lança a despesa pela foto do cupom.
              Tudo com a segurança de confirmar antes de qualquer emissão.
            </p>
            <div className={s.heroActions}>
              <Link className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} href="/cadastro?plano=chat">Testar grátis por {trialDias} dias →</Link>
              <a className={`${s.btn} ${s.btnGhost} ${s.btnLg}`} href="#preco">Ver preço</a>
            </div>
            <p className={s.heroNote}>✓ Sem cartão no teste · ✓ Nota <strong>direto na SEFAZ</strong> · ✓ Cancele quando quiser</p>
          </div>

          {/* Mock da conversa */}
          <div className={s.mock} aria-hidden="true">
            <div className={s.mockHead}>
              <span className={s.dot} style={{ background: "#ff5f56" }} />
              <span className={s.dot} style={{ background: "#ffbd2e" }} />
              <span className={s.dot} style={{ background: "#27c93f" }} />
              <span className={s.mockTitle}>Assistente da sua empresa</span>
            </div>
            <div className={s.chatRow}><div className={`${s.chatBubble} ${s.chatBubbleUser}`}>cobra o João — R$ 320 no Pix</div></div>
            <div className={s.chatRow}><div className={s.chatBubble}>Pix de R$ 320,00 para João Silva. Confirma?</div></div>
            <div className={s.chatRow}><div className={`${s.chatBubble} ${s.chatBubbleUser}`}>sim</div></div>
            <div className={s.chatRow}><div className={s.chatBubble}>✅ QR Code enviado! Copia-e-cola na próxima mensagem.</div></div>
            <div className={s.chatRow}><div className={`${s.chatBubble} ${s.chatBubbleUser}`}>📷 [foto do cupom do posto]</div></div>
            <div className={s.chatRow}><div className={s.chatBubble}>✅ Gasto lançado: Posto Ipiranga — R$ 250,00 · Combustível</div></div>
          </div>
        </div>
      </header>

      {/* Faixa de números */}
      <div className={s.stats}>
        <div className={s.statsInner}>
          <div className={s.stat}><strong>WhatsApp + Telegram</strong><span>e chat no sistema</span></div>
          <div className={s.stat}><strong>{trialDias} dias</strong><span>de teste grátis</span></div>
          <div className={s.stat}><strong>NF-e · NFC-e · NFS-e</strong><span>emitidas pelo chat</span></div>
          <div className={s.stat}><strong>Pix e boleto</strong><span>na conversa</span></div>
        </div>
      </div>

      {/* Recursos */}
      <section className={s.section} id="recursos">
        <div className={s.sectionHead}>
          <span className={s.tag}>O que ele faz por você</span>
          <h2>Mande mensagem. A empresa acontece.</h2>
          <p>Cada ação sensível pede sua confirmação antes — o assistente resume cliente, itens e valor, e só age quando você diz sim.</p>
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

      {/* Preço */}
      <section className={s.spotlight} id="preco">
        <div className={s.spotlightInner}>
          <div>
            <span className={s.tag}>Preço simples</span>
            <h2>Menos que uma diária de funcionário. Por mês.</h2>
            <p>
              Teste grátis por {trialDias} dias, sem cartão. Gostou? Assina e segue de onde parou —
              conversas, notas e clientes ficam guardados.
            </p>
            <ul className={s.checkList}>
              <li><span className={s.checkMark}>✓</span> Notas fiscais SEM limite de quantidade</li>
              <li><span className={s.checkMark}>✓</span> {franquiaIaMes ? `${franquiaIaMes} interações de IA por mês` : "Assistente de IA incluído"} (os menus e botões do bot são ilimitados)</li>
              <li><span className={s.checkMark}>✓</span> Pix, boleto, gastos por foto e painel do Simples/MEI</li>
              <li><span className={s.checkMark}>✓</span> Cresceu? Upgrade para o sistema completo — mesmo login, mesmos dados</li>
            </ul>
          </div>
          <div className={s.phone} aria-hidden="false" style={{ maxWidth: 360, textAlign: "center", padding: "34px 26px" }}>
            <span className={s.eyebrow}>{nomePlano}</span>
            <div style={{ margin: "18px 0 4px" }}>
              {preco ? (
                <>
                  <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em" }}>{preco}</span>
                  <span style={{ color: "rgba(255,255,255,.6)", fontSize: 15 }}>/mês</span>
                </>
              ) : (
                <span style={{ fontSize: 30, fontWeight: 800 }}>Fale com a gente</span>
              )}
            </div>
            <div style={{ color: "rgba(255,255,255,.65)", fontSize: 13.5 }}>notas ilimitadas · certificado A1 necessário</div>
            <div style={{ marginTop: 22 }}>
              <Link className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} href="/cadastro?plano=chat" style={{ width: "100%", justifyContent: "center" }}>
                Começar teste grátis →
              </Link>
            </div>
            <div style={{ marginTop: 12, fontSize: 12.5, color: "rgba(255,255,255,.5)" }}>{trialDias} dias grátis · sem cartão · cancele quando quiser</div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className={s.section} id="como-funciona">
        <div className={s.sectionHead}>
          <span className={s.tag}>Em 3 passos</span>
          <h2>Da conta criada à primeira nota por mensagem</h2>
          <p>Você só precisa do CNPJ ativo e do certificado digital A1 (.pfx) — a exigência da Receita para assinar notas.</p>
        </div>
        <div className={s.segments} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {PASSOS.map((p) => (
            <div key={p.n} className={s.segment} style={{ textAlign: "left", padding: 24 }}>
              <div className={s.featureIcon} style={{ fontWeight: 900, fontSize: 20 }}>{p.n}</div>
              <strong style={{ fontSize: 17 }}>{p.titulo}</strong>
              <span style={{ display: "block", marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>{p.texto}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className={s.cta}>
        <div className={s.ctaInner}>
          <h2>Sua empresa, a uma mensagem de distância</h2>
          <p>
            Crie a conta agora e faça o teste: peça uma nota, cobre um cliente, mande a foto de um
            cupom. E quando crescer, o XERP cresce junto — PDV, estoque e financeiro no mesmo lugar.
          </p>
          <div className={s.ctaActions}>
            <Link className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} href="/cadastro?plano=chat">Testar grátis por {trialDias} dias →</Link>
            <Link className={`${s.btn} ${s.btnLight} ${s.btnLg}`} href="/">Conhecer o sistema completo</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.footerBrand}><span className={s.brandMark}>X</span> XERP · {nomePlano}</span>
          <span>© {new Date().getFullYear()} XERP · por Valleteclab — sua empresa operada pelo chat.</span>
          <Link href="/" style={{ color: "#0e1117", fontWeight: 700, textDecoration: "none" }}>Sistema completo →</Link>
        </div>
      </footer>
    </div>
  );
}
