"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { composicao, LARGURA_DO_MOSAICO, levaBloco, type Caixa } from "@/lib/pdf-editorial/mosaico";
import { chavesDasPaginas, type EntradaDoPlano } from "@/lib/pdf-editorial/plano";
import { textosEditoriais } from "@/lib/pdf-editorial/textos";
import { eCasamento } from "@/lib/proposal-evento";
import type { FotosDoPdf } from "@/lib/pdf-editorial/fotos-do-pdf";
import { textosDaProposta } from "@/lib/proposal-doc-textos";
import { ASPETO_POR_OMISSAO } from "@/lib/proposal-geometria";
import { SITE } from "@/lib/site";
import ImagemComPlanoB from "./ImagemComPlanoB";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA PÁGINA DO PDF NOVO, EM PEQUENO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A miniatura que o estúdio mostra na «Vista de conjunto», no painel «O que vai
 * sair» e no cartão de cada tema. Substitui a `PreviaDaPagina` e a
 * `FolhaDaProposta`, que desenhavam a folha BRANCA do PDF antigo: ela pediu
 * «altera tudo à volta de forma a que o sistema de fazer proposta se adapte à
 * forma como agora está o PDF», e uma miniatura branca de um PDF escuro é a
 * pré-visualização parcial que «dá falsa confiança».
 *
 * ── O QUE É EXACTO E O QUE É APROXIMADO ───────────────────────────────────
 *
 * As páginas dos temas são EXACTAS na forma: as caixas saem de `composicao()`
 * (`pdf-editorial/mosaico.ts`), a mesma função que o servidor chama, com as
 * fotografias pela ordem de desenho (a do cartão à frente) e as formas que o
 * estúdio já mediu.
 *
 * As outras páginas são a sua ESTRUTURA — onde fica a fotografia, onde fica o
 * texto — com as fotografias que o PDF lá põe. Quem as escolhe é o álbum do
 * PDF, pelos pixéis de cada ficheiro (ou ela, à mão: `fotosDasPaginas`), e o
 * estúdio pergunta-lhe (`fotosDoEditorial`, pela rota `fotos-do-pdf`): até 15/10
 * a miniatura adivinhava, e a colaboradora dela viu fotografias «que não têm
 * nada a ver» com as do PDF.
 *
 * Tudo em píxeis da folha do exemplo (1123 × 794), convertidos em `cqw` — a
 * miniatura é um contentor, e a letra cresce com ela.
 */

const W = 1123;
const H = 794;
const pct = (n: number, total: number) => `${(n / total) * 100}%`;
/** Píxeis do exemplo em unidades do contentor: a letra escala com a folha. */
const cq = (px: number) => `${(px / W) * 100}cqw`;
const caixa = (c: Caixa): CSSProperties => ({
  left: pct(c.x, W),
  top: pct(c.y, H),
  width: pct(c.w, W),
  height: pct(c.h, H),
});

/** Uma fotografia: o URL da miniatura e o original para quando ela falhar. */
export interface FotoDaFolha {
  url?: string;
  original?: string;
}

/**
 * Uma fotografia numa caixa. `leitura` é o escurecimento das páginas de foto
 * nítida (capa, citação, fecho, §5): preto de 0 % a 38 % da altura até 65 % no
 * fundo, e 25 % no topo para o logótipo. `arrastada` é o fundo «em movimento»
 * das páginas de texto, com o brilho do PDF (`imagens.BRILHO`).
 */
