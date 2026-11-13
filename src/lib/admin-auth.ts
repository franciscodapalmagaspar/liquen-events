import "server-only";
import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { verifyTotpOnce } from "./totp";
import { log } from "./logger";
// Só o TIPO: a implementação entra por `import()` tardio (ver
// `lerSenhasRedefinidas`), para o Supabase não vir atrás deste módulo nos
// caminhos que só querem o `isAuthed`.
import type { SenhaRedefinida } from "./admin-recuperacao";

/**
 * Admin authentication for the internal dashboard.
 *
 * Design:
 *  - Passwords are verified against bcrypt hashes — never compared in plaintext
 *    and never stored in the browser.
 *  - A successful login mints an HMAC-signed session token (payload + signature)
 *    with an expiry, stored in an httpOnly cookie. The token is tamper-proof:
 *    changing the name or expiry invalidates the signature.
 *  - Accounts are configurable via env, with a dev-friendly shared-password
 *    fallback so local work needs zero setup.
 *
 * Env:
 *  - SESSION_SECRET     HMAC key for sessions (required in production).
 *  - ADMIN_USERS        JSON array of individual accounts:
 *                       [{"email":"catarina@…","name":"Catarina","passwordHash":"$2b$12$…"}]
 *  - ADMIN_PASSWORD_HASH bcrypt hash for the shared-password fallback.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O IDENTIFICADOR DE ENTRADA É O EMAIL — E O NOME CONTINUA A SERVIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Entrava-se com o nome próprio. Um nome próprio é curto, está no site, colide
 * mal a equipa cresça (duas Anas) e nenhum gestor de palavras-passe o sabe
 * guardar — o que empurra as pessoas para palavras-passe repetidas. O email
 * resolve as quatro coisas de uma vez.
 *
 * O que NÃO mudou, de propósito:
 *
 *  • o `name` continua a existir e continua a ser o que se ESCREVE no ecrã
 *    («Bem-vinda, Catarina») e o que fica no `sub` da sessão. Trocar o `sub`
 *    por um email punha um endereço a saudar quem entra e mudava o dono das
 *    tarefas já atribuídas;
 *  • por isso mesmo, uma sessão emitida ANTES desta mudança continua válida:
 *    o corpo assinado não mudou de forma, a chave não mudou, e o
 *    `SESSION_VERSION` não foi tocado. Ninguém a meio de uma proposta é posto
 *    fora por causa desta alteração;
 *  • as passkeys guardam o `name` da conta e continuam a ser resolvidas por ele
 *    (ver `contaExiste`), portanto os aparelhos já registados continuam a abrir
 *    a porta.
 *
 * ── Fase de transição: o NOME ainda é aceite à entrada ──────────────────────
 * Enquanto o `ADMIN_USERS` de produção não tiver `email` em todas as contas,
 * recusar o nome fechava a porta a toda a gente no primeiro deploy. Por isso o
 * nome continua a ser aceite como identificador, e cada uso desse caminho fica
 * registado (`auth: entrada pelo NOME`) para se poder ver quando deixa de
 * acontecer.
 *
 * CAMINHO ANTIGO — marcado em 2026-08-12. A remover quando (e só quando) todas
 * as contas tiverem `email` e os registos deixarem de mostrar entradas por
 * nome. Não tem data automática de fim de propósito: uma constante que expira
 * sozinha põe o back office fechado num sábado de manhã sem ninguém ter mexido
 * em nada.
 */
// In production the session cookie uses the __Host- prefix: the browser then
// guarantees it was set with Secure, Path=/ and no Domain — preventing cookie
// injection/fixation from subdomains or non-HTTPS origins. (Dev is plain HTTP,
// where __Host- cookies are rejected, so we only prefix in production.)
export const ADMIN_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-liquen_admin" : "liquen_admin";
export const ADMIN_NAME_COOKIE = "liquen_user";

/**
 * ── QUANTO DURA UMA SESSÃO, E PORQUE SÃO DOIS NÚMEROS ──────────────────────
 *
 * Durava sempre 30 dias, sem ninguém escolher nada e sem isso estar escrito em
 * lado nenhum. São duas coisas diferentes e ambas erradas: quem entra no
 * portátil do escritório QUER os 30 dias, e quem entra no computador de um
 * fornecedor a meio de um evento não quer nenhum — e não tinha como o dizer.
 *
 * Por isso passam a ser duas durações, escolhidas à entrada com uma caixa que
 * diz o número em português:
 *
 *  · LONGA, 30 dias — o que já acontecia. Continua a ser a opção por omissão,
 *    porque mudar o valor por omissão punha toda a gente fora ao fim de meio
 *    dia sem ter pedido nada. O cookie é persistente: fechar o browser não
 *    fecha a sessão.
 *  · CURTA, 12 horas — e o cookie é de SESSÃO DO BROWSER (sem `maxAge`),
 *    portanto fechar o browser fecha-a antes disso. Doze horas é o tecto, não a
 *    promessa: cobre um dia de trabalho inteiro, incluindo um casamento que
 *    acabe às três da manhã, e não cobre a manhã seguinte noutra pessoa.
 *
 * O número vai DENTRO do token assinado (`exp`) e não só no cookie: um cookie
 * sem prazo é coisa que o browser guarda e que se pode voltar a mandar à mão, e
 * a sessão curta deixava de ser curta.
 */
export const SESSAO_LONGA_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias
export const SESSAO_CURTA_MS = 1000 * 60 * 60 * 12; // 12 horas

const SESSION_TTL_MS = SESSAO_LONGA_MS;

// Global session revocation. Tokens embed the version they were minted with;
// bumping SESSION_VERSION (any new string) invalidates EVERY outstanding
// session at once — the recovery lever for a leaked cookie or a departure,
// without having to rotate SESSION_SECRET. Tokens minted before this claim
// existed count as version "1".
function sessionVersion(): string {
  return process.env.SESSION_VERSION || "1";
}

// bcrypt hash of "liquen2026" — the dev/default shared password. Override in
// production with ADMIN_PASSWORD_HASH (or switch to per-user ADMIN_USERS).
const DEV_SHARED_HASH = "$2b$10$eSAkm9hz/JUpFYWRdPrA9.YJP.Gjry2IwVwgZa3hjvHcvV/r27n7u";

