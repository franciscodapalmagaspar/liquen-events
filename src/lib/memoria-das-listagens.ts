/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MEMÓRIA DAS LISTAGENS DE PASTAS — PARA QUEM DESENHA RASCUNHOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Revisão de 14/11 (2.ª), importante n.º 1. Cada página da pré-visualização
 * real (`pagina-do-rascunho`) pergunta ao armazenamento que fotografias já não
 * existem (`refsQueJaNaoExistem`): uma listagem por PASTA. O estúdio desenha
 * ~26 páginas ao abrir e até 5 por mudança — eram, no pior caso, ~150
 * listagens por minuto a editar uma proposta, onde no `main` eram zero.
 *
 * Duas coisas resolvem isso, e vivem aqui:
 *
 *   · uma MEMÓRIA de {@link MEMORIA_MS} por `bucket::pasta`, que só quem a pede
 *     lê e escreve — os rascunhos, a pré-visualização e o plano do estúdio. O
 *     travão do envio e a porta do casal perguntam sempre de fresco;
 *   · a pergunta EM CURSO partilhada (um mapa de promessas): as páginas
 *     desenhadas ao mesmo tempo esperam pela mesma listagem em vez de fazerem
 *     cada uma a sua.
 *
 * E esquece-se a pasta quando uma escrita a muda nesta instância — levar ou
 * trazer uma foto da Reciclagem, carregar, apagar (`invalidateThemeCount`):
 * as páginas ainda por desenhar já a mostram, sem esperar o prazo. As já
 * desenhadas também: a chave delas leva as que faltam (revisão de 14/11,
 * menor n.º 4 — `pagina-do-rascunho`).
 *
 * Sem `server-only` e sem importar nada: o `theme-storage` chama-o sem trazer
 * o motor do PDF atrás.
 */

/** Quanto vale uma listagem guardada. 3 min: um rascunho não precisa de mais fresco. */
export const MEMORIA_MS = 3 * 60_000;
/** Quanto se espera por uma listagem partilhada antes de a dar por «por confirmar». */
export const ESPERA_MAX_MS = 10_000;
/** Tecto de pastas guardadas — uma pasta por tema ou pedido; folga larga. */
const MAX_PASTAS = 500;

const memoria = new Map<string, { at: number; valor: unknown }>();
const emCurso = new Map<string, Promise<unknown>>();
const emCursoMarca = new Map<string, object>();
/**
 * Quando COMEÇOU cada pergunta em curso (pela marca). Só serve a quem pede
 * `desde` uma pergunta que começou depois disso: uma que começou antes da
 * mudança pode trazer a pasta de antes.
 */
const inicioDaPergunta = new WeakMap<object, number>();

/**
 * A folga para os relógios do navegador e do servidor não baterem certo
 * (3.ª revisão de 14/11, importante n.º 2): `desde` vem do relógio do
 * navegador, a memória do servidor. Uma listagem começada até 5 s antes do
 * instante pedido ainda serve.
 */
export const FOLGA_DO_RELOGIO_MS = 5_000;
/**
 * As respostas das perguntas POR FICHEIRO (`existeNaPasta`, nas pastas maiores
 * do que o tecto da listagem — revisão de 14/11, menor n.º 4): a mesma memória
 * de {@link MEMORIA_MS}, num mapa à parte (são pequenas, e não empurram as
 * listagens para fora). Esquecem-se com a pasta.
 */
const respostas = new Map<string, { at: number; valor: unknown }>();
const respostasEmCurso = new Map<string, Promise<unknown>>();
const respostasMarca = new Map<string, object>();
const MAX_RESPOSTAS = 2_000;

const chaveDe = (bucket: string, pasta: string) => `${bucket}::${pasta}`;
const chaveDaResposta = (bucket: string, pasta: string, nome: string) =>
  `${chaveDe(bucket, pasta)}\u0000${nome}`;

