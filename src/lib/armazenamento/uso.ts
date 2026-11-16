import "server-only";
import { gravarEstadoSeNaoMudou, lerEstadoComVersao } from "@/lib/app-state";
import { log } from "@/lib/logger";
import {
  avisosDoBlob,
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
 * Um contador que não se consegue ler NÃO trava (o Blob é o plano B do
 * Supabase, e uma base de dados em baixo já é avaria que chegue); um contador
 * que não se consegue gravar fica registado nos registos.
 */

export const CHAVE_DO_USO = "armazenamento-blob:uso";
const VIDA_MS = 60_000;

let emMemoria: { uso: UsoDoBlob; lidoEm: number } | null = null;
/** O que esta instância gastou desde a última leitura (ainda não visto nela). */
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
    if (!fresco)
      return emMemoria ? somar(usoNormalizado(emMemoria.uso, agora), desdeALeitura) : null;
    emMemoria = { uso: fresco, lidoEm: Date.now() };
    desdeALeitura = {};
  }
  return somar(usoNormalizado(emMemoria.uso, agora), desdeALeitura);
}

/** Cabe? `null` quando cabe; o motivo quando não cabe. Nunca lança. */
export async function travao(g: Gasto): Promise<Recusa | null> {
  const uso = await usoAtual();
  if (!uso) return null;
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

/** Grava um lote com compare-and-set (até 4 tentativas, contra as outras instâncias). */
async function gravar(g: Gasto): Promise<void> {
  for (let t = 0; t < 4; t++) {
    try {
      const agora = new Date();
      const { valor, versao } = await lerEstadoComVersao<unknown>(CHAVE_DO_USO, 3_000);
      const r = await gravarEstadoSeNaoMudou(
        CHAVE_DO_USO,
        somar(usoNormalizado(valor, agora), g),
        versao,
      );
      if (r === "gravado") return;
      if (r === "falhou") break;
    } catch {
      break;
    }
  }
  log.warn("blob: contador não gravado", { gasto: g });
}

/**
 * O que esta instância ainda não gravou, e a gravação em curso. Oito leituras
 * em paralelo (as derivadas fazem-no) não são oito compare-and-set a lutar
 * pela mesma linha: a primeira grava, as outras juntam-se ao lote seguinte.
 */
let porGravar: Gasto = {};
let aGravar: Promise<void> | null = null;

/** Soma o gasto, em memória e na linha guardada. Nunca lança. */
export async function registar(g: Gasto): Promise<void> {
  if (!temGasto(g)) return;
  desdeALeitura = juntar(desdeALeitura, g);
  porGravar = juntar(porGravar, g);
  // Em ciclo: um gasto que chegue entre o fim do lote e o `finally` ficava
  // pendurado à espera do próximo — volta-se a olhar.
  while (temGasto(porGravar)) {
    if (!aGravar) {
      aGravar = (async () => {
        while (temGasto(porGravar)) {
          const lote = porGravar;
          porGravar = {};
          await gravar(lote);
        }
      })().finally(() => {
        aGravar = null;
      });
    }
    await aGravar;
  }
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
        emMemoria = null;
        desdeALeitura = {};
        return;
      }
      if (r === "falhou") return;
    } catch {
      return;
    }
  }
}

/** Os avisos para o ecrã. Vazio sem Blob ou abaixo do aviso. Nunca lança. */
export async function avisosDoUso(): Promise<string[]> {
  const uso = await usoAtual().catch(() => null);
  return uso ? avisosDoBlob(uso) : [];
}

/** Só para os testes: esquece a cópia em memória. */
export function esquecerUso(): void {
  emMemoria = null;
  desdeALeitura = {};
  porGravar = {};
}