// --- Secret ---------------------------------------------------------------
// Last-resort key when production is fully misconfigured. Random per process so
// session tokens can NEVER be forged with a known/public value (see below).
let randomFallbackSecret: string | null = null;

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (hash) {
      // Don't lock the team out: derive a stable, NON-public key from the
      // (secret) configured password hash. Still — set a real SESSION_SECRET.
      log.error(
        "auth: SESSION_SECRET não definido (ou demasiado curto) em produção — a derivar do ADMIN_PASSWORD_HASH; defina um SESSION_SECRET aleatório de 32+ caracteres",
      );
      return `derived:${hash}`;
    }
    // Neither SESSION_SECRET nor ADMIN_PASSWORD_HASH is set: login is already
    // disabled (sharedHash() === null), so there are no real sessions to keep.
    // Use a random per-process key — NEVER the public, committed DEV_SHARED_HASH,
    // which would let anyone forge a valid admin session cookie.
    if (!randomFallbackSecret) {
      randomFallbackSecret = randomBytes(32).toString("base64url");
      log.error(
        "auth: SESSION_SECRET e ADMIN_PASSWORD_HASH ausentes em produção — login de admin desativado; a usar chave de sessão aleatória por processo",
      );
    }
    return randomFallbackSecret;
  }
  return "liquen-dev-session-secret-change-me";
}

// --- Accounts -------------------------------------------------------------
interface AdminUser {
  /** Nome visível — saudação, dono de tarefas, `sub` da sessão. */
  name: string;
  /** Identificador de entrada. Opcional só durante a transição (ver topo). */
  email?: string;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O HASH PRÓPRIO É OPCIONAL — E A RAZÃO É UMA PESSOA REAL, NUMA TARDE REAL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A dona desta casa não é técnica. Para ligar a recuperação de palavra-passe
   * precisava de acrescentar o `email` à conta dela no `ADMIN_USERS` — e o
   * `ADMIN_USERS` não existia, porque a instalação dela sempre entrou pela
   * palavra-passe única, a `ADMIN_PASSWORD_HASH`.
   *
   * Criar a variável obrigava-a a inventar também um `passwordHash`, e um hash
   * de bcrypt não se escreve à mão: gera-se com um comando de Node, dentro da
   * pasta do projecto, num terminal. Ela não tem nada disso.
   *
   * O que aconteceu a seguir estava escrito nas estrelas: copiou o EXEMPLO do
   * manual, reticências e tudo — `"passwordHash": "$2b$12$..."` — e gravou.
   * Aquilo não é o hash de palavra-passe nenhuma. À publicação seguinte, o
   * `ADMIN_USERS` passaria a mandar e ela ficava **fechada fora do painel do
   * próprio negócio**, sem forma nenhuma de voltar a entrar. Só não aconteceu
   * porque as variáveis da Vercel esperam pela publicação seguinte, e deu tempo
   * de a apagar.
   *
   * ── O QUE ISTO MUDA ──────────────────────────────────────────────────────
   *
   * Sem `passwordHash`, a conta usa a palavra-passe que a instalação JÁ TEM
   * (`ADMIN_PASSWORD_HASH`). Passa a ser possível acrescentar contas — com
   * `name` e `email`, que é tudo o que a recuperação precisa — sem gerar
   * segredo nenhum e sem mudar a palavra-passe de ninguém.
   *
   * É um degrau de migração, e é honesto quanto ao que faz: contas sem hash
   * próprio PARTILHAM a palavra-passe antiga. Numa casa de uma pessoa isso é
   * exactamente o estado de hoje, com um nome e um endereço por cima. Quem
   * quiser palavras-passe separadas põe o `passwordHash` — ou define uma pela
   * própria recuperação, que a guarda por conta (ver `hashEfectivo`).
   *
   * A rede: em produção, uma conta sem hash próprio numa instalação SEM
   * `ADMIN_PASSWORD_HASH` não teria entrada nenhuma. Isso é recusado à entrada,
   * em `configuredUsers`, com o erro a dizer o que falta.
   */
  passwordHash?: string;
  totpSecret?: string;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * COMO ESTA PESSOA ASSINA UM EMAIL AO CLIENTE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Separado do `name` de propósito, e a razão é um defeito medido num email
   * real enviado a uma cliente: a proposta saiu assinada **«Liquen Alentejo»**.
   *
   * Ninguém escreveu esse nome em lado nenhum. Ele foi DERIVADO do endereço da
   * conta — `liquen.alentejo@gmail.com` → `nomeVisivel` troca os pontos por
   * espaços e capitaliza → «Liquen Alentejo» — e daí seguiu para o `sub` da
   * sessão e para o fundo de um email que um casal leu.
   *
   * A regra que isto instala: **um nome adivinhado a partir de um endereço de
   * email nunca assina nada.** Só assina o que estiver escrito aqui, à mão, por
   * quem configurou a conta. Sem `assina`, o email leva a assinatura da CASA,
   * que nunca está errada (`ASSINATURA_NOME` em `email-assinatura.ts`).
   *
   *   { "name": "catarina", "email": "…", "passwordHash": "…",
   *     "assina": { "nome": "Catarina Gaspar", "cargo": "Manager" } }
   */
  assina?: { nome?: string; cargo?: string };
}

/** O que a entrada devolve: quem entrou, e por que endereço (quando o tem). */
export interface ContaAutenticada {
  name: string;
  email?: string;
}

/**
 * O identificador tal como se COMPARA: sem espaços à volta e em minúsculas.
 *
 * O tecto de 160 caracteres é o do endereço mais longo que a norma admite
 * (254) cortado por baixo do que a caixa de correio real usa — serve para não
 * andar a passear cadeias de megabytes vindas do corpo do pedido por dentro do
 * hash e do limitador.
 */
export function normalizarIdentificador(v: string): string {
  return v.trim().toLowerCase().slice(0, 160);
}

/**
 * Comparação de identificadores em TEMPO CONSTANTE.
 *
 * O `bcrypt` já garante isso para a palavra-passe; para o identificador não
 * garantia nada — um `===` de cadeias sai no primeiro carácter diferente, e o
 * tempo passa a dizer quantos caracteres do princípio estavam certos. Sozinho é
 * um sinal minúsculo e ruidoso; junto com uma rota que responde depressa a um
 * endereço inexistente, é o que transforma «adivinhar um email» em «confirmar
 * um email letra a letra».
 *
 * Compara-se o RESUMO e não a cadeia: assim os dois lados têm sempre 32 bytes e
 * o `timingSafeEqual` nunca vê comprimentos diferentes (que ele próprio recusa,
 * e a recusa seria o oráculo de volta pela porta do lado).
 */
