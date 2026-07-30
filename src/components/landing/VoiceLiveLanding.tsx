"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LaunchLeadForm } from "./LaunchLeadForm";
import s from "./voice-live.module.css";

/**
 * Landing "nota por áudio" v3 — SHOW, don't tell:
 *  - a conversa ACONTECE ao vivo na tela (roteiro real do produto, com transcrição,
 *    confirmação EMITIR e nota autorizada), disparada quando o visitante chega no telefone;
 *  - botão que toca a VOZ REAL do assistente (MP3 gerado pelo nosso próprio Kokoro);
 *  - calculadora interativa de tempo perdido digitando nota;
 *  - o argumento que concorrente não copia: IA própria — o áudio não sai do nosso servidor.
 * Preço/trial vêm do PlataformaPlano (nada fixo). CTA → LaunchLeadForm → /cadastro?plano=chat.
 */

type VoiceLiveLandingProps = {
  precoMensal: number;
  trialDias: number;
};

/* ── Roteiro da conversa ao vivo (tempos em ms a partir do passo anterior) ── */
const ROTEIRO = [
  { apos: 900 },   // 1 · áudio do usuário
  { apos: 1500 },  // 2 · eco "Entendi:"
  { apos: 900 },   // 3 · digitando…
  { apos: 1600 },  // 4 · resumo com botões
  { apos: 1700 },  // 5 · usuário responde EMITIR
  { apos: 800 },   // 6 · digitando…
  { apos: 1800 }   // 7 · nota autorizada
] as const;
const PASSO_FINAL = ROTEIRO.length;

function Icon({ name }: { name: "mic" | "check" | "arrow" | "lock" | "replay" | "pause" | "play" }) {
  const path = {
    mic: <><rect x="8" y="3" width="8" height="13" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    replay: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
    pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
    play: <path d="M8 5v14l11-7L8 5Z" />
  }[name];
  return <svg viewBox="0 0 24 24" aria-hidden="true">{path}</svg>;
}

/** Barras de forma de onda (animadas enquanto `ativa`). */
function Waveform({ ativa }: { ativa: boolean }) {
  const alturas = [9, 16, 22, 12, 26, 31, 18, 27, 13, 21, 10, 15, 8, 19, 24, 11];
  return (
    <span className={`${s.wave} ${ativa ? s.waveOn : ""}`} aria-hidden="true">
      {alturas.map((h, i) => <i key={i} style={{ height: h, animationDelay: `${i * 70}ms` }} />)}
    </span>
  );
}

function DigitandoDots() {
  return (
    <span className={s.typing} aria-label="assistente digitando">
      <i /><i /><i />
    </span>
  );
}

