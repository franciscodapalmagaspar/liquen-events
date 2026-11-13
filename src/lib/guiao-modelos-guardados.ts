import "server-only";
import { getState, setState, type ResultadoDeEscrita } from "./app-state";
import {
  MAX_MOMENTOS_DE_MODELO,
  saoModelosDeGuiao,
  type ModeloDeGuiao,
} from "./orcamento/guiao-modelos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MODELOS DE GUIÃO QUE ELA GUARDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Onde ficam, e porquê aqui ─────────────────────────────────────────────
 *
 * Na tabela `app_state`, que já existe e é exactamente isto: uma chave para um
 * valor JSON. É a mesma decisão — e a mesma razão — dos modelos de PROPOSTA em
 * `proposal-templates.ts`: um modelo de guião tem uns dois KB (uma dúzia de
 * momentos, três campos cada) e não vale um passo manual de SQL numa
 * instalação já a funcionar. Uma tabela nova obrigaria a correr um
 * `create table` à mão antes de a funcionalidade servir para alguma coisa, e
 * uma funcionalidade que só arranca depois de alguém abrir o painel do Supabase
 * é uma funcionalidade que não existe.
 *
 * ── E POR ISSO O FICHEIRO NÃO SE CHAMA `-store` ───────────────────────────
 *
 * Chamou-se, durante uma tarde, e um teste apanhou-o: nesta casa um
 * `src/lib/*-store.ts` é uma entidade com TABELA PRÓPRIA por trás de um
 * `Repository`, e o `backup/route.coverage.test.ts` lê a pasta do disco e exige
 * a cada um deles um `mapper.table` que apareça na cópia de segurança. É uma
 * rede boa e está certa — o defeito que a fez nascer foi alguém acrescentar as
 * faturas e os contratos e esquecer-se de os pôr no backup.
 *
 * Isto não é um desses: é uma chave numa tabela partilhada, exactamente como o
 * `proposal-templates.ts` (que, pela mesma razão, também não se chama `-store`).
 * O nome passou a dizer o que a coisa é. Afrouxar a rede para o sufixo caber
 * era pagar com a rede o preço de um nome mal escolhido.
 *
 * ── O que NÃO está aqui ───────────────────────────────────────────────────
 *
 * Os modelos DA CASA (`MODELOS_DA_CASA`, em `orcamento/guiao-modelos.ts`).
 * Vêm com o produto, são iguais em todas as instalações e não se apagam — e por
 * isso não têm nada que ocupar espaço numa base de dados nem que ser lidos numa
 * viagem. A rota junta os dois lados; o que se guarda são os DELA.
 *
 * ── Nunca lança ───────────────────────────────────────────────────────────
 *
 * O `app-state` regista a falha e devolve `null`. Sem base de dados, a lista de
 * modelos aparece com os da casa e o resto do ecrã funciona — degrada, não
 * bloqueia. O que MUDA face a essa regra é a gravação: essa diz onde ficou, e
 * quem chama tem de olhar (ver `guardarModelo`), porque um «Guardado» sobre uma
 * escrita que se perdeu é o defeito que o `app-state.ts` conta por extenso.
 */

const CHAVE = "guiao-templates";

/**
 * Tectos.
 *
 * Isto vive todo numa LINHA de `app_state`: cada leitura traz a lista inteira e
 * cada gravação reescreve-a. Sem tecto, dois anos de «guardar como modelo»
 * transformam uma linha da base de dados num objecto que é lido a cada abertura
 * da vista. Quarenta modelos é muito mais do que alguém consegue distinguir
 * numa lista de escolha; o tecto de bytes é a rede para o caso de um modelo com
 * duzentos momentos.
 */
export const MAX_MODELOS = 40;
export const MAX_BYTES = 256 * 1024;

export class ModeloDemasiadoGrande extends Error {}
export class DemasiadosModelos extends Error {}

function tamanho(v: unknown): number {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Os modelos dela, saneados — nunca os da casa. */
export async function listarModelosDeGuiao(): Promise<ModeloDeGuiao[]> {
  return saoModelosDeGuiao(await getState<unknown>(CHAVE));
}

/**
 * Guarda um modelo e devolve a lista nova mais o destino da escrita.
 *
 * Um `id` já existente SUBSTITUI — é o que faz «guardar por cima do meu
 * Casamento de tarde» funcionar sem deixar dois com o mesmo nome.
 *
 * O `ResultadoDeEscrita` sobe até à rota de propósito: sem base de dados
 * configurada em produção, isto escreve para o disco da função e desaparece no
 * deploy seguinte. Dizer «Guardado» sobre isso é a avaria que o `app-state.ts`
 * documenta — a rota traduz este resultado numa frase que diz a verdade.
 */
export async function guardarModeloDeGuiao(
  modelo: ModeloDeGuiao,
): Promise<{ modelos: ModeloDeGuiao[]; escrita: ResultadoDeEscrita }> {
  if (modelo.momentos.length > MAX_MOMENTOS_DE_MODELO || tamanho(modelo) > MAX_BYTES) {
    throw new ModeloDemasiadoGrande();
  }
  // Para mudar: uma leitura falhada lança, nunca grava uma lista vazia por
  // cima dos modelos que lá estão (auditoria de 13/11).
  const atuais = saoModelosDeGuiao(await getState<unknown>(CHAVE, { ouFalha: true }));
  const semEste = atuais.filter((m) => m.id !== modelo.id);
  if (semEste.length >= MAX_MODELOS) throw new DemasiadosModelos();
  // Mais recente primeiro: é a ordem por que são úteis.
  const modelos = [modelo, ...semEste];
  const escrita = await setState(CHAVE, modelos);
  return { modelos, escrita };
}

export async function apagarModeloDeGuiao(
  id: string,
): Promise<{ modelos: ModeloDeGuiao[]; escrita: ResultadoDeEscrita }> {
  const modelos = saoModelosDeGuiao(await getState<unknown>(CHAVE, { ouFalha: true })).filter(
    (m) => m.id !== id,
  );
  const escrita = await setState(CHAVE, modelos);
  return { modelos, escrita };
}
