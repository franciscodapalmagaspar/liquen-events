"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import {
  chavesDasPaginas,
  formasDosLugares,
  lugaresDaPagina,
  planoDaProposta,
  type EntradaDoPlano,
} from "@/lib/pdf-editorial/plano";
import type { FotosDoPdf } from "@/lib/pdf-editorial/fotos-do-pdf";
import PaginaEditorial, { fontesDasFolhas } from "./PaginaEditorial";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DOCUMENTO INTEIRO, PELA ORDEM EM QUE SAI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Não há forma de ver todos lado a lado para avaliar coerência
 * de paleta» — e, depois de isto existir, «"Todas" mostra 7 páginas quando o
 * PDF tem cerca de 14. Uma pré-visualização parcial dá falsa confiança.»
 *
 * Mostra o documento do desenho NOVO, página a página: a lista é a de
 * `planoDaProposta` (`pdf-editorial/plano.ts`), a mesma sequência que o
 * gerador desenha, presa a ele por um teste — e não uma segunda opinião que um
 * dia divergia. Cada miniatura é uma `PaginaEditorial`: os temas com as caixas
 * exactas do mosaico, as outras páginas com a sua estrutura.
 *
 * ── CLICAR SALTA PARA ONDE O PROBLEMA NASCE ───────────────────────────────
 *
 * Palavras dela: «hoje vê-se um problema na página 5 e tem de se procurar onde
 * ele nasce». Cada página sabe que secção do formulário a produz (`seccao`), e
 * é essa que o clique abre. Uma página de tema salta mais fundo ainda — para
 * o cartão daquele tema.
 *
 * ── AS SETAS SÓ EXISTEM ONDE HÁ ORDEM PARA MUDAR ──────────────────────────
 *
 * Só os temas se reordenam, e só dentro do seu capítulo: o PDF arruma os
 * capítulos pela ordem do dia (cerimónia, cocktail, jantar…), e uma seta que
 * passasse um tema do jantar para antes da cerimónia prometia uma troca que o
 * PDF desfazia. Nas pontas do capítulo ficam desligadas.
 */

/** Quanto tempo o rato tem de ficar quieto para a folha crescer. */
const INTENCAO_MS = 400;

