"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LaunchLeadForm } from "./LaunchLeadForm";
import s from "./vox.module.css";

/**
 * Landing "nota por áudio" v4 — XERP Vox · "o microfone é o novo teclado".
 *  - Herói interativo: o visitante aperta um ORBE de microfone e assiste ao ciclo
 *    completo acontecer — gravação (cronômetro + forma de onda), transcrição sendo
 *    digitada, nota se montando linha a linha e o carimbo AUTORIZADA, fechando com
 *    a VOZ REAL do assistente (MP3 gerado pelo nosso Kokoro);
 *  - abas "fale uma frase, escolha o final": cada comando mostra o que o sistema faz;
 *  - linha do tempo 0s→31s, comparador teclado × voz e calculadora de tempo;
 *  - identidade própria: midnight + violeta + âmbar (som), nada de verde-WhatsApp.
 * Preço/trial vêm do PlataformaPlano (nada fixo). CTA → LaunchLeadForm → /cadastro?plano=chat.
 */

type VoxLandingProps = {
  precoMensal: number;
  trialDias: number;
};

function Icon({ name }: { name: "mic" | "check" | "arrow" | "lock" | "play" | "pause" | "replay" | "spark" | "shield" | "zap" }) {
  const path = {
    mic: <><rect x="8" y="3" width="8" height="13" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    play: <path d="M8 5v14l11-7L8 5Z" />,
    pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
    replay: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
    spark: <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8" />,
    shield: <><path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    zap: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  }[name];
  return <svg viewBox="0 0 24 24" aria-hidden="true">{path}</svg>;
}

/** Forma de onda circular em volta do orbe (ativa enquanto grava). */
function OrbitWave({ ativa }: { ativa: boolean }) {
  const barras = 28;
  return (
    <span className={`${s.orbit} ${ativa ? s.orbitOn : ""}`} aria-hidden="true">
      {Array.from({ length: barras }).map((_, i) => (
        <i key={i} style={{ transform: `rotate(${(360 / barras) * i}deg) translateY(-92px)`, animationDelay: `${i * 55}ms` }} />
      ))}
    </span>
  );
}

const FRASE_USUARIO = "Emite uma nota de serviço de 450 reais pra Ana Souza, consultoria de julho";

