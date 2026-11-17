"use client";

import { useRef } from "react";
import { useAlturaDoConteudo } from "../../ui/altura-do-conteudo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA DESCRIÇÃO QUE SE VÊ INTEIRA — A CAIXA É QUE CRESCE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A descrição de um mood board tinha `rows={2}` e o resto rolava lá dentro.
 * MEDIDO a 390 px, na proposta de que a dona do negócio mandou fotografia:
 *
 *     campo (pt)   70 px de altura   224 px de conteúdo   →  154 px escondidos
 *     campo (en)   70 px de altura   276 px de conteúdo   →  206 px escondidos
 *
 * Sessenta e nove por cento do texto português fora de vista, e sete por cento
 * do que se vê é meia frase — a captura lê-se «…cores escolhida pelos noivos,
 * em jarras de vidro que podem ser transparentes ou de cor . Integração de
 * velas…», com o princípio cortado por cima. Uma barra de deslocação dentro de
 * uma caixa de 70 px, num telemóvel, não é uma forma de ler: é texto invisível
 * com um sinal de que existe.
 *
 * Uma linha por omissão (uma caixa vazia é mais pequena do que era) e cresce
 * com o que lá está. É o mesmo remédio — e a mesma conta das bordas — do
 * `CampoQueCresce` do `ServicesEditor` e do `TextareaQueCresce` da
 * `CaixaInglesa`; aqui não se importa de nenhum dos dois porque nenhum deles é
 * exportado e um export só para quatro linhas ataria o estúdio ao editor de
 * serviços.
 *
 * `useLayoutEffect` e não `useEffect`: com o segundo, a caixa aparecia com uma
 * linha e saltava para as suas à frente de quem escreve.
 */
export function DescricaoQueCresce({
  valor,
  ...resto
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "rows" | "ref"> & {
  valor: string;
}) {
  const meu = useRef<HTMLTextAreaElement | null>(null);
  // ── VAZIA É UMA LINHA, E ISSO TEVE DE SER DITO ────────────────────────
  // MEDIDO: um `<textarea>` VAZIO com este `placeholder` devolve
  // `scrollHeight: 120` no Chrome — o placeholder é maquetizado como texto e
  // conta. Sem altura escrita à mão, o `rows={1}` manda, e o mínimo de toque
  // (44 px, globals.css) faz o resto. E só se mede quando se vê — ver
  // `ui/altura-do-conteudo.ts`.
  useAlturaDoConteudo(meu, valor, { vaziaSemAltura: true });
  return <textarea {...resto} value={valor} rows={1} ref={meu} />;
}
