import type { CSSProperties, ReactNode } from "react";
import type { ImagemWeb, PropostaWeb as Dados } from "@/lib/proposta-web/modelo";
import PropostaWebViva from "./PropostaWebViva";
import { IconeInstagram, IconeLinkedIn } from "@/components/IconesDasRedes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA ONLINE — o protótipo dela de 23/10, com os dados de cada proposta
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «O resultado tem de ficar visualmente idêntico ao index.html»: as mesmas
 * secções, pela mesma ordem, com as classes e o CSS do protótipo
 * (`proposta-web.css`, só com o prefixo `pw-`). Tudo o que se lê vem do motor
 * do PDF (ver `modelo.ts`) — a página não tem textos nem contas próprios.
 *
 * Isto desenha-se no servidor. O que mexe — a barra que aparece depois da
 * capa, as entradas ao rolar, a lupa do mosaico, o «Copiar» — vive em
 * `PropostaWebViva.tsx`, e a página lê-se inteira sem ele.
 */

/** Os `sizes` de cada sítio: o browser escolhe do `srcset` só o que precisa. */
const SIZES = {
  capa: "100vw",
  moldura: "(min-width: 900px) 470px, 90vw",
  tile: "(min-width: 800px) 50vw, 100vw",
  paleta: "(min-width: 900px) 25vw, 50vw",
  mosaico: "(min-width: 800px) 25vw, 50vw",
  mosaicoLargo: "(min-width: 800px) 50vw, 100vw",
  condicoes: "(min-width: 900px) 40vw, 100vw",
} as const;

function Foto({
  img,
  sizes,
  alt = "",
  className,
  prioridade = false,
  estilo,
}: {
  img: ImagemWeb;
  sizes: string;
  alt?: string;
  className?: string;
  prioridade?: boolean;
  estilo?: CSSProperties;
}) {
  const style: CSSProperties = {
    ...(img.posicao ? { objectPosition: img.posicao } : {}),
    // O borrão minúsculo fica por baixo até a fotografia chegar — nunca um
    // rectângulo vazio, e nunca um ícone partido (ver `PropostaWebViva`).
    ...(img.lqip ? { backgroundImage: `url("${img.lqip}")`, backgroundSize: "cover" } : {}),
    ...estilo,
  };
  const imagem = (
    // eslint-disable-next-line @next/next/no-img-element -- o srcset vem assinado do Storage; o `next/image` está desligado nesta casa
    <img
      src={img.src}
      srcSet={img.srcSet}
      sizes={img.srcSet ? sizes : undefined}
      alt={alt}
      className={className}
      style={style}
      loading={prioridade ? "eager" : "lazy"}
      fetchPriority={prioridade ? "high" : "auto"}
      decoding="async"
      data-grande={img.grande}
    />
  );
  if (!img.avif) return imagem;
  return (
    <picture style={{ display: "contents" }}>
      <source srcSet={img.avif} type="image/avif" sizes={sizes} />
      {imagem}
    </picture>
  );
}

/** O fundo arrastado de uma secção escura (o `bg_*.jpg` do protótipo). */
function Fundo({ src }: { src: string | null }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- fundo gerado pela rota `fundo/[id]`
  return <img className="pw-bgi" src={src} alt="" loading="lazy" decoding="async" />;
}

/** «7.287,75 €» → o número grande e o «€» pequeno. */
function Valor({ texto }: { texto: string }) {
  const m = /^(.*?)\s*(€|EUR)$/u.exec(texto.trim());
  if (!m) return <>{texto}</>;
  return (
    <>
      {m[1]}
      <small>{m[2]}</small>
    </>
  );
}

