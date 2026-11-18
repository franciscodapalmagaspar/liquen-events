import "server-only";
import { getSupabase } from "./supabase";
import { lerComNovaTentativa } from "./repository";
import { log } from "./logger";
import { vigiarChave, vigiarValor } from "./app-state/vigiar";
import { comTecto, TEMPO_POR_TENTATIVA_MS } from "./app-state/tecto";
import { emFila, escreverFicheiro, mudarFicheiro, readFileState } from "./app-state/ficheiro";
import {
  comTentativas,
  motivoDaFalha,
  oFicheiroEhEfemero,
  type ResultadoDeEscrita,
} from "./app-state/resultado";
import { comoPrefixo } from "./app-state/like";
export {
  oFicheiroEhEfemero,
  type MotivoDeFalha,
  type OndeFicou,
  type ResultadoDeEscrita,
} from "./app-state/resultado";

/**
 * Tiny persistent key-value state for operational markers (e.g. the list of
 * closed weddings already sent to Meta). Supabase-backed when configured —
 * a local file is EPHEMERAL on serverless, so markers stored there reset on
 * every deploy/instance swap. Falls back to data/app-state.json in dev.
 *
 * Never throws: a broken marker must degrade (worst case, a duplicate
 * notification), not take the caller down. Failures are logged.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MAS «NÃO LANÇA» NUNCA PODE QUERER DIZER «NÃO SE SABE»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `setState` apanhava o erro da escrita, registava-o, e fazia `return` — a
 * mesma coisa, vista de fora, que uma gravação bem sucedida. Enquanto isto
 * guardou apenas marcadores de operação (os fechos já enviados à Meta) o
 * pior que acontecia era uma notificação repetida, e o desenho estava certo.
 *
 * Deixou de estar no dia em que os RASCUNHOS do estúdio passaram a viver aqui.
 * O percurso, tal como aconteceu: uma colaboradora montou uma proposta inteira
 * — fotos, textos, orçamento —, a tabela `app_state` não existia naquela
 * instalação (o `db/schema.sql` estava por correr), cada gravação falhava, e
 * cada falha era engolida. `saveProposalDraft` devolvia o rascunho como se
 * estivesse guardado, a rota respondia OK, e o estúdio escreveu «guardado às
 * 14:32». Estava mesmo guardado — no `localStorage` daquele portátil. A dona do
 * negócio abriu noutro computador e não estava lá nada.
 *
 * Por isso `setState` passa a DIZER onde é que a coisa ficou. Continua a não
 * lançar (uma edição nunca pode falhar por a gravação ter falhado), e quem só
 * quer disparar e esquecer continua a escrever `await setState(...)` sem olhar
 * para o resultado — o que muda é que quem PRECISA de saber já pode perguntar.
 *
 * ── E «ONDE FICOU» TEM DE INCLUIR «QUANTO TEMPO FICA» ──────────────────────
 *
 * A primeira versão disto dizia `{ gravado: true, onde: "ficheiro" }` sempre
 * que não havia Supabase — em produção também. Em Vercel esse ficheiro vive no
 * disco da função: não sobrevive a um deploy e muitas vezes nem à invocação
 * seguinte. Ou seja, era o mesmo defeito com outra roupa — ali a mentira era
 * sobre ter escrito, aqui era sobre o sítio DURAR. Daí o `duradouro` e o
 * `onde: "ficheiro-efemero"`: a escrita aconteceu, e não conta como guardada
 * onde não dura.
 */

/**
 * A leitura falhou (o Supabase não respondeu, ou respondeu com erro) — o que
 * é DIFERENTE de «não há nada guardado». Ver `getState(chave, { ouFalha: true })`.
 */
export class LeituraFalhou extends Error {
  constructor(
    readonly key: string,
    readonly causa: unknown,
  ) {
    super(`Não foi possível ler «${key}» da base de dados.`);
    this.name = "LeituraFalhou";
  }
}

/**
 * Lê uma chave, com as mesmas tentativas da escrita: um erro passageiro (o
 * PGRST303 do relógio, uma ligação que cai) repete-se antes de desistir.
 */
