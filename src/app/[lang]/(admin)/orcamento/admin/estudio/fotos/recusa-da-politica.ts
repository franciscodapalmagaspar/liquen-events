"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO NÃO É A FOTOGRAFIA — É O SÍTIO QUE NÃO A DEIXA APARECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma célula que não desenha nada podia ser três coisas (ver os «três estados»
 * mais abaixo); afinal são quatro, e a quarta é de outra natureza.
 *
 * A `Content-Security-Policy` deste sítio traz uma directiva `img-src`, e ela
 * nomeia de onde é que uma imagem pode vir. Quando a origem do Storage não está
 * na lista, o browser RECUSA a fotografia — e recusa-a antes de a pedir. Não há
 * pedido, não há código de estado, não há linha no painel de rede e não há nada
 * para o servidor registar: do lado do JavaScript o único sinal é o `onerror`
 * do `<img>`, exactamente igual ao de um 404. Foi assim que uma proposta com as
 * fotografias todas guardadas e a sair bem no PDF apareceu no telemóvel dela
 * com nove células a dizer «Não consegui mostrá-la neste ecrã».
 *
 * As duas avarias têm donos e remédios OPOSTOS — uma resolve-se com um botão de
 * tentar outra vez, a outra nunca, por mais vezes que se carregue — e por isso
 * não podem dizer a mesma frase. Um «Tentar novamente» que vai falhar sempre da
 * mesma maneira é uma promessa vazia, e é pior do que não haver botão nenhum.
 *
 * ── COMO É QUE SE SABE ────────────────────────────────────────────────────
 * O browser diz, e ninguém o ouvia: `document.addEventListener(
 * "securitypolicyviolation", …)`. MEDIDO no Chromium, com `img-src 'self'
 * data:` e duas imagens de outra origem: dois eventos, `violatedDirective` e
 * `effectiveDirective` os dois `"img-src"`, e o `blockedURI` INTEIRO — caminho
 * e token incluídos.
 *
 * ── E CASA-SE POR ORIGEM, NÃO POR URL ─────────────────────────────────────
 * Porque o `blockedURI` inteiro é o caso do Chromium, e não a regra: a norma
 * deixa o browser entregá-lo cortado à origem (é o que o WebKit faz em vários
 * casos, e o telemóvel dela é um iPhone). Casar por URL completo funcionaria na
 * máquina onde isto se mediu e falhava calado onde interessa. A origem é o que
 * os dois formatos têm em comum, e chega: quem recusa uma fotografia do Storage
 * recusa-as todas.
 *
 * E se nem a origem der para ler (um `blockedURI` vazio, ou o literal
 * `"self"`), fica a marca sem morada — e aí é o ECRÃ inteiro que passa a dizer
 * isto, em vez de uma célula. Uma célula morta ao mesmo tempo que o browser
 * anuncia uma recusa de `img-src` é a mesma avaria com altíssima probabilidade;
 * calar-se seria voltar à frase errada, que é o defeito que isto veio corrigir.
 *
 * Vive fora do React, como a fila das imagens e pela mesma razão: o evento é do
 * documento, é um só, e um ouvinte por célula numa grelha de vinte e quatro
 * eram vinte e quatro ouvintes para a mesma notícia.
 */
const origensRecusadasPelaPolitica = new Set<string>();

/** Houve uma recusa de `img-src` que não deu para atribuir a uma origem. */
let houveRecusaSemMorada = false;

const ouvintesDaRecusa = new Set<() => void>();

let escutaDaPoliticaLigada = false;

function origemDe(url: string | undefined): string {
  if (!url || typeof window === "undefined") return "";
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return "";
  }
}

function ligarEscutaDaPolitica(): void {
  if (escutaDaPoliticaLigada || typeof document === "undefined") return;
  escutaDaPoliticaLigada = true;
  document.addEventListener("securitypolicyviolation", (e) => {
    // `effectiveDirective` é o nome moderno e `violatedDirective` o antigo; os
    // browsers não concordam sobre qual preenchem, e um deles pode vir com a
    // lista de origens colada («img-src 'self' data:»). Daí o `startsWith`.
    const directiva = e.effectiveDirective || e.violatedDirective || "";
    if (!directiva.startsWith("img-src")) return;
    const origem = origemDe(e.blockedURI);
    if (origem && origem !== window.location.origin) origensRecusadasPelaPolitica.add(origem);
    else houveRecusaSemMorada = true;
    for (const avisar of ouvintesDaRecusa) avisar();
  });
}

function subscreverRecusa(avisar: () => void): () => void {
  ligarEscutaDaPolitica();
  ouvintesDaRecusa.add(avisar);
  return () => {
    ouvintesDaRecusa.delete(avisar);
  };
}

/** Esta fotografia foi recusada pelas regras do próprio sítio? */
export function useRecusaDaPolitica(url?: string): boolean {
  const ler = useCallback(
    () => houveRecusaSemMorada || origensRecusadasPelaPolitica.has(origemDe(url)),
    [url],
  );
  // No servidor não há política nem recusa nenhuma — e não pode haver desencontro
  // de hidratação por causa disto.
  return useSyncExternalStore(subscreverRecusa, ler, () => false);
}
