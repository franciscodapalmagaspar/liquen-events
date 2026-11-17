import "server-only";
import { gravarEstadoSeNaoMudou, lerEstadoComVersao } from "@/lib/app-state";
import { log } from "@/lib/logger";
import {
  podeGastar,
  somar,
  usoNormalizado,
  type Gasto,
  type Recusa,
  type UsoDoBlob,
} from "./tectos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTADOR DO BLOB — uma linha de `app_state`, lida de minuto a minuto
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada operação no Blob pergunta primeiro se cabe (`travao`) e, depois de
 * feita, soma o que gastou (`registar`). A pergunta lê de uma cópia em memória
 * com 60 s de vida MAIS o que esta instância já gastou desde então; a soma é
 * gravada com compare-and-set, como o contador do `ocupacao-do-armazenamento`.
 *
 * Com várias instâncias, cada uma vê as outras com até 60 s de atraso — é
 * isso que pode deixar passar um pouco do travão. Os tectos estão abaixo do
 * crédito para essa folga caber lá dentro.
 *
 * UM TRAVÃO QUE NÃO SABE, FECHA (revisão de 17/11, n.º 5 — regra de custo).
 * Um contador que não se consegue ler recusa TUDO (`contador-ilegivel`): as
 * escritas vão para o Supabase e as leituras voltam ao Supabase quando lá há
 * cópia. Um gasto que não se consegue gravar NÃO se perde: volta para a fila
 * e continua a contar nesta instância até ficar gravado.
 */

export const CHAVE_DO_USO = "armazenamento-blob:uso";
const VIDA_MS = 60_000;

let emMemoria: { uso: UsoDoBlob; lidoEm: number } | null = null;
/**
 * O que esta instância gastou e a linha LIDA ainda não mostra: tudo o que foi
 * somado depois da última leitura, mais o que nem sequer ficou gravado.
 */
let desdeALeitura: Gasto = {};

async function lerFresco(agora: Date): Promise<UsoDoBlob | null> {
  try {
    const { valor } = await lerEstadoComVersao<unknown>(CHAVE_DO_USO, 3_000);
    return usoNormalizado(valor, agora);
  } catch (e) {
    log.warn("blob: contador não lido", { erro: String(e) });
    return null;
  }
}

/** O uso como esta instância o vê agora. `null` se não se conseguiu ler. */
export async function usoAtual(agora: Date = new Date()): Promise<UsoDoBlob | null> {
  if (!emMemoria || Date.now() - emMemoria.lidoEm > VIDA_MS) {
    const fresco = await lerFresco(agora);
    // Uma cópia velha não serve de travão: sem leitura fresca, não se sabe.
    if (!fresco) return null;
    emMemoria = { uso: fresco, lidoEm: Date.now() };
    // A linha lida já tem o que ficou gravado; o que ainda NÃO ficou (na fila
    // ou a meio de gravar) continua a contar por cima dela.
    desdeALeitura = juntar(porGravar, emVoo);
  }
  return somar(usoNormalizado(emMemoria.uso, agora), desdeALeitura);
}

/** Cabe? `null` quando cabe; o motivo quando não cabe (ou quando não se sabe). Nunca lança. */
export async function travao(g: Gasto): Promise<Recusa | null> {
  const uso = await usoAtual();
  if (!uso) {
    log.warn("blob: travão fechado — o contador não se leu", {});
    return "contador-ilegivel";
  }
  const r = podeGastar(uso, g);
  if (r.pode) return null;
  log.warn("blob: operação recusada pelo tecto", { motivo: r.motivo });
  return r.motivo;
}

function temGasto(g: Gasto): boolean {
  return !!(g.avancadas || g.simples || g.transferencia || g.bytes);
}

function juntar(a: Gasto, b: Gasto): Gasto {
  return {
    avancadas: (a.avancadas ?? 0) + (b.avancadas ?? 0),
    simples: (a.simples ?? 0) + (b.simples ?? 0),
    transferencia: (a.transferencia ?? 0) + (b.transferencia ?? 0),
    bytes: (a.bytes ?? 0) + (b.bytes ?? 0),
  };
}

const TENTATIVAS = 8;

/**
 * Grava um lote com compare-and-set. Um conflito (outra instância gravou
 * entretanto) tenta outra vez, com uma pausa a crescer; uma avaria também.
 * Devolve se ficou gravado.
 */
async function gravar(g: Gasto): Promise<boolean> {
  for (let t = 0; t < TENTATIVAS; t++) {
    try {
      const agora = new Date();
      const { valor, versao } = await lerEstadoComVersao<unknown>(CHAVE_DO_USO, 3_000);
      const r = await gravarEstadoSeNaoMudou(
        CHAVE_DO_USO,
        somar(usoNormalizado(valor, agora), g),
        versao,
      );
      if (r === "gravado") return true;
    } catch {
      /* tenta outra vez */
    }
    await new Promise((ok) => setTimeout(ok, Math.min(400, 25 * 2 ** t)));
  }
  log.warn("blob: contador não gravado — o gasto fica na fila", { gasto: g });
  return false;
}

/**
 * O que esta instância ainda não gravou, e o lote a meio de gravar. Oito
 * leituras em paralelo (as derivadas fazem-no) não são oito compare-and-set a
 * lutar pela mesma linha: a primeira grava, as outras juntam-se ao seguinte.
 */
let porGravar: Gasto = {};
let emVoo: Gasto = {};
let aGravar: Promise<void> | null = null;

/** Soma o gasto, em memória e na linha guardada. Nunca lança. */
export async function registar(g: Gasto): Promise<void> {
  if (!temGasto(g)) return;
  desdeALeitura = juntar(desdeALeitura, g);
  porGravar = juntar(porGravar, g);
  if (!aGravar) {
    aGravar = (async () => {
      while (temGasto(porGravar)) {
        emVoo = porGravar;
        porGravar = {};
        const ok = await gravar(emVoo);
        // Não gravou: volta à fila (e continua em `desdeALeitura`). Pára aqui
        // para não martelar uma base de dados em baixo; o próximo gasto volta
        // a tentar com este lá dentro.
        if (!ok) porGravar = juntar(emVoo, porGravar);
        emVoo = {};
        if (!ok) break;
      }
    })().finally(() => {
      aGravar = null;
    });
  }
  await aGravar;
}

/**
 * Repõe os bytes guardados a partir do índice (a soma real), quando a
 * migração o recontou. Os contadores do mês ficam como estão.
 */
export async function acertarBytes(bytes: number): Promise<void> {
  for (let t = 0; t < 4; t++) {
    try {
      const agora = new Date();
      const { valor, versao } = await lerEstadoComVersao<unknown>(CHAVE_DO_USO, 3_000);
      const uso = { ...usoNormalizado(valor, agora), bytes: Math.max(0, Math.round(bytes)) };
      const r = await gravarEstadoSeNaoMudou(CHAVE_DO_USO, uso, versao);
      if (r === "gravado") {
        // Relê-se na próxima pergunta; o que está na fila continua a contar.
        emMemoria = null;
        return;
      }
      if (r === "falhou") return;
    } catch {
      return;
    }
  }
}

/** Só para os testes: esquece a cópia em memória. */
export function esquecerUso(): void {
  emMemoria = null;
  desdeALeitura = {};
  porGravar = {};
  emVoo = {};
}