export function identificadorIgual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function configuredUsers(): AdminUser[] | null {
  const raw = process.env.ADMIN_USERS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (u) =>
          typeof u?.name === "string" &&
          // Ausente = usa a palavra-passe partilhada da instalação. Ver a nota
          // grande no `passwordHash` do tipo, e a rede logo a seguir a isto.
          (u.passwordHash === undefined || typeof u.passwordHash === "string") &&
          // `email` é opcional durante a transição, mas se vier tem de ser
          // texto: um `email: 123` calado transformava-se em «esta conta não
          // tem endereço» e a recuperação dela desaparecia sem aviso.
          (u.email === undefined || typeof u.email === "string") &&
          // O mesmo cuidado para a assinatura: um `assina` malformado tem de
          // ser recusado à entrada, e não silenciosamente lido como «esta
          // pessoa não tem assinatura» — que é o caminho que leva à da casa e
          // esconderia um erro de configuração.
          (u.assina === undefined ||
            (typeof u.assina === "object" &&
              u.assina !== null &&
              (u.assina.nome === undefined || typeof u.assina.nome === "string") &&
              (u.assina.cargo === undefined || typeof u.assina.cargo === "string"))),
      )
    ) {
      /**
       * A REDE DAS CONTAS SEM HASH PRÓPRIO.
       *
       * Uma conta sem `passwordHash` cai na palavra-passe partilhada. Se essa
       * também não existir, a conta não tem entrada NENHUMA — e o modo de
       * falhar seria o pior possível: o `ADMIN_USERS` passa a mandar, portanto
       * a instalação inteira fica sem porta, em silêncio.
       *
       * Recusa-se aqui, com o nome do que falta. Recusar devolve `null`, e
       * `null` faz o resto do módulo voltar à palavra-passe partilhada — que
       * nesta situação é o estado em que a instalação já estava.
       */
      const semHashProprio = (parsed as AdminUser[]).filter((u) => u.passwordHash === undefined);
      if (semHashProprio.length > 0 && !process.env.ADMIN_PASSWORD_HASH) {
        log.error(
          "auth: ADMIN_USERS tem contas sem `passwordHash` e não há ADMIN_PASSWORD_HASH " +
            "para lhes servir de palavra-passe — essas contas não teriam entrada nenhuma; " +
            "ADMIN_USERS ignorado",
          undefined,
          { contas: semHashProprio.map((u) => u.name) },
        );
        return null;
      }
      return parsed;
    }
    log.error("auth: ADMIN_USERS tem um formato inesperado; ignorado");
  } catch {
    log.error("auth: ADMIN_USERS não é JSON válido; ignorado");
  }
  return null;
}

/**
 * The bcrypt hash the shared-password fallback checks against. In production we
 * NEVER fall back to the public dev hash: if neither ADMIN_PASSWORD_HASH nor
 * ADMIN_USERS is configured, return null so login is refused outright (the dev
 * password "liquen2026" is committed and therefore public knowledge).
 */
function sharedHash(): string | null {
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
  if (process.env.NODE_ENV === "production") {
    log.error(
      "auth: sem ADMIN_PASSWORD_HASH nem ADMIN_USERS em produção — login de admin desativado",
    );
    return null;
  }
  return DEV_SHARED_HASH;
}

/**
 * A conta ainda existe?
 *
 * Com `ADMIN_USERS` configurado, só as contas listadas contam. É isto que faz
 * com que tirar alguém de lá revogue TAMBÉM as passkeys dessa pessoa: uma
 * chave presa a um aparelho não passa por `verifyCredentials`, portanto sem
 * esta verificação um aparelho registado continuava a abrir a porta muito
 * depois de a conta ter deixado de existir.
 *
 * Sem `ADMIN_USERS` (palavra-passe partilhada) não há lista de contas para
 * consultar, e qualquer nome é aceite — como já acontece na entrada normal.
 * Nesse modo, a alavanca para pôr alguém fora é o `SESSION_VERSION` mais a
 * remoção do dispositivo na lista.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS NOMES DA EQUIPA — e SÓ os nomes
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O sistema sabe exactamente quem trabalha aqui, e nunca o perguntava a
 * ninguém: o responsável de uma tarefa era um campo de texto livre, e a lista
 * de pessoas do filtro nascia do que estivesse escrito nas tarefas. «Ana»,
 * «ana» e «Ana R.» eram três colaboradoras diferentes — e uma tarefa atribuída
 * a uma delas não aparecia no filtro das outras duas.
 *
 * ── O QUE ESTA FUNÇÃO NÃO PODE DEVOLVER, NUNCA ──────────────────────────
 *
 * O `ADMIN_USERS` traz `passwordHash` em cada conta, e traz `email`. Isto sai
 * para o browser. Por isso devolve uma lista de CADEIAS — não os objectos com
 * um campo escolhido, não uma projecção: cadeias. Um `map` que se esqueça de
 * um campo é um acidente a uma linha de distância; uma lista de nomes não tem
 * como transportar um hash.
 *
 * Devolve `[]` quando não há contas configuradas (a instalação com palavra-
 * passe partilhada). Aí não há equipa a listar, e quem lê isto tem de tratar o
 * vazio como «não sei quem são» — não como «não há ninguém».
 */
export function nomesDaEquipa(): string[] {
  const users = configuredUsers();
  if (!users) return [];
  const nomes = users
    .map((u) => String(u.name ?? "").trim())
    .filter((n) => n.length > 0)
    .map((n) => n.slice(0, 40));
  // Sem repetidos e por ordem, para a lista ser sempre a mesma: uma ordem que
  // muda entre carregamentos faz o olho procurar duas vezes.
  return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt"));
}

export function contaExiste(name: string): boolean {
  const users = configuredUsers();
  if (!users) return true;
  return encontrarConta(users, name) !== null;
}

/**
 * A conta de uma SESSÃO ainda existe?
 *
 * O nome dentro do token vai cortado a 40 caracteres (`createSession`). Até 39
 * é o nome inteiro, e vale o `contaExiste`. Com 40 pode ser o princípio de um
 * nome mais comprido — e aí compara-se com o princípio de cada conta, cortado
 * da mesma maneira. Antes, um nome com 40 ou mais caracteres saltava esta
 * verificação, e a sessão de quem saísse da equipa continuava a valer.
 */
export function contaDaSessaoExiste(sub: string): boolean {
  if (sub.length < 40) return contaExiste(sub);
  const users = configuredUsers();
  if (!users) return true;
  const alvo = normalizarIdentificador(sub);
  let existe = false;
  for (const u of users) {
    const cortado = normalizarIdentificador(String(u.name ?? "").slice(0, 40));
    if (identificadorIgual(cortado, alvo)) existe = true;
  }
  return existe;
}

