"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./manual.module.css";
import { CAPITULOS, type Bloco } from "./manual-data";

/**
 * Manual público (tour passo-a-passo) do XERP. Barra lateral com índice + scrollspy, busca que
 * filtra as seções, e navegação por "trilhas" (primeiros passos por perfil). Página pública.
 */
export function ManualView() {
  const [ativo, setAtivo] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [menuAberto, setMenuAberto] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const termo = busca.trim().toLowerCase();
  const capitulosFiltrados = useMemo(() => {
    if (!termo) return CAPITULOS;
    return CAPITULOS.map((cap) => ({
      ...cap,
      secoes: cap.secoes.filter((s) => `${s.titulo} ${s.resumo} ${JSON.stringify(s.blocos)}`.toLowerCase().includes(termo))
    })).filter((cap) => cap.secoes.length > 0);
  }, [termo]);

  // Scrollspy: destaca no índice a seção visível.
  useEffect(() => {
    const secoes = contentRef.current?.querySelectorAll("[data-secao]");
    if (!secoes?.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visivel = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel) setAtivo(visivel.target.getAttribute("data-secao") ?? "");
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 }
    );
    secoes.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [capitulosFiltrados]);

  function irPara(id: string) {
    setMenuAberto(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>X</span>
          <span>XERP · Manual</span>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.menuToggle}`} onClick={() => setMenuAberto((v) => !v)}>
            ☰ Índice
          </button>
          <a className={`${styles.btn} ${styles.btnDark}`} href="/erp">Acessar o sistema</a>
        </div>
      </header>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>Central de ajuda</span>
        <h1>Como usar o XERP — passo a passo</h1>
        <p>
          Um guia completo de todos os módulos: do primeiro cadastro à emissão de nota, venda no PDV,
          ordem de serviço e fechamento financeiro. Use a busca ou navegue pelo índice ao lado.
        </p>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔎</span>
          <input
            className={styles.search}
            placeholder="Buscar no manual (ex.: emitir nota, boleto, abrir caixa…)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </section>

      {!termo && (
        <div className={styles.trilhas}>
          {TRILHAS.map((t) => (
            <button key={t.id} type="button" className={styles.trilha} onClick={() => irPara(t.id)}>
              <span className={styles.ic}>{t.icone}</span>
              <strong>{t.titulo}</strong>
              <span>{t.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.layout}>
        <nav className={`${styles.sidebar} ${menuAberto ? styles.sidebarOpen : ""}`}>
          {capitulosFiltrados.map((cap) => (
            <div key={cap.id} className={styles.navGroup}>
              <p className={styles.navGroupTitle}>{cap.titulo}</p>
              {cap.secoes.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`${styles.navLink} ${ativo === s.id ? styles.navLinkActive : ""}`}
                  onClick={(e) => { e.preventDefault(); irPara(s.id); }}
                >
                  {s.icone} {s.titulo}
                </a>
              ))}
            </div>
          ))}
          {!capitulosFiltrados.length && <p className={styles.navGroupTitle}>Nada encontrado.</p>}
        </nav>

        <main className={styles.content} ref={contentRef}>
          {capitulosFiltrados.map((cap) =>
            cap.secoes.map((s) => (
              <section key={s.id} id={s.id} data-secao={s.id} className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIcon}>{s.icone}</span>
                  <h2>{s.titulo}</h2>
                </div>
                <p className={styles.sectionResumo}>{s.resumo}</p>
                {s.blocos.map((b, i) => <BlocoView key={i} bloco={b} />)}
              </section>
            ))
          )}
          {!capitulosFiltrados.length && (
            <div className={styles.para}>Nenhum tópico corresponde a “{busca}”. Tente outra palavra.</div>
          )}
        </main>
      </div>

      <footer className={styles.footer}>
        XERP · por Valleteclab — este manual acompanha as funcionalidades do sistema. Dúvidas? Fale com o suporte.
      </footer>
    </div>
  );
}

function BlocoView({ bloco }: { bloco: Bloco }) {
  switch (bloco.tipo) {
    case "passos":
      return (
        <ol className={styles.steps}>
          {bloco.itens.map((p, i) => (
            <li key={i} className={styles.step}>
              {p.titulo && <span className={styles.stepTitle}>{p.titulo}</span>}
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
      );
    case "dica":
      return <div className={`${styles.callout} ${styles.calloutDica}`}><span className={styles.cIc}>💡</span><span>{bloco.texto}</span></div>;
    case "aviso":
      return <div className={`${styles.callout} ${styles.calloutAviso}`}><span className={styles.cIc}>⚠️</span><span>{bloco.texto}</span></div>;
    case "info":
      return <div className={`${styles.callout} ${styles.calloutInfo}`}><span className={styles.cIc}>ℹ️</span><span>{bloco.texto}</span></div>;
    case "paragrafo":
      return <p className={styles.para}>{bloco.texto}</p>;
    case "lista":
      return <ul className={styles.bullets}>{bloco.itens.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case "tags":
      return <div className={styles.tagRow}>{bloco.itens.map((x, i) => <span key={i} className={styles.tag}>{x}</span>)}</div>;
    default:
      return null;
  }
}

const TRILHAS = [
  { id: "primeiros-passos", icone: "🚀", titulo: "Primeiros passos", desc: "Configure a empresa e comece a usar" },
  { id: "pdv", icone: "🛒", titulo: "Vender no PDV", desc: "Caixa, pagamento e cupom" },
  { id: "nfe", icone: "🧾", titulo: "Emitir nota fiscal", desc: "NFC-e, NF-e e NFS-e" },
  { id: "os", icone: "🔧", titulo: "Ordem de serviço", desc: "Da abertura ao faturamento" },
  { id: "contas-receber", icone: "💰", titulo: "Financeiro", desc: "Contas, boleto e Pix" }
];
