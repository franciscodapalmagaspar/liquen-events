import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getSupabase } from "./supabase";
import { eRelogioAdiantado, isMissingTable } from "./repository";
import { log } from "./logger";

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
const FILE = path.join(process.cwd(), "data", "app-state.json");

/**
 * Porque é que a escrita não ficou. Não é decoração: cada um destes tem uma
 * resolução DIFERENTE do lado de quem gere a instalação, e é essa a diferença
 * entre um «Erro interno» que não indica caminho nenhum e uma frase que diz o
 * que fazer a seguir.
 *
 *  - `tabela-em-falta`  → falta correr o `db/schema.sql` no Supabase;
 *  - `sem-permissao`    → a tabela existe mas a chave usada não a pode escrever
 *                         (chave `anon` em vez da `service_role`, ou uma
 *                         política de RLS a recusar a linha);
 *  - `escrita-recusada` → tudo o resto: rede, tempo esgotado, avaria.
 */
export type MotivoDeFalha = "tabela-em-falta" | "sem-permissao" | "escrita-recusada";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MESMO FICHEIRO É UM SÍTIO NUMA MÁQUINA E NÃO É UM SÍTIO EM VERCEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Na máquina de alguém, o `data/app-state.json` é o servidor local: sobrevive a
 * fechar o portátil, é visível de qualquer navegador que fale com ele, e é o
 * recurso legítimo de quem trabalha sem base de dados. Em Vercel, o MESMO
 * ficheiro vive no disco da função — não sobrevive a um deploy, e muitas vezes
 * nem à invocação seguinte, porque o contentor é reciclado.
 *
 * A diferença é o AMBIENTE, e é por isso que a distinção vive aqui e não numa
 * propriedade do ficheiro. A regra é a MESMA que o `repository.assertWritableInProd`
 * e o restauro (`backup-restore.replaceAll`) já usam para recusar escritas —
 * deliberadamente a mesma, para não haver duas ideias diferentes de «isto é
 * produção» a divergirem com o tempo.
 *
 * Lê-se na hora e não no arranque do módulo: os testes trocam o ambiente por
 * caso, e um valor congelado à importação fazia o segundo caso responder o do
 * primeiro.
 */