/**
 * A conta que corresponde a um identificador — email primeiro, nome depois.
 *
 * ── Porque é que a lista é percorrida ATÉ AO FIM ──────────────────────────
 * Sair no primeiro acerto fazia o tempo depender da POSIÇÃO da conta na lista:
 * a primeira respondia mais depressa do que a última, e isso, repetido, ordena
 * as contas de quem tenta. São microssegundos, mas custa nada não os dar.
 *
 * O email tem precedência sobre o nome para que uma conta cujo NOME seja igual
 * ao EMAIL de outra (improvável, não impossível) nunca abra a porta errada.
 */
interface ContaEncontrada {
  user: AdminUser;
  /** `false` quando bateu pelo nome — o caminho antigo (ver topo do ficheiro). */
  porEmail: boolean;
}

function encontrarConta(users: AdminUser[], identificador: string): ContaEncontrada | null {
  const alvo = normalizarIdentificador(identificador);
  if (!alvo) return null;

  let porEmail: AdminUser | null = null;
  let porNome: AdminUser | null = null;
  for (const u of users) {
    if (u.email && identificadorIgual(normalizarIdentificador(u.email), alvo) && !porEmail) {
      porEmail = u;
    }
    if (identificadorIgual(normalizarIdentificador(u.name), alvo) && !porNome) {
      porNome = u;
    }
  }
  if (porEmail) return { user: porEmail, porEmail: true };
  if (porNome) return { user: porNome, porEmail: false };
  return null;
}

/** A conta com este email, para a recuperação. Null quando não existe. */
function contaPorEmail(email: string): AdminUser | null {
  const users = configuredUsers();
  if (!users) return null;
  const achada = encontrarConta(users, email);
  return achada?.porEmail ? achada.user : null;
}

/**
 * O nome a MOSTRAR a partir do que a pessoa escreveu à entrada.
 *
 * Só serve o modo de palavra-passe partilhada, onde não há lista de contas e
 * portanto não há nome nenhum guardado. Sem isto, quem entrasse com
 * `catarina@…` era saudada com o endereço inteiro e as tarefas ficavam
 * atribuídas a «catarina@…» — o email é bom identificador e mau nome próprio.
 */
