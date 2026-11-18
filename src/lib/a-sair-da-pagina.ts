/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA ESTÁ A SAIR? — PARA NÃO SE REGISTAR COMO FALHA O PEDIDO QUE O
 * PRÓPRIO BROWSER CORTOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ao recarregar (ou ao sair) a meio de um `fetch`, o Chrome rejeita-o com
 * `TypeError: Failed to fetch`. Não é a rede nem o servidor: é a página a ir-se
 * embora. Registado como aviso, aparecia na consola como erro a cada recarregar
 * do estúdio — e o passeio `caca/a02-editor-stress` (emojis e acentos) chumbava
 * com isso, porque exige a consola limpa. Uma consola com um erro falso é uma
 * consola onde o verdadeiro passa despercebido.
 *
 * O `pagehide` marca a saída (chega antes de o browser cortar os pedidos); o
 * `pageshow` desmarca-a (a página que volta da cache de trás/frente é a mesma,
 * viva outra vez). O `beforeunload` NÃO serve: pode ser cancelado (o travão de
 * «tem alterações por guardar»), e a página ficava a julgar-se de saída.
 */
let aSair = false;

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    aSair = true;
  });
  window.addEventListener("pageshow", () => {
    aSair = false;
  });
}

export function aPaginaEstaASair(): boolean {
  return aSair;
}
