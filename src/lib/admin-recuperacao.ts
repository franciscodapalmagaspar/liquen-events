import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  getState,
  gravarEstadoSeNaoMudou,
  lerEstadoComVersao,
  type VersaoDoEstado,
} from "./app-state";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE VIVE A RECUPERAÇÃO DE PALAVRA-PASSE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro é só ARRUMAÇÃO: guarda e lê. Quem sabe o que é uma conta é o
 * `admin-auth.ts`, e é de lá que se entra aqui — não ao contrário. Sem essa
 * regra os dois ficheiros importavam-se um ao outro e o `admin-auth`, que é
 * carregado em caminhos quentes (a sonda de saúde, o `/api/orcamento` público),
 * arrastava o Supabase atrás de si em todos eles.
 *
 * ── Porquê o `app_state` e não uma tabela nova ────────────────────────────
 * São no máximo meia dúzia de linhas com semanas de vida. Uma tabela nova
 * obrigava a correr o `db/schema.sql` outra vez em produção antes de a
 * funcionalidade sequer arrancar — e uma recuperação que não funciona é pior
 * do que não a ter, porque só se descobre no sábado de manhã em que faz falta.
 *
 * ── O que fica gravado, e o que NUNCA fica ────────────────────────────────
 * Guarda-se o RESUMO do token (SHA-256), nunca o token. Quem leia a base de
 * dados — uma cópia de segurança, um erro de permissões, um restauro — não fica
 * com nada que sirva para entrar: do resumo não se volta ao token. Pelo mesmo
 * motivo a palavra-passe redefinida entra aqui já em bcrypt.
 *
 * SHA-256 e não bcrypt para o token: o token são 32 bytes de aleatoriedade
 * verdadeira, não uma palavra escolhida por uma pessoa. Não há dicionário que o
 * ataque, portanto o que o bcrypt custa (e custa em cada verificação) não
 * compra nada aqui.
 */

/** Uma chave só, com todos os pedidos e todas as senhas redefinidas. */
export const CHAVE_ESTADO = "admin-recuperacao";

/**
 * VALIDADE DA LIGAÇÃO: 30 MINUTOS.
 *
 * É o costume da indústria, e o costume tem uma razão: a ligação vive numa
 * caixa de correio, que é o sítio por onde uma conta é tomada quando é tomada.
 * Meia hora chega para ir buscar o email, abrir noutro aparelho e escrever uma
 * palavra-passe nova sem pressa; e é curto que baste para uma caixa de correio
 * espreitada mais tarde nesse dia já não valer nada.
 *
 * Mais curto (5–10 min) parece melhor e não é: quem está em campo, com rede
 * fraca, perde a janela e pede outra vez — e cada pedido novo é mais um email
 * com uma ligação viva. Mais longo multiplica a janela sem melhorar nada.
 */
export const VALIDADE_MS = 30 * 60_000;

export interface PedidoDeRecuperacao {
  /** SHA-256 (hex) do token. O token em claro só existe no email. */
  resumo: string;
  expiraEm: number;
  pedidoEm: number;
}

export interface SenhaRedefinida {
  /** bcrypt da palavra-passe nova. */
  hash: string;
  definidaEm: number;
  /**
   * O hash que estava no `ADMIN_USERS` quando esta foi definida.
   *
   * É o que faz o AMBIENTE MANDAR. Se a dona rodar a palavra-passe de alguém no
   * `ADMIN_USERS` (por exemplo depois de uma fuga), este valor deixa de bater
   * certo e a redefinição é ignorada. Sem isto, uma palavra-passe escolhida por
   * aqui sobrevivia a todas as rotações futuras — uma porta aberta que ninguém
   * se lembrava de ter deixado.
   */
  substituiu: string;
}

