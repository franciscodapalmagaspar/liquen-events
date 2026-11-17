/**
 * O crachá do número que acompanha o arrasto de várias fotografias.
 * (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CRACHÁ DO NÚMERO — o que se vê debaixo do ponteiro num arrasto múltiplo
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Arrasto múltiplo agrupado com BADGE OVAL DO NÚMERO.» [APPLE], Parte 4 do
 * `docs/APPLE-TEMAS.md`.
 *
 * Sem isto, pegar em quarenta fotografias arrasta a imagem de UMA — e o que se
 * vê debaixo do ponteiro é indistinguível de arrastar uma só. O número é a
 * única coisa que diz quantas vão a caminho antes de se largar.
 *
 * ── PORQUE É QUE O NÓ VIVE FORA DO ECRÃ E MORRE A SEGUIR ──────────────────
 *
 * O `setDragImage` tira uma FOTOGRAFIA do elemento no instante da chamada, mas
 * a especificação exige que ele ainda esteja no documento nesse instante —
 * `display: none` ou um nó solto dão um arrasto sem imagem nenhuma. Por isso
 * ele entra no documento, é fotografado, e sai no próximo turno da fila de
 * tarefas, que é o primeiro momento em que já não faz falta.
 *
 * `translate(-100%)` e não `left: -9999px`: em `rtl` o segundo empurra o
 * documento para o lado e o browser mostra uma barra de deslocamento durante
 * um fotograma.
 */
export function vestirOArrasto(e: React.DragEvent, quantas: number): void {
  // Uma foto arrasta-se a si própria — a imagem que o browser faz da célula é
  // melhor do que qualquer coisa que se desenhe aqui, e é a da Apple.
  if (quantas <= 1) return;
  const dt = e.dataTransfer;
  if (typeof dt?.setDragImage !== "function" || typeof document === "undefined") return;
  const celula = e.currentTarget as HTMLElement;
  const cracha = document.createElement("div");
  cracha.setAttribute("aria-hidden", "true");
  cracha.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "transform:translate(-100%,-100%)",
    "pointer-events:none",
    "z-index:-1",
    `width:${Math.round(celula.offsetWidth || 120)}px`,
    `height:${Math.round(celula.offsetHeight || 90)}px`,
    "border-radius:8px",
    "background:var(--bo-surface)",
    "border:1px solid var(--bo-accent)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font:600 13px/1 system-ui,sans-serif",
  ].join(";");
  const oval = document.createElement("span");
  oval.textContent = String(quantas);
  // Cápsula, e não rectângulo: é um crachá de contagem, que é o único sítio
  // onde a Parte 4 da tabela de formas do sistema de design pede cápsula num
  // elemento pequeno.
  oval.style.cssText = [
    "min-width:28px",
    "padding:4px 8px",
    "border-radius:999px",
    "background:var(--bo-accent)",
    "color:#fff",
    "text-align:center",
  ].join(";");
  cracha.appendChild(oval);
  document.body.appendChild(cracha);
  try {
    dt.setDragImage(cracha, 12, 12);
  } catch {
    // Um browser que recuse a imagem faz o arrasto na mesma, com a dele.
  }
  window.setTimeout(() => cracha.remove(), 0);
}