export function nomeVisivel(identificador: string): string {
  const limpo = identificador.trim();
  if (!limpo) return "Equipa";
  const arroba = limpo.indexOf("@");
  if (arroba <= 0) return limpo.slice(0, 40);
  const local = limpo
    .slice(0, arroba)
    .replace(/[._+-]+/g, " ")
    .trim();
  if (!local) return "Equipa";
  return local
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
    .slice(0, 40);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ASSINATURA CONFIGURADA DE QUEM ESTÁ COM A SESSÃO ABERTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Devolve `{}` — que quer dizer «assina a casa» — em todos os casos em que não
 * há um nome ESCRITO por uma pessoa para aquela conta:
 *
 *  · sem `ADMIN_USERS` (palavra-passe partilhada), porque aí o nome da sessão é
 *    derivado do endereço de entrada, e é exactamente daí que veio o
 *    «Liquen Alentejo» que uma cliente leu;
 *  · com `ADMIN_USERS` mas sem `assina` na conta, porque o `name` é um
 *    identificador de entrada e pode ser «catarina» ou um endereço;
 *  · conta que já não existe na lista.
 *
 * Nunca atira: uma assinatura não pode ser a razão pela qual uma proposta não
 * chega ao cliente.
 */
export function assinaturaConfigurada(nomeDaSessao: string): {
  nome?: string;
  cargo?: string;
} {
  try {
    const users = configuredUsers();
    if (!users) return {};
    const alvo = normalizarIdentificador(nomeDaSessao);
    if (!alvo) return {};
    const u = users.find(
      (c) =>
        normalizarIdentificador(c.name) === alvo ||
        (c.email ? normalizarIdentificador(c.email) === alvo : false),
    );
    const nome = u?.assina?.nome?.trim();
    if (!nome) return {};
    return { nome, cargo: u?.assina?.cargo?.trim() || "" };
  } catch {
    return {};
  }
}

// ── Two-factor (TOTP) ──────────────────────────────────────────────────────
function totpSecretFor(name: string): string | null {
  const users = configuredUsers();
  if (users) {
    // Aceita email OU nome: quem chama aqui tanto traz o `name` da sessão
    // (rota de entrada, passkeys) como o endereço escrito à entrada.
    const u = encontrarConta(users, name)?.user;
    if (u?.totpSecret) return u.totpSecret;
  }
  return process.env.ADMIN_TOTP_SECRET || null;
}

/** Whether the given user must provide a 2FA code (a TOTP secret is configured). */
export function totpRequired(name: string): boolean {
  return totpSecretFor(name) !== null;
}

/**
 * Verify a 2FA code for the user. Returns true when no 2FA is configured.
 *
 * Usa `verifyTotpOnce` e não `verifyTotp`: o código é GASTO ao ser aceite, para
 * que não sirva uma segunda vez dentro dos ~60 s da janela (RFC 6238 §5.2).
 */
export function checkTotp(name: string, code: string): boolean {
  const secret = totpSecretFor(name);
  if (!secret) return true;
  return verifyTotpOnce(secret, code);
}

/**
 * Verify a login attempt. With ADMIN_USERS configured, matches the named
 * account's own password (true individual accounts). Otherwise falls back to a
 * single shared password accepted with any display name (current UX).
 * Returns the resolved user, or null when credentials are wrong.
 */
// Async + lazy `import("bcryptjs")`: bcrypt is ONLY needed here (the login POST),
// yet this module is also imported by hot, mostly-unauthenticated paths — the
// health probe and the public /api/orcamento route both pull in `isAuthed`
// from here. Keeping bcryptjs out of the top-level import means those paths no
// longer pay to load it; the login route (the sole caller) absorbs one await.
export async function verifyCredentials(
  identificador: string,
  password: string,
): Promise<ContaAutenticada | null> {
  if (!password) return null;
  const { compareSync } = (await import("bcryptjs")).default;

  const users = configuredUsers();
  if (users) {
    // As palavras-passe redefinidas pela recuperação. Lidas SEMPRE, antes de
    // se saber se a conta existe: uma leitura que só acontecesse para contas
    // reais dizia, pelo tempo, quais os endereços que existem.
    const senhas = await lerSenhasRedefinidas();
    const achada = encontrarConta(users, identificador);
    const u = achada?.user;
    // `hashEfectivo` devolve `null` quando a conta não tem hash próprio NEM
    // partilhado. Isso já é recusado à entrada pelo `configuredUsers`, mas um
    // `null` que chegasse aqui tem de acabar em recusa e nunca em excepção.
    const efectivo = u ? hashEfectivo(u, senhas) : null;
    if (u && efectivo && compareSync(password, efectivo)) {
      if (!achada!.porEmail && u.email) {
        // CAMINHO ANTIGO (marcado em 2026-08-12): entrou com o nome tendo a
        // conta email. Fica no registo para se poder ver quando é que este
        // caminho deixa de ser usado e pode ser removido.
        log.warn("auth: entrada pelo NOME — caminho antigo, usar o email", { conta: u.name });
      }
      return u.email ? { name: u.name, email: u.email } : { name: u.name };
    }
    // Nome desconhecido: corre-se na mesma UM compare de bcrypt para que o tempo
    // de resposta não diga se a conta existe (enumeração de utilizadores).
    //
    // O compare-fantasma tem de usar um hash com o MESMO factor de custo dos
    // hashes reais, senão não iguala coisa nenhuma — é ele próprio o oráculo.
    // Antes usava-se o DEV_SHARED_HASH, que está fixo em custo 10: com contas
    // configuradas a custo 12 (o recomendado) uma conta existente demorava
    // ~349 ms e uma inexistente ~86 ms, um rácio de 4x, medível à distância de
    // um pedido. Comparar contra o hash de uma conta REAL faz o trabalho passar
    // pelo mesmo custo, seja o nome válido ou não.
    //
    // Resta uma diferença se as contas do ADMIN_USERS forem geradas com custos
    // DIFERENTES entre si — aí o tempo separa a primeira conta das outras. Gere
    // todos os hashes com o mesmo factor (12) e não sobra sinal nenhum.
    if (!u) {
      try {
        const fantasma = hashEfectivo(users[0], senhas);
        if (fantasma) compareSync(password, fantasma);
      } catch {
        // Hash configurado malformado: o compare atira, mas o caminho tem de
        // terminar em recusa na mesma — nunca em excepção para quem chama.
      }
    }
    return null;
  }

  const hash = sharedHash();
  if (hash && compareSync(password, hash)) {
    return { name: nomeVisivel(identificador) };
  }
  return null;
}

// --- Recuperação de palavra-passe -----------------------------------------
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PALAVRA-PASSE VIVE NO AMBIENTE — E O AMBIENTE NÃO SE ESCREVE EM MARCHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As contas estão no `ADMIN_USERS`, que é uma variável de ambiente. Uma função
 * em Vercel NÃO pode reescrever as suas próprias variáveis: uma recuperação que
 * só mudasse o ambiente era um ecrã bonito que não mudava nada.
 *
 * Por isso a palavra-passe redefinida fica GUARDADA (bcrypt, no `app_state`) e
 * o `verifyCredentials` prefere-a à do ambiente — mas só enquanto o hash do
 * ambiente for exactamente o que estava lá quando ela foi definida
 * (`substituiu`). Assim:
 *
 *  • a recuperação funciona sem ninguém ir ao painel da Vercel;
 *  • e mudar o `ADMIN_USERS` continua a MANDAR: no instante em que a dona roda
 *    um hash, a redefinição correspondente deixa de valer. É a diferença entre
 *    uma funcionalidade e uma porta das traseiras permanente.
 */
async function lerSenhasRedefinidas(): Promise<Record<string, SenhaRedefinida>> {
  try {
    // Import tardio pela MESMA razão do bcryptjs: este módulo é carregado em
    // caminhos quentes e sem sessão, e o `admin-recuperacao` traz o Supabase
    // consigo. Só a entrada paga por isto.
    const { lerRegisto } = await import("./admin-recuperacao");
    return (await lerRegisto()).senhas;
  } catch (err) {
    // Uma leitura falhada não pode ser uma porta aberta nem uma porta fechada
    // ao engano: sem redefinições conhecidas, vale o que está no ambiente.
    log.error("auth: não foi possível ler as palavras-passe redefinidas", err);
    return {};
  }
}

/**
 * O hash que o AMBIENTE dá a esta conta: o dela, ou o partilhado da instalação.
 *
 * `null` quando não há nem um nem outro — o que o `configuredUsers` já recusa,
 * mas que se diz aqui na mesma para quem chama não ter de adivinhar.
 */
function hashDoAmbiente(u: AdminUser): string | null {
  return u.passwordHash ?? sharedHash();
}

function hashEfectivo(u: AdminUser, senhas: Record<string, SenhaRedefinida>): string | null {
  const doAmbiente = hashDoAmbiente(u);
  const email = u.email ? normalizarIdentificador(u.email) : "";
  const guardada = email ? senhas[email] : undefined;
  if (!guardada?.hash) return doAmbiente;
  // O `substituiu` compara-se com o hash do AMBIENTE, seja ele o próprio da
  // conta ou o partilhado. Assim a regra continua a mesma para os dois casos:
  // rodar o hash no painel da Vercel invalida a redefinição correspondente.
  if (guardada.substituiu !== doAmbiente) return doAmbiente;
  return guardada.hash;
}

/**
 * Comprimento mínimo da palavra-passe nova: 12 caracteres.
 *
 * Sem regras de composição (maiúsculas, dígitos, símbolos), que é o que as
 * normas modernas recomendam — as regras produzem `Liquen2026!` em toda a
 * gente, que é curto e adivinhável na mesma. O comprimento é o que conta.
 */
export const MINIMO_PALAVRA_PASSE = 12;
const MAXIMO_PALAVRA_PASSE = 200;

export type ResultadoDoPedido =
  | { estado: "emitido"; token: string; conta: { name: string; email: string } }
  /** O endereço não é de ninguém. Quem chama responde EXACTAMENTE o mesmo que a "emitido". */
  | { estado: "sem-conta" }
  /** Não há contas com email nesta instalação — a recuperação não está montada. */
  | { estado: "sem-recuperacao" }
  /** Havia o que gravar e não houve onde. Não se pode prometer um email. */
  | { estado: "sem-persistencia" };

/**
 * Emite (ou substitui) a ligação de recuperação de uma conta.
 *
 * ── O que aqui é deliberado ───────────────────────────────────────────────
 *  • O pedido NOVO substitui o anterior no mesmo lugar: pedir outra ligação
 *    invalida a que tinha sido enviada antes. Duas ligações vivas para a mesma
 *    conta seriam duas janelas abertas em vez de uma.
 *  • A ESCRITA ACONTECE SEMPRE, mesmo quando o endereço não é de ninguém. Não é
 *    desperdício: é o que faz uma instalação sem gravação responder o mesmo aos
 *    dois casos. Se só se gravasse para contas reais, o 503 de «não consegui
 *    gravar» aparecia só nos endereços verdadeiros — e passava a ser, ele
 *    próprio, a resposta que diz quais os endereços que existem.
 */
export async function pedirRecuperacao(email: string): Promise<ResultadoDoPedido> {
  const users = configuredUsers();
  // Sem contas individuais não há a quem recuperar o quê: o modo de
  // palavra-passe partilhada não tem endereços. Dizer isto não revela nada
  // sobre ninguém — é uma característica da instalação, não de uma pessoa.
  if (!users || !users.some((u) => u.email)) return { estado: "sem-recuperacao" };

  const { lerRegisto, gravarRegisto, limparExpirados, novoToken, resumoDoToken, VALIDADE_MS } =
    await import("./admin-recuperacao");

  // Sem conseguir ler o registo não se grava nada por cima dele: a mesma
  // resposta de «não consegui gravar», igual para qualquer endereço.
  let registo;
  try {
    registo = await lerRegisto();
  } catch (err) {
    log.error("recuperação: não foi possível ler o registo — nada se grava", err);
    return { estado: "sem-persistencia" };
  }
  const agora = Date.now();
  limparExpirados(registo, agora);

  const conta = contaPorEmail(email);
  /**
   * A CHAVE VEM DA CONTA CONFIGURADA, e nunca do que foi escrito no formulário.
   *
   * As duas dão a mesma cadeia — `contaPorEmail` só devolve uma conta quando o
   * que foi escrito corresponde ao endereço dela, e a comparação já passa pela
   * mesma normalização. Mas «dão a mesma cadeia» é uma conclusão que só se tira
   * lendo três funções, e a diferença conta no dia em que uma delas mudar: o
   * nome de uma propriedade onde se ESCREVE não deve depender de texto vindo de
   * fora, ponto final.
   *
   * Foi isto que a análise de segurança marcou como grave, e continuou a marcar
   * depois de as tabelas passarem a não ter herança nenhuma
   * (`admin-recuperacao.ts`) — e bem: aquilo fechou a CONSEQUÊNCIA (contaminar
   * o que todos os objectos herdam), não a origem. Agora o valor que dá o nome
   * à propriedade nasce da configuração da casa.
   */
  const token = conta ? novoToken() : null;
  if (conta?.email && token) {
    registo.pedidos[normalizarIdentificador(conta.email)] = {
      resumo: resumoDoToken(token),
      expiraEm: agora + VALIDADE_MS,
      pedidoEm: agora,
    };
  }

  const escrita = await gravarRegisto(registo);
  if (!escrita.gravado || !escrita.duradouro) {
    log.error("recuperação: não foi possível guardar o pedido", undefined, {
      onde: escrita.onde,
      motivo: escrita.motivo,
    });
    return { estado: "sem-persistencia" };
  }

  if (!conta || !token) return { estado: "sem-conta" };
  return { estado: "emitido", token, conta: { name: conta.name, email: conta.email! } };
}

export type ResultadoDaDefinicao =
  | { estado: "definida"; conta: { name: string; email: string } }
  /** Ligação inválida, já usada, expirada, ou de uma conta que já não existe. */
  | { estado: "ligacao-invalida" }
  | { estado: "fraca" }
  | { estado: "sem-persistencia" };

/**
 * Gasta a ligação e grava a palavra-passe nova.
 *
 * O token é de USO ÚNICO: o pedido é apagado no mesmo movimento em que a senha
 * é escrita, portanto a segunda tentativa com a mesma ligação já não encontra
 * nada. E só se responde «definida» depois de a gravação ter ficado num sítio
 * que DURA — dizer que sim e a pessoa não conseguir entrar a seguir era a pior
 * das respostas possíveis.
 */
export async function definirPalavraPasseComToken(
  token: string,
  nova: string,
): Promise<ResultadoDaDefinicao> {
  if (nova.length < MINIMO_PALAVRA_PASSE || nova.length > MAXIMO_PALAVRA_PASSE) {
    return { estado: "fraca" };
  }
  const users = configuredUsers();
  if (!users) return { estado: "ligacao-invalida" };

  const { lerRegisto, gravarRegisto, limparExpirados, emailDoToken } =
    await import("./admin-recuperacao");

  let registo;
  try {
    registo = await lerRegisto();
  } catch (err) {
    log.error("recuperação: não foi possível ler o registo — nada se grava", err);
    return { estado: "sem-persistencia" };
  }
  const agora = Date.now();
  limparExpirados(registo, agora);

  const email = emailDoToken(registo, token, agora);
  if (!email) return { estado: "ligacao-invalida" };

  const conta = contaPorEmail(email);
  if (!conta?.email) {
    // A conta saiu do ADMIN_USERS entre o pedido e o clique. O pedido morre com
    // ela — nada de deixar uma ligação viva para uma conta que já não existe.
    delete registo.pedidos[email];
    await gravarRegisto(registo);
    return { estado: "ligacao-invalida" };
  }

  const { hashSync } = (await import("bcryptjs")).default;
  // Factor 12 — o mesmo que o `ENTRADA.md` manda usar para gerar os hashes do
  // ADMIN_USERS. Custos diferentes entre contas medem-se pelo tempo de resposta
  // (ver o compare-fantasma acima), por isso não se mistura.
  registo.senhas[normalizarIdentificador(conta.email)] = {
    hash: hashSync(nova, 12),
    definidaEm: agora,
    /**
     * O hash do AMBIENTE, que numa conta sem `passwordHash` próprio é o
     * partilhado da instalação.
     *
     * O `?? ""` falha para o lado seguro: uma cadeia vazia nunca é igual a um
     * hash real, portanto se algum dia isto acontecesse a palavra-passe
     * guardada simplesmente não seria honrada e valia a do ambiente — em vez
     * de valer uma redefinição que já ninguém consegue invalidar.
     */
    substituiu: hashDoAmbiente(conta) ?? "",
  };
  delete registo.pedidos[email];

  const escrita = await gravarRegisto(registo);
  if (!escrita.gravado || !escrita.duradouro) {
    log.error("recuperação: não foi possível guardar a palavra-passe nova", undefined, {
      onde: escrita.onde,
      motivo: escrita.motivo,
    });
    return { estado: "sem-persistencia" };
  }

  log.info("recuperação: palavra-passe redefinida", { conta: conta.name });

  /**
   * As sessões que já estavam abertas com a palavra-passe antiga deixam de
   * valer (auditoria de 13/11, n.º 6) — muda-se a palavra-passe precisamente
   * quando se desconfia de quem a tem. A palavra-passe nova já está gravada:
   * uma revogação que falhe fica registada, mas não desfaz a redefinição.
   */
  try {
    const { revogarSessoesDaConta } = await import("./sessoes-revogadas");
    if (!(await revogarSessoesDaConta(conta.name))) {
      log.error("recuperação: as sessões antigas não foram revogadas", undefined, {
        conta: conta.name,
      });
    }
  } catch (err) {
    log.error("recuperação: as sessões antigas não foram revogadas", err, { conta: conta.name });
  }
  return { estado: "definida", conta: { name: conta.name, email: conta.email } };
}

// --- Sessions -------------------------------------------------------------
// Domain-separate the session-signing key from every other HMAC derived from
// the SAME base secret — notably the public proposal-link tokens
// (src/lib/proposal-token.ts), which a client holds in a plain URL for 14 days.
// Without separation, a proposal token verified as a valid admin session cookie:
// both were signed with the identical key and body construction, with no claim
// distinguishing them. Signing sessions with a labelled sub-key makes a proposal
// signature cryptographically unable to satisfy readSession, independent of the
// payload shape. (Proposal tokens keep signing with the raw base secret, so
// already-sent accept links keep working; only the session key moves.)
function sessionKey(): Buffer {
  return subKey("liquen.admin-session.v1");
}

/**
 * Sub-chave HMAC para um fim NOMEADO, derivada do mesmo segredo base.
 *
 * Existe para que cada uso tenha a sua chave: uma assinatura feita para um fim
 * não pode satisfazer a verificação de outro, mesmo que o corpo assinado
 * calhasse ser idêntico. Foi a separação que fechou o caso em que um token de
 * proposta pública era aceite como cookie de sessão de admin.
 *
 * Quem acrescentar um fim novo escolhe um rótulo novo — nunca reutiliza um.
 */
export function subKey(label: string): Buffer {
  return createHmac("sha256", sessionSecret()).update(label).digest();
}

function sign(body: string): string {
  return createHmac("sha256", sessionKey()).update(body).digest("base64url");
}

/**
 * Mint a signed, expiring session token for the given user name.
 *
 * `ttlMs` tem valor por omissão de propósito: quem não escolher continua com os
 * 30 dias de sempre, e nenhuma sessão já emitida muda de forma por causa disto.
 */
export function createSession(name: string, ttlMs: number = SESSION_TTL_MS): string {
  const agora = Date.now();
  const payload = {
    typ: "session",
    sub: name.slice(0, 40),
    // Quando foi emitida: é o que deixa uma recuperação de palavra-passe
    // invalidar as sessões ANTERIORES dessa conta (`sessoes-revogadas.ts`).
    iat: agora,
    exp: agora + ttlMs,
    v: sessionVersion(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * As duas metades da decisão «manter a sessão iniciada», num sítio só.
 *
 * Vive aqui e não em cada rota porque são DUAS portas de entrada — a
 * palavra-passe e a passkey — e o dia em que uma delas ficasse com o prazo do
 * token de uma e o `maxAge` do cookie da outra era o dia em que a sessão curta
 * deixava de ser curta sem ninguém ver.
 *
 * `maxAge` ausente é um cookie de sessão do browser: morre ao fechá-lo. É essa
 * a diferença que se vê no aparelho emprestado.
 */
export function duracaoDaSessao(manterSessao: boolean): {
  ttlMs: number;
  maxAge: number | undefined;
} {
  if (manterSessao) {
    return { ttlMs: SESSAO_LONGA_MS, maxAge: Math.floor(SESSAO_LONGA_MS / 1000) };
  }
  return { ttlMs: SESSAO_CURTA_MS, maxAge: undefined };
}

/** Validate a session token; returns the user name or null if invalid/expired. */
export function readSession(token: string | undefined | null): { name: string } | null {
  const s = lerSessao(token);
  return s ? { name: s.name } : null;
}

/**
 * A sessão validada, com as datas: `iat` (quando foi emitida) e `exp`.
 *
 * As sessões emitidas antes de o token levar `iat` contam como emitidas no
 * momento mais cedo possível (`exp` menos a duração longa): perante uma
 * revogação, a dúvida resolve-se para o lado de as fechar.
 */
export function lerSessao(
  token: string | undefined | null,
): { name: string; iat: number; exp: number } | null {
  if (!token) return null;
  // A minted token is exactly `body.sig`; base64url contains no ".", so any
  // token that doesn't split into precisely two non-empty parts is malformed or
  // tampered (e.g. trailing junk appended after a valid signature) and refused.
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    // Only an admin-session token is a session. This is a second, independent
    // guard on top of the domain-separated signing key: a token of any other
    // kind must never be honoured here even if it were signed with this key.
    // (Sessions minted before this claim existed lack `typ` and are refused —
    // a one-time re-login, the deliberate cost of closing the bypass.)
    if (payload.typ !== "session") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    // Revoked generation? Tokens minted before the claim existed are "1".
    if (String(payload.v ?? "1") !== sessionVersion()) return null;
    const name = String(payload.sub ?? "");
    // ── QUEM SAIU DA EQUIPA SAI JÁ (10/11) ───────────────────────────────
    // Tirar alguém do `ADMIN_USERS` fechava-lhe a entrada nova, mas um cookie
    // que já tivesse continuava a valer até 30 dias. Agora a sessão só vale
    // enquanto a conta existir. É uma consulta à variável de ambiente — sem
    // rede nem base de dados. Sem `ADMIN_USERS` (palavra-passe partilhada) o
    // `contaExiste` diz sempre que sim. O `sub` é cortado a 40 caracteres ao
    // criar a sessão — e um nome mais comprido também tem de ser reconhecido
    // (auditoria de 13/11, n.º 16): ver `contaDaSessaoExiste`.
    if (!contaDaSessaoExiste(name)) return null;
    const iat = typeof payload.iat === "number" ? payload.iat : payload.exp - SESSAO_LONGA_MS;
    return { name, iat, exp: payload.exp };
  } catch {
    return null;
  }
}

/** True when the request carries a valid, unexpired admin session cookie. */
export function isAuthed(req: NextRequest): boolean {
  return readSession(req.cookies.get(ADMIN_COOKIE)?.value) !== null;
}

// --- Aparelho conhecido ----------------------------------------------------
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BLOQUEIO DA CONTA NÃO FECHA A PORTA AO APARELHO DELA (auditoria de 13/11, n.º 4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O último degrau da escada da entrada (20 falhas numa hora) fecha a conta
 * MESMO para a palavra-passe certa — decisão dela de 10/11, e é o que trava
 * quem tenta palpites a partir de muitos endereços. O efeito secundário: um
 * estranho que soubesse o endereço dela chegava aos 20 de propósito e ela
 * ficava uma hora de fora, sem ter feito nada.
 *
 * A saída que mantém a decisão: o aparelho onde ela já entrou com sucesso leva
 * uma MARCA (cookie próprio, assinado com uma sub-chave só dele, presa à
 * conta). Com a marca, o último degrau não se aplica à palavra-passe certa;
 * sem ela — que é o caso de quem tenta de fora —, fecha como antes. As falhas
 * contam sempre, com ou sem marca.
 */
export const ADMIN_DEVICE_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-liquen_aparelho" : "liquen_aparelho";
export const APARELHO_MS = 1000 * 60 * 60 * 24 * 180; // 180 dias

function chaveDoAparelho(): Buffer {
  return subKey("liquen.admin-aparelho-conhecido.v1");
}

/**
 * A conta a que um identificador escrito à entrada corresponde: o email dela
 * (ou o nome, se não tiver email). Sem `ADMIN_USERS` (palavra-passe
 * partilhada), o próprio identificador.
 */
function contaDoIdentificador(identificador: string): string {
  const users = configuredUsers();
  const achada = users ? encontrarConta(users, identificador) : null;
  if (achada) return normalizarIdentificador(achada.user.email ?? achada.user.name);
  return users ? "" : normalizarIdentificador(identificador);
}

/**
 * A marca que se deixa num aparelho depois de uma entrada bem sucedida, com o
 * identificador que foi escrito nela.
 */
export function criarMarcaDeAparelho(identificador: string): string {
  const corpo = Buffer.from(
    JSON.stringify({
      typ: "aparelho",
      sub: contaDoIdentificador(identificador),
      exp: Date.now() + APARELHO_MS,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", chaveDoAparelho()).update(corpo).digest("base64url");
  return `${corpo}.${sig}`;
}

/**
 * Este aparelho já entrou nesta conta? `identificador` é o que foi escrito à
 * entrada (email ou nome); compara-se com a conta a que ele corresponde.
 */
export function aparelhoConhecido(
  token: string | undefined | null,
  identificador: string,
): boolean {
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return false;
  const esperado = createHmac("sha256", chaveDoAparelho()).update(partes[0]).digest("base64url");
  const a = Buffer.from(partes[1]);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  let p: { typ?: unknown; sub?: unknown; exp?: unknown };
  try {
    p = JSON.parse(Buffer.from(partes[0], "base64url").toString());
  } catch {
    return false;
  }
  if (p.typ !== "aparelho" || typeof p.exp !== "number" || Date.now() > p.exp) return false;
  const alvo = contaDoIdentificador(identificador);
  return !!alvo && identificadorIgual(String(p.sub ?? ""), alvo);
}

// --- Confirmação recente da palavra-passe ----------------------------------
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FICA PARA SEMPRE PEDE A PALAVRA-PASSE OUTRA VEZ (auditoria de 13/11, n.º 5)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Registar um aparelho como chave de entrada é dar-lhe uma porta que dura mais
 * do que a sessão: a passkey continua a abrir depois de o cookie expirar. Por
 * isso não basta ter uma sessão aberta — pede-se a palavra-passe da conta, e a
 * confirmação vale {@link CONFIRMACAO_MS}, num cookie próprio, assinado com uma
 * sub-chave só dele.
 */
export const ADMIN_REAUTH_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-liquen_reconfirmacao" : "liquen_reconfirmacao";
export const CONFIRMACAO_MS = 10 * 60_000;

function chaveDaConfirmacao(): Buffer {
  return subKey("liquen.admin-reconfirmacao.v1");
}

/** O cookie que diz «esta conta confirmou a palavra-passe há pouco». */
export function criarConfirmacao(nomeDaSessao: string): string {
  const corpo = Buffer.from(
    JSON.stringify({
      typ: "reconfirmacao",
      sub: nomeDaSessao.slice(0, 40),
      exp: Date.now() + CONFIRMACAO_MS,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", chaveDaConfirmacao()).update(corpo).digest("base64url");
  return `${corpo}.${sig}`;
}

/** A confirmação é válida, recente, e desta conta? */
export function confirmacaoValida(token: string | undefined | null, nomeDaSessao: string): boolean {
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return false;
  const esperado = createHmac("sha256", chaveDaConfirmacao()).update(partes[0]).digest("base64url");
  const a = Buffer.from(partes[1]);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const p = JSON.parse(Buffer.from(partes[0], "base64url").toString());
    if (p.typ !== "reconfirmacao") return false;
    if (typeof p.exp !== "number" || Date.now() > p.exp) return false;
    return identificadorIgual(
      normalizarIdentificador(String(p.sub ?? "")),
      normalizarIdentificador(nomeDaSessao.slice(0, 40)),
    );
  } catch {
    return false;
  }
}

/**
 * A palavra-passe da conta DA SESSÃO está certa?
 *
 * Pela sessão e não por um identificador escrito: quem confirma é quem já lá
 * está, e não pode confirmar a conta de outra pessoa. Faz sempre um bcrypt,
 * mesmo sem conta, para o tempo não dizer nada.
 */
export async function confirmarPalavraPasse(
  nomeDaSessao: string,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const { compareSync } = (await import("bcryptjs")).default;
  const users = configuredUsers();
  if (users) {
    const senhas = await lerSenhasRedefinidas();
    const alvo = normalizarIdentificador(nomeDaSessao.slice(0, 40));
    let conta: AdminUser | null = null;
    for (const u of users) {
      const nome = normalizarIdentificador(String(u.name ?? "").slice(0, 40));
      if (!conta && identificadorIgual(nome, alvo)) conta = u;
    }
    const hash = conta ? hashEfectivo(conta, senhas) : hashEfectivo(users[0], senhas);
    try {
      const certa = !!hash && compareSync(password, hash);
      return !!conta && certa;
    } catch {
      return false;
    }
  }
  const hash = sharedHash();
  try {
    return !!hash && compareSync(password, hash);
  } catch {
    return false;
  }
}
