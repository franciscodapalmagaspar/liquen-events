import "server-only";
import { lerEstadoComVersao, listStateByPrefix, gravarEstadoSeNaoMudou } from "@/lib/app-state";
import { apagarEstadoSeNaoMudou, apagarLapides } from "@/lib/app-state/apagar";
import { ESPACOS } from "@/lib/app-state/espacos";
import {
  contarPorMotivo,
  oQueSaiDoAppState,
  type LinhaLida,
  type MotivoDeSaida,
  type Saida,
} from "@/lib/app-state/limpeza";
import { listarReciclagem } from "@/lib/reciclagem-store";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LIMPEZA DO `app_state`, NA TAREFA DA NOITE (docs/ESTRUTURA-DOS-DADOS.md, P3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As regras do que sai estão em `app-state/limpeza.ts`; aqui está o COMO, com
 * as quatro travas que o plano pede:
 *
 *  1. **Primeiro a cópia.** O plano faz-se ANTES de a cópia da noite ser
 *     montada, e o que vai sair segue dentro dela (`saiDoAppState`). Só se
 *     apaga depois de o email ter saído e com a cópia completa — a mesma regra
 *     da retenção e da Reciclagem, em `api/cron/backup`.
 *  2. **Uma leitura falhada não apaga nada.** Se a Reciclagem, ou um dos cinco
 *     espaços, não se leu inteiro, o plano é `null`.
 *  3. **Um tecto por noite** ({@link TECTO_POR_NOITE}); o resto fica para a
 *     noite seguinte, e diz-se quantas ficaram.
 *  4. **A primeira noite é a seco.** Sem o registo desta limpeza, a noite só
 *     conta o que sairia e escreve o registo; apaga a partir da seguinte.
 *
 * E cada linha sai com a condição de ainda estar como se leu: uma lápide que
 * o estúdio voltou a gravar, ou uma ligação reescrita, ficam.
 */

export const TECTO_POR_NOITE = 200;
/** O mais de linhas que se lê por espaço; acima disto a leitura conta como falhada. */
const LIMITE_POR_ESPACO = 5000;
/** Apagar uma a uma, mas não todas ao mesmo tempo. */
const EM_PARALELO = 6;

export const CHAVE_DO_REGISTO = `${ESPACOS.registosDasLimpezas.chave}app-state`;

const ESPACOS_LIMPOS = [
  ESPACOS.rascunhos,
  ESPACOS.enviosDeProposta,
  ESPACOS.ligacoes,
  ESPACOS.ligacoesInversas,
  ESPACOS.propostaWeb,
].map((e) => e.chave);

export interface PlanoDaNoite {
  saem: Saida[];
  ficam: number;
}

/** O que vai dentro da cópia da noite, para se poder repor à mão. */
export interface LinhaQueSai {
  key: string;
  motivo: MotivoDeSaida;
  value: unknown;
}

export interface RegistoDaLimpeza {
  /** O dia da primeira noite (a seco). */
  primeiraNoite: string;
  ultima: {
    dia: string;
    aSeco: boolean;
    porMotivo: Partial<Record<MotivoDeSaida, number>>;
    apagadas: number;
    mudaram: number;
    falharam: number;
    ficam: number;
  };
}

/** Os ids que existem: os vivos (da cópia que acabou de se ler) e os da Reciclagem. */
async function quemExiste(vivos: {
  pedidos: readonly string[];
  propostas: readonly string[];
}): Promise<{ pedidos: Set<string>; propostas: Set<string> } | null> {
  let reciclados: string[];
  try {
    // A Reciclagem guarda o pedido E o que saiu com ele (as propostas, os
    // rascunhos…): qualquer id lá dentro conta como existente.
    reciclados = (await listarReciclagem()).flatMap((e) => [
      e.origemId,
      ...idsDoRetrato(e.retrato),
    ]);
  } catch (err) {
    log.warn("limpeza do app_state: a Reciclagem não se leu — nada sai esta noite", {
      erro: String(err),
    });
    return null;
  }
  return {
    pedidos: new Set([...vivos.pedidos, ...reciclados]),
    propostas: new Set([...vivos.propostas, ...reciclados]),
  };
}

function idsDoRetrato(retrato: Record<string, unknown>): string[] {
  return Object.values(retrato).flatMap((grupo) =>
    Array.isArray(grupo)
      ? grupo.flatMap((linha: unknown) => {
          const id: unknown =
            linha && typeof linha === "object" ? Reflect.get(linha, "id") : undefined;
          return typeof id === "string" ? [id] : [];
        })
      : [],
  );
}

/**
 * Lê e decide. `null` quando alguma leitura falhou ou ficou truncada: aí não
 * sai nada, nem a parte que se conseguiu ler.
 */
export async function planearLimpezaDoAppState(
  vivos: { pedidos: readonly string[]; propostas: readonly string[] },
  agora: Date,
): Promise<PlanoDaNoite | null> {
  const existe = await quemExiste(vivos);
  if (!existe) return null;
  const linhas: LinhaLida[] = [];
  for (const prefixo of ESPACOS_LIMPOS) {
    const { entradas, completa } = await listStateByPrefix<unknown>(prefixo, LIMITE_POR_ESPACO);
    if (!completa) {
      log.warn("limpeza do app_state: um espaço não se leu inteiro — nada sai esta noite", {
        prefixo,
      });
      return null;
    }
    linhas.push(...entradas);
  }
  return oQueSaiDoAppState(linhas, existe, agora.getTime(), TECTO_POR_NOITE);
}

/** O que segue na cópia, antes de sair. */
export function paraACopia(plano: PlanoDaNoite): LinhaQueSai[] {
  return plano.saem.map(({ key, motivo, value }) => ({ key, motivo, value }));
}

async function emLotes<T, R>(itens: readonly T[], f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += EM_PARALELO) {
    out.push(...(await Promise.all(itens.slice(i, i + EM_PARALELO).map(f))));
  }
  return out;
}

