import "server-only";
import { createHash } from "node:crypto";
import { gravarEstadoSeNaoMudou, lerEstadoComVersao, type VersaoDoEstado } from "./app-state";
import { lerSessao, normalizarIdentificador } from "./admin-auth";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SESSÕES QUE DEIXAM DE VALER ANTES DO PRAZO (auditoria de 13/11, n.º 6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A sessão é um token assinado que vale até ao `exp` (30 dias, na longa). Sem
 * estado nenhum no servidor, duas coisas não a fechavam:
 *
 *  · SAIR — o cookie era apagado neste browser, mas uma cópia dele continuava
 *    a valer os dias que lhe faltavam;
 *  · REDEFINIR A PALAVRA-PASSE — quem tivesse uma sessão aberta noutro
 *    aparelho continuava lá dentro, que é justamente o que se quer fechar
 *    quando se muda a palavra-passe por desconfiança.
 *
 * Por isso há um registo, no `app_state` (a tabela que já existe, sem
 * migração), com duas listas:
 *
 *  · `desde` — por conta, o instante a partir do qual as sessões valem. Uma
 *    sessão emitida antes disso deixa de valer. A recuperação da palavra-passe
 *    escreve aqui.
 *  · `terminadas` — o resumo de cada sessão terminada com «Sair», até ao prazo
 *    dela (depois disso o próprio token já não vale e a linha sai).
 *
 * ── E O CUSTO ───────────────────────────────────────────────────────────────
 *
 * Quem pergunta é o `proxy.ts`, em cada pedido a `/api` com sessão. Não pode
 * ser uma leitura por pedido: o registo fica em memória
 * {@link VALIDADE_DA_CACHE_MS} e lê-se no máximo uma vez por minuto por
 * instância. Na instância que fez a mudança, vale logo; nas outras, no máximo
 * um minuto depois.
 *
 * Uma leitura que falha não fecha a porta a ninguém (vale o que estava em
 * memória, ou nada): fechar o back office inteiro por uma falha passageira do
 * Supabase seria pior do que o minuto de atraso que se aceita aqui.
 */

export const CHAVE_DAS_SESSOES_REVOGADAS = "sessoes-revogadas";
export const VALIDADE_DA_CACHE_MS = 60_000;
/** Tecto da lista de sessões terminadas — cada «Sair» é uma linha até expirar. */
export const MAX_TERMINADAS = 500;

export interface RegistoDeRevogacoes {
  desde: Record<string, number>;
  terminadas: Record<string, number>;
}

let emMemoria: { registo: RegistoDeRevogacoes; lidoEm: number } | null = null;

/** Só para os testes: esquece o que está em memória. */
export function esquecerRevogacoesEmMemoria(): void {
  emMemoria = null;
  falhouEm = null;
  leituraNoAr = null;
}

/** Só números, sem herança: o que vem da base de dados não decide forma nenhuma. */
function soNumeros(v: unknown): Record<string, number> {
  const fora: Record<string, number> = Object.create(null);
  if (!v || typeof v !== "object") return fora;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n)) fora[k] = n;
  }
  return fora;
}

function normalizar(v: unknown): RegistoDeRevogacoes {
  const r = (v ?? {}) as { desde?: unknown; terminadas?: unknown };
  return { desde: soNumeros(r.desde), terminadas: soNumeros(r.terminadas) };
}