export function oFicheiroEhEfemero(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Onde a escrita ficou mesmo.
 *
 *  - `servidor`         → a tabela `app_state`. Dura.
 *  - `ficheiro`         → o `data/app-state.json` de uma máquina de trabalho.
 *                         Dura o que a máquina durar, que é o que se pede.
 *  - `ficheiro-efemero` → o mesmo ficheiro, no disco de uma função serverless.
 *                         Melhor do que nada — quem gravou ainda o relê nesta
 *                         invocação — e insuficiente: um deploy apaga-o.
 *  - `nenhures`         → não ficou.
 */
export type OndeFicou = "servidor" | "ficheiro" | "ficheiro-efemero" | "nenhures";

/**
 * O que aconteceu a uma escrita.
 *
 * São DUAS perguntas, e confundi-las foi o defeito:
 *
 *  - `gravado`   → «a escrita aconteceu nalgum lado?». É o que a maior parte de
 *                  quem chama precisa: distingue uma edição que foi escrita de
 *                  uma que se perdeu na hora.
 *  - `duradouro` → «esse lado sobrevive a um deploy?». É a pergunta que faltava.
 *                  Uma escrita no disco efémero da função responde `true` à
 *                  primeira e `false` a esta, e quem diz «Guardado» à pessoa
 *                  que está a trabalhar tem de olhar para as duas.
 */
export interface ResultadoDeEscrita {
  gravado: boolean;
  duradouro: boolean;
  onde: OndeFicou;
  motivo?: MotivoDeFalha;
}

/** Uma escrita recusada por falta de autorização — do Postgres (42501,
 *  `insufficient_privilege`) ou da política de RLS, que o PostgREST devolve com
 *  o mesmo código e a mensagem da política. */
function ehSemPermissao(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ((err as { code?: unknown }).code === "42501") return true;
  const msg = (err as { message?: unknown }).message;
  return (
    typeof msg === "string" &&
    /permission denied|row-level security|insufficient[_ ]privilege|not authorized|jwt/i.test(msg)
  );
}

function motivoDaFalha(err: unknown): MotivoDeFalha {
  // O relógio adiantado (PGRST303, «JWT issued at future») é PASSAGEIRO e
  // repete-se — mas a mensagem diz «JWT», e a regra de baixo tomava-o por uma
  // permissão recusada, que nunca se repete. Resultado: nenhuma escrita nem
  // leitura do app_state repetia o erro mais comum (auditoria de 13/11). A
  // mesma deteção do `repository.ts` (`eRelogioAdiantado`).
  if (eRelogioAdiantado(err)) return "escrita-recusada";
  if (isMissingTable(err)) return "tabela-em-falta";
  if (ehSemPermissao(err)) return "sem-permissao";
  return "escrita-recusada";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FALHA PASSAGEIRA NÃO PODE CUSTAR UM RASCUNHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mesmo desenho que `proposal-storage.descarregar` já usa para as fotos, e
 * pela mesma razão: uma ligação reciclada do outro lado, um pico no Supabase, e
 * a gravação morria à primeira. Aqui o que morre é a montagem de uma proposta.
 *
 * Duas tentativas extra, com pausa curta e crescente (150 ms, 300 ms), e um
 * tecto de tempo por tentativa — sem ele um pedido pendurado fica com a rota
 * inteira na mão até a plataforma matar a função.
 *
 * O que NÃO se repete: uma tabela em falta e uma permissão recusada. Essas
 * respondem exactamente o mesmo à terceira vez que à primeira, e repeti-las só
 * atrasa o momento em que o ecrã pode dizer a verdade.
 */
const TENTATIVAS = 3;
const PAUSA_MS = 150;
const TEMPO_POR_TENTATIVA_MS = 8000;

async function comTecto<T>(trabalho: PromiseLike<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      trabalho,
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error("tempo esgotado")), ms);
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

async function readFileState(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FICHEIRO É UM MAPA INTEIRO: DUAS ESCRITAS AO MESMO TEMPO SÃO UMA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Aqui não se grava uma linha, grava-se o mapa TODO: ler o ficheiro, pôr a
 * chave, escrever o ficheiro. Há um `await` no meio, e é isso que estraga tudo
 * — duas chamadas em paralelo lêem ambas o mapa ANTES de qualquer uma escrever,
 * e a segunda grava por cima o mapa dela, sem a chave da primeira. A primeira
 * escrita aconteceu mesmo; foi a seguinte que a apagou.
 *
 * Onde isto doeu: a REPOSIÇÃO de uma cópia de segurança repõe os rascunhos do
 * estúdio em lotes de 25 chamadas paralelas (ver `proposal-drafts.ts`). Medido,
 * de 25 escritas sobrevivia UMA — e a reposição reportava sucesso total, porque
 * cada `setState` devolvia honestamente `{ gravado: true }` sobre uma escrita
 * que de facto tinha acontecido.
 *
 * A solução é a MESMA que o `FileBackend` do `repository.ts` já usa pela mesma
 * razão, e deliberadamente igual para não haver duas ideias diferentes de como
 * se serializa uma escrita a um ficheiro: encadear as operações numa fila, de
 * modo a que o ler-mutar-escrever seja atómico dentro do processo. A fila é do
 * MÓDULO porque o ficheiro também é (há um só `FILE`).
 *
 * O que isto NÃO resolve — e não pode: dois processos a escrever no mesmo
 * ficheiro. Continua a ser um recurso de desenvolvimento; em produção quem
 * guarda é o Supabase, e é o caminho de cima que trata disso.
 */
let filaDoFicheiro: Promise<unknown> = Promise.resolve();

function emFila<R>(trabalho: () => Promise<R>): Promise<R> {
  // `then(fn, fn)`: uma escrita que falhou não pode deixar a fila entupida para
  // as seguintes.
  const corrida = filaDoFicheiro.then(trabalho, trabalho);
  filaDoFicheiro = corrida.then(
    () => {},
    () => {},
  );
  return corrida;
}

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
    return { ok: true, valor: (all[key] as T) ?? null };
  }
  let ultimoErro: unknown = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const { data, error } = await comTecto(
        sb.from("app_state").select("value").eq("key", key).maybeSingle(),
        TEMPO_POR_TENTATIVA_MS,
      );
      if (!error) return { ok: true, valor: (data?.value as T) ?? null };
      ultimoErro = error;
    } catch (err) {
      ultimoErro = err;
    }
    if (motivoDaFalha(ultimoErro) !== "escrita-recusada") break;
    if (tentativa < TENTATIVAS) await new Promise((r) => setTimeout(r, PAUSA_MS * tentativa));
  }
  return { ok: false, erro: ultimoErro };
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
        const { data, error } = await sb
          .from("app_state")
          .select("key, value")
          // `%` e `_` são curingas do LIKE: escapá-los impede que um prefixo com
          // um deles varra mais do que devia.
          .like("key", `${prefix.replace(/([%_\\])/g, "\\$1")}%`)
          .order("key", { ascending: true })
          .range(desde, ate);
        if (error) throw error;
        const pagina = (data ?? []) as { key: string; value: T }[];
        linhas.push(...pagina);
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
    .map(([key, value]) => ({ key, value: value as T }));
  return { entradas: entradas.slice(0, limite), completa: entradas.length <= limite };
}

