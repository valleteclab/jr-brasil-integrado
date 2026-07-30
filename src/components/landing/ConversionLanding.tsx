import Link from "next/link";
import { LaunchLeadForm } from "./LaunchLeadForm";
import s from "./conversion.module.css";

type ConversionLandingProps = {
  precoMensal: number;
  trialDias: number;
};

type IconName =
  | "arrow"
  | "check"
  | "clock"
  | "lock"
  | "message"
  | "mic"
  | "moon"
  | "spark";

const BENEFITS = [
  {
    icon: "clock" as const,
    feature: "Emissão por áudio",
    benefit: "Recupere as horas da semana que iam embora com digitação."
  },
  {
    icon: "lock" as const,
    feature: "Confirmação antes de emitir",
    benefit: "Durma tranquilo: nada sai sem a sua aprovação."
  },
  {
    icon: "message" as const,
    feature: "No chat e no WhatsApp",
    benefit: "A empresa vem até onde você já está trabalhando."
  },
  {
    icon: "spark" as const,
    feature: "Histórico com memória",
    benefit: "Pare de guardar a operação inteira dentro da cabeça."
  }
];

const TRUST = [
  ["Você sempre confirma antes", "Nenhuma nota, cobrança ou ação sensível sai sem a sua aprovação explícita."],
  ["Você entende o que acontece", "O resumo aparece em português simples, sem uma tela cheia de siglas."],
  ["Seus dados continuam seus", "As informações da sua empresa não são vendidas nem compartilhadas."],
  ["Você pode sair quando quiser", "Sem contrato de fidelidade e sem letras miúdas para prender a sua empresa."],
  ["O painel completo continua ali", "A conversa é um atalho para a rotina, não uma prisão."]
];

const FAQ = [
  [
    "A IA pode emitir uma nota errada?",
    "Nada é enviado automaticamente. Antes de qualquer ação fiscal, o XERP mostra os dados organizados para você revisar, corrigir se necessário e confirmar."
  ],
  [
    "Vou precisar aprender mais um sistema?",
    "Se você sabe mandar um áudio ou uma mensagem, já sabe começar. Não há comandos para decorar e o painel completo fica disponível quando você quiser consultar detalhes."
  ],
  [
    "Funciona para serviço e comércio?",
    "Sim. O XERP atende NFS-e para serviços e NF-e ou NFC-e para comércio, além de clientes, produtos, vendas, estoque e financeiro."
  ],
  [
    "Preciso de certificado digital?",
    "Para emitir notas fiscais, normalmente é necessário o certificado A1 da empresa. O onboarding orienta o envio e a configuração de cada modelo fiscal."
  ],
  [
    "E se o sistema entender meu áudio errado?",
    "Você vê a transcrição e um resumo antes de confirmar. Se algo estiver diferente, basta corrigir pela própria conversa."
  ],
  [
    "Funciona no celular e no WhatsApp?",
    "Sim. Você pode usar o chat do XERP pelo celular ou computador e configurar o mesmo assistente para WhatsApp e Telegram."
  ],
  [
    "Isso substitui meu contador?",
    "Não. O XERP organiza a operação e a emissão do dia a dia. Seu contador continua responsável pelo acompanhamento contábil da empresa."
  ],
  [
    "Posso testar antes de decidir?",
    "Sim. O teste é grátis, sem cartão, e você pode cancelar quando quiser."
  ]
];

