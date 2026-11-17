"use client";

import { THEME_PAGE_SIZE } from "@/lib/theme-types";
import { Button } from "../../ui";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { plural } from "@/lib/plural";
import { ABOVE_FOLD, GRELHA_DE_FOTOS, Photo } from "./FotoDoSeletor";
import type { FotosDoSeletor, NavegacaoDaGrelha, SeleccaoDoSeletor } from "./tipos-do-seletor";
import { themeScroll } from "./posicao-do-rolo";

/** A grelha das fotografias do tema no seletor — a carregar, vazia, com erro,
 *  ou cheia, com a selecção e a pré-visualização. (Saiu da coluna das fotos do
 *  seletor na fase 8 da estrutura do código, tal e qual.) */
export interface GrelhaDoSeletorProps {
  usadasNoutras: Readonly<Record<string, string>> | undefined;
  fotos: FotosDoSeletor;
  seleccao: SeleccaoDoSeletor;
  navegacao: NavegacaoDaGrelha;
}

export function GrelhaDoSeletor({
  usadasNoutras,
  fotos,
  seleccao,
  navegacao,
}: GrelhaDoSeletorProps) {
  const {
    themeId,
    images,
    truncated,
    unreadable,
    falhaFotos,
    loadingImages,
    loadingMore,
    failedPaths,
    remaining,
    hasMore,
    loadMore,
  } = fotos;
  const { selectedSet, pendingSet, usedSet, toggleAt, qualidadeDe, atLimit } = seleccao;
  const { focusIndex, setFocusIndex, setPreviewIndex, gridRef, scrollRef, onGridKeyDown } =
    navegacao;
  return (
    <>
      {/* Fotos */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          if (themeId) themeScroll.set(themeId, e.currentTarget.scrollTop);
        }}
        /* `@container`: a grelha aqui dentro passa a medir ESTA
           zona e não a janela. É este invólucro que lhe dá a régua —
           ver o comentário grande na grelha. */
        className="@container min-h-[10rem] flex-1 overflow-y-auto px-5 py-4"
      >
        {loadingImages ? (
          // O esqueleto tem a MESMA forma que a grelha a seguir:
          // com colunas diferentes, as fotos saltavam de sítio no
          // instante em que chegavam.
          <div className={`grid gap-2 ${GRELHA_DE_FOTOS}`}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bo-skeleton aspect-square rounded-lg" aria-hidden />
            ))}
          </div>
        ) : !themeId ? null : unreadable || falhaFotos ? (
          // Falha de leitura NÃO é "tema sem fotos" — dizer-lhe que o tema
          // está vazio seria mentira, e mandava-a carregar tudo outra vez.
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--bo-tinta-72)]">
              Não foi possível ler a pasta deste tema agora.
            </p>
            <p className="bo-text-muted mt-1 text-xs">
              {/* A razão, quando se sabe qual foi. O texto de reserva é
                    para a pasta que o SERVIDOR leu e não conseguiu abrir
                    (um 200 com `ok: false`): aí sabe-se mesmo só que a
                    falha é do lado de lá e passageira. */}
              {falhaFotos?.mensagem ??
                "É uma falha temporária — as fotos não desapareceram. Tenta daqui a pouco."}
            </p>
          </div>
        ) : images.length === 0 ? (
          <p className="bo-text-muted py-8 text-center text-sm">
            Este tema ainda não tem fotos. Adiciona-as em <strong>Temas</strong>.
          </p>
        ) : (
          <>
            <div
              ref={gridRef}
              onKeyDown={onGridKeyDown}
              /* ── AS FOTOS MEDEM A ZONA DAS FOTOS, E NÃO A JANELA ─────
                 Era `grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-5`,
                 e a conta que isso dá está entre as piores que este
                 back office tinha. MEDIDO, num iPad ao alto:

                   · a 639 px o painel é full-bleed (`p-0`), a grelha
                     tem 599 px e três colunas — fotos de 194 px;
                   · a 641 px entra o `sm:p-6`, o painel encolhe para
                     593, a grelha para 553, e o `sm:` manda CINCO
                     colunas — fotos de 102 px.

                 A janela cresceu dois píxeis, o sítio onde as fotos
                 vivem ENCOLHEU 46, e as fotografias ficaram com
                 metade do tamanho. Nenhuma variante de ecrã evita
                 isto, porque a pergunta que elas fazem — «que largura
                 tem a janela?» — não é a que decide, que é «que
                 largura tem esta zona?».

                 Hoje a régua é o `@container` do invólucro:

                   · abaixo de 26 rem de ZONA — um telemóvel — duas
                     colunas fixas. Três a 390 px dariam 111 px por
                     foto, pequenas de mais para escolher decoração,
                     que é o que aqui se faz; e deixar a grelha fluir
                     num ecrã de 320 px dava UMA coluna gigante.
                   · daí para cima, tantas quantas caibam com 9 rem de
                     lado. Não é um degrau, é um MÍNIMO — e por isso a
                     contagem de colunas só pode SUBIR quando a zona
                     cresce. A inversão de cima deixa de ser
                     exprimível.

                 O que devolve, nas mesmas medidas: 179 px aos 641
                 (eram 102), 194 aos 639 como hoje, e a grelha deixa
                 de mudar de forma ao atravessar os 640 px de janela,
                 porque já não os vê. */
              className={`grid select-none gap-2 ${GRELHA_DE_FOTOS}`}
            >
              {images.map((im, i) => {
                const on = selectedSet.has(im.path);
                const going = pendingSet.has(im.path);
                const used = !going && usedSet.has(im.path);
                // "Já noutra proposta" só aparece quando NÃO está nesta: as
                // duas marcas no mesmo sítio tapavam-se uma à outra, e a que
                // interessa primeiro é a desta proposta.
                const noutra = !going && !used ? usadasNoutras?.[im.path] : undefined;
                const failed = failedPaths.includes(im.path);
                // No teto, as fotos por escolher ficam apagadas e anunciadas
                // como indisponíveis (aria-disabled, não `disabled`: o botão
                // continua alcançável pelo teclado). O mesmo para as que já
                // vão a caminho.
                const blocked = (atLimit && !on) || going;
                const qualidade = qualidadeDe(im);
                const ma = qualidade?.nivel === "ma";
                return (
                  // `aspect-square` PASSOU PARA AQUI, do botão para o
                  // invólucro. É o que torna a altura da célula independente
                  // do que está lá dentro — e sem isso `content-visibility`
                  // não podia saltar o conteúdo sem a célula encolher.
                  <div key={im.path} className="celula-saltavel group relative aspect-square">
                    <button
                      type="button"
                      data-cell={i}
                      tabIndex={i === focusIndex ? 0 : -1}
                      aria-pressed={on}
                      aria-disabled={blocked || undefined}
                      // Nome ESTÁVEL: quem diz se está escolhida é o
                      // aria-pressed. O "já nesta proposta" entra no nome
                      // porque é a única forma de a marca visual chegar a
                      // quem não vê a grelha.
                      aria-label={`Foto ${i + 1} de ${images.length}${
                        going
                          ? " (a adicionar)"
                          : used
                            ? " (já nesta proposta)"
                            : noutra
                              ? ` (já usada em ${noutra})`
                              : ""
                      }${failed ? " (não entrou)" : ""}${ma ? " (má qualidade)" : ""}`}
                      onClick={(e) => toggleAt(i, e.shiftKey)}
                      onFocus={() => setFocusIndex(i)}
                      /* `h-full w-full` e não `aspect-square`: quem é
                   quadrado agora é o INVÓLUCRO (ver `celula-saltavel`
                   em globals.css) — é isso que deixa o browser saltar
                   a célula sem ela colapsar. */
                      className={`relative block h-full w-full overflow-hidden rounded-lg border bg-[var(--bo-tinta-6)] ${ESTADO} ${PRESSAO} ${
                        failed
                          ? "border-[var(--bo-perigo)]/60 ring-2 ring-[var(--bo-perigo)]/25"
                          : on
                            ? "border-sage-600 ring-2 ring-sage-600/35"
                            : "border-[var(--bo-hairline-strong)] hover:border-sage-600/45"
                      } ${blocked ? "opacity-50" : ""}`}
                    >
                      <Photo image={im} priority={i < ABOVE_FOLD} />
                      {ma && (
                        // O sinal vermelho, ANTES de escolher (28/10).
                        // À esquerda do visto, para não o tapar.
                        <span
                          aria-hidden
                          title={qualidade?.motivo ?? undefined}
                          className={`absolute top-1 flex h-5 items-center rounded-full bg-[var(--bo-perigo)] px-1.5 text-[10px] font-medium text-white ${
                            on ? "right-7" : "right-1"
                          }`}
                        >
                          Má qualidade
                        </span>
                      )}
                      {on && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sage-600 text-white">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                        </span>
                      )}
                      {(used || going) && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-black/65 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-[0.06em] text-white"
                        >
                          {going ? "A adicionar…" : "Já nesta proposta"}
                        </span>
                      )}
                      {noutra && (
                        <span
                          aria-hidden
                          title={`Já usada em ${noutra}`}
                          className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-[var(--bo-aviso)]/85 px-1.5 py-0.5 text-center text-[10px] tracking-[0.04em] text-white"
                        >
                          {noutra}
                        </span>
                      )}
                    </button>
                    {/* A lupa é o caminho do rato/toque para a foto em
                  grande; pelo teclado é a tecla V. Só é focável na
                  célula ativa, para o Tab não passar por 60 lupas. */}
                    <button
                      type="button"
                      tabIndex={i === focusIndex ? 0 : -1}
                      aria-label={`Ver a foto ${i + 1} em grande`}
                      onClick={() => setPreviewIndex(i)}
                      /* ── O ALVO CRESCE, O DISCO NÃO ──────────────────
                   Isto levava `.alvo-toque`, que sob `(pointer:
                   coarse)` força 44×44 — e num telemóvel, com células
                   de 111 px, o disco preto passou a tapar o canto
                   superior esquerdo de TODAS as fotografias, encostado
                   à margem na primeira coluna. Palavras dela: «os
                   ícones de lupa aparecem cortados pela borda esquerda
                   e sobrepostos às imagens».

                   O alvo de 44 px estava certo e continua lá — o que
                   mudou é quem cresce: o `.alvo-invisivel` estende a
                   área tocável com um `::after` transparente e deixa o
                   desenho nos 24 px. Ver `globals.css`.

                   Fica também mais discreto: um disco a 45% em vez de
                   55%, e mais pequeno, porque a foto é que interessa. */
                      className={`alvo-invisivel absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-[2px] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 ${ESTADO} ${PRESSAO}`}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {hasMore ? (
              <div className="mt-4 flex flex-col items-center gap-1">
                <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>
                  {remaining && remaining > 0
                    ? `Mostrar mais (faltam ${remaining}${truncated ? "+" : ""})`
                    : "Mostrar mais"}
                </Button>
                <p className="bo-text-muted text-xs">
                  As mais recentes aparecem primeiro. A grelha mostra {THEME_PAGE_SIZE} de cada vez
                  para o tema abrir depressa.
                </p>
              </div>
            ) : (
              images.length > THEME_PAGE_SIZE && (
                <p className="bo-text-muted mt-4 text-center text-xs">
                  Fim do tema — {plural(images.length, "foto", "fotos")}.
                </p>
              )
            )}
          </>
        )}
      </div>
    </>
  );
}
