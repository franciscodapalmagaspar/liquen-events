/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TOQUE QUE FECHA UM MENU SÓ FECHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Revisão de 14/11: com o menu de contexto do calendário aberto (toque longo
 * num dia), um toque curto NOUTRO dia fechava o menu E abria «Novo no
 * calendário» — o `pointerdown` fechava, e o `click` que vem a seguir seguia
 * para o dia como se não houvesse menu. Com rato era igual, e no «⋯ Acções»
 * das tarefas também: clicar noutra linha para fechar o menu abria-a.
 *
 * É o que um menu do sistema faz (macOS, iOS): carregar fora FECHA, e mais
 * nada. Por isso, enquanto o menu está aberto, o `pointerdown` fora dele:
 *
 *   · fecha o menu;
 *   · não chega a mais ninguém (`stopPropagation` em captura, na janela —
 *     antes do React): nenhum toque longo começa, nenhum arrasto pega;
 *   · e o `click` que o browser manda a seguir é engolido.
 *
 * O `pointerdown` NÃO leva `preventDefault`: o dedo que pousa fora para rolar
 * a página continua a rolá-la (e o rolo já fecha o menu sozinho), e o foco vai
 * para onde se carregou, como antes.
 *
 * O clique engolido tem prazo: o iOS não manda `click` quando o dedo rolou, e
 * uma bandeira levantada para sempre engolia o próximo toque a sério. Cai no
 * próximo `pointerdown`, ou passado `PRAZO_MS`.
 *
 * O botão direito fora do menu fecha-o na mesma, e o `contextmenu` que vem a
 * seguir DESARMA o engolir: há menus que abrem pelo `contextmenu` com um
 * `click()` sintético (o «⋯» das tarefas), e esse clique tem de passar — o do
 * sítio novo abre, como no macOS (2.ª revisão de 14/11).
 *
 * «Só fecha» vale para o `pointerdown` e o `click`. O `mousedown` e o
 * `pointerup` que vêm a seguir continuam a chegar (ex.: o fundo de uma folha
 * que fecha com `onMouseDown`), como antes desta peça.
 */

/** Quanto tempo o clique que vem depois do toque que fechou é dele. */
export const PRAZO_MS = 1000;

let largarOEngolir: (() => void) | null = null;

/** Engole o próximo `click` (só um), até ao próximo `pointerdown` ou `PRAZO_MS`. */
function engolirOProximoClique() {
  largarOEngolir?.();
  const engolir = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    largar();
  };
  // Em captura também, mas registado DEPOIS do `pointerdown` que o armou —
  // portanto o pointerdown desse mesmo toque não o deita abaixo (já passou).
  const largar = () => {
    window.removeEventListener("click", engolir, true);
    window.removeEventListener("pointerdown", largar, true);
    window.removeEventListener("contextmenu", largar, true);
    clearTimeout(prazo);
    if (largarOEngolir === largar) largarOEngolir = null;
  };
  const prazo = setTimeout(largar, PRAZO_MS);
  window.addEventListener("click", engolir, true);
  window.addEventListener("pointerdown", largar, true);
  window.addEventListener("contextmenu", largar, true);
  largarOEngolir = largar;
}

/**
 * Ouve o `pointerdown` fora de um menu aberto. `dentro` diz o que conta como o
 * menu (o painel, e o botão que o abre, quando o abre e fecha). Devolve a
 * função que deixa de ouvir — para o `return` de um `useEffect`.
 */
export function fecharSoAoTocarFora(
  dentro: (alvo: Node) => boolean,
  aoFechar: (e: PointerEvent) => void,
): () => void {
  const aoPousar = (e: PointerEvent) => {
    const alvo = e.target as Node | null;
    if (!alvo || dentro(alvo)) return;
    e.stopPropagation();
    engolirOProximoClique();
    aoFechar(e);
  };
  window.addEventListener("pointerdown", aoPousar, true);
  return () => window.removeEventListener("pointerdown", aoPousar, true);
}
