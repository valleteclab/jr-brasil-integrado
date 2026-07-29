import Link from "next/link";
import { LaunchLeadForm } from "./LaunchLeadForm";
import s from "./launch.module.css";

type LaunchLandingProps = {
  precoMensal: number;
  trialDias: number;
};

const PAINS = [
  {
    number: "01",
    title: "A nota fica para depois",
    text: "Você termina o serviço, atende o próximo cliente e a emissão vira mais uma pendência para a noite."
  },
  {
    number: "02",
    title: "A empresa mora em cinco lugares",
    text: "Cliente no WhatsApp, venda no caderno, estoque na planilha, cobrança no banco e nota em outro sistema."
  },
  {
    number: "03",
    title: "Tudo depende de você lembrar",
    text: "Quem está devendo? O que acabou? Qual orçamento ficou sem resposta? A operação vive na sua cabeça."
  },
  {
    number: "04",
    title: "O sistema atrapalha a venda",
    text: "Menus demais, campos demais e treinamento demais para fazer algo que deveria começar com uma frase."
  }
];

const CAPABILITIES = [
  ["Nota fiscal", "NF-e, NFC-e e NFS-e com resumo e confirmação antes de emitir."],
  ["Venda e orçamento", "Cadastre o produto, monte o orçamento e avance a venda pela conversa."],
  ["Clientes", "Informe CNPJ ou CPF e o assistente organiza os dados necessários."],
  ["Financeiro", "Consulte recebimentos, despesas, fluxo de caixa, Pix e boletos."],
  ["Estoque", "Consulte saldos, registre produtos e acompanhe o que precisa de atenção."],
  ["Memória de trabalho", "O histórico fica salvo para você retomar a conversa de onde parou."]
];

const FAQ = [
  ["A IA emite a nota sozinha?", "Não. Antes de uma ação sensível, o XERP apresenta o resumo e pede sua confirmação explícita. Você continua no controle."],
  ["Preciso de certificado digital?", "Para emitir notas fiscais, normalmente é necessário o certificado A1 da empresa. O onboarding orienta o envio e pede os dados de cada modelo fiscal."],
  ["Funciona pelo WhatsApp?", "Sim. O mesmo agente pode operar no chat do XERP, Telegram e WhatsApp configurado para a empresa."],
  ["Serve para serviço e comércio?", "Sim. O XERP atende emissão de NFS-e para serviços e NF-e/NFC-e para comércio, além de vendas, estoque e financeiro."],
  ["Vou precisar abandonar o painel?", "Não. A conversa acelera a rotina, e o painel completo continua disponível quando você quiser conferir ou ajustar detalhes."],
  ["Posso cancelar?", "Sim. Você testa sem cartão e decide se o XERP faz sentido para a sua rotina."]
];