interface Loja {
  memoria: Map<string, { at: number; valor: unknown }>;
  emCurso: Map<string, Promise<unknown>>;
  marcas: Map<string, object>;
  maximo: number;
}
const LISTAGENS: Loja = { memoria, emCurso, marcas: emCursoMarca, maximo: MAX_PASTAS };
const RESPOSTAS: Loja = {
  memoria: respostas,
  emCurso: respostasEmCurso,
  marcas: respostasMarca,
  maximo: MAX_RESPOSTAS,
};

/**
 * `desde` (3.ª revisão de 14/11, importante n.º 2): o instante (ms, relógio do
 * navegador) em que uma foto entrou ou saiu da Reciclagem. Só serve uma
 * listagem guardada — ou uma em curso — que tenha COMEÇADO depois disso
 * (menos {@link FOLGA_DO_RELOGIO_MS}); senão lista agora e guarda por cima.
 *
 * O estúdio manda-o em TODOS os pedidos nos 3 min seguintes à mudança
 * (`usePaginaReal`), por isso cada instância renova a pasta UMA vez por
 * mudança — a primeira página que lá cai — e as seguintes lêem a memória
 * nova. Antes (`fresco=1`, 2.ª revisão) só renovava a instância que recebia o
 * primeiro pedido de cada página; as outras serviam a listagem velha.
 *
 * O `desde` só identifica a mudança: o instante que conta é aquele em que
 * esta instância o viu pela primeira vez (ver `primeiroVisto`), por isso um
 * relógio do navegador adiantado ou atrasado não muda nada.
 */
export interface OpcoesDaMemoria {
  desde?: number;
}

/**
 * Quando ESTA instância viu cada `desde` pela primeira vez (relógio do
 * servidor). O `desde` vem do relógio do navegador, que pode estar adiantado
 * ou atrasado; compará-lo com o relógio do servidor fazia uma de duas coisas
 * más (revisão de 14/11, 4.ª): adiantado, o limite andava com o «agora» e a
 * pasta relistava-se de 5 em 5 s durante 3 min; atrasado, servia-se a
 * listagem de antes da mudança. Ancorado no instante em que o servidor o viu,
 * cada `desde` renova a pasta UMA vez por instância, com qualquer desvio.
 */
const primeiroVisto = new Map<number, number>();
const MAX_DESDE = 500;
/** Um `desde` vive 3 min no navegador; aqui guarda-se um pouco mais. */
const VIDA_DO_DESDE_MS = 2 * MEMORIA_MS;

/** O instante a partir do qual uma listagem serve, ou `null` se qualquer uma serve. */
function limiteDe(opcoes: OpcoesDaMemoria, agora: number): number | null {
  const d = opcoes.desde;
  if (typeof d !== "number" || !Number.isFinite(d) || d <= 0) return null;
  let visto = primeiroVisto.get(d);
  if (visto === undefined || agora - visto > VIDA_DO_DESDE_MS) {
    for (const [k, v] of primeiroVisto) if (agora - v > VIDA_DO_DESDE_MS) primeiroVisto.delete(k);
    while (primeiroVisto.size >= MAX_DESDE) {
      const maisVelho = primeiroVisto.keys().next().value;
      if (maisVelho === undefined) break;
      primeiroVisto.delete(maisVelho);
    }
    visto = agora;
    primeiroVisto.set(d, visto);
  }
  return visto - FOLGA_DO_RELOGIO_MS;
}

/**
 * A listagem desta pasta: da memória, da pergunta que já está a correr, ou
 * pedida agora com `listar`. Só se guarda o que veio (`null` — «não se
 * conseguiu listar» — não se guarda: volta a perguntar-se da próxima vez).
 */
export function listagemComMemoria<T>(
  bucket: string,
  pasta: string,
  listar: () => Promise<T | null>,
  opcoes: OpcoesDaMemoria = {},
): Promise<T | null> {
  return comMemoria(LISTAGENS, chaveDe(bucket, pasta), listar, opcoes);
}

