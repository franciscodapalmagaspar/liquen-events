import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getState, setState, type ResultadoDeEscrita } from "./app-state";
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
  return { pedidos: tabelaSemHeranca(null), senhas: tabelaSemHeranca(null) };
}

export async function lerRegisto(): Promise<RegistoDeRecuperacao> {
  // Para MUDAR e voltar a gravar: uma leitura falhada lança em vez de dar um
  // registo vazio — senão o pedido seguinte gravava-o vazio e as
  // palavras-passe redefinidas desapareciam (auditoria de 13/11).
  const guardado = await getState<Partial<RegistoDeRecuperacao>>(CHAVE_ESTADO, { ouFalha: true });
  if (!guardado || typeof guardado !== "object") return registoVazio();
  return {
    pedidos: tabelaSemHeranca<PedidoDeRecuperacao>(guardado.pedidos),
    senhas: tabelaSemHeranca<SenhaRedefinida>(guardado.senhas),
  };
}

/**
 * Grava, e diz onde ficou.
 *
 * Quem chama TEM de olhar para o resultado: em produção sem Supabase a escrita
 * cai no disco efémero da função (`duradouro: false`) e um token que não
 * sobrevive ao pedido seguinte é um email que promete uma coisa que não existe.
 * Ver o comentário grande do `app-state.ts`.
 */
export async function gravarRegisto(registo: RegistoDeRecuperacao): Promise<ResultadoDeEscrita> {
  return setState(CHAVE_ESTADO, registo);
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
