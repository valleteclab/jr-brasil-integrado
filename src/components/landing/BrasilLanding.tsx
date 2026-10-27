"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import s from "./brasil.module.css";

/**
 * Landing /brasil — página de captação para divulgação em perfil do Instagram.
 *
 * O lead é o objetivo: o formulário fica acima da dobra e grava em /api/public/leads (mesmo
 * endpoint das outras landings, com rate limit e honeypot). Quem não quiser esperar o contato
 * tem duas saídas: chamar o WhatsApp na hora (com o código da campanha na mensagem, que é
 * como o agente comercial descobre a origem) ou criar a conta e testar sozinho.
 *
 * Preço, limite de notas e trial vêm do plano cadastrado em /admin/planos — nada fixo aqui.
 */

export type BrasilLandingProps = {
  plano: {
    codigo: string;
    nome: string;
    descricao: string | null;
    precoMensal: number;
    limiteNotasMes: number | null;
    trialDias: number;
  } | null;
  /** Número do WhatsApp comercial, só dígitos com DDI (ex.: 5577998755764). */
  whatsapp: string;
  /** Código da campanha: vai no lead e na mensagem do WhatsApp. */
  campanha: string;
};

type FormState = { nome: string; telefone: string; segmento: string; uf: string };

const INICIAL: FormState = { nome: "", telefone: "", segmento: "", uf: "" };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SEGMENTOS = [
  "Comércio / loja",
  "Prestador de serviço",
  "Oficina / autopeças",
  "Construção / obra",
  "MEI / autônomo",
  "Outro"
];

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"
];

const RECURSOS = [
  { ico: s.icoV, emoji: "🧾", titulo: "Nota fiscal sem dor", texto: "NF-e, cupom (NFC-e) e nota de serviço emitidos direto na SEFAZ e na SEFIN Nacional, com o seu certificado A1." },
  { ico: s.icoA, emoji: "🛒", titulo: "Venda e caixa", texto: "PDV com sangria, suprimento e fechamento conferido. No fim do dia você sabe exatamente o que entrou." },
  { ico: s.icoB, emoji: "💰", titulo: "Cobrança e banco", texto: "Boleto e Pix pelo seu banco, contas a pagar e receber, e o dinheiro conciliado sem planilha." },
  { ico: s.icoV, emoji: "🎙️", titulo: "Opera por áudio", texto: "Manda mensagem de voz no WhatsApp ou Telegram: o assistente entende, confirma com você e emite." },
  { ico: s.icoA, emoji: "📊", titulo: "Imposto no claro", texto: "Painel do Simples e do MEI, apuração do DAS e os XMLs prontos para o contador no fim do mês." },
  { ico: s.icoB, emoji: "🔒", titulo: "Seus dados, seus", texto: "Cada empresa isolada, acesso por permissão e trilha de auditoria. Servidor no Brasil." }
];

const FAQ = [
  { q: "Preciso de certificado digital?", a: "Para emitir nota, sim — é exigência da Receita, não nossa. Se você não tem, a gente mostra o caminho mais barato para conseguir o A1." },
  { q: "Serve para MEI?", a: "Serve. Tem painel próprio de MEI, com o limite de faturamento acompanhado e alerta antes de estourar." },
  { q: "Meu contador continua trabalhando?", a: "Continua. Todo mês ele recebe o pacote com os XMLs e os relatórios que precisa." },
  { q: "Preciso instalar algo?", a: "Não. Funciona no navegador do computador e do celular, e pelo WhatsApp ou Telegram." }
];

/** UTMs da URL (o que o anúncio/bio carregar) com padrão de campanha de Instagram. */
function utmsDaUrl(campanha: string) {
  const p = new URLSearchParams(window.location.search);
  return {
    utmSource: p.get("utm_source") || "instagram",
    utmMedium: p.get("utm_medium") || "bio",
    utmCampaign: p.get("utm_campaign") || campanha,
    utmContent: p.get("utm_content") || undefined,
    utmTerm: p.get("utm_term") || undefined
  };
}