/* ── Telefone com a conversa acontecendo ── */
function ConversaAoVivo() {
  const [passo, setPasso] = useState(0);
  const [rodando, setRodando] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const jaRodou = useRef(false);

  // Dispara quando o telefone entra na tela (uma vez); replay manual depois.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setRodando(true); return; }
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !jaRodou.current) {
        jaRodou.current = true;
        setRodando(true);
        obs.disconnect();
      }
    }, { threshold: 0.35 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!rodando || passo >= PASSO_FINAL) return;
    const t = setTimeout(() => setPasso((p) => p + 1), ROTEIRO[passo].apos);
    return () => clearTimeout(t);
  }, [rodando, passo]);

  const replay = () => { setPasso(0); setRodando(false); requestAnimationFrame(() => setRodando(true)); };
  const terminou = passo >= PASSO_FINAL;

  return (
    <div className={s.stage} ref={stageRef}>
      <div className={s.stageGlow} aria-hidden="true" />
      <div className={s.phone} role="img" aria-label="Demonstração: um áudio vira uma nota fiscal autorizada">
        <div className={s.phoneHead}>
          <span className={s.avatar}>X</span>
          <div>
            <strong>Sua empresa</strong>
            <em><i className={s.onlineDot} /> assistente online</em>
          </div>
        </div>

        <div className={s.chatArea}>
          {passo >= 1 && (
            <div className={`${s.bubble} ${s.me}`}>
              <div className={s.voiceRow}>
                <span className={s.voicePlay}><Icon name={passo === 1 ? "pause" : "play"} /></span>
                <Waveform ativa={passo === 1} />
                <b>0:07</b>
              </div>
            </div>
          )}
          {passo >= 2 && (
            <div className={`${s.bubble} ${s.bot}`}>
              <span className={s.echo}>🎙 Entendi:</span>
              “Emite uma nota de serviço de 450 reais pra Ana Souza”
            </div>
          )}
          {passo === 3 && <div className={`${s.bubble} ${s.bot} ${s.bubbleTyping}`}><DigitandoDots /></div>}
          {passo >= 4 && (
            <div className={`${s.bubble} ${s.bot} ${s.resumo}`}>
              <strong>NFS-e — Ana Souza</strong>
              <div className={s.resumoLinha}><span>Serviço</span><b>Consultoria</b></div>
              <div className={s.resumoLinha}><span>Valor</span><b>R$ 450,00</b></div>
              <p>Confere? Responda <b>EMITIR</b> para eu enviar à prefeitura.</p>
            </div>
          )}
          {passo >= 5 && <div className={`${s.bubble} ${s.me} ${s.curta}`}>EMITIR</div>}
          {passo === 6 && <div className={`${s.bubble} ${s.bot} ${s.bubbleTyping}`}><DigitandoDots /></div>}
          {passo >= 7 && (
            <div className={`${s.bubble} ${s.bot} ${s.sucesso}`}>
              <span className={s.seloOk}><Icon name="check" /></span>
              <div>
                <strong>NFS-e nº 128 autorizada ✅</strong>
                <em>PDF e XML aqui na conversa. 31 segundos.</em>
              </div>
            </div>
          )}
        </div>

        <div className={s.composer}>
          <span>{terminou ? "Sua vez: fale com a sua empresa…" : "Gravando…"}</span>
          <b className={terminou ? "" : s.micGravando}><Icon name="mic" /></b>
        </div>
      </div>

      <div className={`${s.chipFlutuante} ${s.chipSefaz} ${passo >= 7 ? s.chipVisivel : ""}`}>
        <Icon name="check" /> SEFAZ · autorizada
      </div>
      <button type="button" className={`${s.replayBtn} ${terminou ? s.chipVisivel : ""}`} onClick={replay}>
        <Icon name="replay" /> ver de novo
      </button>
    </div>
  );
}

/* ── A voz real do assistente (MP3 gerado pelo nosso Kokoro) ── */
function VozReal() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);

  const alternar = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (tocando) { audio.pause(); audio.currentTime = 0; setTocando(false); return; }
    void audio.play().then(() => setTocando(true)).catch(() => setTocando(false));
  };

  return (
    <button type="button" className={`${s.vozReal} ${tocando ? s.vozTocando : ""}`} onClick={alternar}>
      <span className={s.vozBtn}><Icon name={tocando ? "pause" : "play"} /></span>
      <span className={s.vozTexto}>
        <strong>Ouça a voz real do assistente</strong>
        <em>{tocando ? "falando com você agora…" : "gerada pela nossa própria IA — sem robô de telemarketing"}</em>
      </span>
      <Waveform ativa={tocando} />
      <audio ref={audioRef} src="/audio/voz-assistente.mp3" preload="none" onEnded={() => setTocando(false)} />
    </button>
  );
}

/* ── Calculadora de tempo perdido ── */
function Calculadora() {
  const [notasMes, setNotasMes] = useState(25);
  const MIN_DIGITANDO = 6; // abrir sistema, achar cliente, preencher, conferir
  const SEG_POR_AUDIO = 31;

  const { horasMes, horasAno, diasAno } = useMemo(() => {
    const gastoMes = (notasMes * MIN_DIGITANDO) / 60;
    const comAudio = (notasMes * SEG_POR_AUDIO) / 3600;
    const economiaMes = Math.max(0, gastoMes - comAudio);
    const ano = economiaMes * 12;
    return {
      horasMes: economiaMes.toFixed(1).replace(".", ","),
      horasAno: Math.round(ano),
      diasAno: (ano / 8).toFixed(1).replace(".", ",")
    };
  }, [notasMes]);

  return (
    <div className={s.calc}>
      <div className={s.calcPergunta}>
        <label htmlFor="notas-mes">Quantas notas você emite por mês?</label>
        <output>{notasMes}</output>
      </div>
      <input
        id="notas-mes"
        type="range"
        min={5}
        max={200}
        step={5}
        value={notasMes}
        onChange={(e) => setNotasMes(Number(e.target.value))}
      />
      <div className={s.calcResultados}>
        <div><strong>{horasMes}h</strong><span>de digitação a menos por mês</span></div>
        <div><strong>{horasAno}h</strong><span>por ano de volta pra você</span></div>
        <div><strong>{diasAno}</strong><span>dias úteis de trabalho por ano</span></div>
      </div>
      <small>Comparando ~{MIN_DIGITANDO} min por nota digitada (abrir sistema, achar cliente, preencher, conferir) com um áudio de {SEG_POR_AUDIO} segundos.</small>
    </div>
  );
}