function Foto({
  foto,
  estilo,
  leitura,
  arrastada,
}: {
  foto?: FotoDaFolha;
  estilo: CSSProperties;
  leitura?: boolean;
  arrastada?: number;
}) {
  return (
    <span className="absolute overflow-hidden bg-[var(--bo-papel-pdf)]" style={estilo}>
      {foto?.url && (
        <span
          className="block h-full w-full"
          style={
            arrastada === undefined
              ? undefined
              : {
                  // O arrastado do PDF é um desfoque direccional; aqui basta a
                  // ideia — a fotografia desfeita e escurecida por trás do texto.
                  filter: `blur(1.4cqw) brightness(${arrastada})`,
                  transform: "scale(1.15) rotate(-3deg)",
                }
          }
        >
          <ImagemComPlanoB
            src={foto.url}
            planoB={foto.original}
            className="h-full w-full object-cover"
          />
        </span>
      )}
      {leitura && (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgb(0 0 0 / 0.25) 0%, transparent 25%, transparent 38%, rgb(0 0 0 / 0.65) 100%)",
          }}
        />
      )}
    </span>
  );
}

/** A «moldura afastada» (§4): 1 px de Cal a 13 px da fotografia nítida. */
function Moldura({ c }: { c: Caixa }) {
  return (
    <span
      aria-hidden="true"
      className="absolute border border-[var(--bo-papel-pdf-texto)]"
      style={caixa({ x: c.x - 13, y: c.y - 13, w: c.w + 26, h: c.h + 26 })}
    />
  );
}

/** Uma fotografia nítida com a moldura afastada. */
function Emoldurada({ foto, c }: { foto?: FotoDaFolha; c: Caixa }) {
  if (!foto) return null;
  return (
    <>
      <Foto foto={foto} estilo={caixa(c)} />
      <Moldura c={c} />
    </>
  );
}

/** Uma linha de texto da folha, em píxeis do exemplo (o topo da linha). */
function Texto({
  x,
  y,
  w,
  tam,
  children,
  baixo = false,
  espaco = 0,
  linhas = 1,
}: {
  x: number;
  y: number;
  w: number;
  tam: number;
  children: ReactNode;
  /** Linho, o texto secundário. */
  baixo?: boolean;
  /** O espaçamento entre letras, em `em` — os títulos em maiúsculas (0,10). */
  espaco?: number;
  linhas?: number;
}) {
  return (
    <p
      className="absolute m-0 overflow-hidden font-normal"
      style={{
        left: pct(x, W),
        top: pct(y, H),
        width: pct(w, W),
        fontSize: cq(tam),
        lineHeight: 1.15,
        letterSpacing: espaco ? cq(tam * espaco) : undefined,
        color: baixo ? "var(--bo-papel-pdf-baixo)" : "var(--bo-papel-pdf-texto)",
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: linhas,
      }}
    >
      {children}
    </p>
  );
}

const minusculas = (s: string) => s.toLocaleLowerCase("pt-PT");
const maiusculas = (s: string) => s.toLocaleUpperCase("pt-PT");

/** O cabeçalho das páginas de texto (§3): sobretítulo em itálico, título em maiúsculas. */
function Cabecalho({
  sobre,
  titulo,
  x = MARGEM,
  y = 67,
  w = 900,
}: {
  sobre: string;
  titulo: string;
  x?: number;
  y?: number;
  w?: number;
}) {
  return (
    <>
      <Texto x={x} y={y} w={w} tam={24} baixo>
        {minusculas(sobre)}
      </Texto>
      <Texto x={x} y={y + 40} w={w} tam={37} espaco={0.1} linhas={2}>
        {maiusculas(titulo)}
      </Texto>
    </>
  );
}

/**
 * O bloco de título das páginas de fotografia (§4), em baixo à esquerda: o
 * sobretítulo, o título, o filete a 658 px e a linha pequena a 672.
 */
function BlocoDeTitulo({
  sobre,
  titulo,
  linha,
}: {
  sobre: string;
  titulo: string;
  linha?: string;
}) {
  return (
    <>
      <Texto x={MARGEM} y={540} w={680} tam={29} baixo>
        {minusculas(sobre)}
      </Texto>
      <Texto x={MARGEM} y={582} w={680} tam={48} espaco={0.08} linhas={2}>
        {maiusculas(titulo)}
      </Texto>
      <span
        aria-hidden="true"
        className="absolute bg-[var(--bo-papel-pdf-texto)]"
        style={caixa({ x: MARGEM, y: 658, w: 120, h: 1.5 })}
      />
      {linha && (
        <Texto x={MARGEM} y={672} w={900} tam={12.5} espaco={0.4} baixo>
          {maiusculas(linha)}
        </Texto>
      )}
    </>
  );
}

