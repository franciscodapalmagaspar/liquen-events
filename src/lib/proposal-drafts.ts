import "server-only";
import { ESPACOS } from "@/lib/app-state/espacos";
import {
  apagarEstado,
  getState,
  listStateByPrefix,
  setState,
  type MotivoDeFalha,
  type ResultadoDeEscrita,
} from "./app-state";
import type { Mapper } from "./repository";

/**
 * Rascunhos do estúdio de propostas, guardados NO SERVIDOR.
 *
 * Porquê: até aqui o rascunho — os mood boards, as fotos colocadas, os textos,
 * os valores — vivia só no `localStorage` do navegador. Começar a proposta no
 * portátil e continuá-la no tablet não funcionava, e limpar o histórico
 * apagava trabalho. As FOTOS nunca se perdiam (essas já são copiadas para o
 * Storage quando escolhidas), mas a montagem sim.
 *
 * Onde: na tabela `app_state`, que já existe e é exatamente isto — uma chave
 * para um valor JSON. Deliberadamente NÃO se criou uma tabela nova: um
 * rascunho tem alguns KB (guarda caminhos de fotos, não bytes) e não vale mais
 * um passo manual de SQL numa instalação já a funcionar.
 *
 * Nunca lança: `app-state` regista a falha e devolve null. Sem base de dados o
 * estúdio continua a funcionar com a cópia local do navegador, como antes —
 * degrada para o comportamento antigo em vez de bloquear a edição.
 *
 * ── E DEGRADAR EM SILÊNCIO É QUE NÃO ───────────────────────────────────────
 *
 * Esta última frase estava aqui escrita antes de isto acontecer, e estava
 * incompleta. «Degrada para o comportamento antigo» é verdade; o que faltava
 * dizer é que degradava sem NINGUÉM saber — a gravação falhava, `saveProposalDraft`
 * devolvia o rascunho na mesma, a rota respondia OK e o estúdio escrevia
 * «guardado às 14:32». Uma proposta inteira ficou presa no `localStorage` de um
 * portátil e não existia em mais lado nenhum; quem a foi ver noutro computador
 * encontrou o ecrã vazio.
 *
 * Uma degradação anunciada é uma degradação. Uma degradação em silêncio é uma
 * perda. Por isso `saveProposalDraft` devolve, agora, ONDE é que o rascunho
 * ficou — e a rota e o ecrã levam essa verdade até à pessoa que está a
 * trabalhar, que é a única que pode fazer alguma coisa com ela (não fechar o
 * portátil, avisar quem gere a instalação).
 */

/** O rascunho tal como fica guardado. `doc` é o documento do estúdio. */
export interface StoredProposalDraft {
  doc: unknown;
  /** Quando foi gravado (ISO). É o que permite dizer qual das cópias é a mais
   *  recente quando a mesma proposta é aberta em dois sítios. */
  updatedAt: string;
  /** Quem gravou, para o aviso poder dizer "alterado por…" em vez de só
   *  "alterado noutro sítio". */
  savedBy?: string;
}

/** O espaço de nomes dos rascunhos dentro do `app_state`. Exportado porque há
 *  quem precise de os VARRER e não apenas de ler um: apagar uma foto da
 *  Biblioteca tem de saber que rascunhos a usam (ver `theme-materializar.ts`). */
export const DRAFT_PREFIX = ESPACOS.rascunhos.chave;

/** Chave do rascunho de um pedido. O id é saneado para não poder colidir com
 *  outras chaves do `app_state` (nem sair do seu espaço de nomes). */
