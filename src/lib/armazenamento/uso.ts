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

/**
 * A leitura em voo, partilhada (4.ª revisão de 17/11, n.º 1). Duas leituras ao
 * mesmo tempo contavam a menos: a que começava depois podia acabar primeiro e
 * podar um lote que a outra ainda precisava, e a mais velha escrevia por cima
 * uma cópia mais antiga. Agora há só uma: quem chega a meio espera por ela.
 */
let leituraEmVoo: Promise<boolean> | null = null;

function lerParaAMemoria(agora: Date): Promise<boolean> {
  leituraEmVoo ??= (async () => {
    const inicio = Date.now();
    const fresco = await lerFresco(agora);
    if (!fresco) return false;
    emMemoria = { uso: fresco, lidoEm: Date.now() };
    /**
     * A linha lida já tem o que ficou gravado ANTES de a leitura começar. Por
     * cima dela conta: o que está na fila, o lote a meio de gravar, e os lotes
     * que acabaram de gravar DESDE que a leitura começou (3.ª revisão, n.º 5) —
     * esses podem ter chegado à linha antes ou depois da leitura; na dúvida
     * contam, que contar a mais é seguro e a menos não. A lista NÃO se poda
     * aqui (só por idade, em `gravarAFila`).
     */
    desdeALeitura = gravadosRecentes
      .filter((l) => l.em >= inicio)
      .reduce((t, l) => juntar(t, l.gasto), juntar(porGravar, emVoo));
    return true;
  })().finally(() => {
    leituraEmVoo = null;
  });
  return leituraEmVoo;
}

/** O uso como esta instância o vê agora. `null` se não se conseguiu ler. */
export async function usoAtual(agora: Date = new Date()): Promise<UsoDoBlob | null> {
  if (!emMemoria || Date.now() - emMemoria.lidoEm > VIDA_MS) {
    // Uma cópia velha não serve de travão: sem leitura fresca, não se sabe.
    if (!(await lerParaAMemoria(agora))) return null;
  }
  return somar(usoNormalizado(emMemoria!.uso, agora), desdeALeitura);
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
let aGravar: Promise<boolean> | null = null;
/** Os lotes gravados há pouco, com a hora em que acabaram (ver `usoAtual`). */
let gravadosRecentes: { gasto: Gasto; em: number }[] = [];

/**
 * Grava a fila. Em ciclo, também por FORA (2.ª revisão, n.º 5): um gasto que
 * chegue entre o fim do lote e o `finally` arranca outra gravação em vez de
 * ficar pendurado. Pára num lote que não grava (a base em baixo) — o próximo
 * gasto volta a tentar com ele lá dentro.
 */
function gravarAFila(): Promise<boolean> {
  if (aGravar) return aGravar;
  const esta = (async () => {
    while (temGasto(porGravar)) {
      emVoo = porGravar;
      porGravar = {};
      const ok = await gravar(emVoo);
      if (!ok) porGravar = juntar(emVoo, porGravar);
      else {
        // Só interessam os que acabaram depois da próxima leitura começar; os
        // de há mais de dois minutos já estão em qualquer leitura que venha.
        const agora = Date.now();
        gravadosRecentes = gravadosRecentes.filter((l) => l.em >= agora - 2 * VIDA_MS);
        gravadosRecentes.push({ gasto: emVoo, em: agora });
      }
      emVoo = {};
      if (!ok) return false;
    }
    aoAcabarOLote?.();
    return true;
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
  // `gravacoesPendentes`, e não só a gravação em curso (3.ª revisão de 17/11,
  // n.º 4): um gasto que chegue quando a gravação em curso já acabou o ciclo
  // mas ainda não a deu por terminada ficava só na memória; assim, quem o
  // registou volta a olhar para a fila depois de ela acabar.
  const correr = () => gravacoesPendentes().catch(() => undefined);
  try {
    after(correr);
  } catch {
    // Fora de um pedido (testes, scripts): solta, sem esperar.
    void correr();
  }
}

/** Só para os testes: corre no fim do ciclo de uma gravação, antes de ela se dar por terminada. */
let aoAcabarOLote: (() => void) | null = null;
export function _quandoAcabarOLote(f: (() => void) | null): void {
  aoAcabarOLote = f;
}

/** Espera que a fila esteja gravada (para os testes e para a migração no fim). */
export async function gravacoesPendentes(): Promise<void> {
  while (aGravar || temGasto(porGravar)) {
    // Uma gravação que FALHOU pára aqui (a base em baixo — fica na fila para o
    // próximo gasto); uma que acabou bem volta a olhar para a fila, porque
    // pode ter chegado um gasto depois de ela a ver vazia.
    if (!(await gravarAFila())) return;
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
  gravadosRecentes = [];
  leituraEmVoo = null;
}