async function lerComTentativas<T>(
  key: string,
): Promise<{ ok: true; valor: T | null } | { ok: false; erro: unknown }> {
  const sb = getSupabase();
  if (!sb) {
    const all = await readFileState();
    vigiarValor(key, all[key]);
    return { ok: true, valor: (all[key] as T) ?? null };
  }
  const r = await comTentativas(() =>
    sb.from("app_state").select("value").eq("key", key).maybeSingle(),
  );
  if (!r.ok) return { ok: false, erro: r.erro };
  const valor = r.resposta.data?.value;
  vigiarValor(key, valor);
  return { ok: true, valor: (valor as T) ?? null };
}

/**
 * Lê uma chave.
 *
 * Por omissão, uma leitura falhada dá `null`, como «não há nada» — serve a
 * quem SÓ LÊ (mostrar, decidir se vale a pena fazer uma coisa).
 *
 * Quem lê para MUDAR e voltar a gravar passa `{ ouFalha: true }`: aí `null`
 * quer mesmo dizer «não há nada», e uma leitura falhada LANÇA
 * {@link LeituraFalhou}. Sem isto, um erro passageiro parecia uma chave vazia
 * e a escrita seguinte apagava o que lá estava — palavras-passe redefinidas,
 * modelos, o histórico dos envios (auditoria de 13/11).
 */
export async function getState<T>(key: string, opcoes?: { ouFalha?: boolean }): Promise<T | null> {
  const r = await lerComTentativas<T>(key);
  if (r.ok) return r.valor;
  if (opcoes?.ouFalha) {
    log.error("app-state: leitura para escrita falhou — a escrita não se faz", r.erro, { key });
    throw new LeituraFalhou(key, r.erro);
  }
  log.error("app-state: leitura falhou (a tabela app_state existe? ver db/schema.sql)", r.erro, {
    key,
  });
  return null;
}

/**
 * Várias chaves conhecidas, numa ida só (`key in (…)`), em lotes de 100.
 *
 * Existe para o índice dos resumos das fotografias (`fotos-resumo.ts`): a
 * importação pergunta por 20 ou 30 resumos de uma vez, e 30 leituras soltas
 * eram 30 idas à base de dados. Só devolve as chaves que existem.
 *
 * Nunca lança. Uma leitura falhada devolve um mapa VAZIO — quem chama tem de
 * o ler como «não sei», nunca como «não existe» numa decisão de apagar. (O
 * índice só o usa para decidir NÃO guardar uma cópia; vazio = guarda-se, que é
 * o comportamento de antes.)
 */
export async function getStates<T>(keys: readonly string[]): Promise<Map<string, T>> {
  const saida = new Map<string, T>();
  const unicas = [...new Set(keys.filter((k) => typeof k === "string" && k))];
  if (unicas.length === 0) return saida;
  const sb = getSupabase();
  if (!sb) {
    const all = await readFileState();
    for (const k of unicas) {
      if (!(k in all)) continue;
      vigiarValor(k, all[k]);
      saida.set(k, all[k] as T);
    }
    return saida;
  }
  try {
    for (let i = 0; i < unicas.length; i += 100) {
      const { data, error } = await comTecto(
        sb
          .from("app_state")
          .select("key, value")
          .in("key", unicas.slice(i, i + 100)),
        TEMPO_POR_TENTATIVA_MS,
      );
      if (error) throw error;
      for (const r of data ?? []) {
        vigiarValor(r.key, r.value);
        saida.set(r.key, r.value as T);
      }
    }
    return saida;
  } catch (err) {
    log.error("app-state: leitura de várias chaves falhou", err, { n: unicas.length });
    return new Map();
  }
}

/**
 * Todas as entradas cuja chave começa por `prefix`.
 *
 * Existe por causa de UMA pergunta que não se conseguia responder de outra
 * maneira: *quais os rascunhos do estúdio que usam esta foto da Biblioteca?*
 * Os rascunhos vivem aqui, com a chave `proposal-draft:<pedido>` (ver
 * `proposal-drafts.ts`), e apagar uma foto sem saber quem a usa é a única
 * forma de a referência — em vez da cópia — poder perder trabalho.
 *
 * Não é para o caminho de leitura de nada: é uma varredura, chamada quando ela
 * apaga uma foto ou um tema. Por isso tem tecto, e o tecto é reportado a quem
 * chama em vez de ser escondido — uma varredura truncada não pode passar por
 * uma varredura completa numa decisão sobre perder fotos.
 */
/** O tecto do PostgREST por resposta (`max-rows`, 1000 no Supabase). */
const PAGINA_DO_ESTADO = 1000;