export function draftKey(quoteId: string): string {
  return `${DRAFT_PREFIX}${quoteId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * Esta chave está mesmo dentro do espaço de nomes dos rascunhos?
 *
 * A forma é a que o `draftKey` produz e mais nenhuma. Não é zelo decorativo: a
 * REPOSIÇÃO escreve chaves vindas de um ficheiro que alguém carregou, e o
 * `app_state` é uma tabela partilhada — sem esta guarda, um ficheiro adulterado
 * (ou corrompido) repunha `invoice-seq-2026` ou o marcador da caixa de entrada
 * pela porta dos rascunhos. Fora deste espaço de nomes a reposição não escreve.
 */
export function ehChaveDeRascunho(key: unknown): key is string {
  return typeof key === "string" && new RegExp(`^${DRAFT_PREFIX}[a-zA-Z0-9_-]+$`).test(key);
}

export async function getProposalDraft(quoteId: string): Promise<StoredProposalDraft | null> {
  const stored = await getState<StoredProposalDraft>(draftKey(quoteId));
  if (!stored || typeof stored !== "object" || !("doc" in stored)) return null;
  return stored;
}

/**
 * O resultado de uma gravação: o rascunho tal como ficaria, e se ficou mesmo.
 *
 * Devolve-se o `draft` mesmo quando `persistencia.gravado` é `false` — de
 * propósito. A marca de tempo é útil ao estúdio (é o que ele compara com a
 * cópia local) e a gravação falhada NÃO é uma edição falhada: o trabalho está
 * no ecrã e na cópia local do navegador. O que muda é o que se DIZ.
 *
 * E são TRÊS desfechos, não dois: gravado no servidor (`gravado` e `duradouro`),
 * gravado num sítio que um deploy apaga (`gravado` sem `duradouro` — ver
 * `avisoDeSitioEfemero`), e não gravado. Quem só olhar para `gravado` continua
 * a ler o que sempre leu; quem diz «Guardado» a uma pessoa tem de olhar para os
 * dois.
 */
export interface RascunhoGravado {
  draft: StoredProposalDraft;
  persistencia: ResultadoDeEscrita;
}

export async function saveProposalDraft(
  quoteId: string,
  doc: unknown,
  savedBy?: string,
): Promise<RascunhoGravado> {
  const draft: StoredProposalDraft = {
    doc,
    updatedAt: new Date().toISOString(),
    ...(savedBy ? { savedBy } : {}),
  };
  const persistencia = await setState(draftKey(quoteId), draft);
  return { draft, persistencia };
}

/** Apaga o rascunho (proposta enviada, ou a equipa limpou-o à mão).
 *  APAGA a linha (até 17/11 gravava `null`, e cada rascunho limpo ficava como
 *  lápide para sempre — docs/ESTRUTURA-DOS-DADOS.md, P3). Ler uma chave que não
 *  existe dá `null`, como dava a lápide: quem lê não nota diferença.
 *
 *  Devolve se a limpeza chegou mesmo ao servidor. Falhar aqui não perde
 *  trabalho — perde-se o contrário, o rascunho fica onde estava e volta a
 *  aparecer —, mas quem chama merece saber, e a rota di-lo. */
export async function clearProposalDraft(quoteId: string): Promise<ResultadoDeEscrita> {
  return apagarEstado(draftKey(quoteId));
}

/**
 * A frase que se diz a quem está a trabalhar quando o rascunho não chegou ao
 * servidor.
 *
 * Mora aqui e não na rota nem no ecrã porque é a mesma frase nos dois sítios, e
 * porque a diferença entre os motivos é a única coisa que transforma «não deu»
 * numa acção: a tabela em falta resolve-se com um ficheiro de SQL, a permissão
 * com a chave certa, e uma avaria de rede resolve-se sozinha (por isso, nessa,
 * o que se diz é para não fechar o portátil).
 */
export function porqueNaoGuardou(motivo: MotivoDeFalha | undefined): string {
  if (motivo === "tabela-em-falta") {
    return "A base de dados não tem a tabela dos rascunhos (falta correr o db/schema.sql no Supabase).";
  }
  if (motivo === "sem-permissao") {
    return "A base de dados recusou a gravação por falta de permissões.";
  }
  return "Não foi possível falar com a base de dados.";
}

/** Repetir muda alguma coisa? Uma tabela que não existe e uma permissão
 *  recusada respondem o mesmo à terceira vez que à primeira — quem tenta outra
 *  vez está só a adiar o aviso. */
export function ehFalhaPermanente(motivo: MotivoDeFalha | undefined): boolean {
  return motivo === "tabela-em-falta" || motivo === "sem-permissao";
}

/**
 * A frase para o caso do meio: o rascunho FICOU, mas no disco efémero da função
 * (produção sem Supabase — ver `oFicheiroEhEfemero` em `app-state.ts`).
 *
 * É uma frase à parte e não um `MotivoDeFalha` porque não houve falha nenhuma:
 * a escrita aconteceu, ela pode fechar o separador e voltar a abrir o rascunho
 * daqui a cinco minutos que ele lá está. O que não pode é ficar descansada — o
 * próximo deploy leva-o. Dizer «Guardado» e mais nada era repetir, com outra
 * roupa, o «guardado às 14:32» que fez desaparecer uma proposta inteira.
 *
 * Diz o que fazer e nomeia as variáveis, porque quem lê isto no estúdio é quem
 * tem de ir ter com quem gere a instalação — e uma frase com o nome da variável
 * poupa-lhe a viagem de descobrir qual é.
 */
export function avisoDeSitioEfemero(): string {
  return (
    "Guardado apenas no disco do servidor, que é apagado no próximo deploy. " +
    "Liga a base de dados (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY) para o trabalho ficar mesmo guardado."
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OS RASCUNHOS NA CÓPIA DE SEGURANÇA
// ════════════════════════════════════════════════════════════════════════════
//
// Porquê aqui e não num `*-store.ts`: os rascunhos não têm tabela própria (ver
// o cabeçalho), vivem num ESPAÇO DE NOMES dentro do `app_state`. Quem sabe
// onde começa e onde acaba esse espaço é este ficheiro — o `DRAFT_PREFIX`, o
// `draftKey` e o `ehChaveDeRascunho` são daqui —, e é por isso que a leitura e
// a escrita em bloco da cópia moram ao lado deles em vez de na cópia.
//
// E era o maior bloco de trabalho IRRECUPERÁVEL do sistema a ficar de fora: a
// tabela estava inteira em `NOT_BACKED_UP` com uma razão escrita quando aqui
// só viviam marcadores de operação («perdidos, o pior que acontece é um aviso
// repetido»). Entretanto passaram a viver aqui as propostas por acabar — fotos
// escolhidas, mood boards compostos, textos — e a frase ficou por corrigir. Um
// rascunho perdido não se reconstrói de lado nenhum: as fotos estão no bucket,
// mas a montagem é trabalho de horas que só existia nesta tabela.

/**
 * Um rascunho tal como vai no ficheiro da cópia.
 *
 * `key` é a chave INTEIRA do `app_state` (`proposal-draft:<pedido>`) e é o
 * identificador do registo. Guardar a chave e não só o id do pedido é o que
 * torna a reposição uma escrita literal — não há uma segunda regra, aqui, a
 * remontar chaves a partir de ids e a divergir do `draftKey` com o tempo.
 */
export interface RascunhoNaCopia {
  key: string;
  doc: unknown;
  updatedAt: string;
  savedBy?: string;
}

/**
 * A tradução entre o rascunho no ficheiro e a linha do `app_state`.
 *
 * Tem a forma de um `Mapper` porque é isso que a reposição pede a todos os
 * conjuntos (`RestoreTarget.mapper`) e porque assim a conversão vive num sítio
 * só, como a dos stores — o `toRow` daqui é o mesmo que a escrita usa, e o
 * teste de ida e volta prova que são inversos.
 *
 * `fileName` é o ficheiro de desenvolvimento do `app-state` e está aqui por
 * honestidade, não por uso: a escrita dos rascunhos NÃO passa pelo caminho de
 * ficheiro genérico da reposição (esse escreveria um array por cima do mapa de
 * chaves e levava os marcadores à frente) — passa pelo `setState`, que já sabe
 * falar com os dois lados.
 */
export const mapper: Mapper<RascunhoNaCopia> = {
  table: "app_state",
  fileName: "app-state.json",
  getId: (r) => r.key,
  /**
   * A chave do `app_state` chama-se `key`, não `id` (db/schema.sql: `key text
   * primary key`). Esta é a segunda tabela do sistema assim — a outra é a
   * `biblioteca_fotos`, cuja chave é `path`, e onde a omissão desta linha custou
   * a etiquetagem, a LQIP e a cor de todas as fotografias em produção: o
   * Supabase perguntava `where id = …`, o Postgres respondia `42703 — column
   * does not exist` e o `isMissingTable` traduzia isso para «a funcionalidade
   * não está instalada».
   *
   * Hoje nenhuma escrita chega a usá-la — os rascunhos têm caminho próprio
   * (`RestoreTarget.replace` → `replaceProposalDrafts` → `setState`), e é por
   * isso que a falta nunca deu erro. Mas o `replaceAll` da reposição JÁ lê
   * `mapper.idColumn ?? "id"` para apagar a tabela, e este mapper é a tradução
   * oficial destas linhas: no dia em que alguém lhe der um `createRepository`
   * ou tirar o `replace`, o `where id = 'proposal-draft:<pedido>'` volta — e o
   * que fica por repor são as propostas por acabar, que não existem em mais
   * lado nenhum. Declará-la custa uma linha e fecha a porta.
   */
  idColumn: "key",
  toRow: (r) => ({
    key: r.key,
    value: {
      doc: r.doc,
      updatedAt: r.updatedAt,
      ...(r.savedBy ? { savedBy: r.savedBy } : {}),
    } satisfies StoredProposalDraft,
    updated_at: r.updatedAt,
  }),
  fromRow: (row) => {
    const guardado = (row.value ?? {}) as Partial<StoredProposalDraft>;
    return {
      key: String(row.key ?? ""),
      doc: guardado.doc,
      // Um rascunho sem marca de tempo legível não pode fazer a cópia inteira
      // ser recusada na validação: vazio lê-se como "não se sabe quando", que é
      // a verdade, e é o que os conjuntos sem relógio próprio já fazem.
      updatedAt: typeof guardado.updatedAt === "string" ? guardado.updatedAt : "",
      ...(typeof guardado.savedBy === "string" ? { savedBy: guardado.savedBy } : {}),
    };
  },
};

/**
 * Quantas chaves de rascunho se varrem de uma vez.
 *
 * O tecto por omissão do `listStateByPrefix` são 2000, e foi escolhido para a
 * pergunta que o estreou — «que rascunhos usam esta foto?», feita ao apagar uma
 * imagem. Aqui a pergunta é outra e o custo de bater no tecto também: uma
 * varredura truncada faz a cópia INTEIRA declarar-se incompleta (e a reposição
 * recusar-se, ver a rota), o que é o comportamento certo mas caro para um
 * número escolhido noutro contexto.
 *
 * A conta que importa: há uma chave por pedido alguma vez aberto no estúdio, e
 * ela NÃO desaparece quando a equipa limpa o rascunho — `clearProposalDraft`
 * grava `null`, a linha fica, e continua a ocupar orçamento da varredura. Ou
 * seja, o número a comparar não é «quantos rascunhos por acabar existem» (uma
 * mão cheia) mas «quantas propostas já se começaram desde sempre», que só
 * cresce. A 200 pedidos por ano, 2000 chegavam dez anos depois — e chegavam
 * calados até ao dia da cópia.
 *
 * 10 000 afasta isso para lá do horizonte de vida da instalação. NÃO é uma
 * garantia de tamanho do ficheiro: 10 000 rascunhos cheios seriam centenas de
 * MB e a reposição por HTTP estoirava muito antes disso. É uma garantia de que
 * a varredura não MENTE — se um dia lá chegarem, a cópia diz-se incompleta em
 * vez de deixar rascunhos de fora sem ninguém saber.
 */
export const LIMITE_RASCUNHOS = 10_000;

/** Quantas escritas em voo de cada vez, na reposição. Uma de cada vez era mais
 *  simples mas a rota tem 60 s: com centenas de rascunhos, uma ida ao servidor
 *  por cada um gastava-os todos e a reposição morria a meio. */
const LOTE_DE_ESCRITAS = 25;

const ERRO_VARREDURA =
  `não foi possível varrer os rascunhos do estúdio (chaves \`${DRAFT_PREFIX}\` em app_state): ` +
  `ou a leitura falhou — a tabela existe? ver db/schema.sql —, ou há mais de ${LIMITE_RASCUNHOS} ` +
  `chaves e a varredura ficou truncada. Uma lista incompleta não pode passar por completa numa cópia de segurança.`;

/**
 * Os rascunhos que existem, para a cópia de segurança (e para saber o que lá
 * está antes de repor por cima).
 *
 * LANÇA quando a varredura não se conseguiu fazer INTEIRA. É a diferença que
 * `listStateByPrefix` já sabe fazer — devolve `completa: false` em vez de um
 * vazio que se lê como "não havia nada" — e é aqui que ela vale: a cópia apanha
 * a rejeição, marca o conjunto em `incomplete` e o ficheiro sai a dizer que
 * está incompleto. Devolver `[]` calado dava um ficheiro com ar de completo e
 * sem o trabalho lá dentro, que é exactamente o defeito que isto veio corrigir.
 */
export async function listProposalDrafts(): Promise<RascunhoNaCopia[]> {
  const { entradas, completa } = await listStateByPrefix<unknown>(DRAFT_PREFIX, LIMITE_RASCUNHOS);
  if (!completa) throw new Error(ERRO_VARREDURA);

  const rascunhos: RascunhoNaCopia[] = [];
  for (const { key, value } of entradas) {
    // Uma chave fora da forma do `draftKey` não foi escrita pelo estúdio; e uma
    // que a reposição não pudesse voltar a escrever (ver `ehChaveDeRascunho`)
    // faria a validação do ficheiro recusar a cópia INTEIRA na hora do desastre.
    if (!ehChaveDeRascunho(key)) continue;
    // `null` é um rascunho APAGADO (ver `clearProposalDraft`): a linha fica, o
    // trabalho não. Copiar isso era copiar a ausência de trabalho — e repô-lo
    // ressuscitava linhas vazias sem qualquer utilidade.
    if (value == null || typeof value !== "object") continue;
    const rascunho = mapper.fromRow({ key, value });
    // Sem `doc` não há montagem nenhuma para salvar; é a mesma condição que o
    // `getProposalDraft` usa para dizer "não há rascunho".
    if (rascunho.doc == null || typeof rascunho.doc !== "object") continue;
    rascunhos.push(rascunho);
  }
  // Por ordem de chave: duas exportações do mesmo estado têm de se ler igual
  // (o Supabase não promete ordem nenhuma sem `order`).
  return rascunhos.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Escreve os rascunhos da cópia por cima dos que existem — SUBSTITUINDO, como
 * todos os outros conjuntos da reposição.
 *
 * Não passa pelo caminho normal da reposição (apagar a tabela e reinserir) e a
 * razão é a tabela: `app_state` é partilhada. Um `delete` por tabela levava à
 * frente os marcadores de operação — o UID até onde a caixa de entrada já
 * avisou, os fechos do Meta, o contador de facturas de desenvolvimento — e o
 * robô da caixa de entrada voltava a avisar de emails já avisados no dia da
 * reposição, que é o dia em que a atenção tem de estar toda nos dados.
 *
 * Por isso só se toca no espaço de nomes dos rascunhos:
 *  · cada rascunho do ficheiro é gravado (e a chave é verificada — ver
 *    `ehChaveDeRascunho`: uma cópia adulterada não escreve fora daqui);
 *  · um rascunho que existe AGORA e não vem no ficheiro é apagado, a `null`,
 *    que é como o estúdio já diz "não há rascunho";
 *  · tudo o resto do `app_state` fica exactamente como estava.
 *
 * LANÇA se alguma escrita não chegou ao servidor. `setState` não lança por
 * desenho (uma edição não pode falhar por a gravação ter falhado), mas aqui
 * quem chama é a reposição: um rascunho que não ficou gravado tem de sair pelo
 * nome em `failed`, e não passar por reposto.
 */
export async function replaceProposalDrafts(rascunhos: readonly RascunhoNaCopia[]): Promise<void> {
  const { entradas, completa } = await listStateByPrefix<unknown>(DRAFT_PREFIX, LIMITE_RASCUNHOS);
  // Sem saber que chaves lá estão não se sabe quais apagar — e apagar ao calhas
  // no `app_state` é pior do que não apagar nada.
  if (!completa) throw new Error(ERRO_VARREDURA);

  const doFicheiro = new Map<string, RascunhoNaCopia>();
  for (const rascunho of rascunhos) {
    if (!ehChaveDeRascunho(rascunho.key)) {
      throw new Error(
        `a cópia traz uma chave de rascunho fora do espaço de nomes ("${String(rascunho.key).slice(0, 60)}") — nada foi escrito neste conjunto.`,
      );
    }
    doFicheiro.set(rascunho.key, rascunho);
  }

  const escritas: { key: string; value: unknown }[] = [
    ...[...doFicheiro.values()].map((r) => ({
      key: r.key,
      // A tradução é a do `mapper`, nunca uma segunda escrita à mão aqui.
      value: (mapper.toRow(r) as { value: unknown }).value,
    })),
    // Substituir, não fundir: o que está na base e não está na cópia desaparece.
    // As que já estão a `null` ficam como estão — reescrever null era ruído.
    ...entradas
      .filter(({ key, value }) => ehChaveDeRascunho(key) && value != null && !doFicheiro.has(key))
      .map(({ key }) => ({ key, value: null })),
  ];

  const falhadas: string[] = [];
  for (let i = 0; i < escritas.length; i += LOTE_DE_ESCRITAS) {
    const lote = escritas.slice(i, i + LOTE_DE_ESCRITAS);
    const resultados = await Promise.all(
      // `null` é «não está na cópia»: APAGA-se, não fica lápide (P3).
      lote.map(async (e) => ({
        key: e.key,
        ...(await (e.value === null ? apagarEstado(e.key) : setState(e.key, e.value))),
      })),
    );
    for (const r of resultados) {
      if (!r.gravado) falhadas.push(`${r.key} (${r.motivo ?? "sem motivo"})`);
    }
  }

  if (falhadas.length) {
    throw new Error(
      `${falhadas.length} de ${escritas.length} rascunhos não ficaram gravados: ${falhadas.slice(0, 5).join("; ")}` +
        (falhadas.length > 5 ? ` e mais ${falhadas.length - 5}.` : "."),
    );
  }
}
