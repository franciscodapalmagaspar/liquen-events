import "server-only";
import { after } from "next/server";
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

/** Conflitos (outra instância gravou entretanto): várias, com pausas curtas. */
const TENTATIVAS_POR_CONFLITO = 6;
/** Avarias (a gravação lançou): só duas — a base de dados está em baixo. */
const TENTATIVAS_POR_AVARIA = 2;

/**
 * Grava um lote com compare-and-set. Devolve se ficou gravado.
 * (2.ª revisão de 17/11, n.º 5: as avarias limitam-se a 2, com pausas curtas.)
 */
async function gravar(g: Gasto): Promise<boolean> {
  let conflitos = 0;
  let avarias = 0;
  while (conflitos < TENTATIVAS_POR_CONFLITO && avarias < TENTATIVAS_POR_AVARIA) {
    try {
      const agora = new Date();
      const { valor, versao } = await lerEstadoComVersao<unknown>(CHAVE_DO_USO, 3_000);
      const r = await gravarEstadoSeNaoMudou(
        CHAVE_DO_USO,
        somar(usoNormalizado(valor, agora), g),
        versao,
      );
      if (r === "gravado") return true;
      if (r === "conflito") conflitos++;
      else avarias++;
    } catch {
      avarias++;
    }
    await new Promise((ok) => setTimeout(ok, Math.min(200, 20 * 2 ** (conflitos + avarias))));
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

/**
 * Grava a fila. Em ciclo, também por FORA (2.ª revisão, n.º 5): um gasto que
 * chegue entre o fim do lote e o `finally` arranca outra gravação em vez de
 * ficar pendurado. Pára num lote que não grava (a base em baixo) — o próximo
 * gasto volta a tentar com ele lá dentro.
 */
function gravarAFila(): Promise<void> {
  if (aGravar) return aGravar;
  const esta = (async () => {
    while (temGasto(porGravar)) {
      emVoo = porGravar;
      porGravar = {};
      const ok = await gravar(emVoo);
      if (!ok) porGravar = juntar(emVoo, porGravar);
      emVoo = {};
      if (!ok) return;
    }
  })();
  aGravar = esta.finally(() => {
    aGravar = null;
  });
  return aGravar;
}

/**
 * Soma o gasto. O travão desta instância vê-o JÁ (em memória); a gravação na
 * linha corre em SEGUNDO PLANO e não prende o pedido (2.ª revisão de 17/11,
 * n.º 5): numa rota, com `after` (a função fica viva até acabar); fora de
 * uma, solta. Nunca lança.
 */
export async function registar(g: Gasto): Promise<void> {
  if (!temGasto(g)) return;
  desdeALeitura = juntar(desdeALeitura, g);
  porGravar = juntar(porGravar, g);
  const correr = () => gravarAFila().catch(() => undefined);
  try {
    after(correr);
  } catch {
    // Fora de um pedido (testes, scripts): solta, sem esperar.
    void correr();
  }
}

/** Espera que a fila esteja gravada (para os testes e para a migração no fim). */
export async function gravacoesPendentes(): Promise<void> {
  while (aGravar || temGasto(porGravar)) {
    await gravarAFila();
    if (!aGravar && temGasto(porGravar)) return; // não grava agora — fica na fila
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
