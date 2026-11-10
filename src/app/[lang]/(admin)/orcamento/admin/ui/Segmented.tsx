"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { ESTADO, MARCA, PRESSAO } from "./movimento";

/**
 * A segmented control (a small pill of mutually-exclusive options) for switching
 * a view's mode/filter — the calm alternative to a row of loud buttons. It sits
 * in a soft track; the active segment lifts to white with a shadow.
 *
 * Accessibility & signals
 * - Rendered as a `radiogroup` of `role="radio"` buttons with roving focus, so
 *   arrow keys move between segments and only the group holds one tab stop.
 * - Selection is never colour-only: the active segment gains elevation (white
 *   card + shadow) and `aria-checked`, both independent of hue.
 *
 * Generic over the option value `T` so `value`/`onChange` stay type-safe.
 *
 * @example
 * <Segmented
 *   ariaLabel="Vista"
 *   value={view}
 *   onChange={setView}
 *   options={[
 *     { value: "list", label: "Lista" },
 *     { value: "board", label: "Quadro" },
 *   ]}
 * />
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional leading glyph. */
  icon?: ReactNode;
  /** Accessible name when `label` is icon-only. */
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the whole group. Required. */
  ariaLabel: string;
  /** Shrink the control (denser toolbars). */
  size?: "sm" | "md";
  /**
   * O que fazer quando os segmentos não cabem na largura.
   *
   * `"linha"` (por omissão) quebra para a linha de baixo — é o que serve dois
   * rótulos compridos como os do IVA. Com MUITOS segmentos curtos dá uma
   * pílula de duas linhas, larga e torta: MEDIDO a 390 px nos seis filtros
   * das Propostas. `"rolar"` mantém-nos numa linha só e deixa o contentor
   * (que tem de ter `overflow-x-auto`) rolar com o dedo, como as pílulas de
   * estado dos Pedidos — e traz o segmento escolhido para dentro do ecrã.
   */
  quebra?: "linha" | "rolar";
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  quebra = "linha",
  className,
}: SegmentedProps<T>) {
  // 44 px de altura onde se toca com o dedo, a densidade de sempre com rato —
  // a mesma regra e a mesma razão que estão escritas em `Button.tsx`. Estes
  // segmentos são filtros ("Todas · 0", "Últimos 3 meses"), e são dos alvos em
  // que mais se toca no telemóvel.
  const pad =
    size === "sm"
      ? "h-8 pointer-coarse:h-11 px-3 text-xs"
      : "h-9 pointer-coarse:h-11 px-3.5 text-sm";

  /**
   * ── O GRUPO TEM DE TER SEMPRE UMA PORTA DE ENTRADA ────────────────────────
   *
   * O foco andante dava `tabIndex={0}` só ao segmento activo. Quando o `value`
   * não consta das opções — um filtro antigo reposto do `localStorage`, um
   * estado gravado que entretanto deixou de existir — NENHUM segmento ficava
   * activo, todos ficavam a -1, e o controlo inteiro saía da ordem de
   * tabulação: com teclado deixava de haver maneira de lá chegar, e portanto de
   * mudar o filtro que está encravado. Sem rato, o ecrã ficava preso.
   *
   * Com um `value` desconhecido, a entrada é o primeiro segmento (e as setas
   * passam a partir dele). Nada muda no caso normal.
   */
  const activeIndex = options.findIndex((o) => o.value === value);
  const entryIndex = activeIndex === -1 ? 0 : activeIndex;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    if (options.length === 0) return;
    // Valor fora das opções: a primeira seta escolhe o ponto de entrada em vez
    // de não fazer nada (era o que prendia o teclado).
    if (activeIndex === -1) {
      onChange(options[entryIndex].value);
      return;
    }
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = options[(activeIndex + delta + options.length) % options.length];
    onChange(next.value);
  }

  /**
   * ── A PÍLULA DESLIZA, EM VEZ DE APARECER NOUTRO SÍTIO ─────────────────────
   *
   * Medido na Pixelmatters: o segmento activo não muda de cor de repente — há
   * um indicador que ANDA de um segmento para o outro. É a peça mais copiável
   * do site deles, e o ecrã onde mais se sente é o dos filtros das Propostas,
   * que ela abre todos os dias.
   *
   * O detalhe que faz a diferença lá: o texto acende ANTES de a pílula chegar.
   * Separar o sinal («ouvi-te») do movimento («e agora mostro-te») é o que faz
   * o clique parecer imediato e o movimento parecer caro — em vez de obrigar a
   * escolher entre os dois. Se os dois tempos fossem iguais, o clique parecia
   * lento.
   *
   * Lá são 200 ms e 300 ms. Aqui são os degraus da casa: o texto nos 120 ms do
   * `ESTADO` (que ele já tinha) e a pílula nos 250 ms do `elemento` — «uma
   * coisa a mover-se», que é exactamente o que ela é. A ordem é a mesma e a
   * distância entre os dois é maior, não menor.
   *
   * ── E PORQUE É QUE O FUNDO BRANCO DO BOTÃO NÃO DESAPARECEU ───────────────
   *
   * Porque a posição da pílula só se sabe MEDINDO, e medir precisa de browser.
   * Entre o HTML do servidor e o React chegar, o segmento activo tem de se ver
   * na mesma — senão o controlo aparece sem nada escolhido e corrige-se à
   * vista, que é o mesmo defeito das maiúsculas que se acabou de tirar.
   *
   * Por isso: o botão activo traz o seu fundo desde o servidor, e SÓ o larga
   * quando a pílula já está medida e no sítio (`temMarca`). Nunca há dois
   * fundos ao mesmo tempo, e nunca há nenhum.
   */
  const grupoRef = useRef<HTMLDivElement>(null);

  // Numa fila que rola, o segmento escolhido pode estar fora do ecrã (escolhido
  // pelas setas, ou reposto de antes). Traz-se para dentro, sem mexer na
  // página na vertical.
  useEffect(() => {
    if (quebra !== "rolar") return;
    const activo = grupoRef.current?.querySelector<HTMLElement>('[data-activo="sim"]');
    activo?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [quebra, value]);
  const [marca, setMarca] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Só se anima a partir da SEGUNDA medição: a primeira punha a pílula a
  // deslizar do canto superior esquerdo até ao segmento activo, à chegada.
  const [podeAnimar, setPodeAnimar] = useState(false);

  // ── A CHAVE DAS OPÇÕES, E NÃO A LISTA (10/11) ──────────────────────────
  // Quem usa isto escreve `options={[…]}` no próprio desenho, portanto a lista
  // é nova a cada desenho do ecrã à volta — no estúdio, a cada letra. Com ela
  // nas dependências, a medição (que lê `offsetLeft`, layout forçado) corria a
  // cada tecla. O que muda a pílula é QUE segmentos há; o tamanho de cada um já
  // o segue o `ResizeObserver`.
  const chaveDasOpcoes = options.map((o) => o.value).join("\n");

  useEffect(() => {
    const grupo = grupoRef.current;
    if (!grupo) return;

    const medir = () => {
      const activo = grupo.querySelector<HTMLElement>('[data-activo="sim"]');
      // Sem segmento activo (um filtro gravado que já não existe) não há
      // pílula — e o controlo continua a funcionar, apenas sem marca.
      if (!activo || !activo.offsetWidth) {
        setMarca(null);
        return;
      }
      const nova = {
        x: activo.offsetLeft,
        y: activo.offsetTop,
        w: activo.offsetWidth,
        h: activo.offsetHeight,
      };
      // A mesma medida não volta a desenhar o controlo.
      setMarca((m) =>
        m && m.x === nova.x && m.y === nova.y && m.w === nova.w && m.h === nova.h ? m : nova,
      );
    };

    medir();
    // A pílula tem de seguir o segmento quando ele muda de tamanho ou de linha:
    // o contentor tem `flex-wrap`, e uma janela mais estreita passa metade dos
    // segmentos para baixo. Sem isto, a marca ficava onde o segmento estava.
    const observador = new ResizeObserver(medir);
    observador.observe(grupo);
    for (const b of grupo.querySelectorAll("button")) observador.observe(b);
    return () => observador.disconnect();
  }, [value, chaveDasOpcoes]);

  useEffect(() => {
    if (!marca || podeAnimar) return;
    const id = requestAnimationFrame(() => setPodeAnimar(true));
    return () => cancelAnimationFrame(id);
  }, [marca, podeAnimar]);

  const temMarca = marca !== null;

  return (
    <div
      ref={grupoRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        // `flex-wrap`: dois segmentos com rótulos compridos ("IVA incluído" e
        // "+ IVA (acresce)") somam mais de 375 px e o segundo ficava cortado na
        // margem. Encolhê-los cortava as palavras; abreviá-los tirava-lhes o
        // sentido. Passar para a linha de baixo não custa nada e mantém as duas
        // legíveis — num ecrã largo continuam lado a lado, porque só quebra
        // quando não cabe.
        // `rounded-full` nos dois: a caixa e cada segmento. O DESIGN.md já
        // descrevia isto como «uma pequena pílula de opções mutuamente
        // exclusivas» — passou a sê-lo. Ver a nota no `ui/Button.tsx`: a curva
        // máxima é de quem se clica.
        "relative inline-flex items-center gap-1 rounded-full border border-[var(--bo-hairline)] bg-[var(--bo-tinta-6)] p-1",
        quebra === "rolar" ? "flex-nowrap" : "flex-wrap",
        className,
      )}
    >
      {/* A pílula. `aria-hidden` porque não diz nada que o `aria-checked` de
          cada segmento não diga melhor — é desenho, não informação. */}
      {marca && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-0 top-0 rounded-full bg-[var(--bo-surface)] shadow-[var(--bo-sombra-suspensa)]",
            podeAnimar && MARCA,
          )}
          style={{
            translate: `${marca.x}px ${marca.y}px`,
            width: marca.w,
            height: marca.h,
          }}
        />
      )}
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            data-activo={active ? "sim" : "nao"}
            tabIndex={i === entryIndex ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              /* ── `alvo-toque`: O PISO DE 44 px, E PORQUE É NO PRIMITIVO ───
                 Um rótulo curto não chega sozinho aos 44 px de largura. O
                 passeio `admin-mobile.spec.ts` apanhou-o no CI com o nome à
                 frente — «42x44px "Dia"», o primeiro segmento do comutador de
                 vistas do calendário —, e mediu 42 onde a conta em papel dava
                 43,9: a régua do browser é que manda, e estava 2 px abaixo.

                 Fica AQUI e não no calendário porque o defeito não é do
                 calendário: é de qualquer rótulo curto em qualquer comutador,
                 e o próximo que nascesse com «Ver» ou «Tudo» repetia-o. A
                 classe só existe dentro de `(pointer: coarse)`, portanto no
                 computador nada muda de tamanho.

                 O `display: inline-flex` que ela impõe já cá estava; o que
                 acrescenta é o centrar, que é o que se quer quando o piso
                 estica a pílula para lá do que o rótulo ocupa. */
              `alvo-toque relative inline-flex items-center gap-1.5 rounded-full font-medium ${ESTADO} ${PRESSAO}`,
              pad,
              quebra === "rolar" && "shrink-0 whitespace-nowrap",
              active
                ? // O fundo próprio é a rede de antes de a pílula existir. Sai
                  // no instante em que ela está medida e no sítio — nunca há
                  // dois fundos, e nunca há nenhum.
                  cn("text-[var(--bo-text)]", !temMarca && "bg-[var(--bo-surface)]")
                : "text-foreground/50 hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-6)]",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