export interface RegistoDeRecuperacao {
  /** email normalizado → pedido em curso (no máximo UM por conta). */
  pedidos: Record<string, PedidoDeRecuperacao>;
  /** email normalizado → palavra-passe redefinida. */
  senhas: Record<string, SenhaRedefinida>;
  /**
   * email normalizado → instante da última redefinição pela recuperação. As
   * passkeys dessa conta registadas ANTES dele deixam de abrir a porta.
   *
   * Separado da `senhas` de propósito: rodar o hash no `ADMIN_USERS` desliga a
   * palavra-passe redefinida (ver `substituiu`), mas não pode ressuscitar um
   * aparelho que se fechou por desconfiança.
   */
  passkeysDesde: Record<string, number>;
  /**
   * marcador do pedido → instante. Cada pedido de ligação — tenha o endereço
   * conta ou não — deixa aqui um marcador ALEATÓRIO e único (revisão de 16/11,
   * n.º 1). É o que uma escrita que respondeu tarde procura na releitura, e
   * por ser igual nos dois casos o mesmo atraso dá a mesma resposta (e o mesmo
   * número de idas à base de dados) a um endereço real e a um inventado. Vive
   * {@link VIDA_DAS_MARCAS_MS} e nunca passa de {@link MAX_MARCAS}.
   */
  marcas: Record<string, number>;
}

export const VIDA_DAS_MARCAS_MS = 10 * 60_000;
export const MAX_MARCAS = 50;

/** Um marcador de pedido: 12 bytes aleatórios. Não abre nada, só se procura. */
export function novaMarca(): string {
  return randomBytes(12).toString("base64url");
}

/** 32 bytes de aleatoriedade criptográfica — 43 caracteres seguros num URL. */
export function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

export function resumoDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Compara dois resumos em tempo constante.
 *
 * Um resumo não é segredo, mas a comparação percorre a lista de pedidos: um
 * `===` que sai cedo diria, pelo tempo, quantos caracteres do resumo calculado
 * coincidem com um dos guardados. Custa nada fechá-lo.
 */
export function resumoIgual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS DUAS TABELAS NÃO HERDAM NADA — e porquê
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `pedidos` e `senhas` são tabelas indexadas por um endereço de email, e o
 * endereço vem de fora. Um objecto normal de JavaScript traz, de nascença,
 * propriedades que não estão lá escritas: `__proto__`, `constructor`,
 * `toString`. Escrever ou ler nessas chaves não mexe numa entrada da tabela —
 * mexe no que TODOS os objectos do processo herdam.
 *
 * Hoje o único caminho de escrita já está fechado por outra razão (só se grava
 * um pedido quando o endereço corresponde a uma conta configurada, e nenhuma
 * conta se chama `__proto__`), mas essa defesa é acidental: vive noutro
 * ficheiro, e a próxima pessoa que acrescente um caminho de escrita aqui não
 * tem como saber que ela existe. A análise de segurança apontou exactamente
 * para isto, e tinha razão a apontar.
 *
 * `Object.create(null)` faz tabelas SEM herança nenhuma: `pedidos["__proto__"]`
 * passa a ser uma entrada como outra qualquer, que não pode contaminar nada. O
 * JSON não guarda o prototype, portanto a reconstrução tem de ser feita aqui, a
 * cada leitura — que é o único sítio por onde o conteúdo guardado entra.
 *
 * As chaves perigosas são copiadas na mesma, e é de propósito: apagá-las em
 * silêncio esconderia um registo estragado em vez de o mostrar. O que muda é
 * que deixam de significar o que significavam.
 */
function tabelaSemHeranca<T>(origem: unknown): Record<string, T> {
  const limpa = Object.create(null) as Record<string, T>;
  if (!origem || typeof origem !== "object") return limpa;
  for (const [chave, valor] of Object.entries(origem as Record<string, T>)) {
    limpa[chave] = valor;
  }
  return limpa;
}

export function registoVazio(): RegistoDeRecuperacao {
  return {
    pedidos: tabelaSemHeranca(null),
    senhas: tabelaSemHeranca(null),
    passkeysDesde: tabelaSemHeranca(null),
    marcas: tabelaSemHeranca(null),
  };
}

/** Só os instantes que são números: o que vem da base não decide forma nenhuma. */
function soInstantes(origem: unknown): Record<string, number> {
  const limpa = tabelaSemHeranca<number>(null);
  for (const [k, v] of Object.entries(tabelaSemHeranca<unknown>(origem))) {
    if (typeof v === "number" && Number.isFinite(v)) limpa[k] = v;
  }
  return limpa;
}

function registoDe(guardado: Partial<RegistoDeRecuperacao> | null): RegistoDeRecuperacao {
  if (!guardado || typeof guardado !== "object") return registoVazio();
  return {
    pedidos: tabelaSemHeranca<PedidoDeRecuperacao>(guardado.pedidos),
    senhas: tabelaSemHeranca<SenhaRedefinida>(guardado.senhas),
    passkeysDesde: soInstantes(guardado.passkeysDesde),
    marcas: soInstantes(guardado.marcas),
  };
}