/* ── Página ── */
export function VoiceLiveLanding({ precoMensal, trialDias }: VoiceLiveLandingProps) {
  const preco = precoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  return (
    <main className={s.page}>
      <nav className={s.nav} aria-label="Navegação">
        <Link className={s.brand} href="/"><span>X</span>XERP</Link>
        <span className={s.navSelo}><Icon name="lock" /> IA própria · seu áudio não sai do nosso servidor</span>
        <a className={s.navCta} href="#comecar">Testar grátis</a>
      </nav>

      {/* HERO: a demonstração É o herói */}
      <header className={s.hero}>
        <div className={s.heroCopy}>
          <span className={s.kicker}><Icon name="mic" /> Nota fiscal por áudio</span>
          <h1>Aperte o play.<br /><em>É assim que se emite nota</em> a partir de agora.</h1>
          <p>
            Você manda um áudio no WhatsApp ou Telegram. O assistente entende, mostra o resumo,
            você responde <b>EMITIR</b> — e a nota autorizada volta na mesma conversa, com PDF.
            Sem tela, sem digitação, sem &ldquo;deixa pra noite&rdquo;.
          </p>
          <VozReal />
          <div className={s.heroAcoes}>
            <a className={s.ctaPrimario} href="#comecar">Emitir minha primeira nota por áudio <Icon name="arrow" /></a>
          </div>
          <div className={s.heroConfianca}>
            <span><Icon name="check" /> {trialDias} dias grátis, sem cartão</span>
            <span><Icon name="check" /> Você confirma antes de emitir</span>
            <span><Icon name="check" /> {preco}/mês depois</span>
          </div>
        </div>
        <ConversaAoVivo />
      </header>

      {/* Faixa de fatos */}
      <div className={s.fatos}>
        <div><strong>31s</strong><span>do áudio à nota autorizada</span></div>
        <div><strong>NF-e · NFC-e · NFS-e</strong><span>direto na SEFAZ e prefeitura</span></div>
        <div><strong>100%</strong><span>das emissões confirmadas por você</span></div>
        <div><strong>0 áudio</strong><span>enviado para big techs — IA nossa</span></div>
      </div>

      {/* Calculadora */}
      <section className={s.secao}>
        <div className={s.secaoCabeca}>
          <span className={s.eyebrow}>Faça a conta</span>
          <h2>Quanto da sua vida vai embora digitando nota?</h2>
          <p>Arraste e veja o tempo que a sua voz devolve para o seu dia.</p>
        </div>
        <Calculadora />
      </section>

      {/* Como funciona + privacidade */}
      <section className={s.secao}>
        <div className={s.secaoCabeca}>
          <span className={s.eyebrow}>Por trás da mágica</span>
          <h2>Simples na conversa. Sério por dentro.</h2>
        </div>
        <div className={s.pilares}>
          <article>
            <span className={s.pilarNum}>1</span>
            <h3>Fala do seu jeito</h3>
            <p>&ldquo;Emite uma nota de 450 pra Ana&rdquo;, &ldquo;cobra o João no Pix&rdquo;, &ldquo;quanto vendi hoje?&rdquo; — áudio ou texto, sem comando decorado. Cliente novo? Só o CNPJ: buscamos o resto na Receita.</p>
          </article>
          <article>
            <span className={s.pilarNum}>2</span>
            <h3>Confirma antes de valer</h3>
            <p>Nada sensível acontece sem o seu <b>EMITIR</b>. O resumo mostra cliente, serviço e valor — e valores, links e documentos sempre chegam também em texto, para ficar registrado.</p>
          </article>
          <article>
            <span className={s.pilarNum}>3</span>
            <h3>Seu áudio fica em casa</h3>
            <p>A transcrição e a voz do assistente rodam em <b>IA própria, nos nossos servidores no Brasil</b>. Seu áudio não vira dado de treino de ninguém. LGPD de verdade, não de banner.</p>
          </article>
        </div>
      </section>

      {/* O que mais faz */}
      <section className={s.secao}>
        <div className={s.secaoCabeca}>
          <span className={s.eyebrow}>A nota é só a porta de entrada</span>
          <h2>Um funcionário de IA, não um emissor.</h2>
        </div>
        <div className={s.gridMais}>
          {[
            ["💸", "Cobra por você", "Pix com QR e boleto gerados na conversa e enviados ao seu cliente."],
            ["📸", "Foto do cupom = gasto lançado", "Tirou foto da despesa, mandou, está categorizada. Fim do caderninho."],
            ["🛒", "Venda completa", "Orçamento, pedido, baixa de estoque e financeiro — tudo pelo chat."],
            ["📊", "Responde na hora", "“Quanto vendi hoje?”, “quem me deve?”, “e o estoque?” — sem abrir tela."],
            ["🏢", "Feito para contadores", "Um número atende vários CNPJs: o assistente pergunta qual empresa e você troca com uma palavra."],
            ["🔐", "Certificado pelo chat", "Até o A1 (.pfx) você envia na própria conversa. Configuração sem mistério."]
          ].map(([emoji, titulo, texto]) => (
            <article key={titulo as string}>
              <span aria-hidden="true">{emoji}</span>
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Oferta + form */}
      <section className={`${s.secao} ${s.oferta}`} id="comecar">
        <div className={s.ofertaGrid}>
          <div>
            <span className={s.eyebrow}>Sem enrolação</span>
            <h2>Teste com a sua empresa, hoje.</h2>
            <p>
              {trialDias} dias grátis, sem cartão. Cadastro pelo CNPJ (a Receita preenche o resto),
              certificado pelo chat e a primeira nota sai ainda hoje — falando.
            </p>
            <div className={s.precoCard}>
              <small>depois do teste</small>
              <strong>{preco}</strong><span>/mês · notas ilimitadas</span>
            </div>
            <ul className={s.checklist}>
              <li><Icon name="check" /> WhatsApp, Telegram e chat no sistema</li>
              <li><Icon name="check" /> Áudio nos dois sentidos: ele te entende e te responde falando</li>
              <li><Icon name="check" /> NF-e, NFC-e e NFS-e + Pix, boleto e gastos por foto</li>
              <li><Icon name="check" /> Cresceu? Vira ERP completo sem migração — mesmo login</li>
            </ul>
          </div>
          <LaunchLeadForm campanha="nota-por-audio-v3" origem="Landing Nota por Áudio v3" />
        </div>
      </section>

      {/* FAQ */}
      <section className={s.secao} id="duvidas">
        <div className={s.secaoCabeca}>
          <span className={s.eyebrow}>Perguntas diretas</span>
          <h2>O que todo mundo pergunta.</h2>
        </div>
        <div className={s.faq}>
          {[
            ["A IA emite a nota sozinha?", "Nunca. Ela organiza tudo e espera você responder EMITIR. Sem a sua confirmação explícita, nenhuma nota, cobrança ou cancelamento acontece."],
            ["E se ela entender errado o meu áudio?", "Ela repete o que entendeu (🎙 “Entendi: …”) e mostra o resumo com cliente e valor ANTES de agir. Entendeu errado? É só corrigir na conversa."],
            ["Meu áudio vai parar em alguma big tech?", "Não. A transcrição e a voz do assistente rodam em IA própria, nos nossos servidores. Seu áudio não é usado para treinar modelos de terceiros."],
            ["Preciso de certificado digital?", "Sim, o A1 (.pfx) da sua empresa — exigência da Receita para assinar notas. Você envia o arquivo pelo próprio chat e o sistema configura tudo."],
            ["Funciona para serviço e comércio?", "Sim: NFS-e para serviços, NF-e e NFC-e para comércio — direto na SEFAZ e no padrão nacional das prefeituras."],
            ["E quando a empresa crescer?", "O chat é a porta de entrada de um ERP completo (PDV, estoque, financeiro, OS). O upgrade mantém seus dados e seu login — sem migração."]
          ].map(([q, a]) => (
            <details key={q as string}>
              <summary>{q}<i>+</i></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className={s.final}>
        <h2>&ldquo;Emite essa nota pra mim.&rdquo;</h2>
        <p>Sete palavras. É tudo que a burocracia vai exigir de você a partir de hoje.</p>
        <a className={s.ctaPrimario} href="#comecar">Começar teste grátis <Icon name="arrow" /></a>
      </section>

      <footer className={s.rodape}>
        <Link className={s.brand} href="/"><span>X</span>XERP</Link>
        <div>
          <Link href="/login">Entrar</Link>
          <Link href="/chat">Plano Chat</Link>
          <Link href="/">Sistema completo</Link>
        </div>
        <small>© {new Date().getFullYear()} XERP por Valleteclab · seu áudio processado por IA própria, no Brasil.</small>
      </footer>

      <a className={s.ctaMobile} href="#comecar">🎙 Testar a nota por áudio</a>
    </main>
  );
}
