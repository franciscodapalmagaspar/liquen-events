import { Fragment } from "react";
import { wordStaggerMs } from "@/lib/motion/tokens";

/**
 * O TÍTULO DE TOPO ENTRA PALAVRA A PALAVRA.
 *
 * Pedido dela (22/10), entre as animações que escolheu: «Títulos palavra a
 * palavra» — os títulos de topo entram como já entrava a frase do «Sobre».
 *
 * ── PORQUE É QUE NÃO É O `TitleReveal` ───────────────────────────────────
 * O `TitleReveal` é de cliente: desenha as palavras invisíveis no servidor e
 * só as mostra quando o React acorda e o observador as vê. Num título de topo
 * isso é o «aparece, some, volta» que o #252 tirou do sítio — e, no dia em que
 * o JavaScript não corre, um título que nunca aparece. Este é só HTML e CSS
 * (`.palavra-sobe`, no `globals.css`): o servidor já manda as palavras com o
 * atraso de cada uma, e a animação arranca sozinha.
 *
 *   · Na primeira visita espera pela cortina (`--cortina-sobe`), como a
 *     fotografia (`.hero-settle`): sobe com o pano, em vez de correr por baixo
 *     dele para ninguém.
 *   · Ao mudar de página, a página nova é montada de novo e as palavras sobem
 *     logo.
 *   · Com movimento reduzido, o título está simplesmente lá.
 *
 * As palavras ficam no texto do título (não há cópia escondida), com o espaço
 * ENTRE as máscaras: o nome do título para o leitor de ecrã e para o Google é
 * a frase tal e qual.
 */
export default function TituloPalavraAPalavra({ texto }: { texto: string }) {
  const palavras = texto.split(/\s+/).filter(Boolean);
  return (
    <>
      {palavras.map((palavra, i) => (
        <Fragment key={i}>
          {/* A máscara: `pb`/`-mb` deixam caber as hastes de baixo (g, j, p)
              sem mudar a altura da linha — o mesmo par do `TitleReveal`. */}
          <span className="inline-block overflow-hidden align-bottom pb-[0.16em] -mb-[0.16em]">
            <span
              className="palavra-sobe inline-block"
              style={{ "--word-delay": `${wordStaggerMs(i)}ms` } as React.CSSProperties}
            >
              {palavra}
            </span>
          </span>
          {i < palavras.length - 1 ? " " : ""}
        </Fragment>
      ))}
    </>
  );
}