/* ── Herói: o orbe de microfone que executa a demonstração ── */
function PalcoMic() {
  // fases: pronto → gravando → transcrevendo → montando → autorizada
  const [fase, setFase] = useState<"pronto" | "gravando" | "transcrevendo" | "montando" | "autorizada">("pronto");
  const [decimos, setDecimos] = useState(0);
  const [letras, setLetras] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const jaIniciou = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const limpar = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const depois = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  const iniciar = () => {
    limpar();
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setDecimos(0);
    setLetras(0);
    setFase("gravando");
    depois(3200, () => setFase("transcrevendo"));
    depois(6300, () => setFase("montando"));
    depois(8600, () => {
      setFase("autorizada");
      void audioRef.current?.play().catch(() => undefined);
    });
  };

  // Cronômetro da gravação (décimos de segundo).
  useEffect(() => {
    if (fase !== "gravando") return;
    const t = setInterval(() => setDecimos((d) => Math.min(d + 1, 31)), 100);
    return () => clearInterval(t);
  }, [fase]);

  // Máquina de escrever da transcrição.
  useEffect(() => {
    if (fase !== "transcrevendo" && fase !== "montando" && fase !== "autorizada") return;
    if (letras >= FRASE_USUARIO.length) return;
    const t = setTimeout(() => setLetras((l) => l + 2), 42);
    return () => clearTimeout(t);
  }, [fase, letras]);

  // Auto-start quando o palco entra na tela (uma vez).
  useEffect(() => {
    const el = palcoRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { if (!jaIniciou.current) { jaIniciou.current = true; iniciar(); } return; }
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !jaIniciou.current) {
        jaIniciou.current = true;
        depois(700, iniciar);
        obs.disconnect();
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => { obs.disconnect(); limpar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const segundos = `${Math.floor(decimos / 10)}.${decimos % 10}s`;
  const mostrouNota = fase === "montando" || fase === "autorizada";

  return (
    <div className={s.palco} ref={palcoRef}>
      <div className={s.palcoGlow} aria-hidden="true" />

      <button
        type="button"
        className={`${s.orbe} ${fase === "gravando" ? s.orbeGravando : ""} ${fase === "autorizada" ? s.orbeOk : ""}`}
        onClick={iniciar}
        aria-label={fase === "pronto" ? "Apertar para ver a demonstração" : "Repetir a demonstração"}
      >
        <OrbitWave ativa={fase === "gravando"} />
        <span className={s.orbeNucleo}>
          <Icon name={fase === "autorizada" ? "check" : "mic"} />
        </span>
        <span className={s.orbeLegenda}>
          {fase === "pronto" && "aperte e veja"}
          {fase === "gravando" && <>gravando <b>{segundos}</b></>}
          {fase === "transcrevendo" && "transcrevendo…"}
          {fase === "montando" && "montando a nota…"}
          {fase === "autorizada" && "31 segundos. só."}
        </span>
      </button>

      <div className={s.painel} aria-live="polite">
        <div className={`${s.linhaTranscricao} ${letras > 0 ? s.visivel : ""}`}>
          <span className={s.tagVoce}><Icon name="mic" /> você disse</span>
          <p>
            “{FRASE_USUARIO.slice(0, letras)}
            {letras < FRASE_USUARIO.length && fase !== "pronto" && fase !== "gravando" ? <i className={s.caret} /> : null}
            {letras >= FRASE_USUARIO.length ? "”" : ""}
          </p>
        </div>

        <div className={`${s.notaCard} ${mostrouNota ? s.notaVisivel : ""}`}>
          <header>
            <span className={s.notaTipo}>NFS-e · serviço</span>
            <span className={s.notaNum}>nº 128</span>
          </header>
          <div className={s.notaLinha} style={{ animationDelay: "0.05s" }}><span>Tomador</span><b>Ana Souza</b></div>
          <div className={s.notaLinha} style={{ animationDelay: "0.25s" }}><span>Descrição</span><b>Consultoria · julho</b></div>
          <div className={s.notaLinha} style={{ animationDelay: "0.45s" }}><span>Valor</span><b>R$ 450,00</b></div>
          <footer style={{ animationDelay: "0.65s" }}>
            <em>você respondeu <b>EMITIR</b> — enviada à prefeitura</em>
            <span className={`${s.carimbo} ${fase === "autorizada" ? s.carimboOn : ""}`}>AUTORIZADA</span>
          </footer>
        </div>
      </div>

      {fase === "autorizada" && (
        <button type="button" className={s.replayBtn} onClick={iniciar}>
          <Icon name="replay" /> ver de novo
        </button>
      )}
      <audio ref={audioRef} src="/audio/voz-assistente.mp3" preload="none" />
    </div>
  );
}

/* ── A voz real do assistente ── */
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
      <span className={`${s.vozWave} ${tocando ? s.vozWaveOn : ""}`} aria-hidden="true">
        {[9, 16, 22, 12, 26, 31, 18, 27, 13, 21, 10, 15].map((h, i) => <i key={i} style={{ height: h, animationDelay: `${i * 70}ms` }} />)}
      </span>
      <audio ref={audioRef} src="/audio/voz-assistente.mp3" preload="none" onEnded={() => setTocando(false)} />
    </button>
  );
}

/* ── "Fale uma frase. Escolha o final." ── */
const FINAIS = [
  {
    frase: "Emite uma nota de 450 pra Ana",
    titulo: "Nota autorizada",
    emoji: "🧾",
    detalhe: "NFS-e nº 128 autorizada na prefeitura, PDF e XML entregues na conversa.",
    tempo: "31s"
  },
  {
    frase: "Cobra o João 200 no Pix",
    titulo: "Cobrança no Pix",
    emoji: "💸",
    detalhe: "QR Code e copia-e-cola gerados e enviados direto para o WhatsApp do João.",
    tempo: "12s"
  },
  {
    frase: "Quanto eu vendi hoje?",
    titulo: "Resposta na hora",
    emoji: "📊",
    detalhe: "“R$ 2.340 em 14 vendas — 18% acima de ontem.” Falada e escrita, sem abrir tela.",
    tempo: "4s"
  },
  {
    frase: "Lança esse gasto: foto do cupom",
    titulo: "Gasto categorizado",
    emoji: "📸",
    detalhe: "A foto do cupom vira despesa lançada e categorizada. Fim do caderninho.",
    tempo: "9s"
  }
] as const;

function FrasesFinais() {
  const [ativo, setAtivo] = useState(0);
  return (
    <div className={s.finais}>
      <div className={s.finaisFrases} role="tablist" aria-label="Frases de exemplo">
        {FINAIS.map((f, i) => (
          <button
            key={f.frase}
            type="button"
            role="tab"
            aria-selected={ativo === i}
            className={`${s.fraseChip} ${ativo === i ? s.fraseAtiva : ""}`}
            onClick={() => setAtivo(i)}
          >
            <Icon name="mic" /> “{f.frase}”
          </button>
        ))}
      </div>
      <div className={s.finalCard} role="tabpanel" key={ativo}>
        <span className={s.finalEmoji} aria-hidden="true">{FINAIS[ativo].emoji}</span>
        <div>
          <strong>{FINAIS[ativo].titulo} <b className={s.finalTempo}>em {FINAIS[ativo].tempo}</b></strong>
          <p>{FINAIS[ativo].detalhe}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Calculadora de tempo devolvido ── */
function Calculadora() {
  const [notasMes, setNotasMes] = useState(25);
  const [minPorNota, setMinPorNota] = useState(6);
  const SEG_POR_AUDIO = 31;

  const { horasMes, horasAno, diasAno } = useMemo(() => {
    const economiaMes = Math.max(0, (notasMes * minPorNota) / 60 - (notasMes * SEG_POR_AUDIO) / 3600);
    const ano = economiaMes * 12;
    return {
      horasMes: economiaMes.toFixed(1).replace(".", ","),
      horasAno: Math.round(ano),
      diasAno: (ano / 8).toFixed(1).replace(".", ",")
    };
  }, [notasMes, minPorNota]);

  return (
    <div className={s.calc}>
      <div className={s.calcSliders}>
        <div className={s.calcCampo}>
          <div className={s.calcPergunta}>
            <label htmlFor="vox-notas">Notas por mês</label>
            <output>{notasMes}</output>
          </div>
          <input id="vox-notas" type="range" min={5} max={200} step={5} value={notasMes} onChange={(e) => setNotasMes(Number(e.target.value))} />
        </div>
        <div className={s.calcCampo}>
          <div className={s.calcPergunta}>
            <label htmlFor="vox-min">Minutos digitando cada uma</label>
            <output>{minPorNota} min</output>
          </div>
          <input id="vox-min" type="range" min={2} max={15} step={1} value={minPorNota} onChange={(e) => setMinPorNota(Number(e.target.value))} />
        </div>
      </div>
      <div className={s.calcResultados}>
        <div><strong>{horasMes}h</strong><span>de digitação a menos por mês</span></div>
        <div><strong>{horasAno}h</strong><span>por ano de volta pra você</span></div>
        <div><strong>{diasAno}</strong><span>dias úteis inteiros por ano</span></div>
      </div>
      <small>Comparando digitação tradicional (abrir sistema, achar cliente, preencher, conferir) com um áudio de {SEG_POR_AUDIO} segundos.</small>
    </div>
  );
}

/* ── Marquee de frases ── */
const MARQUEE = [
  "emite uma nota de 450 pra Ana",
  "cobra o João no Pix",
  "quanto vendi hoje?",
  "cancela a nota 128",
  "tira foto do cupom e lança",
  "manda o orçamento pro cliente",
  "quem tá me devendo?",
  "cadastra esse CNPJ aí",
  "baixa o estoque da venda",
  "repete a nota de junho"
];

/* ── Página ── */
export function VoxLanding({ precoMensal, trialDias }: VoxLandingProps) {
  const preco = precoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  return (
    <main className={s.page}>
      <nav className={s.nav} aria-label="Navegação">
        <Link className={s.brand} href="/"><span>V</span>XERP <em>Vox</em></Link>
        <span className={s.navSelo}><Icon name="shield" /> IA própria · seu áudio não sai do nosso servidor</span>
        <a className={s.navCta} href="#comecar">Testar grátis</a>
      </nav>

      {/* HERO: o orbe É a demonstração */}
      <header className={s.hero}>
        <div className={s.heroCopy}>
          <span className={s.kicker}><Icon name="spark" /> Apresentando o XERP Vox</span>
          <h1>O microfone é<br /><em>o novo teclado.</em></h1>
          <p>
            Fale o que aconteceu no seu negócio. O Vox entende, mostra o resumo, você confirma —
            e a nota fiscal volta <b>autorizada</b> na conversa, com PDF. Sem tela, sem campo,
            sem “deixa pra noite”.
          </p>
          <div className={s.heroAcoes}>
            <a className={s.ctaPrimario} href="#comecar">Emitir minha primeira nota por áudio <Icon name="arrow" /></a>
            <VozReal />
          </div>
          <div className={s.heroConfianca}>
            <span><Icon name="check" /> {trialDias} dias grátis, sem cartão</span>
            <span><Icon name="check" /> Você confirma antes de emitir</span>
            <span><Icon name="check" /> {preco}/mês depois</span>
          </div>
        </div>
        <PalcoMic />
      </header>

      {/* Marquee de frases */}
      <div className={s.marqueeWrap} aria-hidden="true">
        <div className={s.marquee}>
          {[...MARQUEE, ...MARQUEE].map((frase, i) => (
            <span key={i} className={s.marqueeItem}><Icon name="mic" /> {frase}</span>
          ))}
        </div>
      </div>

      {/* Faixa de fatos */}
      <div className={s.fatos}>
        <div><strong>31s</strong><span>do áudio à nota autorizada</span></div>
        <div><strong>NF-e · NFC-e · NFS-e</strong><span>direto na SEFAZ e prefeitura</span></div>
        <div><strong>100%</strong><span>das emissões confirmadas por você</span></div>
        <div><strong>0 áudio</strong><span>enviado para big techs — IA nossa</span></div>
      </div>

      {/* Frases → finais */}
      <section className={s.secao}>
        <div className={s.secaoCabeca}>
          <span className={s.eyebrow}>Uma frase basta</span>
          <h2>Fale uma frase. <em>Escolha o final.</em></h2>
          <p>Cada comando de voz vira uma rotina inteira do seu negócio — toque nas frases e veja.</p>
        </div>
        <FrasesFinais />
      </section>

      {/* Linha do tempo */}
      <section className={s.secao}>
        <div className={s.secaoCabeca}>
          <span className={s.eyebrow}>Segundo a segundo</span>
          <h2>O que acontece em 31 segundos.</h2>
        </div>
        <div className={s.timeline}>
          {[
            ["0s", "Você fala", "Aperta o microfone no WhatsApp ou Telegram e fala do seu jeito — sem comando decorado."],
            ["6s", "O Vox repete", "Transcrição na hora, com IA própria: “Entendi: nota de R$ 450 para Ana Souza…”"],
            ["10s", "Você confirma", "Resumo com cliente, serviço e valor. Nada acontece sem o seu EMITIR."],
            ["31s", "Nota autorizada", "Prefeitura ou SEFAZ autorizam. PDF e XML voltam na mesma conversa."]
          ].map(([tempo, titulo, texto], i) => (
            <article key={tempo} className={s.tempo}>
              <span className={s.tempoDot}><i>{i + 1}</i></span>
              <small>{tempo}</small>
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Teclado × Voz */}
      <section className={s.secao}>
        <div className={s.secaoCabeca}>
          <span className={s.eyebrow}>A troca</span>
          <h2>Aposente o caminho longo.</h2>
        </div>
        <div className={s.versus}>
          <article className={s.versoAntigo}>
            <h3>⌨️ Do jeito antigo</h3>
            <ul>
              <li>Abrir o sistema e fazer login</li>
              <li>Procurar o cliente (ou cadastrar)</li>
              <li>Preencher serviço, valor, impostos</li>
              <li>Conferir tudo, campo por campo</li>
              <li>Emitir, baixar o PDF, mandar no WhatsApp</li>
            </ul>
            <footer>≈ 6 minutos por nota</footer>
          </article>
          <span className={s.versusX}><Icon name="zap" /></span>
          <article className={s.versoNovo}>
            <h3>🎙 Com o XERP Vox</h3>
            <ul>
              <li>“Emite uma nota de 450 pra Ana”</li>
              <li>Responder EMITIR</li>
            </ul>
            <footer>≈ 31 segundos por nota</footer>
          </article>
        </div>
      </section>

      {/* Calculadora */}
      <section className={s.secao}>
        <div className={s.secaoCabeca}>
          <span className={s.eyebrow}>Faça a conta</span>
          <h2>Quanto da sua vida vai embora digitando nota?</h2>
          <p>Arraste e veja o tempo que a sua voz devolve para o seu dia.</p>
        </div>
        <Calculadora />
      </section>

      {/* Privacidade */}
      <section className={s.secao}>
        <div className={s.privacidade}>
          <span className={s.privSelo}><Icon name="shield" /></span>
          <div>
            <span className={s.eyebrow}>O argumento que ninguém copia</span>
            <h2>Seu áudio fica em casa.</h2>
            <p>
              A transcrição e a voz do assistente rodam em <b>IA própria, nos nossos servidores no Brasil</b> —
              não em API de big tech. Seu áudio não vira dado de treino de ninguém.
              E nada sensível acontece sem a sua confirmação explícita: <b>sem o seu EMITIR, nenhuma nota sai</b>.
            </p>
            <div className={s.privChips}>
              <span><Icon name="lock" /> Transcrição local (Whisper próprio)</span>
              <span><Icon name="lock" /> Voz gerada em casa (TTS próprio)</span>
              <span><Icon name="lock" /> LGPD de verdade, não de banner</span>
            </div>
          </div>
        </div>
      </section>

      {/* Oferta + form */}
      <section className={`${s.secao} ${s.oferta}`} id="comecar">
        <div className={s.ofertaGrid}>
          <div>
            <span className={s.eyebrow}>Sem enrolação</span>
            <h2>Desligue o teclado hoje.</h2>
            <p>
              {trialDias} dias grátis, sem cartão. Cadastro pelo CNPJ (a Receita preenche o resto),
              certificado A1 enviado pelo próprio chat — e a primeira nota sai ainda hoje, falando.
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
          <LaunchLeadForm campanha="nota-por-audio-v4" origem="Landing Nota por Áudio v4 (Vox)" />
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
            ["E se ela entender errado o meu áudio?", "Ela repete o que entendeu (“Entendi: …”) e mostra o resumo com cliente e valor ANTES de agir. Entendeu errado? É só corrigir na conversa."],
            ["Meu áudio vai parar em alguma big tech?", "Não. A transcrição e a voz do assistente rodam em IA própria, nos nossos servidores no Brasil. Seu áudio não é usado para treinar modelos de terceiros."],
            ["Preciso de certificado digital?", "Sim, o A1 (.pfx) da sua empresa — exigência da Receita para assinar notas. Você envia o arquivo pelo próprio chat e o sistema configura tudo."],
            ["Funciona para serviço e comércio?", "Sim: NFS-e para serviços, NF-e e NFC-e para comércio — direto na SEFAZ e no padrão nacional das prefeituras."],
            ["E quando a empresa crescer?", "O Vox é a porta de entrada de um ERP completo (PDV, estoque, financeiro, OS). O upgrade mantém seus dados e seu login — sem migração."]
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
        <span className={s.finalMic}><Icon name="mic" /></span>
        <h2>&ldquo;Emite essa nota pra mim.&rdquo;</h2>
        <p>Sete palavras. É tudo que a burocracia vai exigir de você a partir de hoje.</p>
        <a className={s.ctaPrimario} href="#comecar">Começar teste grátis <Icon name="arrow" /></a>
      </section>

      <footer className={s.rodape}>
        <Link className={s.brand} href="/"><span>V</span>XERP <em>Vox</em></Link>
        <div>
          <Link href="/login">Entrar</Link>
          <Link href="/chat">Plano Chat</Link>
          <Link href="/">Sistema completo</Link>
        </div>
        <small>© {new Date().getFullYear()} XERP Vox por Valleteclab · seu áudio processado por IA própria, no Brasil.</small>
      </footer>

      <a className={s.ctaMobile} href="#comecar">🎙 Testar a nota por áudio</a>
    </main>
  );
}
