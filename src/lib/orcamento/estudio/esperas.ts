/*
 * Quanto tempo se diz que uma tradução ou uma cópia de fotografias vai demorar.
 * Saiu do `ProposalStudio.tsx` tal e qual (fase 3 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO DEMORA UMA TRADUÇÃO — E PORQUE É QUE ISTO É UM PALPITE E NÃO UMA CONTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A espera da tradução é OPACA vista daqui, e não por preguiça: o estúdio faz
 * UM pedido à rota (`motorPelaRota` só parte em vários acima de 300 campos, e
 * uma proposta pesada tem ~218). Os lotes de 50 que se veem no código são do
 * outro lado da rota — é o motor do serviço que os manda, um a seguir ao
 * outro, e do lado de cá não há nenhum sinal de que o terceiro acabou.
 *
 * Partir o pedido aqui para poder contar os lotes seria trocar um pedido por
 * cinco: mais viagens na rede dela para desenhar uma barra. Uma animação que
 * atrasa a tarefa que retrata não se faz, e por isso isto fica um palpite.
 *
 * O palpite, escrito para poder ser corrigido: uma ida à rota mais a resposta
 * do serviço rondam o segundo, e cada lote de 50 campos que o serviço manda a
 * seguir custa outro tanto. Sobra por cima do que se mede num portátil, porque
 * quem espera está numa quinta com 4G — e a curva do `EmCurso` perdoa um erro
 * de dois para um: o que ela não perdoa é uma barra que chega ao fim e fica lá.
 */
const TRADUCAO_MS_FIXOS = 800;

const TRADUCAO_MS_POR_LOTE = 1_500;

/** O tamanho do lote do motor do serviço (`MAX_TEXTOS_POR_PEDIDO`, no DeepL). */
const TRADUCAO_CAMPOS_POR_LOTE = 50;

/** Quanto tempo, mais ou menos, traduzir `campos` campos de prosa. */
export function esperaDaTraducao(campos: number): number {
  const lotes = Math.max(1, Math.ceil(Math.max(0, campos) / TRADUCAO_CAMPOS_POR_LOTE));
  return TRADUCAO_MS_FIXOS + TRADUCAO_MS_POR_LOTE * lotes;
}

/**
 * Quanto demora copiar `fotos` fotografias de um modelo para este pedido.
 *
 * Também opaca, e também um pedido só (`/api/propostas/copiar`): o servidor
 * copia OITO de cada vez (`EM_PARALELO`, em `proposal-storage`), cada foto são
 * duas cópias no armazenamento — o original e a miniatura —, e nada disso é
 * observável daqui. O palpite é essa aritmética, com a folga de sempre para a
 * rede de quem espera.
 */
const COPIA_FOTOS_EM_PARALELO = 8;

export function esperaDaCopiaDeFotos(fotos: number): number {
  const lotes = Math.max(1, Math.ceil(Math.max(0, fotos) / COPIA_FOTOS_EM_PARALELO));
  return 900 + 1_500 * lotes;
}
