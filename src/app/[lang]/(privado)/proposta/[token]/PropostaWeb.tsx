import type { CSSProperties, ReactNode } from "react";
import type { ImagemWeb, PropostaWeb as Dados } from "@/lib/proposta-web/modelo";
import type { FormaDaCelula } from "@/lib/proposta-web/mosaico";
import PropostaWebViva from "./PropostaWebViva";
import { IconeInstagram, IconeLinkedIn } from "@/components/IconesDasRedes";
import { fatorParaCobrir, sizesParaCobrir } from "@/lib/proposta-web/tamanhos";

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

/**
 * Os `sizes` de cada sítio, a contar com o recorte (`tamanhos.ts`): numa
 * caixa mais alta do que a fotografia é a ALTURA que manda, e o browser tem
 * de pedir um ficheiro mais largo do que a caixa. Os números são os do CSS
 * (`proposta-web.css`) — a altura de cada secção e as colunas de cada grelha.
 */
const SIZES = {
  // A capa cresce 9% ao entrar (`kb`).
  capa: (a: number) => sizesParaCobrir(a, [{ vw: 1, vh: 1 }], 1.09),
  citacao: (a: number) => sizesParaCobrir(a, [{ vw: 1, vh: 0.92 }]),
  tile: (a: number, sozinho: boolean) =>
    sizesParaCobrir(
      a,
      sozinho
        ? [{ vw: 1, vh: 0.82 }]
        : [
            { desde: 800, vw: 0.5, vh: 0.82 },
            { vw: 1, vh: 0.82 },
          ],
    ),
  paletaGrande: (a: number) =>
    sizesParaCobrir(a, [
      { desde: 900, vw: 0.25, vh: 1 },
      { vw: 0.5, vh: 0.7 },
    ]),
  paleta: (a: number) =>
    sizesParaCobrir(a, [
      { desde: 900, vw: 0.25, vh: 0.5 },
      { vw: 0.5, vh: 0.35 },
    ]),
  condicoes: (a: number) =>
    sizesParaCobrir(a, [
      { desde: 900, vw: 0.4, vh: 1 },
      { vw: 1, vh: 0.56 },
    ]),
  /** As molduras: «A proposta» e o fecho (4:5), os capítulos (3:4). */
  moldura: (a: number, forma: number, max: number) => {
    const f = fatorParaCobrir(a, forma);
    return `(min-width: 900px) ${Math.round(max * f)}px, ${Math.round(90 * f)}vw`;
  },
  /** O mosaico: 4 colunas de 25vw no computador, 2 de 50vw (linhas de 46vw) no telemóvel. */
  mosaico: (a: number, forma: FormaDaCelula, formaMovel: FormaDaCelula) => {
    const LARGO = { normal: [1, 1], alta: [1, 0.5], larga: [2, 2], grande: [2, 1] } as const;
    const [colunas, celula] = LARGO[forma];
    const [colunasM, celulaM] = LARGO[formaMovel];
    const pc = Math.round(25 * colunas * fatorParaCobrir(a, celula));
    const tm = Math.round(50 * colunasM * fatorParaCobrir(a, (celulaM * 50) / 46));
    return `(min-width: 800px) ${pc}vw, ${tm}vw`;
  },
} as const;

/** As células do mosaico que pedem mais do que a AVIF de 1200 (ver `Foto`). */
const MOSAICO_GRANDE: ReadonlySet<FormaDaCelula> = new Set(["alta", "larga", "grande"]);

export function Foto({
  img,
  sizes,
  alt = "",
  className,
  prioridade = false,
  estilo,
  espacoGrande = false,
}: {
  img: ImagemWeb;
  sizes: string;
  alt?: string;
  className?: string;
  prioridade?: boolean;
  estilo?: CSSProperties;
  /**
   * O espaço pede mais pixéis do que a AVIF de 1200 tem (a capa, a citação,
   * os cartões, a paleta, as células grandes). Aí a AVIF só entra quando há a
   * grande — o browser escolhe o `<source>` pelo FORMATO, nunca pelo tamanho,
   * e esticaria a de 1200 (28/10). Sem ela, o `srcset` em JPEG, que vai até
   * ao original, escolhe pelo tamanho.
   */
  espacoGrande?: boolean;
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
  if (!img.avif || (espacoGrande && !img.avifGrande)) return imagem;
  return (
    <picture style={{ display: "contents" }}>
      {/* As larguras reais vão no `srcset`: o browser escolhe a de 1200 ou a
          grande pelo `sizes`, como no JPEG. */}
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
        <Foto img={k.foto} sizes={SIZES.moldura(k.foto.aspecto, 0.75, 430)} alt={k.nome} />
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
                    sizes={SIZES.mosaico(cel.imagem.aspecto, cel.forma, cel.formaMovel)}
                    espacoGrande={
                      MOSAICO_GRANDE.has(cel.forma) || MOSAICO_GRANDE.has(cel.formaMovel)
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
          <Foto
            img={d.capa.fundo}
            sizes={SIZES.capa(d.capa.fundo.aspecto)}
            className="pw-bg"
            prioridade
            espacoGrande
          />
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
              <Foto
                img={d.proposta.foto}
                sizes={SIZES.moldura(d.proposta.foto.aspecto, 0.8, 470)}
              />
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
                {s.foto && (
                  <Foto
                    img={s.foto}
                    sizes={SIZES.tile(
                      s.foto.aspecto,
                      i === d.servicos!.itens.length - 1 && d.servicos!.itens.length % 2 === 1,
                    )}
                    alt={s.nome}
                    espacoGrande
                  />
                )}
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
                <Foto
                  key={i}
                  img={f}
                  sizes={i === 0 ? SIZES.paletaGrande(f.aspecto) : SIZES.paleta(f.aspecto)}
                  espacoGrande
                  className={i === 0 ? "pw-pal-grande" : undefined}
                />
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
          <Foto img={d.citacao.foto} sizes={SIZES.citacao(d.citacao.foto.aspecto)} espacoGrande />
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
          {d.condicoes.foto && (
            <Foto
              img={d.condicoes.foto}
              sizes={SIZES.condicoes(d.condicoes.foto.aspecto)}
              espacoGrande
            />
          )}
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
              <Foto img={d.fecho.foto} sizes={SIZES.moldura(d.fecho.foto.aspecto, 0.8, 360)} />
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
