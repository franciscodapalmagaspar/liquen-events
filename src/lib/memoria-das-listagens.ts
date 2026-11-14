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
 * ela repõe a foto e a pré-visualização mostra-a logo, sem esperar o prazo.
 *
 * Sem `server-only` e sem importar nada: o `theme-storage` chama-o sem trazer
 * o motor do PDF atrás.
 */

/** Quanto vale uma listagem guardada. 3 min: um rascunho não precisa de mais fresco. */
export const MEMORIA_MS = 3 * 60_000;
/** Tecto de pastas guardadas — uma pasta por tema ou pedido; folga larga. */
const MAX_PASTAS = 500;

const memoria = new Map<string, { at: number; valor: unknown }>();
const emCurso = new Map<string, Promise<unknown>>();
const emCursoMarca = new Map<string, object>();

const chaveDe = (bucket: string, pasta: string) => `${bucket}::${pasta}`;

/**
 * A listagem desta pasta: da memória, da pergunta que já está a correr, ou
 * pedida agora com `listar`. Só se guarda o que veio (`null` — «não se
 * conseguiu listar» — não se guarda: volta a perguntar-se da próxima vez).
 */
export async function listagemComMemoria<T>(
  bucket: string,
  pasta: string,
  listar: () => Promise<T | null>,
): Promise<T | null> {
  const chave = chaveDe(bucket, pasta);
  const agora = Date.now();
  const ja = memoria.get(chave);
  if (ja && agora - ja.at <= MEMORIA_MS) return ja.valor as T;
  const corre = emCurso.get(chave);
  if (corre) return corre as Promise<T | null>;
  // A marca desta pergunta: se a pasta for esquecida enquanto ela corre (uma
  // escrita nesta instância), o que vier pode já estar velho e não se guarda.
  const marca = {};
  emCursoMarca.set(chave, marca);
  const nova = listar()
    .then((valor) => {
      if (valor !== null && emCursoMarca.get(chave) === marca) guardar(chave, valor);
      return valor;
    })
    .finally(() => {
      if (emCursoMarca.get(chave) === marca) {
        emCurso.delete(chave);
        emCursoMarca.delete(chave);
      }
    });
  emCurso.set(chave, nova);
  return nova;
}

function guardar(chave: string, valor: unknown): void {
  const agora = Date.now();
  // As caducadas saem antes de se escrever: o mapa não cresce sem fim numa
  // instância que fica viva dias.
  for (const [k, v] of memoria) if (agora - v.at > MEMORIA_MS) memoria.delete(k);
  memoria.delete(chave);
  memoria.set(chave, { at: agora, valor });
  while (memoria.size > MAX_PASTAS) {
    const maisVelha = memoria.keys().next().value;
    if (maisVelha === undefined) break;
    memoria.delete(maisVelha);
  }
}

/** Esquece a listagem desta pasta (e a pergunta em curso, que pode vir velha). */
export function esquecerListagemDaPasta(bucket: string, pasta: string): void {
  const chave = chaveDe(bucket, pasta);
  memoria.delete(chave);
  emCurso.delete(chave);
  emCursoMarca.delete(chave);
}

/** Só para os testes. */
export function esquecerListagens(): void {
  memoria.clear();
  emCurso.clear();
  emCursoMarca.clear();
}

/** Só para os testes: quantas pastas estão guardadas. */
export function quantasListagensGuardadas(): number {
  return memoria.size;
}