/** As linhas de uma coluna de texto — a forma do texto, sem as palavras. */
function Linhas({
  x,
  y,
  w,
  n,
  alto = 716,
  fios = false,
}: {
  x: number;
  y: number;
  w: number;
  n: number;
  alto?: number;
  /** Fios de 1 px na Pedra, à largura da coluna (as tabelas, o índice). */
  fios?: boolean;
}) {
  const passo = fios
    ? Math.min(61, (alto - y) / Math.max(1, n))
    : Math.min(22, (alto - y) / Math.max(1, n));
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute"
          style={
            fios
              ? {
                  ...caixa({ x, y: y + i * passo, w, h: 1.5 }),
                  background: "var(--bo-papel-pdf-fio)",
                }
              : {
                  ...caixa({ x, y: y + i * passo, w: w * (i % 4 === 3 ? 0.6 : 0.95), h: 5 }),
                  borderRadius: "999px",
                  background: "color-mix(in srgb, var(--bo-papel-pdf-baixo) 28%, transparent)",
                }
          }
        />
      ))}
    </>
  );
}

const MARGEM = 72;
const FOLHA_INTEIRA: CSSProperties = { inset: 0 };
/** As fotografias emolduradas das páginas de texto e dos separadores (§6). */
const FOTO_DO_INDICE: Caixa = { x: 91, y: 96, w: 322, h: 442 };
const FOTO_DA_PROPOSTA: Caixa = { x: 797, y: 96, w: 288, h: 374 };
const FOTO_DO_SEPARADOR: Caixa = { x: 696, y: 101, w: 346, h: 430 };

