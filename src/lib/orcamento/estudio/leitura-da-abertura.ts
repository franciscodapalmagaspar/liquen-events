/**
 * ════════════════════════════════════════════════════════════════════════════
 * SEM O RASCUNHO DO SERVIDOR LIDO, O ESTÚDIO NÃO GRAVA SOZINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A gravação leva o carimbo da versão que leu (`baseUpdatedAt`), e é por ele
 * que o servidor sabe que alguém gravou entretanto — e guarda a outra versão
 * na gaveta em vez de a esmagar. Antes de a leitura da abertura responder, ou
 * quando ela falhou, esse carimbo é `null`: uma gravação nessa altura escreve
 * por cima do que lá estiver, sem gaveta nenhuma.
 *
 * E havia uma que saía SOZINHA: abrir com um rascunho neste navegador corrige-o
 * ao restaurar (identificadores, a referência, o preço do pedido), e as
 * correções agendavam a gravação dos 800 ms. Com a leitura lenta ou falhada,
 * esse PUT ia às cegas — e podia apagar uma versão mais recente feita noutro
 * dispositivo sem ninguém ter tocado em nada (o teste «não reenvia às cegas
 * quando nem sequer se conseguiu ler o servidor», que só olhava para os
 * primeiros 300 ms; com 800 ms ou a máquina carregada, ficava vermelho).
 *
 * A regra: enquanto a leitura não tiver respondido bem, o que muda no ecrã sem
 * um gesto dela é tratado como a abertura — não se grava. Ao primeiro gesto
 * (uma tecla, um toque, colar, largar), grava-se como sempre: trabalho dela
 * nunca fica por gravar à espera de uma rede que pode não voltar. E quando a
 * leitura responde, as correções do restauro gravam-se, já com o carimbo certo.
 */

/** Em que pé está a leitura do rascunho do servidor, ao abrir o estúdio. */
export type LeituraDaAbertura = "a-caminho" | "lida" | "falhou";

/**
 * O estúdio espera por ela antes de gravar sozinho? Só enquanto a leitura não
 * respondeu bem E ela ainda não fez nenhum gesto no ecrã.
 */
export function esperaPorElaParaGravar(leitura: LeituraDaAbertura, houveGesto: boolean): boolean {
  return leitura !== "lida" && !houveGesto;
}
