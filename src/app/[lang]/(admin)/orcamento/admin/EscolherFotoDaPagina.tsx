"use client";

import { useState, type ReactNode } from "react";
import { ArrastarParaEnquadrar, type Foco } from "./ArrastarParaEnquadrar";
import ImagemComPlanoB from "./ImagemComPlanoB";
import { Button, FolhaOuDialogo, Segmented } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";

/** Uma fotografia que se pode escolher, ou a que está num lugar. */
export interface FotoParaEscolher {
  ref: string;
  url?: string;
  original?: string;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTOGRAFIA DE UMA PÁGINA DO PDF, ESCOLHIDA POR ELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (15/10): «queremos ter a liberdade de colocar as fotos que
 * quisermos nas imagens de fundo das capas ou em qualquer sítio do PDF». Abre
 * a partir da miniatura da página (a vista de conjunto) — foi onde ela escolheu
 * fazê-lo. Mostra o que o PDF põe lá AGORA (a escolha dela ou a do sistema) e
 * deixa trocar cada lugar por uma fotografia desta proposta, da biblioteca de
 * temas ou carregada na hora.
 *
 * Cada toque aplica-se logo (a miniatura muda com ele) e tem «Anular» — não há
 * «Guardar» para esquecer. «Voltar ao automático» devolve a página ao sistema.
 *
 * ── E O ENQUADRAR (23/10) ─────────────────────────────────────────────────
 * «ajustar a posição da foto quando escolhemos uma foto para um slide»: o lugar
 * escolhido mostra-se com a forma da caixa onde sai NÍTIDO no PDF
 * (`formasDosLugares`), e arrasta-se como a capa. O que ela larga é o recorte
 * que sai. A paleta tem seis lugares — a fila de cinco e o painel grande.
 */
const FOLHA = 1123 / 794;
const posicaoDe = (f?: Foco | null) => (f ? `${f.x * 100}% ${f.y * 100}%` : undefined);
export default function EscolherFotoDaPagina({
  aberto,
  nome,
  max,
  lugares,
  escolhida,
  podeVoltarAoAutomatico = true,
  lugar,
  formas,
  focos = [],
  focoDela = false,
  aspetos = {},
  fotosDaProposta,
  carregar,
  onLugar,
  onFoco,
  onEscolher,
  onQuantas,
  onAutomatico,
  onBiblioteca,
  onFechar,
}: {
  aberto: boolean;
  /** O nome da página («Inspiração · Cocktail»). */
  nome: string;
  /** Quantos lugares a página pode ter: 1, ou 2 no separador. */
  max: number;
  /** O que está em cada lugar AGORA, pela ordem (o que o PDF põe). */
  lugares: readonly (FotoParaEscolher | null)[];
  /** `true` quando a página tem a escolha dela (e não a do sistema). */
  escolhida: boolean;
  /** A capa não tem automático: é a «Fotografia da capa». */
  podeVoltarAoAutomatico?: boolean;
  /** O lugar que um toque numa fotografia vai trocar. */
  lugar: number;
  /** A forma (largura ÷ altura) da caixa de cada lugar no PDF. */
  formas?: readonly number[];
  /** O enquadramento que se vê em cada lugar (o dela, ou o do PDF). */
  focos?: readonly (Foco | null)[];
  /** O lugar activo tem um enquadramento escolhido por ela. */
  focoDela?: boolean;
  /** Largura ÷ altura de cada fotografia, pela referência. */
  aspetos?: Readonly<Record<string, number>>;
  fotosDaProposta: readonly FotoParaEscolher[];
  /** A caixa de carregar uma fotografia nova (a do estúdio). */
  carregar: ReactNode;
  onLugar: (lugar: number) => void;
  /** Enquadrar o lugar activo (`null` = o automático). */
  onFoco?: (foco: Foco | null) => void;
  onEscolher: (ref: string) => void;
  onQuantas: (n: 1 | 2) => void;
  onAutomatico: () => void;
  onBiblioteca: () => void;
  onFechar: () => void;
}) {
  // Com mais de dois lugares (a paleta) estão sempre todos; no separador, o
  // número é o que ela escolheu (uma ou duas).
  const quantas = max > 2 ? max : Math.min(max, Math.max(1, lugares.length));
  const forma = (i: number) => formas?.[i] ?? FOLHA;
  const nomeDoLugar = (i: number) => (max === 6 && i === 5 ? "Painel grande" : `Lugar ${i + 1}`);
  const activa = lugares[lugar] ?? null;
  // A forma da fotografia: a que o estúdio já mediu, ou a que se mede aqui,
  // quando ela chega — sem ela não se sabe para que lado se pode arrastar.
  const [medidas, setMedidas] = useState<Record<string, number>>({});
  const aspetoDe = (ref: string) => aspetos[ref] ?? medidas[ref];
  return (
    <FolhaOuDialogo
      aberto={aberto}
      onFechar={onFechar}
      sobretitulo="Fotografia da página"
      titulo={nome}
      descricao={
        escolhida
          ? "Escolhida por vocês. Toca numa fotografia para a trocar — é esta que sai no PDF."
          : "Escolhida pelo sistema. Toca numa fotografia para pôr outra — é essa que sai no PDF."
      }
      largura="md"
      folhaAlta
      accoes={
        <>
          {escolhida && podeVoltarAoAutomatico && (
            <Button variant="ghost" size="sm" onClick={onAutomatico} className="mr-auto">
              Voltar ao automático
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onFechar}>
            Feito
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {max === 2 && (
          <Segmented
            ariaLabel="Quantas fotografias no separador"
            value={String(Math.min(quantas, 2)) as "1" | "2"}
            onChange={(v) => onQuantas(v === "1" ? 1 : 2)}
            options={[
              { value: "1", label: "Uma (página inteira)" },
              { value: "2", label: "Duas (lado a lado)" },
            ]}
          />
        )}

        {/* Os lugares da página, como estão agora. */}
        <div
          role="radiogroup"
          aria-label="Que lugar trocar"
          className={`grid items-start gap-2 ${
            quantas > 2 ? "grid-cols-3" : quantas > 1 ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {Array.from({ length: quantas }, (_, i) => {
            const f = lugares[i] ?? null;
            const activo = lugar === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={activo}
                aria-label={
                  quantas > 1
                    ? `${nomeDoLugar(i)}${f ? "" : ", sem fotografia"}`
                    : "A fotografia da página"
                }
                onClick={() => onLugar(i)}
                style={{ aspectRatio: String(forma(i)) }}
                className={`relative overflow-hidden rounded-lg bg-[var(--bo-tinta-10)] ${
                  activo && quantas > 1
                    ? "ring-2 ring-[var(--bo-accent)] ring-offset-2 ring-offset-[var(--bo-surface)]"
                    : ""
                } ${ESTADO} ${PRESSAO}`}
              >
                {f?.url && (
                  <ImagemComPlanoB
                    src={f.url}
                    planoB={f.original}
                    posicao={posicaoDe(focos[i])}
                    className="h-full w-full object-cover"
                  />
                )}
                {quantas > 1 && (
                  <span className="absolute left-2 top-2 rounded-full bg-[var(--bo-surface)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--bo-text)]">
                    {i + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* O enquadrar do lugar activo, na forma da caixa onde sai no PDF. */}
        {onFoco && activa?.url && (
          <div>
            <p className="bo-eyebrow mb-2">
              Enquadrar{quantas > 1 ? ` · ${nomeDoLugar(lugar).toLowerCase()}` : ""}
            </p>
            <div
              style={{ maxWidth: `min(100%, ${Math.round(240 * Math.max(1, forma(lugar)))}px)` }}
            >
              <ArrastarParaEnquadrar
                aspeto={aspetoDe(activa.ref)}
                aspetoDaCaixa={forma(lugar)}
                foco={focos[lugar] ?? { x: 0.5, y: 0.5 }}
                activo
                nome={`de «${nome}»${quantas > 1 ? `, ${nomeDoLugar(lugar).toLowerCase()}` : ""}`}
                onFoco={onFoco}
              >
                {(posicao) => (
                  <div
                    className="relative w-full overflow-hidden rounded-lg bg-[var(--bo-tinta-10)]"
                    style={{ aspectRatio: String(forma(lugar)) }}
                  >
                    <ImagemComPlanoB
                      src={activa.url ?? ""}
                      planoB={activa.original}
                      posicao={posicao}
                      onMedida={(a) =>
                        setMedidas((m) =>
                          Math.abs((m[activa.ref] ?? 0) - a) < 0.001
                            ? m
                            : { ...m, [activa.ref]: a },
                        )
                      }
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </ArrastarParaEnquadrar>
            </div>
            {focoDela && (
              <button
                type="button"
                onClick={() => onFoco(null)}
                className={`alvo-toque relative mt-1 text-caption font-medium text-[var(--bo-accent)] underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
              >
                Enquadramento automático
              </button>
            )}
          </div>
        )}

        <div>
          <p className="bo-eyebrow mb-2">Desta proposta</p>
          {fotosDaProposta.length ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fotosDaProposta.map((f) => {
                const usada = lugares.slice(0, quantas).some((l) => l?.ref === f.ref);
                return (
                  <li key={f.ref}>
                    <button
                      type="button"
                      onClick={() => onEscolher(f.ref)}
                      aria-pressed={usada}
                      aria-label={usada ? "Fotografia já nesta página" : "Pôr esta fotografia"}
                      className={`relative block aspect-square w-full overflow-hidden rounded-md bg-[var(--bo-tinta-10)] ${
                        usada
                          ? "ring-2 ring-[var(--bo-accent)] ring-offset-1 ring-offset-[var(--bo-surface)]"
                          : ""
                      } ${ESTADO} ${PRESSAO}`}
                    >
                      {f.url && (
                        <ImagemComPlanoB
                          src={f.url}
                          planoB={f.original}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--bo-text-muted)]">
              Ainda não há fotografias nos temas desta proposta.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm" onClick={onBiblioteca} className="self-start">
            Da biblioteca de temas
          </Button>
          {carregar}
        </div>
      </div>
    </FolhaOuDialogo>
  );
}