function Icon({ name }: { name: "mic" | "spark" | "check" | "arrow" }) {
  const paths = {
    mic: <><rect x="8" y="3" width="8" height="13" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    spark: <><path d="m12 2 1.5 5.1L18 9l-4.5 1.9L12 16l-1.5-5.1L6 9l4.5-1.9L12 2Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function LaunchLanding({ precoMensal, trialDias }: LaunchLandingProps) {
  const price = precoMensal.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0
  });

  return (
    <main className={s.page}>
      <div className={s.announcement}>
        <span className={s.liveDot} />
        O jeito mais rápido de entender o XERP é pedir alguma coisa para ele.
        <a href="#acesso">Experimentar agora</a>
      </div>

      <nav className={s.nav} aria-label="Navegação principal">
        <Link className={s.brand} href="/">
          <span className={s.brandMark}>X</span>
          <span>XERP</span>
        </Link>
        <div className={s.navLinks}>
          <a href="#problema">Por que existe</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#oferta">O que está incluído</a>
          <a href="#duvidas">Dúvidas</a>
        </div>
        <a className={s.navCta} href="#acesso">Testar grátis</a>
      </nav>

      <header className={s.hero}>
        <div className={s.heroGlow} />
        <div className={s.heroGrid}>
          <div className={s.heroCopy}>
            <div className={s.kicker}>
              <Icon name="spark" />
              O ERP que entende a sua voz
            </div>
            <h1>
              Sua empresa não precisa de <span>mais uma tela.</span>
              <br />Precisa de uma resposta.
            </h1>
            <p>
              Mande um áudio dizendo o que precisa. O XERP organiza os dados, confere com você
              e transforma sua fala em nota fiscal, venda, cobrança e controle.
            </p>
            <div className={s.heroActions}>
              <a className={s.primaryCta} href="#acesso">
                Quero testar por {trialDias} dias
                <Icon name="arrow" />
              </a>
              <a className={s.textCta} href="#demonstracao">
                <span className={s.play}>▶</span>
                Veja a conversa acontecer
              </a>
            </div>
            <div className={s.trustLine}>
              <span><Icon name="check" /> Sem cartão</span>
              <span><Icon name="check" /> Você confirma antes</span>
              <span><Icon name="check" /> A partir de {price}/mês</span>
            </div>
          </div>

          <div className={s.demoStage} id="demonstracao">
            <div className={s.orbitOne} />
            <div className={s.orbitTwo} />
            <div className={s.phone}>
              <div className={s.phoneTop}>
                <div className={s.assistantAvatar}><Icon name="spark" /></div>
                <div>
                  <strong>Assistente XERP</strong>
                  <span><i /> pronto para ajudar</span>
                </div>
                <b>•••</b>
              </div>
              <div className={s.chatDate}>Hoje</div>
              <div className={`${s.bubble} ${s.userBubble}`}>
                <div className={s.audioMessage}>
                  <span className={s.audioPlay}>▶</span>
                  <div className={s.wave} aria-label="Mensagem de áudio de 8 segundos">
                    {[8, 14, 20, 11, 24, 30, 17, 25, 12, 19, 9, 14, 7].map((height, index) => (
                      <i key={index} style={{ height }} />
                    ))}
                  </div>
                  <span>0:08</span>
                </div>
                <small>“Emite uma nota de serviço de 450 reais para a Ana.”</small>
              </div>
              <div className={`${s.bubble} ${s.botBubble}`}>
                <div className={s.botLabel}><Icon name="spark" /> XERP organizou</div>
                <strong>NFS-e para Ana Souza</strong>
                <dl>
                  <div><dt>Serviço</dt><dd>Consultoria</dd></div>
                  <div><dt>Valor</dt><dd>R$ 450,00</dd></div>
                </dl>
                <p>Confira os dados antes de emitir.</p>
                <div className={s.confirmButtons}>
                  <span>Emitir nota</span>
                  <span>Corrigir</span>
                </div>
              </div>
              <div className={`${s.bubble} ${s.botBubble} ${s.successBubble}`}>
                <span className={s.successIcon}><Icon name="check" /></span>
                <div><strong>Nota autorizada</strong><small>PDF e XML prontos para enviar.</small></div>
              </div>
              <div className={s.chatComposer}>
                <span>Fale ou escreva com sua empresa…</span>
                <b><Icon name="mic" /></b>
              </div>
            </div>
            <div className={`${s.floatCard} ${s.floatCardTop}`}>
              <span>Tempo entre o pedido e a ação</span>
              <strong>uma conversa</strong>
            </div>
            <div className={`${s.floatCard} ${s.floatCardBottom}`}>
              <Icon name="check" />
              <span><strong>Você no controle</strong>Confirmação antes de executar</span>
            </div>
          </div>
        </div>
      </header>

      <section className={s.problem} id="problema">
        <div className={s.problemIntro}>
          <span className={s.sectionEyebrow}>O problema não é falta de esforço</span>
          <h2>Você abriu uma empresa.<br />Não uma central de digitação.</h2>
          <p>
            Enquanto você troca de tela, procura cadastro e repete informação, o cliente espera.
            O trabalho termina — mas a burocracia continua.
          </p>
        </div>
        <div className={s.painGrid}>
          {PAINS.map((pain) => (
            <article key={pain.number} className={s.painCard}>
              <span>{pain.number}</span>
              <h3>{pain.title}</h3>
              <p>{pain.text}</p>
            </article>
          ))}
        </div>
        <div className={s.problemClose}>
          <span>O XERP nasceu de uma pergunta simples:</span>
          <strong>“E se administrar a empresa começasse do mesmo jeito que você já trabalha — falando?”</strong>
        </div>
      </section>

      <section className={s.mechanism} id="como-funciona">
        <div className={s.sectionHeader}>
          <span className={s.sectionEyebrow}>O novo mecanismo</span>
          <h2>Fale. Confira. Resolvido.</h2>
          <p>Sem mágica e sem perder o controle. A inteligência organiza; a decisão continua sendo sua.</p>
        </div>
        <div className={s.steps}>
          <article>
            <span className={s.stepNumber}>1</span>
            <div className={s.stepIcon}><Icon name="mic" /></div>
            <h3>Você fala como fala</h3>
            <p>Texto, áudio, foto ou arquivo. Sem decorar comando e sem linguagem de sistema.</p>
          </article>
          <div className={s.stepConnector}><Icon name="arrow" /></div>
          <article>
            <span className={s.stepNumber}>2</span>
            <div className={s.stepIcon}><Icon name="spark" /></div>
            <h3>O XERP organiza</h3>
            <p>Busca cliente, produto e contexto, identifica o que falta e mostra um resumo claro.</p>
          </article>
          <div className={s.stepConnector}><Icon name="arrow" /></div>
          <article>
            <span className={s.stepNumber}>3</span>
            <div className={s.stepIcon}><Icon name="check" /></div>
            <h3>Você confirma</h3>
            <p>Uma ação sensível só acontece depois da sua aprovação. Simples, seguro e auditável.</p>
          </article>
        </div>
      </section>

      <section className={s.transformation}>
        <div className={s.transformationGrid}>
          <div className={s.before}>
            <span>Antes</span>
            <h3>A empresa pede energia o tempo todo</h3>
            <ul>
              <li>“Depois eu emito essa nota.”</li>
              <li>“Onde anotei esse orçamento?”</li>
              <li>“Preciso abrir o computador.”</li>
              <li>“Acho que esse cliente ainda não pagou.”</li>
            </ul>
          </div>
          <div className={s.shift}>
            <span>→</span>
            <small>mude a relação com a gestão</small>
          </div>
          <div className={s.after}>
            <span>Com o XERP</span>
            <h3>A empresa responde quando você pergunta</h3>
            <ul>
              <li><Icon name="check" /> “Emite a nota da Ana.”</li>
              <li><Icon name="check" /> “Mostra os orçamentos abertos.”</li>
              <li><Icon name="check" /> “Quanto tenho para receber?”</li>
              <li><Icon name="check" /> “Cadastra este produto.”</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={s.capabilities} id="oferta">
        <div className={s.sectionHeader}>
          <span className={s.sectionEyebrow}>Muito além da nota por áudio</span>
          <h2>Uma conversa na frente.<br />Uma operação completa por trás.</h2>
          <p>Você começa pelo chat e encontra um sistema de verdade sustentando cada resposta.</p>
        </div>
        <div className={s.capabilityGrid}>
          {CAPABILITIES.map(([title, text], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <Icon name="arrow" />
            </article>
          ))}
        </div>
      </section>

      <section className={s.proof}>
        <div className={s.proofPanel}>
          <div>
            <span className={s.sectionEyebrow}>A prova que importa</span>
            <h2>Não acredite em promessa.<br />Peça uma tarefa.</h2>
            <p>
              Crie sua conta, configure a emissão com o onboarding e converse com o assistente.
              A experiência foi feita para você sentir a diferença na rotina, não para assistir a uma apresentação.
            </p>
          </div>
          <div className={s.promptStack}>
            <span>Experimente pedir:</span>
            <div>“Quais notas emiti este mês?”</div>
            <div>“Cadastre este produto com 10 unidades.”</div>
            <div>“Crie um orçamento para este cliente.”</div>
            <div>“Quanto tenho para receber esta semana?”</div>
          </div>
        </div>
      </section>

      <section className={s.offer} id="acesso">
        <div className={s.offerGrid}>
          <div className={s.offerCopy}>
            <span className={s.sectionEyebrow}>Seu próximo passo</span>
            <h2>Coloque a sua empresa para conversar.</h2>
            <p>
              Comece com {trialDias} dias grátis. Sem cartão. Configure seu negócio e faça o primeiro
              pedido ao assistente ainda hoje.
            </p>
            <div className={s.price}>
              <small>Depois do teste</small>
              <div><strong>{price}</strong><span>/mês</span></div>
            </div>
            <ul>
              <li><Icon name="check" /> Assistente por chat e áudio</li>
              <li><Icon name="check" /> NF-e, NFC-e e NFS-e</li>
              <li><Icon name="check" /> Clientes, produtos, vendas e orçamentos</li>
              <li><Icon name="check" /> Consultas financeiras e fiscais</li>
              <li><Icon name="check" /> Histórico e confirmações seguras</li>
            </ul>
          </div>
          <LaunchLeadForm />
        </div>
      </section>

      <section className={s.faq} id="duvidas">
        <div className={s.faqIntro}>
          <span className={s.sectionEyebrow}>Perguntas honestas</span>
          <h2>Antes de você perguntar.</h2>
          <p>Sem letras miúdas escondendo como a experiência funciona.</p>
        </div>
        <div className={s.faqList}>
          {FAQ.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<span>+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={s.finalCta}>
        <div className={s.finalGlow} />
        <span className={s.sectionEyebrow}>O futuro da sua rotina pode começar com uma frase</span>
        <h2>“XERP, emite essa nota para mim.”</h2>
        <p>Você cuida do negócio. O XERP ajuda a operação a acompanhar.</p>
        <a className={s.primaryCta} href="#acesso">
          Quero testar agora
          <Icon name="arrow" />
        </a>
      </section>

      <footer className={s.footer}>
        <Link className={s.brand} href="/">
          <span className={s.brandMark}>X</span>
          <span>XERP</span>
        </Link>
        <p>Gestão comercial, fiscal e financeira que conversa com você.</p>
        <div>
          <Link href="/login">Entrar</Link>
          <Link href="/manual">Manual</Link>
          <Link href="/">Sistema completo</Link>
        </div>
        <small>© {new Date().getFullYear()} XERP por Valleteclab.</small>
      </footer>

      <a className={s.mobileCta} href="#acesso">Testar grátis <Icon name="arrow" /></a>
    </main>
  );
}
