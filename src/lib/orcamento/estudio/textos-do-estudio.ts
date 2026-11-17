/*
 * As frases do estúdio: o estado da gravação e o número do total. O que o PDF
 * não leva vive em `conteudo-incompleto.ts`, ao lado.
 *
 * Saiu tal e qual do `ProposalStudio.tsx` (fase 1 de `docs/ESTRUTURA-DO-CODIGO.md`);
 * o componente reexporta o que já exportava, para nenhum chamador mudar.
 */
import { quandoGravado } from "@/lib/quando-gravado";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS ESTADOS DO INDICADOR DE GRAVAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tinha dois — «a guardar…» e «guardado às 14:32» — e o segundo era dito
 * também quando a gravação no servidor tinha falhado, porque a cópia local
 * tinha corrido bem e mais nada era verificado. «Guardado» é a palavra que faz
 * uma pessoa fechar o portátil descansada, e foi exactamente isso que
 * aconteceu: uma proposta inteira ficou num `localStorage` e o ecrã disse, o
 * tempo todo, que estava guardada.
 *
 * O terceiro estado tem de ser LIDO, não decifrado. Por isso não é um visto de
 * outra cor: são as palavras «só neste computador», por extenso, também no
 * telemóvel — é a única forma de a informação mudar o que a pessoa faz a
 * seguir.
 */
/**
 * ── E O QUARTO, QUE É O DO DEPLOYMENT ─────────────────────────────────────
 *
 * `nao-dura-ao-deploy` é o desfecho do meio, e não é uma subtileza: a gravação
 * CHEGOU ao servidor (não é `so-neste-computador` — noutro computador a
 * proposta abre), e mesmo assim o próximo deploy leva-a, porque em produção sem
 * base de dados o rascunho fica no disco da função.
 *
 * Precisa de palavras próprias exactamente por isso. «Guardado» era falso pelo
 * lado do tempo, e «só neste computador» seria falso pelo lado do sítio —
 * mandaria alguém copiar o trabalho para outra máquina, que é o gesto que não
 * resolve nada aqui.
 */
export type EstadoDaGravacaoNoEcra =
  | "a-guardar"
  | "so-neste-computador"
  | "nao-dura-ao-deploy"
  | "guardado";

export function textoDaGravacao(
  estado: EstadoDaGravacaoNoEcra,
  gravadoEm: Date | null,
): { curto: string; longo: string; leitor: string } {
  if (estado === "a-guardar") {
    return { curto: "…", longo: "a guardar…", leitor: "a guardar" };
  }
  const horas = gravadoEm ? quandoGravado(gravadoEm) : "";
  if (estado === "so-neste-computador") {
    // A hora entra na frase porque a pergunta seguinte dela é sempre «desde
    // quando?» — é o que lhe diz quanto trabalho está em risco.
    return {
      curto: "⚠ guardado só neste computador",
      longo: horas ? `guardado só neste computador às ${horas}` : "guardado só neste computador",
      leitor: "atenção: o rascunho está guardado só neste computador e não chegou ao servidor",
    };
  }
  if (estado === "nao-dura-ao-deploy") {
    // A hora fica, como no estado de cima e pela mesma razão. O que muda é a
    // segunda metade da frase: o problema não é ONDE está, é ATÉ QUANDO.
    return {
      curto: "⚠ guardado até ao próximo deploy",
      longo: horas
        ? `guardado às ${horas}, num sítio que o próximo deploy apaga`
        : "guardado num sítio que o próximo deploy apaga",
      leitor: "atenção: o rascunho está guardado num sítio que o próximo deploy apaga",
    };
  }
  return { curto: "✓", longo: `guardado às ${horas}`, leitor: "rascunho guardado no servidor" };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NÚMERO ESCRITO NO CAMPO DO TOTAL — COM VÍRGULA, SEMPRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo do total é TEXTO (aceita «1.500» e «1 500 €» a meio de serem
 * escritos) e é relido com `parseMoneyText`, que segue o português: o ponto é
 * separador de MILHARES, a vírgula é o decimal.
 *
 * Quem escrevia neste campo por código usava `String(n)`, e o JavaScript
 * escreve os decimais com PONTO. `String(3355.98)` dava «3355.98», que
 * `parseMoneyText` relê como 335 598 — cem vezes mais. Media-se assim:
 *
 *     parseMoneyText(String(3355.98))  →  335598
 *     parseMoneyText("3355,98")        →  3355.98
 *
 * Aconteceu de verdade no botão «Usar X €»: com uma proposta de 2.460,00 € e
 * uma deslocação de 75,00 € lida com IVA incluído, a sugestão é 3.355,98 € e o
 * campo ficava com 335.598,00 € — e esse número seguia para o preço final do
 * pedido, para o sinal e para a fatura. O mesmo valia para qualquer total com
 * cêntimos escrito por um valor adicional, por uma versão reposta ou por uma
 * proposta copiada.
 *
 * Um número inteiro sai como sempre saiu («2460»), para não mudar o que ela vê
 * no caso normal.
 */
export function textoDoTotal(base: number): string {
  return Number.isInteger(base) ? String(base) : String(base).replace(".", ",");
}