export async function listStateByPrefix<T>(
  prefix: string,
  limite = 2000,
): Promise<{ entradas: { key: string; value: T }[]; completa: boolean }> {
  const sb = getSupabase();
  if (sb) {
    try {
      /**
       * Às páginas de {@link PAGINA_DO_ESTADO}: o PostgREST corta CADA resposta
       * nas 1000 linhas sem avisar, e um `.limit(limite + 1)` maior do que isso
       * voltava com 1000 e dizia-se «completa» (revisão de 13/11, n.º 1). Ordem
       * pela chave, que é única: as páginas não se repetem nem saltam linhas.
       */
      const linhas: { key: string; value: T }[] = [];
      for (let desde = 0; linhas.length <= limite; desde += PAGINA_DO_ESTADO) {
        const ate = Math.min(desde + PAGINA_DO_ESTADO, limite + 1) - 1;
        // Com nova tentativa no PGRST303 («JWT issued at future»), como o
        // repositório: a 16/11 uma recusa passageira deixou a cópia da noite
        // sem os emails das propostas (`proposalEmails`).
        const { data, error } = await lerComNovaTentativa(() =>
          sb
            .from("app_state")
            .select("key, value")
            // `%` e `_` são curingas do LIKE: escapá-los impede que um prefixo
            // com um deles varra mais do que devia.
            .like("key", comoPrefixo(prefix))
            .order("key", { ascending: true })
            .range(desde, ate),
        );
        if (error) throw error;
        const pagina = data ?? [];
        for (const l of pagina) {
          vigiarValor(l.key, l.value);
          linhas.push({ key: l.key, value: l.value as T });
        }
        if (pagina.length < ate - desde + 1) break;
      }
      return { entradas: linhas.slice(0, limite), completa: linhas.length <= limite };
    } catch (err) {
      log.error("app-state: varredura por prefixo falhou", err, { prefix });
      // Devolver "vazio e completo" faria quem chama concluir que ninguém usa a
      // foto. Vazio e INCOMPLETO é a verdade: não se sabe.
      return { entradas: [], completa: false };
    }
  }
  const all = await readFileState();
  const entradas = Object.entries(all)
    .filter(([k]) => k.startsWith(prefix))
    .map(([key, value]) => {
      vigiarValor(key, value);
      return { key, value: value as T };
    });
  return { entradas: entradas.slice(0, limite), completa: entradas.length <= limite };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LEITURA COM VERSÃO E ESCRITA CONDICIONAL (revisão de 13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Para quem lê-muda-grava um registo partilhado e não pode perder uma escrita
 * que entre no meio (dois «Sair» ao mesmo tempo, ver `sessoes-revogadas.ts`).
 *
 * `lerEstadoComVersao` lê UMA vez, com tecto `tectoMs` e SEM repetições (quem
 * chama decide o que fazer com a falha — o caminho quente não pode ficar 24 s
 * à espera de três tentativas). A versão é o `updated_at` da linha (`null`
 * quando a linha não existe).
 *
 * `gravarEstadoSeNaoMudou` só grava se a linha ainda estiver na versão lida:
 *  · `"gravado"`   — ficou;
 *  · `"conflito"`  — alguém escreveu entretanto: relê e tenta outra vez;
 *  · `"falhou"`    — a escrita não se fez (erro ou tempo esgotado).
 *
 * Sem base de dados (desenvolvimento) a versão é o próprio valor em JSON, e a
 * comparação e a escrita fazem-se dentro da fila do ficheiro.
 */
export type VersaoDoEstado = string | null;

export async function lerEstadoComVersao<T>(
  key: string,
  tectoMs: number,
): Promise<{ valor: T | null; versao: VersaoDoEstado }> {
  const sb = getSupabase();
  if (!sb) {
    const all = await readFileState();
    vigiarValor(key, all[key]);
    const valor = (all[key] as T) ?? null;
    return { valor, versao: valor === null ? null : JSON.stringify(valor) };
  }
  const { data, error } = await comTecto(
    sb.from("app_state").select("value, updated_at").eq("key", key).maybeSingle(),
    tectoMs,
  );
  if (error) throw error;
  if (!data) return { valor: null, versao: null };
  vigiarValor(key, data.value);
  return {
    valor: (data.value as T) ?? null,
    // Não-nula pelo esquema; o `""` fica para uma linha escrita à mão sem ela.
    versao: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

export async function gravarEstadoSeNaoMudou<T>(
  key: string,
  value: T,
  versao: VersaoDoEstado,
  tectoMs: number = TEMPO_POR_TENTATIVA_MS,
): Promise<"gravado" | "conflito" | "falhou"> {
  vigiarChave(key);
  const sb = getSupabase();
  if (!sb) {
    if (oFicheiroEhEfemero()) return "falhou";
    try {
      return await emFila(async () => {
        const all = await readFileState();
        const atual = all[key] === undefined ? null : JSON.stringify(all[key]);
        if (atual !== versao) return "conflito" as const;
        all[key] = value;
        await escreverFicheiro(all);
        return "gravado" as const;
      });
    } catch (err) {
      log.error("app-state: escrita condicional em ficheiro falhou", err, { key });
      return "falhou";
    }
  }
  const agora = new Date().toISOString();
  try {
    if (versao === null) {
      // A linha ainda não existia: inserir. Se outra escrita a criou entretanto,
      // a chave primária recusa — é um conflito, não uma avaria.
      const { error } = await comTecto(
        sb.from("app_state").insert({ key, value, updated_at: agora }),
        tectoMs,
      );
      if (!error) return "gravado";
      if ((error as { code?: unknown }).code === "23505") return "conflito";
      throw error;
    }
    const base = sb.from("app_state").update({ value, updated_at: agora }).eq("key", key);
    const guardada = versao === "" ? base.is("updated_at", null) : base.eq("updated_at", versao);
    const { data, error } = await comTecto(guardada.select("key"), tectoMs);
    if (error) throw error;
    return (data ?? []).length > 0 ? "gravado" : "conflito";
  } catch (err) {
    log.error("app-state: escrita condicional falhou", err, { key });
    return "falhou";
  }
}

export {
  apagarEstado,
  apagarEstadoPorPrefixo,
  apagarEstadoSeNaoMudou,
  apagarLapides,
} from "./app-state/apagar";

/**
 * Grava, e DIZ se gravou.
 *
 * Continua a não lançar — quem chama pode ignorar o resultado exactamente como
 * ignorava o `void`, e nada do que já existia muda de comportamento. Quem
 * escreve trabalho de uma pessoa (os rascunhos do estúdio) tem, agora, como
 * saber que não escreveu.
 */
export async function setState<T>(key: string, value: T): Promise<ResultadoDeEscrita> {
  vigiarChave(key);
  const sb = getSupabase();
  if (sb) {
    const r = await comTentativas(() =>
      sb.from("app_state").upsert({ key, value, updated_at: new Date().toISOString() }),
    );
    if (r.ok) return { gravado: true, duradouro: true, onde: "servidor" };
    const ultimoErro = r.erro;
    const motivo = motivoDaFalha(ultimoErro);
    log.error(
      "app-state: escrita falhou (a tabela app_state existe? ver db/schema.sql)",
      ultimoErro,
      {
        key,
        motivo,
      },
    );
    return { gravado: false, duradouro: false, onde: "nenhures", motivo };
  }
  try {
    // Ler-mutar-escrever em fila: ver `emFila`. Sem isto, o que se grava aqui é
    // o mapa como ele estava para ESTA chamada, e quem entrar a seguir apaga a
    // chave que esta acabou de pôr.
    await mudarFicheiro((all) => {
      all[key] = value;
    });
    // A escrita aconteceu nos dois casos. O que muda — e é tudo o que muda — é
    // o que se DIZ sobre o sítio onde ela ficou.
    if (oFicheiroEhEfemero()) {
      // `warn` e não `error`: isto não é uma avaria, é uma instalação sem base
      // de dados. O `env.ts` já grita por SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
      // no arranque; esta linha é para quem for ver os registos depois de o
      // trabalho desaparecer, e diz-lhe exactamente onde ele tinha ficado.
      log.warn(
        "app-state: escrita só no disco efémero da função — não sobrevive a um deploy (falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
        { key },
      );
      return { gravado: true, duradouro: false, onde: "ficheiro-efemero" };
    }
    return { gravado: true, duradouro: true, onde: "ficheiro" };
  } catch (err) {
    log.error("app-state: escrita em ficheiro falhou", err, { key });
    return { gravado: false, duradouro: false, onde: "nenhures", motivo: "escrita-recusada" };
  }
}
