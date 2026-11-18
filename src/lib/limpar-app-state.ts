import "server-only";
import { z } from "zod";
import { gravarEstadoSeNaoMudou, getStates, lerEstadoComVersao } from "@/lib/app-state";
import { apagarEstadoSeNaoMudou, apagarLapides } from "@/lib/app-state/apagar";
import { ESPACOS } from "@/lib/app-state/espacos";
import {
  ESPACOS_LIMPOS,
  contarPorMotivo,
  oQueSaiDoAppState,
  type MotivoDeSaida,
  type Saida,
} from "@/lib/app-state/limpeza";
import { comTecto } from "@/lib/app-state/tecto";
import { varrerPrefixo, type LinhaVarrida } from "@/lib/app-state/varrer";
import { lerTodasAsLinhas } from "@/lib/ler-todas-as-linhas";
import { listarReciclagem } from "@/lib/reciclagem-store";
import { getSupabase } from "@/lib/supabase";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LIMPEZA DO `app_state`, NA TAREFA DA NOITE (docs/ESTRUTURA-DOS-DADOS.md, P3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As regras do que sai estão em `app-state/limpeza.ts`; aqui está o COMO, com
 * as travas que o plano pede:
 *
 *  1. **Primeiro a cópia.** O plano faz-se ANTES de a cópia da noite se fechar,
 *     e o que vai sair segue DENTRO dela (`saiDoAppState`), com o valor cru
 *     que tinha. Só se apaga depois de
 *     o email ter saído e com a cópia completa — a regra da retenção e da
 *     Reciclagem, em `api/cron/backup`. O que não se conseguiu copiar não sai.
 *  2. **Uma leitura falhada não apaga nada.** Se a Reciclagem, ou um dos cinco
 *     espaços, não se leu inteiro, o plano é `null`.
 *  3. **Tectos.** {@link TECTO_POR_NOITE} linhas e {@link TECTO_DE_BYTES_NA_COPIA}
 *     de valores dentro da cópia (o anexo do email tem tecto); o resto fica
 *     para a noite seguinte. E o plano inteiro tem {@link TEMPO_DO_PLANO_MS}:
 *     a cópia não pode ficar à espera dele.
 *  4. **A primeira noite é a seco.** Sem o registo desta limpeza, a noite só
 *     conta o que sairia e escreve o registo; apaga a partir da seguinte.
 *
 * E cada linha sai só se ainda estiver como se leu: uma lápide que voltou a ter
 * valor, ou uma ligação reescrita, ficam.
 *
 * Custo: a varredura traz a chave, a versão e um ou dois campos de topo, não os
 * valores (`varrer.ts`); os valores só se leem para as linhas que saem. Medido a 18/11: ~180 linhas na primeira noite.
 */

export const TECTO_POR_NOITE = 200;
export const TECTO_DE_BYTES_NA_COPIA = 2_000_000;
export const TEMPO_DO_PLANO_MS = 15_000;
/** O mais de linhas que se lê por espaço; acima disto a leitura conta como falhada. */
const LIMITE_POR_ESPACO = 5000;
/** Apagar uma a uma, mas não todas ao mesmo tempo. */
const EM_PARALELO = 6;
/** Valores lidos de cada vez para a cópia. */
const LOTE_DE_VALORES = 20;

export const CHAVE_DO_REGISTO = `${ESPACOS.registosDasLimpezas.chave}app-state`;

export interface PlanoDaNoite {
  saem: Saida[];
  ficam: number;
}

/** Uma linha que sai, como vai na cópia: o valor cru, tal como estava. */
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

const linhaDaReciclagem = z.looseObject({
  origem_id: z.string(),
  propostas: z.array(z.looseObject({ id: z.string() })).nullable(),
});

/**
 * Os ids que estão na Reciclagem: o que se apagou e as propostas que foram com
 * um pedido (`retrato.propostas`, só o caminho, não o retrato inteiro).
 */
async function idsNaReciclagem(): Promise<string[] | null> {
  try {
    const sb = getSupabase();
    if (!sb) {
      return (await listarReciclagem()).flatMap((e) => [
        e.origemId,
        ...(idsDe(e.retrato.propostas ?? []) ?? []),
      ]);
    }
    const { data, error } = await lerTodasAsLinhas<unknown>(
      sb,
      "reciclagem",
      "id, origem_id, propostas:retrato->propostas",
    );
    if (error || !data) return null;
    const ids: string[] = [];
    for (const linha of data) {
      const r = linhaDaReciclagem.safeParse(linha);
      if (!r.success) return null;
      ids.push(r.data.origem_id, ...(r.data.propostas ?? []).map((p) => p.id));
    }
    return ids;
  } catch {
    return null;
  }
}

/**
 * Lê e decide. `null` quando alguma leitura falhou ou ficou truncada: aí não
 * sai nada, nem a parte que se conseguiu ler.
 */
export async function planearLimpezaDoAppState(
  vivos: { pedidos: readonly string[]; propostas: readonly string[] },
  agora: Date,
): Promise<PlanoDaNoite | null> {
  const reciclados = await idsNaReciclagem();
  if (!reciclados) {
    log.warn("limpeza do app_state: a Reciclagem não se leu — nada sai esta noite");
    return null;
  }
  const lidos = await Promise.all(
    ESPACOS_LIMPOS.map(({ prefixo, campos }) =>
      varrerPrefixo(prefixo, { campos, limite: LIMITE_POR_ESPACO }),
    ),
  );
  const incompleto = lidos.findIndex((l) => !l.completa);
  if (incompleto >= 0) {
    log.warn("limpeza do app_state: um espaço não se leu inteiro — nada sai esta noite", {
      prefixo: ESPACOS_LIMPOS[incompleto].prefixo,
    });
    return null;
  }
  const linhas: LinhaVarrida[] = lidos.flatMap((l) => l.linhas);
  const existe = {
    pedidos: new Set([...vivos.pedidos, ...reciclados]),
    propostas: new Set([...vivos.propostas, ...reciclados]),
  };
  return oQueSaiDoAppState(linhas, existe, agora.getTime(), TECTO_POR_NOITE);
}

/**
 * O que segue na cópia — o valor CRU de cada linha, lido agora (os conjuntos
 * `proposalDrafts`/`proposalEmails` da cópia são normalizados e podiam não ter
 * tudo) — e o plano reduzido ao que se conseguiu copiar: uma linha cujo valor
 * não se leu, ou que já não cabe no tecto de bytes, fica para a noite seguinte.
 */
export async function prepararCopia(
  plano: PlanoDaNoite,
): Promise<{ plano: PlanoDaNoite; naCopia: LinhaQueSai[] }> {
  const saem: Saida[] = [];
  const naCopia: LinhaQueSai[] = [];
  let bytes = 0;
  let cheio = false;
  // Pela ordem de saída, em lotes: chegando ao tecto, pára de LER (não traz
  // valores que já não cabiam para os deitar fora).
  for (let i = 0; i < plano.saem.length && !cheio; i += LOTE_DE_VALORES) {
    const lote = plano.saem.slice(i, i + LOTE_DE_VALORES);
    const porLer = lote.filter((s) => !s.nula).map((s) => s.key);
    const valores = porLer.length > 0 ? await getStates<unknown>(porLer) : new Map();
    for (const s of lote) {
      const valor = s.nula ? null : valores.get(s.key);
      if (valor === undefined) continue; // não se leu: não vai, não sai
      const tamanho = JSON.stringify(valor).length;
      if (bytes + tamanho > TECTO_DE_BYTES_NA_COPIA) {
        cheio = true;
        break;
      }
      bytes += tamanho;
      naCopia.push({ key: s.key, motivo: s.motivo, value: valor });
      saem.push(s);
    }
  }
  return { plano: { saem, ficam: plano.ficam + plano.saem.length - saem.length }, naCopia };
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
 * e as propostas outra vez), e o que dele vai na cópia. `null` — e nada sai —
 * quando a cópia está incompleta, quando os pedidos ou as propostas não têm a
 * forma esperada ou vêm VAZIOS (uma tabela inteira vazia faria de tudo um
 * órfão, e é mais provável uma leitura estranha do que uma casa sem pedidos),
 * ou quando o plano passa do seu tempo. Nunca lança.
 */
export async function planearNaCopia(
  copia: { incomplete?: unknown; quotes?: unknown; proposals?: unknown },
  agora: Date,
): Promise<{ plano: PlanoDaNoite; naCopia: LinhaQueSai[] } | null> {
  if (!Array.isArray(copia.incomplete) || copia.incomplete.length > 0) return null;
  const pedidos = idsDe(copia.quotes);
  const propostas = idsDe(copia.proposals);
  if (!pedidos?.length || !propostas?.length) return null;
  try {
    return await comTecto(
      (async () => {
        const plano = await planearLimpezaDoAppState({ pedidos, propostas }, agora);
        return plano ? prepararCopia(plano) : null;
      })(),
      TEMPO_DO_PLANO_MS,
    );
  } catch (err) {
    log.error("limpeza do app_state: o plano falhou — nada sai esta noite", err);
    return null;
  }
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
 * que falhar fica para a noite seguinte, e o registo diz quantas. `null`
 * quando o registo não se leu (e então nada sai).
 */
export async function aplicarLimpezaDoAppState(
  plano: PlanoDaNoite,
  dia: string,
): Promise<RegistoDaLimpeza["ultima"] | null> {
  let lido: { valor: RegistoDaLimpeza | null; versao: string | null };
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
    const lapides = plano.saem.filter((s) => s.nula).map((s) => s.key);
    const { sairam, falhou } = await apagarLapides(lapides);
    apagadas += sairam.length;
    // Sem falha, as que não saíram deixaram de ser lápides (voltaram a ter
    // valor); com falha, não se sabe: contam como falhadas.
    if (falhou) falharam += lapides.length - sairam.length;
    else mudaram += lapides.length - sairam.length;
    const resto = plano.saem.filter((s) => !s.nula);
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
