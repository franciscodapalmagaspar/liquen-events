import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { caminhoValido, ehBaldeDoBlob, type BaldeDoBlob } from "./baldes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ENDEREÇO DE UMA FOTOGRAFIA NO BLOB, COM O PRAZO QUE ELA SEMPRE TEVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotografias de uma proposta assinam-se por DEZ anos e ficam guardadas
 * assim no retrato da página do casal (`urls-assinados.ts`); as da biblioteca,
 * por seis horas. Um endereço assinado do Blob dura no máximo SETE DIAS (o
 * limite do testemunho de assinatura). Se o `balde()` devolvesse o endereço do
 * Blob tal e qual, a proposta que um casal reabrisse no mês seguinte vinha com
 * as fotografias partidas.
 *
 * Por isso, para prazos longos, o endereço é NOSSO:
 *
 *     /api/ficheiro/<balde>/<caminho>?token=<cabeçalho>.<carga>.<assinatura>
 *
 * com o prazo de sempre lá dentro. A rota confere a assinatura e responde com
 * um REDIRECCIONAMENTO para um endereço do Blob acabado de assinar — os bytes
 * vão do Blob ao navegador sem passar pela função (o dono pediu: só passa por
 * uma função o que já passava, os PDF). E é nessa rota que cada leitura do
 * navegador se conta para o tecto, coisa que um endereço directo não deixava.
 *
 * O `token` tem a forma de um JWT (três partes, `exp` em segundos na do meio)
 * DE PROPÓSITO: o estúdio (`assinatura.ts`) e o retrato do casal
 * (`assinaturas-do-retrato.ts`) já sabem ler o prazo de um endereço assim, e
 * passam a saber ler o deste sem mudar uma linha.
 *
 * A chave da assinatura deriva do token do Blob (que só o servidor tem). Trocar
 * o token invalida os endereços guardados — o que se reassina sozinho em todo o
 * lado menos nos retratos, que se refazem (ver `assinaturas-do-retrato.ts`).
 */

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const CABECALHO = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
export const PREFIXO_DA_ROTA = "/api/ficheiro/";

interface Carga {
  /** Expira (segundos desde 1970). */
  exp: number;
  /** Tamanho, para a rota contar a transferência sem ir à base de dados. */
  t: number;
  /** Balde e caminho: a assinatura só abre ESTE ficheiro. */
  b: string;
  c: string;
}

function chave(segredo: string): Buffer {
  return createHash("sha256").update(`liquen:ficheiro:v1:${segredo}`).digest();
}

function assinar(dados: string, segredo: string): string {
  return createHmac("sha256", chave(segredo)).update(dados).digest("base64url");
}

/**
 * ── O MESMO FICHEIRO DÁ O MESMO ENDEREÇO (revisão de 17/11, n.º 2) ─────────
 *
 * Com o `exp` = agora + prazo, cada visita assinava um endereço diferente e o
 * navegador nunca reutilizava a sua cache (a chave da cache é o endereço
 * inteiro — o defeito que `urls-assinados.ts` já tinha corrigido no
 * Supabase). Agora o fim arredonda PARA CIMA a uma grelha alinhada ao
 * relógio, com o passo do próprio prazo até ao máximo de 30 dias: dentro do
 * mesmo passo, o mesmo ficheiro dá exactamente os mesmos bytes. O prazo real
 * fica entre o pedido e o dobro dele (no máximo prazo + 30 dias) — nunca
 * menos do que o pedido.
 */
const PASSO_MAXIMO_S = 30 * 24 * 3600;

export function expAlinhado(agoraMs: number, validadeSegundos: number): number {
  const prazo = Math.max(1, Math.floor(validadeSegundos));
  const passo = Math.min(prazo, PASSO_MAXIMO_S);
  const fim = Math.floor(agoraMs / 1000) + prazo;
  return Math.ceil(fim / passo) * passo;
}

/** O endereço (relativo à origem do site) de um ficheiro do Blob. */
export function urlEstavel(
  balde: BaldeDoBlob,
  caminho: string,
  tamanho: number,
  validadeSegundos: number,
  segredo: string,
  agoraMs: number = Date.now(),
): string {
  const carga: Carga = {
    exp: expAlinhado(agoraMs, validadeSegundos),
    t: Math.max(0, Math.round(tamanho)),
    b: balde,
    c: caminho,
  };
  const corpo = `${CABECALHO}.${b64(JSON.stringify(carga))}`;
  const token = `${corpo}.${assinar(corpo, segredo)}`;
  const partes = caminho.split("/").map(encodeURIComponent).join("/");
  return `${PREFIXO_DA_ROTA}${balde}/${partes}?token=${token}`;
}

/**
 * Confere um pedido à rota. Devolve o ficheiro que abre, ou o motivo da recusa.
 * O balde e o caminho do endereço têm de ser os da assinatura.
 */
export function conferirUrlEstavel(
  balde: string,
  caminho: string,
  token: string | null,
  segredo: string,
  agoraMs: number = Date.now(),
):
  | { ok: true; balde: BaldeDoBlob; caminho: string; tamanho: number; expiraEm: number }
  | { ok: false; motivo: "mal-formado" | "assinatura" | "expirado" } {
  if (!token || !ehBaldeDoBlob(balde) || !caminhoValido(caminho))
    return { ok: false, motivo: "mal-formado" };
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== CABECALHO) return { ok: false, motivo: "mal-formado" };
  const esperada = Buffer.from(assinar(`${partes[0]}.${partes[1]}`, segredo));
  const dada = Buffer.from(partes[2]);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada))
    return { ok: false, motivo: "assinatura" };
  let carga: Carga;
  try {
    carga = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as Carga;
  } catch {
    return { ok: false, motivo: "mal-formado" };
  }
  if (carga.b !== balde || carga.c !== caminho) return { ok: false, motivo: "assinatura" };
  if (!Number.isFinite(carga.exp) || carga.exp * 1000 <= agoraMs)
    return { ok: false, motivo: "expirado" };
  return {
    ok: true,
    balde,
    caminho,
    tamanho: Number.isFinite(carga.t) && carga.t > 0 ? carga.t : 0,
    expiraEm: carga.exp * 1000,
  };
}
