/**
 * ════════════════════════════════════════════════════════════════════════════
 * ARRASTAR FOTOGRAFIAS DE UM TEMA PARA OUTRO — as contas, sem desenho nenhum
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 08 do `docs/APPLE-TEMAS.md`, ponto 22 da auditoria: «não se arrasta uma
 * fotografia de um tema para outro — é a operação mais natural desta biblioteca
 * e não existe.»
 *
 * O que vive aqui é o que se pode provar sem browser: o que viaja no arrasto,
 * quantas fotos ele leva, se um destino é válido, e as frases que o
 * `role="status"` anuncia. O desenho — a coluna da esquerda, o crachá, o
 * regresso animado — vive no `ListaDeTemas.tsx` e no `Temas.tsx`.
 *
 * ── PORQUE É QUE O TIPO MIME É NOSSO E NÃO `text/plain` ────────────────────
 *
 * Porque a MESMA grelha já usa `text/plain` para outra coisa: reordenar fotos
 * DENTRO do tema escreve lá o índice de origem. Um destino que aceitasse
 * `text/plain` passava a aceitar também um pedaço de texto arrastado do
 * Chrome, e a reordenação passava a parecer uma mudança de tema. Um tipo
 * próprio é o que faz `dataTransfer.types.includes(...)` responder à pergunta
 * certa: «isto que vem a caminho é um lote de fotografias desta biblioteca?».
 *
 * O `dataTransfer` só deixa LER os dados no `drop` (durante o `dragover` a
 * lista de tipos está lá, os valores não). Por isso a decisão de aceitar
 * faz-se pelo TIPO, e a de agir pelo conteúdo — e é por isso que há duas
 * funções e não uma.
 */

/** O tipo que identifica um lote de fotografias desta biblioteca. */
export const TIPO_DE_CARGA = "application/x-liquen-fotos";

/** O que viaja no arrasto. */
export interface CargaDeFotos {
  /** O tema de onde as fotos saem. É ele que diz se um destino é válido. */
  origem: string;
  /** Os caminhos no Storage, pela ordem da grelha. */
  paths: string[];
}

/**
 * QUANTAS FOTOS VIAJAM QUANDO SE PEGA NUMA.
 *
 * «Agrupar arrasto múltiplo com badge do número.» [APPLE] A regra que todos os
 * gestores de ficheiros partilham, e que é preciso escrever porque a
 * alternativa é tentadora: pegar numa foto que ESTÁ na selecção leva a selecção
 * INTEIRA; pegar numa que não está leva só essa — e não desfaz a selecção, que
 * é trabalho dela e não se deita fora por um gesto que pode ser um engano.
 *
 * Devolve os caminhos pela ordem da GRELHA (a de `todas`), e não pela ordem por
 * que ela clicou: é assim que a contagem do crachá e a lista que chega ao
 * servidor se lêem como o que está no ecrã.
 */
export function fotosQueViajam(
  path: string,
  seleccionadas: ReadonlySet<string>,
  todas: readonly string[],
): string[] {
  if (!seleccionadas.has(path)) return [path];
  const lote = todas.filter((p) => seleccionadas.has(p));
  // Uma selecção que já não contém nada da grelha à vista (fotos removidas
  // noutro separador) não pode transformar o arrasto em nada: leva a foto que
  // ela pegou, que é o gesto que fez.
  return lote.length > 0 ? lote : [path];
}

/**
 * Este destino aceita esta carga?
 *
 * «Mostrar sinal de aceitação SÓ sobre um destino válido.» [APPLE] Um tema não
 * é destino de si próprio — largar as fotos onde elas já estão não é uma
 * operação, é um engano —, e um lote vazio não vai a lado nenhum.
 */
export function destinoValido(carga: CargaDeFotos | null, destino: string): boolean {
  return !!carga && carga.paths.length > 0 && carga.origem !== destino;
}

/**
 * ── QUANTO TEMPO SE SEGURA UM TEMA ANTES DE ELE ABRIR ──────────────────────
 *
 * «Spring loading: manter sobre um tema ~1 s abre-o.» [APPLE] Um segundo, e
 * não menos: abaixo disso o gesto de ATRAVESSAR a lista para chegar ao tema de
 * baixo passa a abrir os três temas do caminho.
 */
export const SPRING_LOADING_MS = 1000;

/** «3 fotografias» / «1 fotografia» — a contagem escrita como se fala. */
function fotografias(n: number): string {
  return `${n} ${n === 1 ? "fotografia" : "fotografias"}`;
}

/**
 * O que o `role="status"` anuncia depois de um arrasto que correu bem.
 *
 * «Sempre com Anular, e anunciado em role="status": "3 fotografias movidas
 * para Bouquets Campestres."» — Parte 4 do documento, à letra.
 */
export function fraseDoMovimento(quantas: number, destino: string): string {
  return `${fotografias(quantas)} ${quantas === 1 ? "movida" : "movidas"} para «${destino}».`;
}

/** E o que se anuncia quando o arrasto não levou nada — a mesma região, para
 *  quem ouve o ecrã não ficar à espera de uma frase que nunca chega. */
export function fraseDeMovimentoFalhado(quantas: number, destino: string): string {
  return `Não foi possível mover ${fotografias(quantas)} para «${destino}». Continuam onde estavam.`;
}

/** E o que se anuncia ao ANULAR — o resultado, e não só o nome da acção.
 *  «Permitir desfazer sempre, rotulando a ação e mostrando o resultado.» */
export function fraseDoRegresso(quantas: number, origem: string): string {
  return `${fotografias(quantas)} de volta a «${origem}».`;
}

/**
 * ── ESCREVER E LER A CARGA ────────────────────────────────────────────────
 *
 * Nenhuma das duas lança. O `dataTransfer` é uma API que recusa escritas fora
 * do handler certo e devolve strings vazias quando o browser decidiu não
 * partilhar nada — e um arrasto que rebenta a meio deixa o ecrã com uma
 * fotografia meio transparente e nenhuma explicação.
 *
 * Vai também em `text/plain`, com os nomes por extenso: é o que faz largar um
 * lote numa nota do Mail ou num campo de texto escrever alguma coisa em vez de
 * nada. Não é o canal que a lista lê — esse é o `TIPO_DE_CARGA`.
 */
export function escreverCarga(dt: DataTransfer | null, carga: CargaDeFotos): void {
  if (!dt) return;
  try {
    dt.setData(TIPO_DE_CARGA, JSON.stringify(carga));
  } catch {
    // Um browser que recuse um tipo próprio deixa o arrasto de reordenar
    // intacto — é ele que escreve o `text/plain` a seguir.
  }
}

export function lerCarga(dt: DataTransfer | null): CargaDeFotos | null {
  if (!dt) return null;
  let cru = "";
  try {
    cru = dt.getData(TIPO_DE_CARGA);
  } catch {
    return null;
  }
  if (!cru) return null;
  try {
    const dados = JSON.parse(cru) as Partial<CargaDeFotos>;
    if (typeof dados?.origem !== "string" || !Array.isArray(dados?.paths)) return null;
    const paths = dados.paths.filter((p): p is string => typeof p === "string" && p.length > 0);
    return paths.length > 0 ? { origem: dados.origem, paths } : null;
  } catch {
    return null;
  }
}

/** Vem aí um lote de fotografias? Responde-se pelo TIPO, que é a única coisa
 *  que o `dragover` deixa ver — ver a nota do cabeçalho. */
export function trazFotos(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  try {
    return Array.from(dt.types ?? []).includes(TIPO_DE_CARGA);
  } catch {
    return false;
  }
}
