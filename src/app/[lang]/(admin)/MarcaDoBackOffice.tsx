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
 *
 * ── O `<main>` MANDA, O `<body>` COPIA ──────────────────────────────────
 *
 * A aparência continua a viver no `[data-admin-mode]` (é lá que o servidor a
 * escreve e que o `EscolherAparencia` a muda). O `<body>` copia-a, e um
 * `MutationObserver` só sobre esse atributo desse elemento mantém a cópia
 * certa: o guião do HTML não corre numa navegação dentro da aplicação (um
 * `<script>` posto pelo React não se executa), e quem mude o atributo do
 * `<main>` — o interruptor, ou um passeio — não tem de saber do `<body>`.
 * Uma escrita por mudança de aparência: nada que se meça.
 */
export function copiarAparencia(origem: Element | null, b: HTMLElement): void {
  const a = origem?.getAttribute("data-aparencia");
  if (a === "claro" || a === "escuro") b.setAttribute("data-aparencia", a);
  else b.removeAttribute("data-aparencia");
}

export function MarcaDoBackOffice() {
  useEffect(() => {
    const b = document.body;
    b.classList.add("bo");
    const origem = document.querySelector("[data-admin-mode]");
    copiarAparencia(origem, b);
    const vigia = new MutationObserver(() => copiarAparencia(origem, b));
    if (origem) vigia.observe(origem, { attributes: true, attributeFilter: ["data-aparencia"] });
    return () => {
      vigia.disconnect();
      b.classList.remove("bo");
      b.removeAttribute("data-aparencia");
    };
  }, []);
  return null;
}
