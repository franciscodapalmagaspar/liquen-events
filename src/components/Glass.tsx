"use client";

import { useEffect, useRef, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import type { OpcoesDoVidro } from "@/lib/liquid-glass";
import { onIdle } from "@/lib/onIdle";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SUPERFÍCIE DE VIDRO, EM REACT
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O motor está em `lib/liquid-glass.ts` e não sabe o que é React: recebe um
 * elemento, põe-lhe vidro, e devolve o `destroy()`. Este componente é a única
 * ponte entre os dois, e existe por uma razão só — **o `destroy()` não é
 * opcional**. Cada `attach()` pendura um `<filter>` no `<defs>` do documento; um
 * ecrã que abre e fecha vinte vezes sem desmontar deixa vinte lá dentro, e o
 * vigésimo primeiro vidro já custa o dobro a desenhar.
 *
 * ── OS VALORES NÃO SE ESCOLHEM AQUI ──────────────────────────────────────
 *
 * Vêm da tabela da Parte 3 do `docs/LIQUID-GLASS.md`, e a `superficie` é a
 * linha dessa tabela. Uma barra e um botão com o mesmo bisel parecem feitos do
 * mesmo material com espessuras erradas — e a tabela é o que impede cada ecrã de
 * inventar a sua.
 *
 * A regra que ela sublinhou: **acima de 20 de força o fundo deixa de se
 * reconhecer**, e o vidro passa a chamar mais atenção do que o conteúdo. É o
 * erro mais comum de quem descobre o efeito, e por isso a força mais alta desta
 * tabela é 12.
 *
 * ── AS DUAS REGRAS DA PARTE 5 QUE ESTE FICHEIRO CUMPRE SOZINHO ───────────
 *
 *  · **`prefers-reduced-motion` desliga o `track()`.** O `track()` é um laço de
 *    `requestAnimationFrame` a refazer o mapa a cada frame enquanto a forma
 *    transita — é precisamente o que essa preferência proíbe. Sem ele o vidro
 *    fica na forma final, desenhado uma vez, e é isso que se quer.
 *
 *    O reflexo do ponteiro FICA. Não é movimento autónomo: é a resposta directa
 *    ao rato, da mesma família de um `hover`, e desligá-la era tirar o segundo
 *    dos três sinais que fazem isto ler-se como Liquid Glass.
 *
 *  · **Uma camada de vidro por ecrã.** Essa é a única que este componente NÃO
 *    consegue cumprir — quem monta dois `<Glass>` no mesmo ecrã tem de os contar
 *    a olho. (No site público conta-os um teste: `vidro-do-site.test.ts`.) Vidro sobre vidro duplica o custo e transforma o fundo em papa
 *    cinzenta.
 *
 * ── O MOTOR CHEGA DEPOIS, E SÓ A QUEM O VAI USAR (17/11) ────────────────
 *
 * Este componente vivia no back office. Saiu de lá quando o site precisou dele
 * — a barra de cookies («os cookies eu quero colocar transparente iphone») —,
 * porque um segundo vidro ao lado do primeiro é o defeito que a Parte −1 do
 * sistema de design existe para evitar. E com a mudança de casa veio uma
 * mudança de peso: o motor (`lib/liquid-glass.ts`) passou a ser carregado com
 * `import()` dentro do efeito. A barra de cookies está em todas as páginas
 * públicas; com o `import` estático, o motor viajava no JavaScript do
 * arranque de todas elas, e quem chega pelo telemóvel (onde nem se monta)
 * pagava-o para nada.
 *
 *  · `adiar` espera que o browser fique livre (`onIdle`) antes de o ir buscar.
 *    O que se vê na primeira pintura é a tinta e o rebordo, que são CSS; a
 *    refracção junta-se depois, sem disputar a hidratação.
 *  · `quando` é a condição de media em que o vidro se monta — a barra de
 *    cookies pede `(pointer: fine)`, porque no toque um `backdrop-filter` num
 *    elemento `fixed` volta a desfocar o que passa por trás em cada fotograma
 *    do deslize (`globals.css`, «NO TOQUE, O AVISO NÃO DESFOCA»).
 *  · E ninguém que tenha pedido menos transparência, mais contraste ou cores
 *    forçadas leva vidro (`SEM_VIDRO`): é o que a Apple faz com «Reduzir
 *    transparência». O CSS repete a regra (`globals.css`, ao pé do `.lg`),
 *    porque a preferência pode mudar com a página aberta.
 *
 * ── E O TEXTO POR CIMA PRECISA DE FUNDO PRÓPRIO ──────────────────────────
 *
 * Contraste sobre vidro não é fixo: muda com o que está por baixo. Um rótulo
 * cinzento sobre uma fotografia clara e sobre uma escura não é o mesmo rótulo.
 * Quem põe texto directamente numa destas superfícies dá-lhe fundo próprio, ou
 * tira-o do vidro. Aqui não há nada a fazer cumprir — fica dito onde se lê.
 */

/** As linhas da tabela da Parte 3. */
export type SuperficieDeVidro = "painel" | "barra" | "controlo" | "menu";

const TABELA: Record<
  SuperficieDeVidro,
  Pick<OpcoesDoVidro, "bezel" | "strength" | "blur" | "saturate">
> = {
  /** Painel, cartão, folha modal. */
  painel: { bezel: 16, strength: 12, blur: 2, saturate: 1.5 },
  /** Barra de topo, sub-navegação. */
  barra: { bezel: 12, strength: 10, blur: 3, saturate: 1.5 },
  /** Botão, pastilha, chip. */
  controlo: { bezel: 8, strength: 7, blur: 1, saturate: 1.45 },
  /** Menu, popover. */
  menu: { bezel: 14, strength: 11, blur: 2, saturate: 1.5 },
};

/**
 * Quem pediu para ver as coisas sem transparência. A estas pessoas o vidro não
 * se monta — e o CSS do `.lg` tira-lhes o `backdrop-filter` que já lá esteja.
 */
export const SEM_VIDRO =
  "(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)";

function corresponde(consulta: string): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(consulta).matches === true;
}