/** O resumo de um token: o que se guarda em vez do token, que é uma credencial. */
export function resumoDaSessao(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** A chave de uma conta no registo: o nome como vai na sessão (40 caracteres). */
function chaveDaConta(nome: string): string {
  return normalizarIdentificador(nome.slice(0, 40));
}

/**
 * ── A LEITURA DO CAMINHO QUENTE (revisão de 13/11) ──────────────────────────
 *
 * Quem espera por isto é CADA pedido à `/api` com sessão (o `proxy.ts`). Por
 * isso a leitura é própria e curta:
 *  · UMA tentativa, com tecto de {@link TECTO_DA_LEITURA_MS} — o `getState`
 *    faria três de 8 s, e com o Supabase pendurado cada clique ficava ~24 s
 *    preso no proxy;
 *  · a falha também fica em memória ({@link ESPERA_DEPOIS_DE_FALHAR_MS}): sem
 *    isso, com a base em baixo, N pedidos eram N leituras penduradas;
 *  · pedidos simultâneos partilham a leitura que já está no ar.
 * A regra continua a mesma: uma leitura que falha não fecha a porta a ninguém.
 */
export const TECTO_DA_LEITURA_MS = 1_500;
export const ESPERA_DEPOIS_DE_FALHAR_MS = 5_000;

let falhouEm: number | null = null;
let leituraNoAr: Promise<RegistoDeRevogacoes> | null = null;

async function lerRegisto(agora: number): Promise<RegistoDeRevogacoes> {
  if (emMemoria && agora - emMemoria.lidoEm < VALIDADE_DA_CACHE_MS) return emMemoria.registo;
  if (falhouEm !== null && agora - falhouEm < ESPERA_DEPOIS_DE_FALHAR_MS) {
    return emMemoria?.registo ?? normalizar(null);
  }
  if (leituraNoAr) return leituraNoAr;
  leituraNoAr = (async () => {
    try {
      const { valor } = await lerEstadoComVersao<RegistoDeRevogacoes>(
        CHAVE_DAS_SESSOES_REVOGADAS,
        TECTO_DA_LEITURA_MS,
      );
      const registo = normalizar(valor);
      emMemoria = { registo, lidoEm: Date.now() };
      falhouEm = null;
      return registo;
    } catch (err) {
      falhouEm = Date.now();
      log.warn("sessões: não foi possível ler as revogações — vale o que está em memória", {
        erro: String(err),
      });
      return emMemoria?.registo ?? normalizar(null);
    } finally {
      leituraNoAr = null;
    }
  })();
  return leituraNoAr;
}

/**
 * Esta sessão foi revogada? `false` para um token que nem é sessão (quem
 * chama já o recusa por si).
 */
export async function sessaoRevogada(
  token: string | undefined | null,
  agora: number = Date.now(),
): Promise<boolean> {
  const s = lerSessao(token);
  if (!s || !token) return false;
  const registo = await lerRegisto(agora);
  const desde = registo.desde[chaveDaConta(s.name)];
  if (typeof desde === "number" && s.iat < desde) return true;
  return Object.prototype.hasOwnProperty.call(registo.terminadas, resumoDaSessao(token));
}

/** `readSession` mais as revogações — para quem pode esperar (as páginas). */
export async function sessaoValida(
  token: string | undefined | null,
): Promise<{ name: string } | null> {
  const s = lerSessao(token);
  if (!s) return null;
  if (await sessaoRevogada(token)) return null;
  return { name: s.name };
}

/**
 * Ler-mudar-gravar o registo, com escrita CONDICIONAL: só grava se ninguém
 * tiver escrito desde a leitura; se escreveu, relê e aplica a mudança outra
 * vez por cima (até {@link TENTATIVAS_DE_ESCRITA}). Sem isto, dois «Sair» ao
 * mesmo tempo partiam do mesmo registo e o segundo apagava o primeiro.
 * `true` só quando ficou gravado.
 */
const TENTATIVAS_DE_ESCRITA = 4;
const TECTO_DA_ESCRITA_MS = 3_000;

async function mudarRegisto(mudar: (r: RegistoDeRevogacoes) => void): Promise<boolean> {
  for (let tentativa = 1; tentativa <= TENTATIVAS_DE_ESCRITA; tentativa++) {
    let lido: { valor: RegistoDeRevogacoes | null; versao: VersaoDoEstado };
    try {
      lido = await lerEstadoComVersao<RegistoDeRevogacoes>(
        CHAVE_DAS_SESSOES_REVOGADAS,
        TECTO_DA_ESCRITA_MS,
      );
    } catch (err) {
      // Sem ler, não se grava por cima: perder-se-iam as revogações que lá estão.
      log.error("sessões: não foi possível ler o registo — a revogação não se grava", err);
      return false;
    }
    const registo = normalizar(lido.valor);
    const agora = Date.now();
    mudar(registo);
    aparar(registo, agora);
    const r = await gravarEstadoSeNaoMudou(
      CHAVE_DAS_SESSOES_REVOGADAS,
      registo,
      lido.versao,
      TECTO_DA_ESCRITA_MS,
    );
    if (r === "gravado") {
      emMemoria = { registo, lidoEm: agora };
      return true;
    }
    if (r === "falhou") {
      log.error("sessões: a revogação não ficou guardada");
      return false;
    }
    // Conflito: alguém escreveu entretanto. Pausa curta e desigual, e outra vez.
    await new Promise((res) => setTimeout(res, tentativa * 10 + Math.random() * 20));
  }
  log.error("sessões: a revogação não ficou guardada — o registo não parou de mudar");
  return false;
}

/**
 * As terminadas que já expiraram saem (o token delas já não vale sozinho).
 * Acima de {@link MAX_TERMINADAS}, NUNCA se tira uma que ainda vale: tirá-la
 * era devolver a vida a uma sessão terminada. Fica o aviso nos registos.
 */
export function aparar(registo: RegistoDeRevogacoes, agora: number): void {
  for (const [k, exp] of Object.entries(registo.terminadas)) {
    if (exp <= agora) delete registo.terminadas[k];
  }
  const n = Object.keys(registo.terminadas).length;
  if (n > MAX_TERMINADAS) {
    log.warn("sessões: há mais sessões terminadas ainda válidas do que o tecto — ficam todas", {
      n,
      tecto: MAX_TERMINADAS,
    });
  }
}

/** «Sair»: esta sessão deixa de valer, mesmo que alguém tenha uma cópia do cookie. */
export async function terminarSessao(token: string | undefined | null): Promise<boolean> {
  const s = lerSessao(token);
  if (!s || !token) return false;
  const resumo = resumoDaSessao(token);
  return mudarRegisto((r) => {
    r.terminadas[resumo] = s.exp;
  });
}

/** Todas as sessões desta conta emitidas até agora deixam de valer. */
export async function revogarSessoesDaConta(nome: string): Promise<boolean> {
  const chave = chaveDaConta(nome);
  if (!chave) return false;
  const agora = Date.now();
  return mudarRegisto((r) => {
    r.desde[chave] = agora;
  });
}