export default function PaginaEditorial({
  pagina,
  doc,
  fotosDoTema,
  aspetos,
  capa,
  outras,
}: {
  pagina: EntradaDoPlano;
  doc: ProposalDoc;
  /** As fotografias de um tema, pelo índice de `images` — só nas páginas de tema. */
  fotosDoTema?: (bi: number, i: number) => FotoDaFolha | undefined;
  /** A forma medida de cada fotografia, por caminho. */
  aspetos?: Record<string, number>;
  /** A fotografia de fundo da capa e da contracapa. */
  capa?: FotoDaFolha;
  /** As fotografias que o PDF põe nesta página, pelos lugares dela. */
  outras?: (n: number) => FotoDaFolha | undefined;
}) {
  const nomes = (doc.clientNames ?? "").trim();
  const org = doc.template === "organizacao";
  const casamento = eCasamento(doc.eventType);
  const outra = (n: number) => outras?.(n);
  // As palavras são as do PDF (`textosDaProposta`, `textosEditoriais`), não
  // uma segunda cópia.
  const t = textosDaProposta("pt");
  const te = textosEditoriais("pt");
  let conteudo: ReactNode;

  switch (pagina.tipo) {
    case "capa":
    case "contracapa":
      conteudo = (
        <>
          <Foto foto={outra(0) ?? capa} estilo={FOLHA_INTEIRA} leitura />
          {pagina.tipo === "capa" ? (
            <BlocoDeTitulo
              sobre={te.sobretituloCapa(org, casamento)}
              titulo={nomes || "Os nomes do cliente"}
              linha={[doc.eventType, doc.location].filter(Boolean).join(" · ")}
            />
          ) : (
            <BlocoDeTitulo
              sobre={t.obrigada}
              titulo={t.agradecimento.replace(/[.!]+$/u, "")}
              linha={`${SITE.email} · ${SITE.phoneDisplay}`}
            />
          )}
        </>
      );
      break;

    case "indice":
      conteudo = (
        <>
          <Foto foto={outra(0)} estilo={FOLHA_INTEIRA} arrastada={0.42} />
          <Emoldurada foto={outra(0)} c={FOTO_DO_INDICE} />
          <Cabecalho sobre={te.indice} titulo={te.tituloIndice} x={504} y={82} w={547} />
          <Linhas x={504} y={235} w={547} n={8} fios />
        </>
      );
      break;

    case "proposta":
      conteudo = (
        <>
          <Foto foto={outra(0)} estilo={FOLHA_INTEIRA} arrastada={0.42} />
          <Emoldurada foto={outra(0)} c={FOTO_DA_PROPOSTA} />
          <Cabecalho
            sobre={te.aProposta}
            titulo={te.tituloDaProposta(nomes || null, org, casamento)}
            w={690}
          />
          {[0, 1, 2].map((k) => (
            <span key={k}>
              <Linhas x={72} y={264 + k * 91} w={317} n={1} fios />
              <Linhas x={418} y={264 + k * 91} w={317} n={1} fios />
            </span>
          ))}
        </>
      );
      break;

    case "servicos": {
      const n = Math.max(1, pagina.servicos.length);
      const cw = (W - 2 * MARGEM - 7 * (n - 1)) / n;
      conteudo = (
        <>
          <Cabecalho
            sobre={t.sobretituloServicos}
            titulo={
              pagina.continuacao
                ? `${te.tituloServicos(n, null)} ${te.continuacao}`
                : te.tituloServicos(n, null)
            }
          />
          {pagina.servicos.map((nome, i) => {
            const x = MARGEM + i * (cw + 7);
            return (
              <span key={i}>
                <Foto foto={outra(i)} estilo={caixa({ x, y: 211, w: cw, h: 505 })} leitura />
                <Texto x={x + 28} y={600} w={cw - 56} tam={14} espaco={0.2} linhas={2}>
                  {maiusculas(nome)}
                </Texto>
              </span>
            );
          })}
        </>
      );
      break;
    }

    case "ambiente":
      conteudo = (
        <>
          <Foto
            foto={outra(5)}
            estilo={caixa({ x: 442, y: 0, w: W - 442, h: H })}
            arrastada={0.42}
          />
          <Foto foto={outra(5)} estilo={caixa({ x: 0, y: 0, w: 442, h: H })} />
          <Cabecalho sobre={te.sobretituloAmbiente} titulo={te.tituloAmbiente} x={504} w={547} />
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute border border-[var(--bo-papel-pdf-fio)]"
              style={{
                ...caixa({ x: 504 + i * 111, y: 243, w: 103, h: 211 }),
                background: `color-mix(in srgb, var(--bo-papel-pdf-baixo) ${85 - i * 15}%, var(--bo-papel-pdf))`,
              }}
            />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <Foto
              key={i}
              foto={outra(i)}
              estilo={caixa({ x: 504 + i * 111, y: 527, w: 103, h: 103 })}
            />
          ))}
        </>
      );
      break;

    case "separador":
      // A primeira é a nítida, emoldurada; a segunda, se houver, o fundo
      // arrastado — como o PDF (`paginas/fotografia.ts`) e como ela escolhe.
      conteudo = (
        <>
          <Foto foto={outra(1) ?? outra(0)} estilo={FOLHA_INTEIRA} arrastada={0.8} />
          <Emoldurada foto={outra(0)} c={FOTO_DO_SEPARADOR} />
          <BlocoDeTitulo
            sobre={`${te.inspiracao} · ${String(pagina.numero).padStart(2, "0")}`}
            titulo={pagina.titulo}
          />
        </>
      );
      break;

    case "tema": {
      const b = doc.moodBoards[pagina.bi];
      const forma = (i: number) => aspetos?.[b?.images?.[i] ?? ""] ?? ASPETO_POR_OMISSAO;
      const c = composicao(pagina.fotos.map(forma), pagina.vez % 2 === 0, pagina.disposicao);
      const titulo = pagina.titulo || "Sem título";
      if (c.tipo === "texto") {
        conteudo = (
          <>
            <Foto foto={outra(0)} estilo={FOLHA_INTEIRA} arrastada={0.42} />
            <Emoldurada foto={outra(0)} c={FOTO_DA_PROPOSTA} />
            <Cabecalho sobre={te.inspiracao} titulo={titulo} w={690} />
            <Linhas x={MARGEM} y={300} w={520} n={4} alto={420} />
          </>
        );
        break;
      }
      const mosaico = "mosaico" in c ? c.mosaico : null;
      const bloco = c.tipo === "inteira" || levaBloco(c.tipo, pagina.parte === 0, casamento);
      conteudo = (
        <>
          {c.celulas.map((cel, k) => (
            <Foto
              key={k}
              foto={fotosDoTema?.(pagina.bi, pagina.fotos[k])}
              estilo={caixa(cel)}
              leitura={bloco && c.tipo !== "desalinhadas"}
            />
          ))}
          {mosaico && (
            <>
              <span
                aria-hidden="true"
                className="absolute bg-[var(--bo-papel-pdf)]"
                style={caixa(mosaico)}
              />
              <Texto
                x={mosaico.x + 48}
                y={mosaico.y + 52}
                w={LARGURA_DO_MOSAICO - 78}
                tam={24}
                baixo
              >
                {minusculas(te.inspiracao)}
              </Texto>
              <Texto
                x={mosaico.x + 48}
                y={mosaico.y + 90}
                w={LARGURA_DO_MOSAICO - 78}
                tam={24}
                espaco={0.1}
                linhas={3}
              >
                {maiusculas(titulo)}
              </Texto>
              {pagina.parte > 0 && (
                <Texto
                  x={mosaico.x + 48}
                  y={mosaico.y + 190}
                  w={LARGURA_DO_MOSAICO - 78}
                  tam={11}
                  espaco={0.3}
                  baixo
                >
                  {maiusculas(te.maisIdeias)}
                </Texto>
              )}
            </>
          )}
          {bloco && <BlocoDeTitulo sobre={te.inspiracao} titulo={titulo} />}
        </>
      );
      break;
    }

    case "citacao":
      conteudo = (
        <>
          <Foto foto={outra(0)} estilo={FOLHA_INTEIRA} leitura />
          <BlocoDeTitulo
            sobre={te.formaDeVer}
            titulo={(t.slogan ?? SITE.slogan).replace(/[.!]+$/u, "")}
            linha={SITE.name}
          />
        </>
      );
      break;

    case "total":
      conteudo = (
        <>
          <Foto foto={outra(0)} estilo={FOLHA_INTEIRA} arrastada={0.42} />
          <Cabecalho sobre={te.sobretituloInvestimento} titulo={t.totalAPagar} />
          <Texto x={MARGEM} y={196} w={700} tam={85}>
            {doc.totalText?.trim() || "—"}
          </Texto>
          <Linhas x={MARGEM} y={350} w={595} n={5} alto={565} fios />
        </>
      );
      break;

    case "orcamento":
      conteudo = (
        <>
          <Foto foto={outra(0)} estilo={FOLHA_INTEIRA} arrastada={0.42} />
          <Cabecalho
            sobre={te.sobretituloInvestimento}
            titulo={
              pagina.continuacao ? `${te.tituloOrcamento} ${te.continuacao}` : te.tituloOrcamento
            }
          />
          <Linhas
            x={MARGEM}
            y={235}
            w={760}
            n={pagina.linhas + 1}
            alto={235 + 43 * (pagina.linhas + 1)}
            fios
          />
        </>
      );
      break;

    case "cronograma":
    case "condicoes": {
      const titulo = pagina.tipo === "cronograma" ? t.tituloCronograma : pagina.nome;
      const sobre =
        pagina.tipo === "cronograma"
          ? t.sobretituloCronograma
          : pagina.qual === "notas"
            ? te.condicoes
            : t.sobretituloCondicoes;
      const colunas = pagina.tipo === "condicoes" && pagina.qual === "notas" ? 3 : 2;
      const larg = (705 - MARGEM - 29 * (colunas - 1)) / colunas;
      conteudo = (
        <>
          <Foto foto={outra(0)} estilo={FOLHA_INTEIRA} arrastada={0.3} />
          <Foto foto={outra(0)} estilo={caixa({ x: W - 374, y: 0, w: 374, h: H })} />
          <Cabecalho sobre={sobre} titulo={titulo} w={661} />
          {Array.from({ length: colunas }, (_, i) => (
            <Linhas key={i} x={MARGEM + i * (larg + 29)} y={200} w={larg} n={22} alto={700} />
          ))}
        </>
      );
      break;
    }
  }

  return (
    <div
      // A folha do cliente mantém a letra do cliente: o marcador devolve o
      // `--font-display` à serifa nesta árvore (ver `globals.css`).
      data-folha-do-cliente
      // ── UMA IMAGEM DA PÁGINA, E NÃO TEXTO PARA LER ──────────────────────
      // As letras aqui dentro são o desenho da folha à escala — 5 a 9 px
      // num telemóvel. Lidas por um leitor de ecrã eram dezenas de frases
      // soltas por miniatura; medidas como parágrafos, a auditoria táctil
      // acusava-as de «texto esmagado» (92 px para 45 letras). A miniatura
      // é uma IMAGEM com o nome da página, e o desenho por dentro é decorativo.
      role="img"
      aria-label={`Página «${pagina.nome}», como vai sair no PDF`}
      className="relative w-full overflow-hidden rounded-md border border-[var(--bo-hairline-strong)]"
      style={{
        aspectRatio: `${W} / ${H}`,
        containerType: "inline-size",
        background: "var(--bo-papel-pdf)",
      }}
    >
      <div aria-hidden="true" className="absolute inset-0">
        {conteudo}
      </div>
    </div>
  );
}

