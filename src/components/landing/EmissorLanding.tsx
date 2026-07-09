import Link from "next/link";
import s from "./landing.module.css";

/**
 * Landing de divulgação do PLANO EMISSOR DE NOTAS (/emissor): página de vendas focada em
 * MEI e pequenas do Simples que só querem emitir NF-e/NFS-e. Preço, trial e limite vêm do
 * PlataformaPlano (editável em /admin/planos) — nada hardcoded. CTA → /cadastro.
 */

export type EmissorLandingProps = {
  precoMensal: number | null;
  limiteNotasMes: number | null;
  trialDias: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const RECURSOS = [
  { icone: "📑", titulo: "NFS-e padrão nacional", texto: "Nota de serviço emitida direto na SEFIN Nacional, com PDF na hora para mandar ao cliente. Sem prefeitura por prefeitura, sem sistema da prefeitura." },
  { icone: "🧾", titulo: "NF-e de produto (modelo 55)", texto: "Vendeu mercadoria? Emite a NF-e direto na SEFAZ, com as regras tributárias do Simples já aplicadas por NCM e UF." },
  { icone: "👥", titulo: "Cadastro de clientes", texto: "Cadastre uma vez, emita sempre: CPF/CNPJ, endereço e e-mail do tomador ficam guardados para a próxima nota." },
  { icone: "📊", titulo: "Painel do Simples e do MEI", texto: "Acompanhe o faturamento do ano, a projeção e o limite do MEI com alertas em 80% — e a estimativa do DAS do mês." },
  { icone: "📦", titulo: "Pacote do contador", texto: "No fim do mês, baixe um ZIP com todos os XMLs e um resumo pronto para enviar à contabilidade. Um clique." },
  { icone: "🔔", titulo: "Alertas que evitam susto", texto: "Certificado vencendo, limite do MEI chegando, DAS perto do dia 20, notas do plano no fim — o sistema avisa sozinho." }
];

const PASSOS = [
  { n: "1", titulo: "Crie sua conta", texto: "CNPJ, e-mail e senha. Sem cartão de crédito para testar." },
  { n: "2", titulo: "Envie seu certificado A1", texto: "O mesmo .pfx que seu contador usa. É ele que assina as notas — exigência da SEFAZ." },
  { n: "3", titulo: "Emita a primeira nota", texto: "Cadastre o cliente, preencha o serviço ou produto e pronto: nota autorizada com PDF na tela." }
];

export function EmissorLanding({ precoMensal, limiteNotasMes, trialDias }: EmissorLandingProps) {
  const preco = precoMensal && precoMensal > 0 ? brl(precoMensal) : null;

  return (
    <div className={s.page}>
      {/* Nav */}
      <div className={s.navInner}>
        <nav className={s.nav}>
          <span className={s.brand}><span className={s.brandMark}>X</span> XERP <span style={{ fontWeight: 600, fontSize: 13, color: "#ffc107" }}>· Emissor de Notas</span></span>
          <div className={s.navLinks}>
            <a href="#recursos">O que tem</a>
            <a href="#preco">Preço</a>
            <a href="#como-funciona">Como funciona</a>
            <Link href="/">Sistema completo</Link>
          </div>
          <Link className={`${s.btn} ${s.btnPrimary}`} href="/cadastro">Testar grátis</Link>
        </nav>
      </div>

      {/* Hero */}
      <header className={s.hero}>
        <div className={s.heroInner}>
          <div>
            <span className={s.eyebrow}>Para MEI e pequenas do Simples</span>
            <h1>Emita NF-e e NFS-e <em>em minutos</em>, sem complicação.</h1>
            <p className={s.heroSub}>
              Chega de sistema difícil ou de depender de terceiros para cada nota. Com seu
              certificado A1, você emite direto na SEFAZ e na SEFIN Nacional, com PDF na hora
              e o painel do Simples/MEI de olho no seu limite.
            </p>
            <div className={s.heroActions}>
              <Link className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} href="/cadastro">Testar grátis por {trialDias} dias →</Link>
              <a className={`${s.btn} ${s.btnGhost} ${s.btnLg}`} href="#preco">Ver preço</a>
            </div>
            <p className={s.heroNote}>✓ Sem cartão no teste · ✓ Emissão <strong>direto na SEFAZ</strong> · ✓ Cancele quando quiser</p>
          </div>

          {/* Mock do emissor */}
          <div className={s.mock} aria-hidden="true">
            <div className={s.mockHead}>
              <span className={s.dot} style={{ background: "#ff5f56" }} />
              <span className={s.dot} style={{ background: "#ffbd2e" }} />
              <span className={s.dot} style={{ background: "#27c93f" }} />
              <span className={s.mockTitle}>XERP · Emissor de Notas</span>
            </div>
            <div className={s.kpis}>
              <div className={s.kpi}><span>Notas no mês</span><strong>12</strong><span className={s.up}>SEFAZ · 100% autorizadas</span></div>
              <div className={s.kpi}><span>Valor emitido</span><strong>R$ 8.340</strong><span>NF-e + NFS-e</span></div>
              <div className={s.kpi}><span>Limite MEI</span><strong>46%</strong><span className={s.up}>dentro do previsto</span></div>
              <div className={s.kpi}><span>DAS estimado</span><strong>R$ 76,90</strong><span>vence dia 20</span></div>
            </div>
            <div className={s.chatRow}><div className={`${s.chatBubble} ${s.chatBubbleUser}`}>NFS-e para Maria — R$ 450,00</div></div>
            <div className={s.chatRow}><div className={s.chatBubble}>Nota autorizada ✅ PDF pronto para enviar.</div></div>
          </div>
        </div>
      </header>

      {/* Faixa de números */}
      <div className={s.stats}>
        <div className={s.statsInner}>
          <div className={s.stat}><strong>NF-e + NFS-e</strong><span>direto na SEFAZ/SEFIN</span></div>
          <div className={s.stat}><strong>{trialDias} dias</strong><span>de teste grátis</span></div>
          <div className={s.stat}><strong>{limiteNotasMes ? `${limiteNotasMes} notas` : "Notas"}</strong><span>por mês no plano</span></div>
          <div className={s.stat}><strong>PDF na hora</strong><span>e XML do contador</span></div>
        </div>
      </div>

      {/* Recursos */}
      <section className={s.section} id="recursos">
        <div className={s.sectionHead}>
          <span className={s.tag}>Só o que você precisa</span>
          <h2>Feito para quem só quer emitir a nota</h2>
          <p>Sem módulos que você não usa, sem tela poluída. Abra, emita, mande o PDF ao cliente e o XML ao contador.</p>
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
            <h2>Um plano só, sem pegadinha</h2>
            <p>
              Teste grátis por {trialDias} dias, sem cartão. Gostou? Assina e continua de onde
              parou — suas notas e clientes ficam guardados.
            </p>
            <ul className={s.checkList}>
              <li><span className={s.checkMark}>✓</span> {limiteNotasMes ? `Até ${limiteNotasMes} notas por mês (NF-e + NFS-e)` : "Emissão de NF-e e NFS-e"}</li>
              <li><span className={s.checkMark}>✓</span> Painel do Simples/MEI com alertas de limite</li>
              <li><span className={s.checkMark}>✓</span> Pacote mensal de XMLs para o contador</li>
              <li><span className={s.checkMark}>✓</span> Cresceu? Upgrade para o sistema completo a qualquer momento — mesmo login, mesmos dados</li>
            </ul>
          </div>
          <div className={s.phone} aria-hidden="false" style={{ maxWidth: 360, textAlign: "center", padding: "34px 26px" }}>
            <span className={s.eyebrow}>Emissor de Notas</span>
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
            {limiteNotasMes ? <div style={{ color: "rgba(255,255,255,.65)", fontSize: 13.5 }}>{limiteNotasMes} notas/mês · certificado A1 necessário</div> : null}
            <div style={{ marginTop: 22 }}>
              <Link className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} href="/cadastro" style={{ width: "100%", justifyContent: "center" }}>
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
          <h2>Da conta criada à primeira nota</h2>
          <p>Você só precisa do CNPJ ativo e do certificado digital A1 (o arquivo .pfx) — a exigência da Receita para assinar notas.</p>
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
          <h2>Sua próxima nota sai em minutos</h2>
          <p>
            Crie a conta agora e emita ainda hoje. E quando a empresa crescer, o XERP cresce junto:
            PDV, estoque, financeiro e até operação por WhatsApp — no mesmo sistema, sem migração.
          </p>
          <div className={s.ctaActions}>
            <Link className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} href="/cadastro">Testar grátis por {trialDias} dias →</Link>
            <Link className={`${s.btn} ${s.btnLight} ${s.btnLg}`} href="/">Conhecer o sistema completo</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.footerBrand}><span className={s.brandMark}>X</span> XERP · Emissor de Notas</span>
          <span>© {new Date().getFullYear()} XERP · por Valleteclab — emissão fiscal para MEI e pequenas empresas.</span>
          <Link href="/" style={{ color: "#0e1117", fontWeight: 700, textDecoration: "none" }}>Sistema completo →</Link>
        </div>
      </footer>
    </div>
  );
}