export default function VistaDeConjunto({
  doc,
  fotosDoPdf = null,
  onMudarFoto,
  ordem,
  idioma = "pt",
  urls,
  originais = {},
  aspetos,
  onMover,
  onSaltar,
  onIrParaSeccao,
  onFechar,
}: {
  doc: ProposalDoc;
  /** Que fotografia o PDF põe em cada página (`useFotosDoPdf`); `null` enquanto não se sabe. */
  fotosDoPdf?: FotosDoPdf | null;
  /**
   * Abrir a escolha da fotografia de uma página (`fotosDasPaginas`) — pedido
   * dela de 15/10. Sem isto, a vista só mostra.
   */
  onMudarFoto?: (chave: string, nome: string, max: number, formas: number[]) => void;
  /** Índices reais dos boards, pela ordem em que as páginas saem. */
  ordem: readonly number[];
  idioma?: IdiomaDaProposta;
  urls: Record<string, string>;
  /** O original de cada foto, para quando a miniatura não existir. */
  originais?: Record<string, string>;
  /** A forma medida de cada foto, por caminho. */
  aspetos: Record<string, number>;
  /** Mover a página que está NA POSIÇÃO `de` para a posição `para`. */
  onMover: (de: number, para: number) => void;
  onSaltar: (bi: number) => void;
  /** Abrir a secção do formulário que produz uma página. */
  onIrParaSeccao: (seccao: string) => void;
  /** Fechar — só para quem a abre. Onde ela está sempre à vista (o fim do
   *  passo 1), não há nada para fechar e o botão não se desenha. */
  onFechar?: () => void;
}) {
  const paginas = useMemo(() => planoDaProposta(doc), [doc]);
  const chaves = useMemo(() => chavesDasPaginas(paginas), [paginas]);
  const fontes = useMemo(
    () => fontesDasFolhas(doc, paginas, urls, originais, fotosDoPdf),
    [doc, paginas, urls, originais, fotosDoPdf],
  );
  const aumentada = useIntencaoDeAmpliar();
  void idioma;

  // As páginas de tema que abrem um tema (a 1.ª parte), e o capítulo de cada
  // uma — é contra a vizinha do MESMO capítulo que as setas se movem.
  const aberturas = paginas.flatMap((p, i) => (p.tipo === "tema" && p.parte === 0 ? [i] : []));
  // Fora dos casamentos cada mood board é o seu capítulo (`tema-<n>`), e a
  // ordem do PDF é só a ordem dos boards: para as setas, contam todos como um
  // capítulo só — senão nenhum tinha vizinho e as setas ficavam todas apagadas.
  const capituloDe = (p: EntradaDoPlano | undefined) =>
    p?.tipo === "tema" ? (p.grupo.startsWith("tema-") ? "tema" : p.grupo) : null;

  return (
    <div className="mb-4 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="bo-eyebrow">Vista de conjunto</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/50">
            {/* O número que ela vê aqui é o MESMO que o botão de gerar mostra —
                sai os dois de `planoDaProposta`. Duas contagens sobre o mesmo
                documento foi o defeito que isto veio fechar. */}
            Cerca de {paginas.length} páginas, pela ordem em que saem, com as fotografias que o PDF
            lá põe. Clica numa para ir onde ela se escreve.
          </p>
        </div>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            className={`alvo-toque text-[11px] font-medium text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
          >
            Fechar
          </button>
        )}
      </div>

      {/* Duas miniaturas, três a partir de 640, quatro a partir de 1024. O
          último degrau era `xl:` (1280): entre 1024 e 1280 lia-se um documento
          de treze folhas a três por linha — cinco linhas onde cabiam quatro —,
          e o corte não era nenhum dos três da casa. `lg:` é o mesmo sítio onde
          a barra lateral deixa de ser gaveta, portanto os três degraus desta
          fila são agora os mesmos três de todo o back office. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {paginas.map((pagina, i) => {
          const bi = pagina.tipo === "tema" ? pagina.bi : undefined;
          const vi = aberturas.indexOf(i);
          // Para onde o tema vai: o lugar do tema VIZINHO do mesmo capítulo,
          // na ordem real dos boards. `-1` = não há vizinho desse lado.
          const vizinho = (d: -1 | 1) => {
            const j = aberturas[vi + d];
            const p = j === undefined ? undefined : paginas[j];
            return p?.tipo === "tema" && capituloDe(p) === capituloDe(pagina) ? p.bi : undefined;
          };
          const anterior = vi >= 0 ? vizinho(-1) : undefined;
          const seguinte = vi >= 0 ? vizinho(1) : undefined;
          const pos = bi === undefined ? -1 : ordem.indexOf(bi);
          const paraTras = anterior === undefined ? -1 : ordem.indexOf(anterior);
          const paraAFrente = seguinte === undefined ? -1 : ordem.indexOf(seguinte);

          return (
            <li key={`${pagina.tipo}-${i}`} className="min-w-0">
              <button
                type="button"
                {...aumentada.pega(i, () =>
                  bi === undefined ? onIrParaSeccao(pagina.seccao) : onSaltar(bi),
                )}
                className={`block w-full text-left ${ESTADO} ${PRESSAO}`}
                aria-label={`Ir para onde se escreve a página ${i + 1}, ${pagina.nome}`}
              >
                {/* A folha cresce COM `transform`: não empurra nada, não abre
                    barra de deslocamento nenhuma, e é a única propriedade que o
                    telemóvel dela anima sem perder fotogramas. O ponto de
                    ancoragem sai de onde a folha está no ecrã — a da ponta
                    direita cresce para dentro em vez de sair pela margem. */}
                <div
                  className="motion-safe:transition-transform motion-safe:duration-vista motion-safe:ease-out"
                  style={
                    aumentada.qual === i
                      ? {
                          transform: "scale(1.85)",
                          transformOrigin: aumentada.ancora,
                          zIndex: 20,
                          position: "relative",
                        }
                      : undefined
                  }
                >
                  <PaginaEditorial
                    pagina={pagina}
                    doc={doc}
                    aspetos={aspetos}
                    capa={fontes.capa}
                    fotosDoTema={fontes.fotosDoTema}
                    outras={fontes.outrasDa(i)}
                  />
                </div>
              </button>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="min-w-0 text-[11px] leading-tight text-[var(--bo-text-muted)]">
                  {/* «Página 4 de 7», sempre à vista: é assim que se fala de uma
                      folha ao telefone com um casal, e era o que faltava para
                      um problema visto aqui se conseguir nomear. */}
                  <span className="block tabular-nums text-foreground/45">
                    Página {i + 1} de {paginas.length}
                  </span>
                  <span className="block truncate">{pagina.nome}</span>
                  {(() => {
                    const lugares =
                      pagina.tipo === "capa" ? { min: 1, max: 1 } : lugaresDaPagina(pagina);
                    if (!onMudarFoto || !lugares || pagina.tipo === "contracapa") return null;
                    const escolhida = pagina.tipo === "capa" || !!doc.fotosDasPaginas?.[chaves[i]];
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          onMudarFoto(chaves[i], pagina.nome, lugares.max, formasDosLugares(pagina))
                        }
                        aria-label={`Mudar a fotografia da página ${i + 1}, ${pagina.nome}`}
                        className={`alvo-toque mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--bo-accent)] ${ESTADO} ${PRESSAO}`}
                      >
                        {escolhida && pagina.tipo !== "capa" && (
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-[var(--bo-accent)]"
                          />
                        )}
                        Mudar fotografia
                        {escolhida && pagina.tipo !== "capa" && (
                          <span className="sr-only"> (escolhida por vocês)</span>
                        )}
                      </button>
                    );
                  })()}
                </p>
                {vi >= 0 && (
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => onMover(pos, paraTras)}
                      disabled={paraTras < 0}
                      aria-label={`Mover a página ${i + 1} para trás`}
                      className={`alvo-toque flex h-6 w-6 items-center justify-center rounded-md text-foreground/45 hover:bg-[var(--bo-tinta-6)] disabled:opacity-30 ${ESTADO} ${PRESSAO}`}
                    >
                      <span aria-hidden="true">←</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onMover(pos, paraAFrente)}
                      disabled={paraAFrente < 0}
                      aria-label={`Mover a página ${i + 1} para a frente`}
                      className={`alvo-toque flex h-6 w-6 items-center justify-center rounded-md text-foreground/45 hover:bg-[var(--bo-tinta-6)] disabled:opacity-30 ${ESTADO} ${PRESSAO}`}
                    >
                      <span aria-hidden="true">→</span>
                    </button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * ── APROXIMAR-SE DE UMA FOLHA, SEM SAIR DA GRELHA ─────────────────────────
 *
 * Numa grelha de quatro colunas cada folha tem 170 px: dá para ver a FORMA da
 * página — cheia, vazia, desequilibrada — e não dá para ler uma palavra. Abrir
 * um diálogo para cada uma era transformar «percorrer catorze folhas» em
 * catorze aberturas e catorze fechos.
 *
 * ── PORQUE É QUE ESPERA ───────────────────────────────────────────────────
 *
 * Porque o rato atravessa a grelha para chegar às setas, e uma folha que cresce
 * de cada vez que o cursor lhe passa por cima é a grelha inteira a saltar. Os
 * 400 ms são o que separa «passei por aqui» de «estou a olhar para esta» — o
 * mesmo número que a casa já usa para as intenções e o tecto do vocabulário de
 * movimento.
 *
 * ── E PORQUE É QUE NÃO EXISTE NO TELEMÓVEL ────────────────────────────────
 *
 * Porque num telemóvel não há «passar por cima»: há tocar, e tocar já faz outra
 * coisa — salta para onde a página se escreve. Uma ampliação presa ao toque
 * roubava o gesto ao salto. `(hover: hover)` pergunta ao aparelho em vez de
 * adivinhar pela largura.
 */
function useIntencaoDeAmpliar() {
  const [qual, setQual] = useState<number | null>(null);
  const [ancora, setAncora] = useState("center");
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parar = () => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = null;
  };
  useEffect(() => parar, []);

  const podeAmpliar = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return {
    qual,
    ancora,
    pega(i: number, aoCarregar: () => void) {
      return {
        onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
          if (!podeAmpliar()) return;
          const caixa = e.currentTarget.getBoundingClientRect();
          // O ponto por onde a folha fica presa: a da ponta esquerda cresce
          // para a direita, a da direita para a esquerda. Sem isto, as folhas
          // das pontas cresciam para fora da janela — e num iPhone uma coisa
          // desenhada fora da margem é a página inteira a arrastar-se para o
          // lado, que é um defeito que esta casa já pagou uma vez.
          const meio = caixa.left + caixa.width / 2;
          const largura = window.innerWidth;
          const x = meio < largura / 3 ? "left" : meio > (largura * 2) / 3 ? "right" : "center";
          const y =
            caixa.top < window.innerHeight / 3
              ? "top"
              : caixa.bottom > (window.innerHeight * 2) / 3
                ? "bottom"
                : "center";
          setAncora(`${x} ${y}`);
          parar();
          relogio.current = setTimeout(() => setQual(i), INTENCAO_MS);
        },
        onPointerLeave: () => {
          parar();
          setQual((antes) => (antes === i ? null : antes));
        },
        // Sair da folha com o teclado, ou carregar nela, desfaz a ampliação: o
        // que vem a seguir é um salto para outro sítio da página, e a folha
        // ficaria grande por cima do que ela foi ver.
        onBlur: () => {
          parar();
          setQual((antes) => (antes === i ? null : antes));
        },
        onClick: () => {
          parar();
          setQual(null);
          aoCarregar();
        },
      };
    },
  };
}
