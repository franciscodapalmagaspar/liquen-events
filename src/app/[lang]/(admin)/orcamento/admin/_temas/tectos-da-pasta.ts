/**
 * Os tectos da pasta de um tema: quantos pedidos em voo, quantos lotes de
 * miniaturas, quanto se espera antes de adivinhar. Saíram do topo do
 * `Temas.tsx` (fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`), tal e qual — são
 * custo (rede, Supabase) e mudam com a política, não com o desenho.
 */

/**
 * Quantos carregamentos em voo ao mesmo tempo.
 *
 * Quatro, e não mais: cada pedido leva um JPEG de ~3 MB, por isso o gargalo é
 * o canal de SUBIDA (uma ligação doméstica sobe ~10–20 Mbit/s). Mais ligações
 * não somam largura de banda — repartem a mesma —, e cada uma paga o seu pico
 * de memória (a bitmap descodificada + os canvas). Quatro, e não menos:
 * preparar a foto seguinte (descodificar + redimensionar + codificar) é
 * trabalho de CPU no fio principal, e é durante essa preparação que as outras
 * três mantêm o canal cheio. O browser abre ~6 ligações por servidor em
 * HTTP/1.1; deixar duas de fora mantém a grelha e as miniaturas a responder
 * enquanto um lote de 300 fotos sobe.
 */
export const UPLOAD_CONCURRENCY = 4;

/** Remoções em voo ao mesmo tempo (pedidos vazios: mais folga do que a subida). */
export const DELETE_CONCURRENCY = 6;

/**
 * Quantos ficheiros são lidos ao mesmo tempo para lhes calcular a impressão
 * digital.
 *
 * O `crypto.subtle.digest` não bloqueia o fio principal (o browser resolve-o
 * fora dele) e é barato ao lado do resto — MEDIDO em Chromium nesta caixa:
 * 42,9 ms numa foto de 8,1 MB (181 MB/s), contra 337 ms para PREPARAR a mesma
 * foto. O que aqui se limita não é o CPU, é a MEMÓRIA: cada ficheiro tem de
 * estar inteiro em `ArrayBuffer` para ser resumido, e um arrasto de 300 fotos
 * de 8 MB lidas de uma vez seriam 2,4 GB. Quatro em voo são ~32 MB de pico — o
 * mesmo teto de quatro que os carregamentos já usam, pela mesma razão.
 */
export const FINGERPRINT_CONCURRENCY = 4;

/**
 * Quanto tempo se espera antes de ir buscar a página seguinte.
 *
 * A primeira página tem de chegar primeiro — pedir as duas ao mesmo tempo era
 * fazer exatamente o que este trabalho todo veio corrigir. Medido, uma página
 * de miniaturas fica no ecrã em ~350 ms; um segundo e meio é depois disso com
 * folga, e continua a ser muito antes de ela chegar ao fundo da grelha.
 */
export const PREFETCH_DELAY_MS = 1500;

/** Quantas fotos do lote entram na grelha já com a imagem local à vista.
 *  Mostrar as 300 de uma vez obrigava o navegador a descodificar 300 fotos de
 *  12 MP para desenhar quadrados de 150 px; as restantes ganham a
 *  pré-visualização quando a sua miniatura é gerada (que é logo a seguir). */
export const PREVIEW_EAGER = 12;

/** Teto de lotes de uma passagem de miniaturas (8 fotos por lote): trava um
 *  ciclo infinito se o servidor devolver sempre o mesmo cursor. */
export const MAX_THUMB_BATCHES = 2000;

/** Lotes seguidos sem gerar nada (e com falhas) antes de desistir: a esta
 *  altura o problema é o Storage, não as fotos. */
export const MAX_BAD_BATCHES = 3;

/** Quantas páginas já mostradas se voltam a pedir no fim da geração de
 *  miniaturas, para a grelha passar a mostrar as novas. */
export const MAX_REFRESH_PAGES = 5;