/**
 * De onde vêm as fotografias das miniaturas, para uma lista de páginas.
 *
 * Os temas usam as SUAS fotografias, pela ordem de desenho. As outras páginas
 * usam as que o PDF lá põe (`doPdf`, pela chave de cada página — a resposta da
 * rota `fotos-do-pdf`). Enquanto essa resposta não chega, a capa mostra a que
 * ela escolheu e as outras ficam com o fundo liso: uma fotografia adivinhada
 * era a que «não tem nada a ver».
 */
export function fontesDasFolhas(
  doc: ProposalDoc,
  plano: readonly EntradaDoPlano[],
  urls: Record<string, string>,
  originais: Record<string, string> = {},
  doPdf?: FotosDoPdf | null,
) {
  // Uma fotografia embutida no rascunho (`data:`) mostra-se a si própria — não
  // tem miniatura no armazenamento, e o `img-src` da casa aceita `data:`.
  const daRef = (ref?: string | null): FotoDaFolha | undefined =>
    ref
      ? { url: urls[ref] ?? (ref.startsWith("data:") ? ref : undefined), original: originais[ref] }
      : undefined;
  const chaves = chavesDasPaginas(plano);
  const capaRef = (doc.coverImages ?? []).find((c) => c && c.trim());
  return {
    capa: daRef(doPdf?.capa?.[0]?.ref ?? capaRef),
    fotosDoTema: (bi: number, k: number) => daRef(doc.moodBoards[bi]?.images?.[k]),
    outrasDa: (i: number) => (n: number) => daRef(doPdf?.[chaves[i]]?.[n]?.ref),
  };
}