export interface GlassProps extends Omit<HTMLAttributes<HTMLElement>, "className" | "children"> {
  superficie: SuperficieDeVidro;
  /** O elemento desenhado. `div` por omissão; `header` ou `nav` quando é isso que é. */
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  /** A condição de media em que o vidro se monta (ex.: `(pointer: fine)`). Sem ela, monta-se sempre. */
  quando?: string;
  /** Esperar que o browser fique livre antes de carregar o motor. Para o que está no arranque das páginas públicas. */
  adiar?: boolean;
  /**
   * Falso enquanto o vidro não deve existir (a barra de cookies por cima do
   * vídeo da entrada). Ao passar a falso, o vidro desmonta-se.
   */
  ativo?: boolean;
  /**
   * Onde o motor não pode entrar (Safari, Firefox), NÃO usar o desfoque de
   * recurso: fica só a tinta. Para superfícies fixas no site, onde um
   * `blur(12px)` permanente é o custo que se tirou a 29/10 e a 9/11.
   */
  soComMotor?: boolean;
}

export function Glass({
  superficie,
  as: Tag = "div",
  className = "",
  children,
  quando,
  adiar = false,
  ativo = true,
  soComMotor = false,
  ...resto
}: GlassProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* O rebordo é um `::after` com `inset: 0`, e isso precisa de um ancestral
       posicionado — mesmo quando o motor não se monta, porque o rebordo é CSS e
       desenha-se na mesma. Só se toca no `position` quando ele é `static`: uma
       barra que já era `fixed` ou `sticky` é assim porque flutua, e trocar-lhe
       o posicionamento por causa do rebordo tirava-lhe o `left`/`right` e a
       largura com eles. (MEDIDO: uma barra de 1056 px passava a ocupar os
       1200 px do ecrã.) */
    const posicaoOriginal = el.style.position;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const reporPosicao = () => {
      el.style.position = posicaoOriginal;
    };

    if (!ativo) return reporPosicao;
    if (corresponde(SEM_VIDRO)) return reporPosicao;
    if (quando !== undefined && !corresponde(quando)) return reporPosicao;

    let vivo = true;
    let desfazer: (() => void) | undefined;

    const montar = () => {
      import("@/lib/liquid-glass")
        .then(({ attach, specular, suportado }) => {
          if (!vivo) return;
          if (soComMotor && !suportado()) return;
          desfazer = montarVidro(el, superficie, attach, specular);
        })
        /* Um ChunkLoadError (rede que falha, publicação nova que apagou o
           pedaço antigo) sem `.catch` subia a `unhandledrejection` e ia para
           o `/api/erro-do-site`. Sem motor a superfície fica com a tinta: não
           é um erro. */
        .catch(() => {});
    };

    const cancelarEspera = adiar ? onIdle(montar) : (montar(), () => {});
    return () => {
      vivo = false;
      cancelarEspera();
      desfazer?.();
      reporPosicao();
    };
  }, [superficie, quando, adiar, ativo, soComMotor]);

  return (
    <Tag ref={ref} className={`lg ${className}`} {...resto}>
      {children}
    </Tag>
  );
}

type Motor = typeof import("@/lib/liquid-glass");

/** Põe o vidro no elemento e devolve o desfazer. Só corre depois de o motor chegar. */
function montarVidro(
  el: HTMLElement,
  superficie: SuperficieDeVidro,
  attach: Motor["attach"],
  specular: Motor["specular"],
): () => void {
  /* Lido no momento de montar e não guardado em estado: mudar esta preferência
     a meio de uma sessão é raríssimo, e o custo de acertar seria um listener
     por superfície de vidro para um caso que ninguém vive. */
  const sossego = corresponde("(prefers-reduced-motion: reduce)");

  const vidro = attach(el, { ...TABELA[superficie], live: !sossego });
  /* O âmbito é o próprio elemento e não o documento: um `pointermove` ligado
     ao `document` por cada vidro do ecrã corre em todos os movimentos do rato,
     incluindo os que passam a mil píxeis de distância. */
  const desligarReflexo = specular(el, { selector: null });

  return () => {
    desligarReflexo();
    vidro.destroy();
  };
}