/** Só para LER (a entrada, as passkeys). Para mudar, {@link mudarRegisto}. */
export async function lerRegisto(): Promise<RegistoDeRecuperacao> {
  // Uma leitura falhada lança em vez de dar um registo vazio: quem lê tem de
  // saber que não sabe (auditoria de 13/11).
  const guardado = await getState<Partial<RegistoDeRecuperacao>>(CHAVE_ESTADO, { ouFalha: true });
  return registoDe(guardado);
}

/**
 * Uma leitura com TECTO, para quem está à espera numa entrada (as passkeys —
 * revisão de 16/11, n.º 7). O `lerRegisto` usa as três tentativas do
 * `getState`, que com o Supabase pendurado podiam deixar a pessoa ~24 s a
 * olhar para o ecrã. Aqui é UMA leitura, cortada a `tectoMs`; passar do tecto
 * lança, como uma leitura falhada.
 */
export async function lerRegistoComTecto(tectoMs: number): Promise<RegistoDeRecuperacao> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const leitura = lerEstadoComVersao<Partial<RegistoDeRecuperacao>>(CHAVE_ESTADO, tectoMs);
  // Se perder a corrida e falhar depois, não fica uma rejeição sem dono.
  leitura.catch(() => undefined);
  try {
    const { valor } = await Promise.race([
      leitura,
      new Promise<never>((_, recusa) => {
        relogio = setTimeout(() => recusa(new Error("tecto da leitura")), tectoMs);
      }),
    ]);
    return registoDe(valor);
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LER-MUDAR-GRAVAR, COM ESCRITA CONDICIONAL (auditoria de 16/11, n.º 4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O registo é UM documento com todos os pedidos e todas as senhas. Gravá-lo
 * inteiro sem olhar fazia com que dois pedidos ao mesmo tempo partissem do
 * mesmo registo, e o segundo a gravar apagasse o que o primeiro escreveu: uma
 * ligação que já ia no email deixava de abrir, ou uma palavra-passe acabada de
 * definir desaparecia.
 *
 * Agora, como nas `sessoes-revogadas`: lê-se com a versão, aplica-se a
 * mudança, e grava-se SÓ se ninguém tiver escrito entretanto. Se escreveu,
 * relê-se e aplica-se a mudança outra vez, por cima do que lá está (até
 * {@link TENTATIVAS_DE_ESCRITA}). Por isso `mudar` tem de poder correr mais de
 * uma vez sobre registos diferentes — não guarda nada fora de si a não ser o
 * que for igual em todas as voltas.
 *
 * `mudar` diz se há o que gravar. «falhou» quando a escrita não se fez ou não
 * DURA (em produção sem Supabase, o disco efémero da função: um token que não
 * sobrevive ao pedido seguinte é um email que promete o que não existe).
 *
 * ── UMA ESCRITA QUE CHEGA DEPOIS DO TECTO (revisão de 16/11, n.º 6) ─────────
 * O tecto corta a ESPERA, não o UPDATE: com o Supabase lento, a escrita podia
 * ficar feita depois de o tecto ter dito «falhou» — e a pessoa via «não foi
 * possível guardar» com a palavra-passe nova já a valer, e sem as sessões
 * antigas fechadas. Por isso o tecto subiu para 8 s, e quando a escrita dá
 * «falhou» RELÊ-SE: se o que se queria gravar já lá está (`jaEsta`), conta
 * como gravado e quem chama continua.
 */
const TENTATIVAS_DE_ESCRITA = 4;
export const TECTO_DA_ESCRITA_MS = 8_000;

export type ResultadoDaMudanca<T> =
  | { estado: "gravado"; valor: T }
  | { estado: "sem-escrita"; valor: T }
  | { estado: "sem-leitura" }
  | { estado: "falhou" };

export interface Mudanca<T> {
  gravar: boolean;
  valor: T;
  /**
   * O que se queria gravar já está neste registo? Só se pergunta depois de
   * uma escrita que deu «falhou». Sem ela, um «falhou» é sempre falha.
   */
  jaEsta?: (registo: RegistoDeRecuperacao) => boolean;
}

export async function mudarRegisto<T>(
  mudar: (registo: RegistoDeRecuperacao, agora: number) => Mudanca<T>,
): Promise<ResultadoDaMudanca<T>> {
  for (let tentativa = 1; tentativa <= TENTATIVAS_DE_ESCRITA; tentativa++) {
    let lido: { valor: Partial<RegistoDeRecuperacao> | null; versao: VersaoDoEstado };
    try {
      lido = await lerEstadoComVersao<Partial<RegistoDeRecuperacao>>(
        CHAVE_ESTADO,
        TECTO_DA_ESCRITA_MS,
      );
    } catch (err) {
      // Sem ler, não se grava por cima: perder-se-iam as senhas que lá estão.
      log.error("recuperação: não foi possível ler o registo — nada se grava", err);
      return { estado: "sem-leitura" };
    }
    const registo = registoDe(lido.valor);
    const agora = Date.now();
    limparExpirados(registo, agora);
    const { gravar, valor, jaEsta } = mudar(registo, agora);
    if (!gravar) return { estado: "sem-escrita", valor };

    const r = await gravarEstadoSeNaoMudou(CHAVE_ESTADO, registo, lido.versao, TECTO_DA_ESCRITA_MS);
    if (r === "gravado") return { estado: "gravado", valor };
    if (r === "falhou") {
      if (jaEsta && (await ficouGravado(jaEsta))) {
        log.warn("recuperação: a escrita respondeu tarde, mas ficou feita");
        return { estado: "gravado", valor };
      }
      return { estado: "falhou" };
    }
    // Conflito: alguém escreveu entretanto. Pausa curta e desigual, e outra vez.
    await new Promise((res) => setTimeout(res, tentativa * 10 + Math.random() * 20));
  }
  log.error("recuperação: o registo não parou de mudar — nada se gravou");
  return { estado: "falhou" };
}

/** Relê o registo e pergunta se a escrita que «falhou» afinal ficou. */
async function ficouGravado(jaEsta: (registo: RegistoDeRecuperacao) => boolean): Promise<boolean> {
  try {
    const { valor } = await lerEstadoComVersao<Partial<RegistoDeRecuperacao>>(
      CHAVE_ESTADO,
      TECTO_DA_ESCRITA_MS,
    );
    return jaEsta(registoDe(valor));
  } catch {
    return false;
  }
}

/**
 * Deita fora os pedidos que já expiraram.
 *
 * Não é higiene: é a garantia de que um token expirado deixa de EXISTIR em vez
 * de ficar por aí a ser comparado. Corre em cada leitura-escrita, portanto o
 * registo não cresce com pedidos velhos.
 */
export function limparExpirados(registo: RegistoDeRecuperacao, agora = Date.now()): void {
  for (const [email, pedido] of Object.entries(registo.pedidos)) {
    if (!pedido || typeof pedido.expiraEm !== "number" || pedido.expiraEm <= agora) {
      delete registo.pedidos[email];
    }
  }
  // Os marcadores dos pedidos: só servem enquanto uma escrita pode responder
  // tarde. Saem os velhos e, acima do tecto, os mais antigos.
  for (const [marca, quando] of Object.entries(registo.marcas)) {
    if (quando <= agora - VIDA_DAS_MARCAS_MS) delete registo.marcas[marca];
  }
  const vivas = Object.entries(registo.marcas).sort((a, b) => a[1] - b[1]);
  for (const [marca] of vivas.slice(0, Math.max(0, vivas.length - MAX_MARCAS))) {
    delete registo.marcas[marca];
  }
}

/** O email cujo pedido em curso corresponde a este token, ou null. */
export function emailDoToken(
  registo: RegistoDeRecuperacao,
  token: string,
  agora = Date.now(),
): string | null {
  const resumo = resumoDoToken(token);
  for (const [email, pedido] of Object.entries(registo.pedidos)) {
    if (!pedido?.resumo || pedido.expiraEm <= agora) continue;
    if (resumoIgual(pedido.resumo, resumo)) return email;
  }
  return null;
}

/** Regista uma leitura falhada sem nunca deixar escapar o token. */
export function registarFalhaDeToken(motivo: string): void {
  log.warn("recuperação: ligação recusada", { motivo });
}