function Icon({ name }: { name: IconName }) {
  const paths = {
    arrow: <><path d="M5 12h14" /><path d="m14 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    message: <path d="M20 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v8Z" />,
    mic: <><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    moon: <path d="M20 15.7A9 9 0 0 1 8.3 4a9 9 0 1 0 11.7 11.7Z" />,
    spark: <><path d="m12 2 1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7L12 2Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function ChatDemo() {
  const bars = [11, 18, 8, 25, 31, 17, 23, 12, 28, 19, 9, 15, 7, 20, 12];

  return (
    <div className={s.demoShell} id="demonstracao">
      <div className={s.demoTop}>
        <div className={s.demoAvatar}><Icon name="spark" /></div>
        <div>
          <strong>Assistente XERP</strong>
          <span><i /> disponível agora</span>
        </div>
        <b>•••</b>
      </div>

      <div className={s.demoBody}>
        <span className={s.demoDate}>Hoje, 18h32</span>
        <div className={`${s.demoBubble} ${s.voiceBubble}`}>
          <div className={s.voiceRow}>
            <span className={s.play}>▶</span>
            <div className={s.wave}>
              {bars.map((height, index) => <i key={index} style={{ height }} />)}
            </div>
            <small>0:07</small>
          </div>
          <p>“Emite uma nota de serviço de 450 reais, consultoria, para o João.”</p>
        </div>

        <div className={`${s.demoBubble} ${s.answerBubble}`}>
          <span className={s.organized}><Icon name="spark" /> Organizei para você</span>
          <strong>NFS-e para João Ferreira</strong>
          <dl>
            <div><dt>Serviço</dt><dd>Consultoria</dd></div>
            <div><dt>Valor</dt><dd>R$ 450,00</dd></div>
          </dl>
          <p>Confira antes de emitir.</p>
          <div className={s.demoActions}>
            <span>Confirmar emissão</span>
            <span>Corrigir</span>
          </div>
        </div>

        <div className={`${s.demoBubble} ${s.successBubble}`}>
          <span><Icon name="check" /></span>
          <div><strong>Nota autorizada</strong><small>PDF e XML prontos.</small></div>
        </div>
      </div>

      <div className={s.demoComposer}>
        <span>Fale com a sua empresa…</span>
        <b><Icon name="mic" /></b>
      </div>
    </div>
  );
}

export function ConversionLanding({ precoMensal, trialDias }: ConversionLandingProps) {
  const price = precoMensal.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0
  });
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer }
    }))
  };

  return (
    <main className={s.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <nav className={s.nav} aria-label="Navegação principal">
        <Link className={s.brand} href="/">
          <span>X</span>
          XERP
        </Link>
        <div className={s.navLinks}>
          <a href="#problema">Por que mudar</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#confianca">Por que confiar</a>
          <a href="#duvidas">Dúvidas</a>
        </div>
        <a className={s.navCta} href="#acesso">Testar grátis</a>
      </nav>

      <header className={s.hero}>
        <div className={s.heroNoise} />
        <div className={s.heroGrid}>
          <div className={s.heroCopy}>
            <span className={s.eyebrow}><i /> Nota fiscal por voz, com você no controle</span>
            <h1>Fale.<br /><em>A nota sai</em><br />sozinha.</h1>
            <p>
              Sem menu, sem campo, sem sistema para aprender. Você diz o que aconteceu,
              o XERP organiza os dados, confirma com você e emite a nota fiscal enquanto
              você já atende o próximo cliente.
            </p>
            <div className={s.heroActions}>
              <a className={s.primaryCta} href="#acesso">
                Testar grátis por {trialDias} dias
                <Icon name="arrow" />
              </a>
              <a className={s.secondaryCta} href="#demonstracao">
                <span>▶</span> Ver a conversa
              </a>
            </div>
            <div className={s.assurances}>
              <span><Icon name="check" /> Sem cartão</span>
              <span><Icon name="check" /> Confirmação antes de emitir</span>
              <span><Icon name="check" /> Cancele quando quiser</span>
            </div>
          </div>

          <div className={s.heroDemo}>
            <div className={s.demoHalo} />
            <ChatDemo />
            <div className={s.timeBadge}>
              <Icon name="clock" />
              <span><small>Do pedido à nota</small><strong>uma conversa</strong></span>
            </div>
          </div>
        </div>
        <a className={s.scrollCue} href="#problema"><span>Role para entender</span><i /></a>
      </header>

      <section className={s.problem} id="problema">
        <div className={s.sectionGrid}>
          <div className={s.sectionNumber}>01</div>
          <div className={s.problemCopy}>
            <span className={s.kicker}>O problema não é falta de esforço</span>
            <h2>Você abriu uma empresa.<br /><em>Não virou digitador.</em></h2>
            <p className={s.lead}>
              Todo real que você fatura passa, antes, por uma fileira de cliques.
              Cliente. Produto. Valor. CFOP, CST, NCM.
            </p>
            <p>
              O trabalho já foi entregue, o cliente já está satisfeito e a venda já aconteceu.
              Só falta a parte chata — justamente a que fica para a noite, para o fim de semana,
              para “depois eu resolvo”.
            </p>
          </div>
          <div className={s.problemStatements}>
            <blockquote>Emitir uma nota de R$ 80 pode levar o mesmo tempo que ganhá-los.</blockquote>
            <ul>
              <li><span>01</span>Cada campo repetido é um minuto que não volta.</li>
              <li><span>02</span>Cada sistema aberto é um motivo a mais para adiar.</li>
              <li><span>03</span>Isso não é ineficiência sua. O processo foi desenhado errado.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={s.imagine}>
        <div className={s.imagineGrid}>
          <div className={s.scene}>
            <div className={s.sceneClock}><Icon name="moon" /><span><strong>18h32</strong>fim de expediente</span></div>
            <div className={s.scenePhone}>
              <span className={s.sceneMic}><Icon name="mic" /></span>
              <div className={s.sceneWave}>{[9, 18, 27, 14, 33, 20, 11, 25, 16].map((h, i) => <i key={i} style={{ height: h }} />)}</div>
              <small>“Emite a nota do João…”</small>
            </div>
            <div className={s.sceneSuccess}><Icon name="check" /><span><strong>Nota autorizada</strong>três segundos depois</span></div>
          </div>
          <div className={s.imagineCopy}>
            <span className={s.kicker}>Agora imagine o contrário</span>
            <h2>O cliente ainda está do seu lado.</h2>
            <p>
              Você pega o celular e diz, quase sem pensar: “Emite uma nota de serviço,
              450 reais, consultoria, para o João.”
            </p>
            <p>
              Enquanto guarda as ferramentas, a nota chega organizada. Você confere, toca em
              confirmar e pronto. Nunca abriu um sistema. Nunca digitou um CNPJ.
            </p>
            <strong className={s.imagineClose}>Você só falou. E sua empresa fez o resto.</strong>
          </div>
        </div>
      </section>

      <section className={s.how} id="como-funciona">
        <div className={s.sectionHeading}>
          <span className={s.kicker}>O novo mecanismo</span>
          <h2>Fale. Confira. <em>Resolvido.</em></h2>
          <p>Sem mágica e sem perder o controle. A inteligência organiza; a decisão continua sua.</p>
        </div>
        <div className={s.steps}>
          <article>
            <span className={s.stepTop}><b>01</b><Icon name="mic" /></span>
            <h3>Você fala como fala</h3>
            <p>Áudio, texto, foto ou print. Do jeito que já se comunica, sem aprender comando.</p>
          </article>
          <i className={s.stepLine} />
          <article>
            <span className={s.stepTop}><b>02</b><Icon name="spark" /></span>
            <h3>O XERP organiza</h3>
            <p>Busca o cliente, entende o contexto e mostra um resumo simples, sem jargão fiscal.</p>
          </article>
          <i className={s.stepLine} />
          <article>
            <span className={s.stepTop}><b>03</b><Icon name="check" /></span>
            <h3>Você confirma</h3>
            <p>Nada sensível acontece sem o seu “sim”. Você aprova e a nota está emitida.</p>
          </article>
        </div>
      </section>

      <section className={s.benefits}>
        <div className={s.benefitIntro}>
          <span className={s.kicker}>O que você realmente leva</span>
          <h2>Ninguém compra emissão por áudio.</h2>
          <p>Você compra o direito de não trabalhar à noite.</p>
        </div>
        <div className={s.benefitList}>
          {BENEFITS.map((benefit, index) => (
            <article key={benefit.feature}>
              <span className={s.benefitIcon}><Icon name={benefit.icon} /></span>
              <div><small>{benefit.feature}</small><h3>{benefit.benefit}</h3></div>
              <b>{String(index + 1).padStart(2, "0")}</b>
            </article>
          ))}
        </div>
        <a className={s.midCta} href="#acesso">Quero recuperar meu tempo <Icon name="arrow" /></a>
      </section>

      <section className={s.comparison}>
        <div className={s.sectionHeading}>
          <span className={s.kicker}>A mudança cabe em uma conversa</span>
          <h2>Antes pede energia.<br /><em>Depois, responde.</em></h2>
        </div>
        <div className={s.compareGrid}>
          <div className={s.before}>
            <span>Antes do XERP</span>
            <ul>
              <li>“Depois eu emito essa nota.”</li>
              <li>Cliente no WhatsApp, venda no caderno, nota em outro sistema.</li>
              <li>“Onde anotei esse orçamento?”</li>
              <li>Abrir o computador para qualquer coisa.</li>
              <li>A operação inteira vive na sua cabeça.</li>
            </ul>
          </div>
          <div className={s.after}>
            <span>Com o XERP</span>
            <ul>
              <li><Icon name="check" /> “Emite a nota da Ana.” — e está feito.</li>
              <li><Icon name="check" /> Tudo em uma única conversa.</li>
              <li><Icon name="check" /> “Mostra os orçamentos abertos.”</li>
              <li><Icon name="check" /> Resolver do celular, em segundos.</li>
              <li><Icon name="check" /> A operação responde quando você pergunta.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={s.trust} id="confianca">
        <div className={s.trustIntro}>
          <span className={s.kicker}>Sem números inflados. Só transparência.</span>
          <h2>Não pedimos para você confiar às cegas.</h2>
          <p>
            O XERP foi desenhado para acelerar o trabalho sem tirar de você a decisão.
          </p>
        </div>
        <div className={s.trustList}>
          {TRUST.map(([title, text], index) => (
            <article key={title}>
              <span><Icon name="check" /></span>
              <div><h3>{title}</h3><p>{text}</p></div>
              <b>0{index + 1}</b>
            </article>
          ))}
        </div>
      </section>

      <section className={s.offer} id="acesso">
        <div className={s.offerIntro}>
          <span className={s.kicker}>Seu próximo passo</span>
          <h2>Coloque sua empresa para conversar.</h2>
          <p>
            Leva menos de um minuto para liberar o teste. Depois, o onboarding orienta
            a configuração passo a passo.
          </p>
          <div className={s.price}>
            <span>Depois de {trialDias} dias grátis</span>
            <div><strong>{price}</strong><small>/mês</small></div>
          </div>
          <ul>
            <li><Icon name="check" /> Chat e áudio no celular ou computador</li>
            <li><Icon name="check" /> NF-e, NFC-e e NFS-e</li>
            <li><Icon name="check" /> Clientes, produtos, vendas e financeiro</li>
            <li><Icon name="check" /> Sem cartão e sem fidelidade</li>
          </ul>
        </div>
        <LaunchLeadForm
          origem="Landing Nota por Áudio — Versão B"
          campanha="nota-por-audio-v2"
          dorPrincipal="Quer recuperar tempo emitindo notas fiscais por voz."
        />
      </section>

      <section className={s.faq} id="duvidas">
        <div className={s.faqIntro}>
          <span className={s.kicker}>Perguntas honestas</span>
          <h2>Antes de você perguntar.</h2>
          <p>As objeções mais comuns, sem respostas escondidas em letras miúdas.</p>
        </div>
        <div className={s.faqList}>
          {FAQ.map(([question, answer], index) => (
            <details key={question}>
              <summary><span>0{index + 1}</span>{question}<b>+</b></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={s.finalCta}>
        <div className={s.finalOrb} />
        <span className={s.kicker}>O futuro da sua rotina começa com uma frase</span>
        <h2>“Emite essa nota<br />para mim.”</h2>
        <p>Foi só isso que você precisou dizer. A partir de agora, pode ser assim que sua empresa funciona.</p>
        <a className={s.primaryCta} href="#acesso">Quero testar grátis por {trialDias} dias <Icon name="arrow" /></a>
        <small>Sem cartão. Você confirma antes. Cancele quando quiser.</small>
      </section>

      <footer className={s.footer}>
        <Link className={s.brand} href="/"><span>X</span>XERP</Link>
        <p>Gestão comercial, fiscal e financeira que conversa com você.</p>
        <div><Link href="/login">Entrar</Link><Link href="/manual">Manual</Link><Link href="/">Sistema completo</Link></div>
        <small>© {new Date().getFullYear()} XERP por Valleteclab.</small>
      </footer>

      <a className={s.mobileCta} href="#acesso">Testar grátis <Icon name="arrow" /></a>
    </main>
  );
}