export function BrasilLanding({ plano, whatsapp, campanha }: BrasilLandingProps) {
  const [form, setForm] = useState<FormState>(INICIAL);
  const [consentimento, setConsentimento] = useState(true);
  const [site, setSite] = useState(""); // honeypot: robô preenche, humano não vê
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);

  const trial = plano?.trialDias ?? 7;
  const preco = plano && plano.precoMensal > 0 ? brl(plano.precoMensal) : null;
  const urlCadastro = plano ? `/cadastro?plano=${encodeURIComponent(plano.codigo.toLowerCase())}` : "/cadastro";
  const linkZap = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Quero conhecer o XERP [c:${campanha}]`)}`;

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          telefone: form.telefone.replace(/\D/g, ""),
          site,
          consentimento,
          canalOrigem: "LANDING_PAGE",
          origem: "Landing Brasil (Instagram)",
          campanha,
          dorPrincipal: "Veio da campanha /brasil: quer emitir nota e organizar a empresa.",
          ...utmsDaUrl(campanha)
        })
      });
      const dados = (await resposta.json()) as { leadId?: string; error?: string };
      if (!resposta.ok || !dados.leadId) {
        throw new Error(dados.error || "Não foi possível registrar seu contato agora.");
      }
      setLeadId(dados.leadId);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível registrar seu contato agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.faixa}><i /><i /><i /></div>

      <div className={s.topoBarra}>
        <div className={`${s.wrap} ${s.topo}`}>
          <span className={s.marca}><span className={s.losango} /> XERP</span>
          <span className={s.selo}>🇧🇷 Tecnologia 100% brasileira</span>
        </div>
      </div>

      {/* Hero + captação */}
      <header className={s.hero}>
        <div className={`${s.wrap} ${s.heroInner}`}>
          <div>
            <span className={s.kicker}>Para quem empreende no Brasil</span>
            <h1>Sua empresa no controle: <em>nota fiscal, caixa e cobrança</em> num sistema só.</h1>
            <p className={s.sub}>
              Emita NF-e, cupom e nota de serviço direto na SEFAZ, com o seu certificado.
              Sem depender de terceiros e sem mensalidade de gente grande.
            </p>
            <ul className={s.bullets}>
              <li><span className={s.check}>✓</span><span><strong>Emissão em minutos</strong> — nota autorizada com PDF e XML na hora</span></li>
              <li><span className={s.check}>✓</span><span><strong>Fale, não digite</strong> — manda um áudio no WhatsApp ou Telegram e a nota sai</span></li>
              <li><span className={s.check}>✓</span><span><strong>Simples e MEI</strong> — painel do DAS e pacote de XML para o contador</span></li>
              <li><span className={s.check}>✓</span><span><strong>{trial} dias grátis</strong> — sem cartão para testar</span></li>
            </ul>
          </div>

          <div className={s.card} id="cadastro">
            <div className={s.cardTopo}>
              <strong>Quero conhecer o XERP</strong>
              <span>Deixe seu contato — a gente te chama no WhatsApp hoje.</span>
            </div>

            {leadId ? (
              <div className={s.ok}>
                <span style={{ fontSize: 34 }} aria-hidden="true">🇧🇷</span>
                <h3>Recebido!</h3>
                <p>Nosso especialista vai te chamar no WhatsApp. Se quiser adiantar, já pode começar seu teste agora.</p>
                <Link className={s.btn} href={urlCadastro}>Começar meu teste grátis</Link>
                <a className={s.linkDireto} href={linkZap} target="_blank" rel="noopener noreferrer">Ou falar agora no WhatsApp →</a>
              </div>
            ) : (
              <form className={s.form} onSubmit={enviar}>
                <label className={s.campo}>
                  <span>Seu nome</span>
                  <input
                    required
                    autoComplete="name"
                    placeholder="Como quer ser chamado"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </label>
                <label className={s.campo}>
                  <span>WhatsApp</span>
                  <input
                    required
                    minLength={10}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                </label>
                <div className={s.dupla}>
                  <label className={s.campo}>
                    <span>Seu negócio</span>
                    <select value={form.segmento} onChange={(e) => setForm({ ...form, segmento: e.target.value })}>
                      <option value="">Selecione</option>
                      {SEGMENTOS.map((seg) => <option key={seg}>{seg}</option>)}
                    </select>
                  </label>
                  <label className={s.campo}>
                    <span>Estado</span>
                    <select value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
                      <option value="">UF</option>
                      {UFS.map((uf) => <option key={uf}>{uf}</option>)}
                    </select>
                  </label>
                </div>

                <label className={s.lgpd}>
                  <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} />
                  <span>Autorizo o contato pelo WhatsApp sobre o XERP. Posso pedir para parar quando quiser.</span>
                </label>

                <div className={s.honeypot} aria-hidden="true">
                  <label>
                    Site
                    <input tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
                  </label>
                </div>

                {erro ? <p className={s.erro}>{erro}</p> : null}

                <button className={s.btn} type="submit" disabled={enviando}>
                  {enviando ? "Enviando..." : "Quero falar com um especialista"}
                </button>
                <a className={`${s.btn} ${s.btnZap}`} href={linkZap} target="_blank" rel="noopener noreferrer">
                  Chamar agora no WhatsApp
                </a>

                <div className={s.ou}>ou</div>
                <Link className={s.linkDireto} href={urlCadastro}>Prefiro criar minha conta e testar sozinho →</Link>
              </form>
            )}
          </div>
        </div>
      </header>

      {/* O que resolve */}
      <section className={s.secao}>
        <div className={s.wrap}>
          <div className={s.tit}>
            <span className={s.barrinha} />
            <h2>O que o dono da empresa resolve aqui</h2>
            <p>Sem precisar de três sistemas diferentes e um escritório para cada coisa.</p>
          </div>
          <div className={s.grid3}>
            {RECURSOS.map((r) => (
              <article className={s.box} key={r.titulo}>
                <span className={`${s.ico} ${r.ico}`} aria-hidden="true">{r.emoji}</span>
                <h3>{r.titulo}</h3>
                <p>{r.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Como começa */}
      <section className={`${s.secao} ${s.secaoCinza}`}>
        <div className={s.wrap}>
          <div className={s.tit}>
            <span className={s.barrinha} />
            <h2>Começa em três passos</h2>
            <p>Dá para emitir a primeira nota no mesmo dia.</p>
          </div>
          <div className={s.passo}>
            <span className={s.num}>1</span>
            <span><strong>Crie a conta</strong><em>Dados da empresa e pronto — {trial} dias grátis, sem cartão.</em></span>
          </div>
          <div className={s.passo}>
            <span className={s.num}>2</span>
            <span><strong>Suba seu certificado A1</strong><em>Se ainda não tem, a gente te orienta a conseguir o seu.</em></span>
          </div>
          <div className={s.passo}>
            <span className={s.num}>3</span>
            <span><strong>Emita sua primeira nota</strong><em>Pela tela, pelo WhatsApp ou mandando um áudio. PDF e XML na hora.</em></span>
          </div>
        </div>
      </section>

      {/* Plano da campanha (do cadastro de planos) */}
      <section className={s.secao} id="plano">
        <div className={s.wrap}>
          <div className={s.tit}>
            <span className={s.barrinha} />
            <h2>A oferta desta campanha</h2>
            <p>Começa pequeno e sobe quando a empresa crescer. Sem multa para sair.</p>
          </div>
          <div className={s.planoGrid}>
            <div className={s.plano}>
              <span className={s.tag}>Oferta desta página</span>
              <span className={s.planoNome}>{plano?.nome ?? "Plano da campanha"}</span>
              {preco ? <div className={s.preco}>{preco}<small>/mês</small></div> : null}
              {plano?.descricao ? <p className={s.planoDesc}>{plano.descricao}</p> : null}
              <ul>
                {plano?.limiteNotasMes ? <li>{plano.limiteNotasMes} notas fiscais por mês</li> : null}
                <li>NF-e, cupom e nota de serviço</li>
                <li>Assistente no WhatsApp e no Telegram</li>
                <li>{trial} dias grátis, sem cartão</li>
              </ul>
              <Link className={s.btnPlano} href={urlCadastro}>Quero este plano</Link>
            </div>
            <div className={s.outros}>
              <h3>Precisa de mais que isso?</h3>
              <p>Tem plano com PDV, estoque e financeiro completo. O especialista te mostra no WhatsApp qual encaixa no seu tamanho.</p>
              <ul className={s.listaSimples}>
                <li>Loja com caixa e estoque</li>
                <li>Boleto e Pix pelo seu banco</li>
                <li>Várias empresas no mesmo login</li>
              </ul>
              <a className={s.linkDireto} style={{ textAlign: "left", paddingLeft: 0 }} href={linkZap} target="_blank" rel="noopener noreferrer">
                Falar com um especialista →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Dúvidas */}
      <section className={s.secao}>
        <div className={s.wrap}>
          <div className={s.tit}><span className={s.barrinha} /><h2>Dúvidas rápidas</h2></div>
          {FAQ.map((item) => (
            <details className={s.faq} key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={s.ctaFinal}>
        <div className={`${s.wrap} ${s.ctaFinalInner}`}>
          <h2>Pare de pagar caro para emitir uma nota.</h2>
          <p>Teste {trial} dias, sem cartão. Se não servir, você sai sem pagar nada.</p>
          <a className={s.btnBranco} href="#cadastro">Quero meu teste grátis</a>
        </div>
      </section>

      <div className={s.faixa}><i /><i /><i /></div>
      <footer className={s.pe}>
        <div className={`${s.wrap} ${s.peInner}`}>
          XERP — sistema de gestão e emissor fiscal. Lauro de Freitas/BA<br />
          Seus dados são usados apenas para este contato comercial (LGPD).{" "}
          <Link href="/">Conheça o sistema completo</Link>
        </div>
      </footer>
    </div>
  );
}
