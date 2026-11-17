"use client";

import { type Dispatch, type JSX, type RefObject, type SetStateAction } from "react";
import { type LeituraFalhada } from "@/lib/porque-nao-leu";
import { THEME_PAGE_SIZE, type ThemeImage, type ThemeSummary } from "@/lib/theme-types";
import { Button } from "../ui";
import { ESTADO } from "../ui/movimento";
import { GRELHA_DE_FOTOS } from "./grelha-de-fotos";
import { readDropEntries } from "./largar-pastas";
import type { Pending } from "./tipos-da-pasta";
import { plural } from "@/lib/plural";

/** A grelha das fotografias de um tema — a carregar, vazia, ou cheia — com o
 *  arrasto para reordenar e para largar ficheiros. (Saiu da pasta do tema na
 *  fase 8 da estrutura do código, tal e qual.) */
export interface GrelhaDaPastaProps {
  theme: ThemeSummary;
  images: ThemeImage[];
  truncated: boolean;
  falhaDaPasta: LeituraFalhada | null;
  loading: boolean;
  loadingMore: boolean;
  pending: Pending[];
  setDrag: Dispatch<SetStateAction<boolean>>;
  drag: boolean;
  /**
   * A profundidade do arrasto por cima da grelha (cada filho que o ponteiro
   * atravessa conta uma entrada e uma saída). Vive na pasta, que é dona dela;
   * a grelha só a faz andar — e sabe quando voltou a zero.
   */
  arrasto: { entrar: () => void; sair: () => number; zerar: () => void };
  remaining: number | null;
  hasMore: boolean;
  handleDrop: (entries: FileSystemEntry[], files: File[]) => Promise<void>;
  loadMore: () => Promise<void>;
  unreadable: boolean;
  grelha: RefObject<HTMLDivElement | null>;
  colunas: number;
  pendentes: JSX.Element[];
  celulaDaFoto: (im: ThemeImage, i: number) => JSX.Element;
}