export default function PropostaWeb({
  dados: d,
  lang,
  escolhas,
  avisos,
  datas,
  fontes = "",
}: {
  /** As classes do `next/font` (as variáveis `--pw-bodoni` e `--pw-jost`). */
  fontes?: string;
  dados: Dados;
  lang: string;
  /** As escolhas do casal (`EscolhasDoDocumento`), quando o documento as tem. */
  escolhas?: ReactNode;
  /** Avisos da página (proposta revista depois de aceite, expirada). */
  avisos?: ReactNode;
  /** «Válida até… · Emitida a…» e a versão, já escritas. */
  datas: string;
}) {
  const { t } = d;
  const capitulosAntes = d.capitulos.slice(0, d.citacaoDepoisDe);
  const capitulosDepois = d.capitulos.slice(d.citacaoDepoisDe);
  const temInspiracao = d.capitulos.length > 0;
  const ancoras = [
    { href: "#proposta", nome: t.ancoras.proposta },
    ...(d.servicos ? [{ href: "#servicos", nome: t.ancoras.servicos }] : []),
    ...(temInspiracao ? [{ href: "#inspiracao", nome: t.ancoras.inspiracao }] : []),
    ...(d.investimento ? [{ href: "#investimento", nome: t.ancoras.investimento }] : []),
    { href: "#condicoes", nome: t.ancoras.condicoes },
  ];

  const capitulo = (k: Dados["capitulos"][number]) => {
    const texto = (
      <div>
        <div className="pw-num pw-rv">{k.numero}</div>
        <div className="pw-k pw-rv">{t.ancoras.inspiracao.toLocaleLowerCase(lang)}</div>
        <h2 className="pw-t pw-rv">{k.nome}</h2>
        <div className="pw-rule pw-rv" />
        {(k.nota || k.linha) && <p className="pw-rv">{k.nota || k.linha}</p>}
      </div>
    );
    const moldura = k.foto ? (
      <div className="pw-frame pw-rv">
        <Foto img={k.foto} sizes={SIZES.moldura} alt={k.nome} />
      </div>
    ) : null;
    return (
      <div key={k.id}>
        <section className="pw-dark pw-chap" id={k.id}>
          <Fundo src={k.fundo} />
          <div className="pw-wrap pw-inner">
            {k.fotoAEsquerda ? (
              <>
                {moldura}
                {texto}
              </>
            ) : (
              <>
                {texto}
                {moldura}
              </>
            )}
          </div>
        </section>
        {k.mosaico.length > 0 && (
          <section className="pw-mos" data-g="">
            {k.mosaico.map((cel, i) => {
              const CLASSE = { normal: "", alta: "tall", larga: "wide", grande: "big" } as const;
              const forma = [
                CLASSE[cel.forma] && `pw-${CLASSE[cel.forma]}`,
                CLASSE[cel.formaMovel] && `pw-m-${CLASSE[cel.formaMovel]}`,
              ]
                .filter(Boolean)
                .join(" ");
              if (cel.texto)
                return (
                  <figure key={i} className={`pw-txt ${forma}`}>
                    <div className="pw-k">{cel.texto.sobre}</div>
                    <b>{cel.texto.titulo}</b>
                    {cel.texto.nota && <span>{cel.texto.nota}</span>}
                  </figure>
                );
              if (!cel.imagem) return null;
              return (
                <figure
                  key={i}
                  className={forma || undefined}
                  tabIndex={0}
                  role="button"
                  aria-label={`${t.fotografia} ${i + 1} · ${k.nome}`}
                >
                  <Foto
                    img={cel.imagem}
                    sizes={
                      cel.forma === "larga" || cel.forma === "grande"
                        ? SIZES.mosaicoLargo
                        : SIZES.mosaico
                    }
                  />
                </figure>
              );
            })}
          </section>
        )}
      </div>
    );
  };

  return (
    <div className={`pw ${fontes}`} lang={lang} data-pw-raiz="">
      <PropostaWebViva
        t={{
          fechar: t.fechar,
          anterior: t.anterior,
          seguinte: t.seguinte,
          fotografia: t.fotografia,
          copiado: t.copiado,
        }}
        ancoras={ancoras}
        fontes={fontes}
        lang={lang}
      />

      {/* ── Capa ── */}
      <header className="pw-hero" id="top">
        {d.capa.fundo && (
          <Foto img={d.capa.fundo} sizes={SIZES.capa} className="pw-bg" prioridade />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- o logótipo, servido pelo site */}
        <img className="pw-logo" src="/logo-liquen-proposta.png" alt="Líquen Events" />
        <div className="pw-blk">
          <div className="pw-k">{d.capa.sobre}</div>
          <h1 className="pw-t">
            {d.capa.nomes.outro ? (
              <>
                {d.capa.nomes.um} <em className="pw-k">&amp;</em> {d.capa.nomes.outro}
              </>
            ) : (
              d.capa.nomes.um
            )}
          </h1>
          <div className="pw-rule" />
          <div className="pw-meta pw-s">
            {d.capa.partes.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </div>
        <div className="pw-scroll">{t.descer}</div>
      </header>

      {/* ── Saudação ── */}
      <section className="pw-hello pw-wrap">
        <div className="pw-k pw-rv">{d.saudacao}</div>
        <div className="pw-rule pw-rv" />
        <p className="pw-rv">{t.introducao}</p>
      </section>

      {/* ── A proposta ── */}
      <section className="pw-dark" id="proposta">
        <Fundo src={d.proposta.fundo} />
        <div className="pw-wrap pw-prop">
          <div>
            <div className="pw-k pw-rv" style={{ fontSize: "clamp(20px,2.2vw,28px)" }}>
              {d.proposta.sobre.toLocaleLowerCase(lang)}
            </div>
            <h2 className="pw-t pw-rv">{d.proposta.titulo}</h2>
            <dl className="pw-facts pw-rv">
              {d.proposta.factos.map((f, i) => (
                <div
                  key={f.rotulo}
                  style={
                    i === d.proposta.factos.length - 1 && d.proposta.factos.length % 2 === 1
                      ? { gridColumn: "span 2" }
                      : undefined
                  }
                >
                  <dt>{f.rotulo}</dt>
                  <dd>{f.valor}</dd>
                </div>
              ))}
            </dl>
            {d.proposta.nota && <p className="pw-note pw-rv">{d.proposta.nota}</p>}
          </div>
          {d.proposta.foto && (
            <div className="pw-frame pw-rv">
              <Foto img={d.proposta.foto} sizes={SIZES.moldura} />
            </div>
          )}
        </div>
      </section>

      {/* ── O que propomos ── */}
      {d.servicos && (
        <>
          <div className="pw-wrap pw-sec-head" id="servicos">
            <div>
              <div className="pw-k pw-rv">{t.oQuePropomos}</div>
              <h2 className="pw-t pw-rv">{d.servicos.titulo}</h2>
            </div>
            <p className="pw-rv">{t.textoDosServicos}</p>
          </div>
          <section className="pw-svc">
            {d.servicos.itens.map((s, i) => (
              <div
                key={s.numero}
                className="pw-tile"
                style={
                  // Ímpar: o último ocupa as duas colunas (o LEIA-ME).
                  i === d.servicos!.itens.length - 1 && d.servicos!.itens.length % 2 === 1
                    ? { gridColumn: "1 / -1" }
                    : undefined
                }
              >
                {s.foto && <Foto img={s.foto} sizes={SIZES.tile} alt={s.nome} />}
                <div className="pw-in pw-rv">
                  <div className="pw-n">{s.numero}</div>
                  <h3 className="pw-t">{s.nome}</h3>
                  <div className="pw-rule" />
                  {s.descricao && <p>{s.descricao}</p>}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {/* ── Paleta e ambiente ── */}
      {d.paleta && (
        <section className="pw-pal">
          <div className="pw-left">
            <div
              className="pw-k pw-rv"
              style={{ fontSize: "clamp(20px,2.2vw,28px)", color: "var(--muted)" }}
            >
              {t.paleta}
            </div>
            <h2
              className="pw-t pw-rv"
              style={{ fontSize: "clamp(28px,3.6vw,48px)", fontWeight: 400 }}
            >
              {d.paleta.titulo}
            </h2>
            <div className="pw-rule pw-rv" />
            <p className="pw-rv" style={{ maxWidth: 460, color: "var(--muted)" }}>
              {d.paleta.subtitulo}
            </p>
            {d.paleta.cores.length > 0 && (
              <div className="pw-sw pw-rv">
                {d.paleta.cores.map((c) => (
                  <div key={c} style={{ background: c, color: corDoTexto(c) }}>
                    {c.replace("#", "").toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>
          {d.paleta.fotos.length > 0 && (
            <div className="pw-pics">
              {d.paleta.fotos.map((f, i) => (
                <Foto key={i} img={f} sizes={SIZES.paleta} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Inspiração: capítulos, a citação a meio ── */}
      <div id="inspiracao" />
      {capitulosAntes.map(capitulo)}
      {d.citacao && (
        <section className="pw-quote">
          <Foto img={d.citacao.foto} sizes={SIZES.capa} />
          <div>
            <blockquote className="pw-rv">{d.citacao.frase}</blockquote>
            <span className="pw-s pw-rv">{d.citacao.assinatura}</span>
          </div>
        </section>
      )}
      {capitulosDepois.map(capitulo)}

      {/* ── As escolhas do casal (o que eles FAZEM nesta página) ── */}
      {escolhas && <section className="pw-wrap pw-escolhas">{escolhas}</section>}

      {/* ── Investimento ── */}
      {d.investimento && (
        <section className="pw-dark" id="investimento">
          <Fundo src={d.investimento.fundo} />
          <div className="pw-wrap pw-inv">
            <div>
              <div className="pw-k pw-rv" style={{ fontSize: "clamp(20px,2.2vw,28px)" }}>
                {t.ancoras.investimento.toLocaleLowerCase(lang)}
              </div>
              <div className="pw-big pw-rv">
                <Valor texto={d.investimento.valor} />
              </div>
              <div className="pw-s pw-rv" style={{ marginTop: 14, opacity: 0.8 }}>
                {d.investimento.nota ? t.totalComIva : d.investimento.rotulo}
              </div>
              {d.investimento.marcos.length > 0 && (
                <div className="pw-steps pw-rv">
                  {d.investimento.marcos.map((m) => (
                    <div key={m.texto}>
                      <div className="pw-pc">{m.percentagem}%</div>
                      <div className="pw-v">{m.valor}</div>
                      <div className="pw-w">{m.texto}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pw-rv">
              <table className="pw-tbl">
                <tbody>
                  {d.investimento.servicos.length > 0 && (
                    <tr>
                      <td>
                        {d.investimento.servicos.map((s, i) => (
                          <span key={i}>
                            {i > 0 && <br />}
                            {String(i + 1).padStart(2, "0")} · {s.nome}
                            {s.marca ? ` (${s.marca})` : ""}
                            {s.preco ? ` · ${s.preco}` : ""}
                          </span>
                        ))}
                      </td>
                      <td />
                    </tr>
                  )}
                  {d.investimento.linhas.map((l) => (
                    <tr key={l.rotulo}>
                      <td>{l.rotulo}</td>
                      <td>{l.valor}</td>
                    </tr>
                  ))}
                  <tr className="pw-tot">
                    <td>{d.investimento.rotulo}</td>
                    <td>{d.investimento.valor}</td>
                  </tr>
                </tbody>
              </table>
              {d.investimento.rodape.map((r) => (
                <p key={r} className="pw-note" style={{ marginTop: 14 }}>
                  {r}
                </p>
              ))}
              <div style={{ marginTop: 34, display: "flex", flexWrap: "wrap", gap: 12 }}>
                <a className="pw-btn" href="#condicoes">
                  {t.verCondicoes}
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Condições ── */}
      <section className="pw-cond" id="condicoes">
        <div className="pw-ph">
          {d.condicoes.foto && <Foto img={d.condicoes.foto} sizes={SIZES.condicoes} />}
        </div>
        <div className="pw-txt">
          <div
            className="pw-k pw-rv"
            style={{ fontSize: "clamp(20px,2.2vw,28px)", color: "var(--muted)" }}
          >
            {t.condicoesSobre}
          </div>
          <h2
            className="pw-t pw-rv"
            style={{ fontSize: "clamp(28px,3.6vw,48px)", fontWeight: 400 }}
          >
            {t.ancoras.condicoes}
          </h2>
          <div className="pw-rule pw-rv" />
          <div className="pw-rv">
            {d.condicoes.blocos.map((b, i) => (
              <details key={`${b.titulo}-${i}`} open={i === 0}>
                <summary>
                  {b.titulo} <i aria-hidden="true">+</i>
                </summary>
                <ul>
                  {b.itens.map((it, j) => (
                    <li key={j}>
                      {it.forte && <b style={{ fontWeight: 400 }}>{it.forte}: </b>}
                      {it.texto}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fecho ── */}
      <section className="pw-dark pw-close" id="avancar">
        <Fundo src={d.fecho.fundo} />
        <div className="pw-wrap">
          {d.fecho.foto && (
            <div className="pw-frame pw-rv">
              <Foto img={d.fecho.foto} sizes={SIZES.moldura} />
            </div>
          )}
          <div className="pw-k pw-rv">{d.fecho.obrigado}</div>
          <h2 className="pw-t pw-rv">{t.tituloDoFecho}</h2>
          <div className="pw-rule pw-rv" style={{ margin: "22px auto" }} />
          <p
            className="pw-rv"
            style={{ maxWidth: 480, margin: "0 auto", color: "var(--on-dark-2)" }}
          >
            {t.fraseDoFecho}
          </p>
          <div className="pw-ct pw-rv" style={{ marginTop: 26 }}>
            <a
              className="pw-btn pw-solid"
              href={d.fecho.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.responderWhatsApp}
            </a>
            <a className="pw-btn" href={d.fecho.mailto}>
              {t.responderEmail}
            </a>
          </div>
          <div className="pw-ct pw-rv">
            <div className="pw-c">
              <span>{d.fecho.email}</span>
              <button type="button" data-copy={d.fecho.email}>
                {t.copiar}
              </button>
            </div>
            <div className="pw-c">
              <span>{d.fecho.telefoneDisplay}</span>
              <button type="button" data-copy={d.fecho.telefone}>
                {t.copiar}
              </button>
            </div>
          </div>
          {avisos}
          <div className="pw-valid pw-rv">{datas}</div>
          <div className="pw-rv" style={{ marginTop: 26 }}>
            <a className="pw-btn" href={d.pdf} target="_blank" rel="noopener noreferrer">
              {t.verPdf}
            </a>
          </div>
        </div>
      </section>
      {/* O fecho da página (pedido dela, 25/10: «mais bonito… o Instagram, o
          LinkedIn, como logo, como está no site… o logo ao meio»). Tudo ao
          centro, como o fecho logo acima: o logótipo, o lema, um traço, e as
          redes com o mesmo desenho do rodapé do site. */}
      <footer className="pw-foot">
        {/* eslint-disable-next-line @next/next/no-img-element -- o logótipo, servido pelo site */}
        <img src="/logo-liquen-proposta.png" alt="Líquen Events" />
        <p className="pw-foot-lema">{d.lema}</p>
        <div className="pw-rule" />
        <div className="pw-redes">
          <a
            href={d.redes.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.redes.instagram}
          >
            <IconeInstagram tamanho={20} />
          </a>
          {d.redes.linkedin ? (
            <a
              href={d.redes.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.redes.linkedin}
            >
              <IconeLinkedIn tamanho={20} />
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

/** Tinta ou Cal por cima de uma amostra, pela luminância (contraste ≥ 4,5:1). */
function corDoTexto(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return l > 0.28 ? "#2A2620" : "#FBFAF6";
}
