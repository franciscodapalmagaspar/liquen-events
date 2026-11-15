"use client";

import { prefersReducedMotion } from "./useReducedMotion";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROLAR ATÉ VER — uma porta só, e que pergunta antes de animar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O DEFEITO ─────────────────────────────────────────────────────────────
 *
 * O `globals.css` desta casa declara `html { scroll-behavior: smooth }` e
 * DESLIGA-O, logo a seguir, dentro de `@media (prefers-reduced-motion: reduce)`
 * — o rolo suave é uma escolha da folha de estilos e a folha de estilos já
 * respeita quem pediu para não animar.
 *
 * `element.scrollIntoView({ behavior: "smooth" })` escrito em JavaScript passa
 * por cima disso. O `behavior` do argumento GANHA ao `scroll-behavior` do CSS
 * (é o que a especificação diz: a folha de estilos só entra quando o argumento
 * traz `"auto"`), portanto sete chamadas espalhadas pelo back office estavam a
 * arrastar o ecrã de quem tem enjoo de movimento — e um rolo de página inteira
 * é, de toda a gramática de movimento da casa, o gesto que pior lhe cai.
 *
 * E não há `motion-safe:` que valha aqui: essa variante é do Tailwind, existe
 * em CSS e não tem equivalente numa chamada de função. Em JavaScript a
 * preferência LÊ-SE — é o que esta peça faz.
 *
 * ── PORQUE É QUE É UM AJUDANTE E NÃO SETE CORRECÇÕES ──────────────────────
 *
 * Porque sete sítios a decidir cada um por si voltam a divergir, e já tinham
 * divergido: quando isto se escreveu havia DUAS leituras da preferência no back
 * office, com dois nomes diferentes e dois corpos diferentes — a do
 * `DossierClient` (que chamava a peça partilhada) e uma cópia local dentro do
 * `ThemePicker`, com `try`/`catch` e tudo. Duas maneiras certas de fazer a
 * mesma coisa são o passo antes de haver uma errada.
 *
 * O `rolo-que-respeita-quem-nao-quer-movimento.test.ts` varre o back office e
 * fica vermelho se alguém voltar a escrever `behavior: "smooth"` à mão. É o
 * teste que faz este ficheiro valer a pena — sem ele, isto é só mais um sítio
 * que ninguém sabe que existe.
 *
 * ── E AS CHAMADAS SEM `behavior` NENHUM? ──────────────────────────────────
 *
 * Ficam como estão, e de propósito. `scrollIntoView({ block: "nearest" })`
 * herda o `scroll-behavior` da folha de estilos — ou seja, JÁ obedece à
 * preferência, pelo caminho do CSS. Passá-las por aqui não corrigia nada e
 * escrevia à força um `behavior` que ninguém tinha pedido. A regra da casa é
 * portanto: **quem escreve `behavior` em JavaScript passa por esta porta; quem
 * não escreve nenhum deixa a folha de estilos decidir.**
 */

/** `"auto"` para quem pediu para não animar, `"smooth"` para os restantes. */
export function comportamentoDoRolo(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/**
 * Leva a vista até ao elemento, com rolo suave só para quem o aceita.
 *
 * O `block`/`inline` continua a ser de quem chama — é enquadramento, não
 * movimento, e cada sítio sabe o seu (`"start"` para uma secção, `"center"`
 * para um campo, `"nearest"` para não mexer no que já está à vista).
 *
 * A guarda do `scrollIntoView` não é zelo: o jsdom não o implementa, e metade
 * dos testes de componente do back office montam ecrãs que o chamam. Sem ela,
 * um `TypeError` num teste que não tem nada que ver com rolo nenhum.
 */
export function rolarAteVer(
  alvo: Element | null | undefined,
  opcoes: Omit<ScrollIntoViewOptions, "behavior"> = {},
): void {
  if (!alvo || typeof alvo.scrollIntoView !== "function") return;
  alvo.scrollIntoView({ ...opcoes, behavior: comportamentoDoRolo() });
}

/**
 * O mesmo para a janela — o `scrollBy` que o `AdminLogin` faz para seguir o
 * teclado do telemóvel. Mesma pergunta, mesma resposta, outro sujeito.
 */
export function rolarAJanela(opcoes: Omit<ScrollToOptions, "behavior">): void {
  if (typeof window === "undefined") return;
  window.scrollBy({ ...opcoes, behavior: comportamentoDoRolo() });
}

/**
 * ── ATÉ SE VER INTEIRO, POR CIMA DA BARRA DE BAIXO ──────────────────────────
 *
 * Para o que NASCE por baixo do que se tocou (o resumo do dia no calendário, a
 * linha de escrever uma tarefa): se o fundo dele fica por baixo da barra fixa
 * de baixo — dita pelo `scroll-margin-bottom` do próprio alvo —, sobe o
 * mínimo para o fundo assentar por cima dela. Se já se vê, não mexe.
 *
 * Não é o `block: "nearest"` porque esse, MEDIDO num Chromium (auditoria do
 * telemóvel de 14/11), parava 40 px antes: com o alvo a 975 px e uma margem de
 * 98, o `nearest` deixava o fundo a 606 num ecrã de 664 — por baixo da barra.
 * O `end` respeita a margem, e é a conta que aqui se faz à mão primeiro.
 *
 * Quando o alvo é mais alto do que o que sobra, encosta-se o TOPO (o princípio
 * é o que interessa ler primeiro).
 */
export function rolarAteCaberPorCima(alvo: Element | null | undefined): void {
  if (!alvo || typeof window === "undefined") return;
  const r = alvo.getBoundingClientRect();
  const estilo = getComputedStyle(alvo);
  const chao = window.innerHeight - (parseFloat(estilo.scrollMarginBottom) || 0);
  if (r.bottom <= chao + 0.5) return;
  // O que sobra entre o que está colado em cima (o `scroll-margin-top`) e a barra.
  const sobra = chao - (parseFloat(estilo.scrollMarginTop) || 0);
  rolarAteVer(alvo, { block: r.height > sobra ? "start" : "end" });
}