/**
 * Apaga as entradas cuja chave começa por `prefix` E é menor do que
 * `chaveAntesDe` (comparação de texto) — e só essas.
 *
 * Existe para os registos com a DATA dentro da chave (`<prefixo><AAAA-MM-DD>:…`,
 * ver `diagnostico-video`): com a data no formato ISO, «a chave é menor do que
 * `<prefixo><dia>`» é exactamente «é de antes desse dia». As duas condições
 * vão juntas para a base de dados, numa só ordem: nada fora do prefixo pode
 * sair por engano.
 *
 * Devolve quantas saíram, ou `null` quando não se conseguiu apagar (o erro
 * fica registado; quem chama tenta outra vez na noite seguinte).
 */
export async function apagarEstadoPorPrefixo(
  prefix: string,
  chaveAntesDe: string,
): Promise<number | null> {
  if (!prefix || !chaveAntesDe.startsWith(prefix)) return 0;
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await comTecto(
        sb
          .from("app_state")
          .delete()
          .like("key", `${prefix.replace(/([%_\\])/g, "\\$1")}%`)
          .lt("key", chaveAntesDe)
          .select("key"),
        TEMPO_POR_TENTATIVA_MS,
      );
      if (error) throw error;
      return (data ?? []).length;
    } catch (err) {
      log.error("app-state: apagar por prefixo falhou", err, { prefix });
      return null;
    }
  }
  try {
    return await emFila(async () => {
      const all = await readFileState();
      const sair = Object.keys(all).filter((k) => k.startsWith(prefix) && k < chaveAntesDe);
      if (sair.length === 0) return 0;
      for (const k of sair) delete all[k];
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(all, null, 2));
      return sair.length;
    });
  } catch (err) {
    log.error("app-state: apagar por prefixo em ficheiro falhou", err, { prefix });
    return null;
  }
}

/**
 * Grava, e DIZ se gravou.
 *
 * Continua a não lançar — quem chama pode ignorar o resultado exactamente como
 * ignorava o `void`, e nada do que já existia muda de comportamento. Quem
 * escreve trabalho de uma pessoa (os rascunhos do estúdio) tem, agora, como
 * saber que não escreveu.
 */
export async function setState<T>(key: string, value: T): Promise<ResultadoDeEscrita> {
  const sb = getSupabase();
  if (sb) {
    let ultimoErro: unknown = null;
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        const { error } = await comTecto(
          sb.from("app_state").upsert({ key, value, updated_at: new Date().toISOString() }),
          TEMPO_POR_TENTATIVA_MS,
        );
        if (!error) return { gravado: true, duradouro: true, onde: "servidor" };
        ultimoErro = error;
      } catch (err) {
        ultimoErro = err;
      }
      // Instalação incompleta: repetir dá a mesma resposta e só atrasa o aviso.
      if (motivoDaFalha(ultimoErro) !== "escrita-recusada") break;
      if (tentativa < TENTATIVAS) {
        await new Promise((r) => setTimeout(r, PAUSA_MS * tentativa));
      }
    }
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
    await emFila(async () => {
      const all = await readFileState();
      all[key] = value;
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(all, null, 2));
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