/**
 * Apaga o que o plano diz — ou, na primeira noite, só conta. Nunca lança: o
 * que falhar fica para a noite seguinte, e o registo diz quantas.
 */
export async function aplicarLimpezaDoAppState(
  plano: PlanoDaNoite,
  dia: string,
): Promise<RegistoDaLimpeza["ultima"] | null> {
  let lido: Awaited<ReturnType<typeof lerEstadoComVersao<RegistoDaLimpeza>>>;
  try {
    lido = await lerEstadoComVersao<RegistoDaLimpeza>(CHAVE_DO_REGISTO, 4_000);
  } catch (err) {
    log.warn("limpeza do app_state: o registo não se leu — nada sai esta noite", {
      erro: String(err),
    });
    return null;
  }
  const primeiraNoite = lido.valor?.primeiraNoite ?? dia;
  const aSeco = primeiraNoite === dia;

  let apagadas = 0;
  let mudaram = 0;
  let falharam = 0;
  if (!aSeco) {
    const lapides = plano.saem.filter((s) => s.motivo === "lapide").map((s) => s.key);
    const { sairam, falhou } = await apagarLapides(lapides);
    apagadas += sairam.length;
    // Sem falha, as que não saíram deixaram de ser lápides (o estúdio voltou
    // a gravar); com falha, não se sabe: contam como falhadas.
    if (falhou) falharam += lapides.length - sairam.length;
    else mudaram += lapides.length - sairam.length;
    const resto = plano.saem.filter((s) => s.motivo !== "lapide");
    for (const r of await emLotes(resto, (s) => apagarEstadoSeNaoMudou(s.key, s.versao))) {
      if (r === "apagado") apagadas++;
      else if (r === "mudou") mudaram++;
      else falharam++;
    }
  }

  const ultima: RegistoDaLimpeza["ultima"] = {
    dia,
    aSeco,
    porMotivo: contarPorMotivo(plano.saem),
    apagadas,
    mudaram,
    falharam,
    ficam: plano.ficam,
  };
  const r = await gravarEstadoSeNaoMudou<RegistoDaLimpeza>(
    CHAVE_DO_REGISTO,
    { primeiraNoite, ultima },
    lido.versao,
  );
  if (r !== "gravado") log.warn("limpeza do app_state: o registo da noite não ficou", { r });
  if (falharam > 0) log.warn("limpeza do app_state: há linhas que não saíram", { falharam });
  return ultima;
}

/** Os ids de uma lista da cópia; `null` se a lista não tem a forma esperada. */
function idsDe(linhas: unknown): string[] | null {
  if (!Array.isArray(linhas)) return null;
  const ids: string[] = [];
  for (const l of linhas) {
    const id: unknown = l && typeof l === "object" ? Reflect.get(l, "id") : undefined;
    if (typeof id !== "string") return null;
    ids.push(id);
  }
  return ids;
}

/**
 * O plano da noite a partir da cópia que acabou de se ler (sem ler os pedidos
 * e as propostas outra vez). `null` — e nada sai — quando a cópia está
 * incompleta, quando os pedidos ou as propostas não têm a forma esperada, ou
 * quando vêm VAZIOS: uma tabela inteira vazia faria de tudo um órfão, e é mais
 * provável uma leitura estranha do que uma casa sem pedidos. Nunca lança.
 */
export async function planearNaCopia(
  copia: { incomplete?: unknown; quotes?: unknown; proposals?: unknown },
  agora: Date,
): Promise<PlanoDaNoite | null> {
  if (!Array.isArray(copia.incomplete) || copia.incomplete.length > 0) return null;
  const pedidos = idsDe(copia.quotes);
  const propostas = idsDe(copia.proposals);
  if (!pedidos?.length || !propostas?.length) return null;
  try {
    return await planearLimpezaDoAppState({ pedidos, propostas }, agora);
  } catch (err) {
    log.error("limpeza do app_state: o plano falhou — nada sai esta noite", err);
    return null;
  }
}