/** A resposta de uma pergunta por ficheiro nesta pasta, com a mesma memória. */
export function respostaComMemoria<T>(
  bucket: string,
  pasta: string,
  nome: string,
  perguntar: () => Promise<T | null>,
  opcoes: OpcoesDaMemoria = {},
): Promise<T | null> {
  return comMemoria(RESPOSTAS, chaveDaResposta(bucket, pasta, nome), perguntar, opcoes);
}

async function comMemoria<T>(
  loja: Loja,
  chave: string,
  listar: () => Promise<T | null>,
  opcoes: OpcoesDaMemoria,
): Promise<T | null> {
  const agora = Date.now();
  const limite = limiteDe(opcoes, agora);
  const serve = (inicio: number | undefined) =>
    limite === null || (inicio !== undefined && inicio >= limite);
  const ja = loja.memoria.get(chave);
  if (ja && agora - ja.at <= MEMORIA_MS && serve(ja.at)) return ja.valor as T;
  const corre = loja.emCurso.get(chave);
  const marcaQueCorre = loja.marcas.get(chave);
  if (corre && marcaQueCorre && serve(inicioDaPergunta.get(marcaQueCorre))) {
    return corre as Promise<T | null>;
  }
  // A marca desta pergunta: se a pasta for esquecida enquanto ela corre (uma
  // escrita nesta instância), ou se uma pergunta mais nova passar à frente, o
  // que vier pode já estar velho e não se guarda.
  const marca = {};
  inicioDaPergunta.set(marca, agora);
  loja.marcas.set(chave, marca);
  // Uma listagem pendurada não prende as outras perguntas desta pasta até ao
  // timeout do fetch (~300 s): ao fim de {@link ESPERA_MAX_MS} vale `null`
  // («por confirmar»), que não se guarda.
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const espera = new Promise<null>((r) => {
    relogio = setTimeout(() => r(null), ESPERA_MAX_MS);
  });
  const nova = Promise.race([listar(), espera])
    .then((valor) => {
      // Guarda-se com o instante em que a pergunta COMEÇOU: é desde aí que a
      // listagem diz a verdade (`desde` compara com ele).
      if (valor !== null && loja.marcas.get(chave) === marca) guardar(loja, chave, valor, agora);
      return valor;
    })
    .finally(() => {
      clearTimeout(relogio);
      if (loja.marcas.get(chave) === marca) {
        loja.emCurso.delete(chave);
        loja.marcas.delete(chave);
      }
    });
  loja.emCurso.set(chave, nova);
  return nova;
}

function guardar(loja: Loja, chave: string, valor: unknown, at: number): void {
  const agora = Date.now();
  // As caducadas saem antes de se escrever: o mapa não cresce sem fim numa
  // instância que fica viva dias.
  for (const [k, v] of loja.memoria) if (agora - v.at > MEMORIA_MS) loja.memoria.delete(k);
  loja.memoria.delete(chave);
  loja.memoria.set(chave, { at, valor });
  while (loja.memoria.size > loja.maximo) {
    const maisVelha = loja.memoria.keys().next().value;
    if (maisVelha === undefined) break;
    loja.memoria.delete(maisVelha);
  }
}

/** Esquece a listagem desta pasta (e a pergunta em curso, que pode vir velha). */
export function esquecerListagemDaPasta(bucket: string, pasta: string): void {
  const chave = chaveDe(bucket, pasta);
  memoria.delete(chave);
  emCurso.delete(chave);
  emCursoMarca.delete(chave);
  // E as respostas por ficheiro da mesma pasta.
  const prefixo = `${chave}\u0000`;
  for (const k of [...respostas.keys(), ...respostasEmCurso.keys()]) {
    if (!k.startsWith(prefixo)) continue;
    respostas.delete(k);
    respostasEmCurso.delete(k);
    respostasMarca.delete(k);
  }
}

/** Só para os testes. */
export function esquecerListagens(): void {
  memoria.clear();
  emCurso.clear();
  emCursoMarca.clear();
  respostas.clear();
  respostasEmCurso.clear();
  respostasMarca.clear();
  primeiroVisto.clear();
}

/** Só para os testes: quantas pastas estão guardadas. */
export function quantasListagensGuardadas(): number {
  return memoria.size;
}