export function GrelhaDaPasta({
  theme,
  images,
  truncated,
  falhaDaPasta,
  loading,
  loadingMore,
  pending,
  setDrag,
  drag,
  arrasto,
  remaining,
  hasMore,
  handleDrop,
  loadMore,
  unreadable,
  grelha,
  colunas,
  pendentes,
  celulaDaFoto,
}: GrelhaDaPastaProps) {
  return (
    <>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          arrasto.entrar();
          setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          if (arrasto.sair() === 0) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          arrasto.zerar();
          setDrag(false);
          // As `entries` têm de sair do DataTransfer AGORA: ele é esvaziado
          // assim que este handler retorna, e o resto do trabalho é `async`.
          const entries = readDropEntries(e.dataTransfer);
          const files = Array.from(e.dataTransfer?.files ?? []);
          void handleDrop(entries, files);
        }}
        // A marca por onde os testes encontram esta caixa. Era a classe
        // `border-dashed`, e deixou de servir no dia em que o tracejado passou
        // a existir só durante um arrasto (fase 07) — um selector que depende
        // de um estado transitório é um selector que encontra a zona de largar
        // metade das vezes.
        data-zona-de-largar=""
        // `@container`: é ESTA caixa que o `GRELHA_DE_FOTOS` mede. A largura
        // dela não acompanha a da janela a partir de `lg`, onde a navegação
        // passa a ocupar 256 px em fluxo — a conta toda está no comentário do
        // `GRELHA_DE_FOTOS`.
        /* ══════════════════════════════════════════════════════════════════
           O TRACEJADO SÓ EXISTE DURANTE UM ARRASTO — FASE 07
           ══════════════════════════════════════════════════════════════════

           Ponto 17 da auditoria, e o critério 8: «a área tracejada está sempre
           visível… um tracejado permanente é ruído que ensina a ignorar o
           sinal. A grelha é só a grelha.» [APPLE, Drag and drop: mostrar sinal
           de aceitação SÓ sobre um destino válido, durante o arrasto.]

           Três estados, e a moldura tem sempre 1 px para a geometria não
           saltar (é ela que o `zonaDeLargar` do teste conta):

             · a arrastar ficheiros por cima → tracejado no acento, e o realce
               do contentor. É o sinal de aceitação, e só aqui;
             · com fotografias na grelha → moldura TRANSPARENTE. A grelha é só
               a grelha;
             · sem fotografias nenhumas → um fio da casa, contínuo. Não é uma
               zona de largar a anunciar-se: é a moldura da frase que ocupa o
               lugar das fotografias, e sem ela o texto fica solto no meio da
               página. Contínuo e não tracejado, que é a diferença entre uma
               moldura e um convite.

           A `bo-cena` não entra aqui: ver a nota do split view.

           ── A GRELHA ALINHA COM O RESTO DA PÁGINA (9/11) ──────────────────
           A moldura tem `p-4` para o realce do arrasto ter onde respirar, e
           com isso as fotografias ficavam 17 px para dentro do título e da
           margem — no telemóvel começavam aos 34 px quando tudo o resto
           começa aos 16. `-mx-4 -mt-4` devolve esses 16 px: as fotografias
           alinham com o título, e o realce do arrasto estende-se 16 px para
           fora delas, como na app Fotografias. */
        className={`@container -mx-4 -mt-4 rounded-2xl border p-4 ${ESTADO} ${
          drag
            ? "border-dashed border-sage-600/60 bg-sage-600/[0.06]"
            : images.length === 0 && pending.length === 0
              ? "border-[var(--bo-hairline-strong)]"
              : "border-transparent"
        }`}
      >
        {loading ? (
          <div className={GRELHA_DE_FOTOS}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="bo-skeleton aspect-[4/3] min-h-[104px] rounded-lg"
                aria-hidden
              />
            ))}
          </div>
        ) : unreadable ? (
          // Falha de leitura NÃO é "tema sem fotos": dizer-lhe para arrastar
          // fotos aqui seria convidá-la a duplicar o que já lá está.
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--bo-tinta-72)]">
              Não foi possível ler a pasta deste tema agora.
            </p>
            <p className="bo-text-muted mt-1 text-xs">
              {/* A razão, quando se sabe qual foi. O texto de reserva é para a
                  pasta que o SERVIDOR disse não ter conseguido ler (um 200 com
                  `ok: false`): aí ele já respondeu, e o que se sabe é mesmo só
                  que a falha é do lado de lá e passageira. */}
              {falhaDaPasta?.mensagem ??
                "É uma falha temporária — as fotos não desapareceram. Recarrega a página daqui a pouco."}
            </p>
          </div>
        ) : images.length === 0 && pending.length === 0 ? (
          <div className="py-12 text-center">
            <p className="bo-text-muted text-sm">
              Arrasta para aqui as fotos deste tema — ou uma pasta inteira —, ou usa “Adicionar
              fotos”.
            </p>
            <p className="bo-text-muted mt-1 text-xs">JPG, PNG ou WEBP · também HEIC do iPhone</p>
          </div>
        ) : (
          <>
            {/* ── UMA SÓ `role="row"`, E A LINHA DITA EM CADA CÉLULA ──────
                Agrupar as células em linhas a sério (um `<div role="row">`
                por linha) era o óbvio, e foi o primeiro a ser feito. Partia
                uma coisa: o número de colunas MEDE-SE, e muda — ao abrir (2
                da classe → 5 medidas), ao alargar a janela, a cada foto que
                sai e empurra as outras uma casa para trás. Uma célula que
                muda de pai é, para o React, uma célula NOVA: desmontava-se, a
                miniatura voltava a fazer o fade e o original perdia a vez na
                fila dos descarregamentos (o teste «a foto que está no ecrã
                não espera pelas que não estão» apanhou-o).

                Fica uma linha só, que não muda nunca, e a posição de cada
                foto vai no `aria-rowindex` / `aria-colindex` dela — é o que
                deixa o leitor de ecrã dizer «linha 3, coluna 2» sem a árvore
                mexer. A geometria é a do `GRELHA_DE_FOTOS`: a linha é
                `display: contents`, não ocupa caixa nenhuma. */}
            <div
              ref={grelha}
              role="grid"
              aria-multiselectable="true"
              aria-label={`Fotografias de ${theme.name}`}
              aria-rowcount={Math.ceil((pending.length + images.length) / colunas)}
              aria-colcount={colunas}
              className={`select-none ${GRELHA_DE_FOTOS}`}
            >
              <div role="row" className="contents">
                {pendentes}
                {images.map((im, i) => celulaDaFoto(im, i))}
              </div>
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
