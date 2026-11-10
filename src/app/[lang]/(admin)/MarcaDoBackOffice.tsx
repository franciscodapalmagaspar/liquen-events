"use client";

import { useEffect } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O `<body>` SABE QUE É O BACK OFFICE — SEM `:has()` (10/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (9/11): «a parte dos pagamentos quando se carrega num cliente está super
 * travada». MEDIDO no build de produção (40 clientes inventados, processador
 * 4× mais lento): abrir um cliente fazia o browser recalcular o estilo da
 * página INTEIRA quatro vezes (~2 500 elementos, ~240 ms ao todo). A causa
 * eram as 43 regras `body:has([data-admin-mode]) …` do `admin.css`: com um
 * `:has()` no `<body>`, cada elemento que entra ou sai da página obriga o
 * browser a voltar a perguntar «o body ainda tem um [data-admin-mode]?» — e a
 * redesenhar o estilo de tudo o que depende disso. Sem elas: ~88 ms.
 *
 * As regras passam a ler uma CLASSE no `<body>` (`.bo`), que é posta:
 *  - no HTML, por um guião de uma linha logo no início do `<main>` deste grupo
 *    (`GUIAO_DA_MARCA`), antes da primeira pintura — o mesmo que o `:has()`
 *    garantia, porque o `[data-admin-mode]` também vinha no HTML;
 *  - e tirada aqui ao sair do back office por navegação no browser (o `<body>`
 *    é o da raiz e fica), para o estilo do back office não ficar colado ao
 *    sítio público.
 *
 * NÃO é a `admin-mode`: essa continua a entrar só depois de o React hidratar,
 * e os passeios usam-na como sinal disso (AGENTS.md).
 *
 * A aparência (claro/escuro) viaja para o `<body>` pelo mesmo caminho: as
 * regras `body:has([data-admin-mode][data-aparencia=…])` passaram a
 * `body:is(.bo, .admin-mode)[data-aparencia=…]`, com a MESMA especificidade.
 */
export function MarcaDoBackOffice() {
  useEffect(() => {
    const b = document.body;
    b.classList.add("bo");
    return () => {
      b.classList.remove("bo");
      b.removeAttribute("data-aparencia");
    };
  }, []);
  return null;
}
