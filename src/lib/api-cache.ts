import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Respostas de LISTA com validação condicional (ETag → 304 Not Modified).
 *
 * O back office volta a pedir a mesma lista muitas vezes por sessão: o
 * `useCachedList` revalida sempre que uma vista é montada (é o que a mantém
 * fresca), e mudar de Faturas para Propostas e voltar são três pedidos. Com 300
 * pedidos, `/api/propostas` são ~158 KB — descarregados de novo de cada vez,
 * quase sempre para dar exactamente o mesmo resultado.
 *
 * Aqui a resposta passa a levar um ETag do próprio corpo. Quando o cliente
 * reenvia esse ETag em `If-None-Match` e nada mudou, devolvemos **304 sem
 * corpo**: zero bytes na rede, zero `JSON.parse` no browser e — o que mais se
 * nota ao clicar — a lista do lado do cliente MANTÉM A MESMA IDENTIDADE, por
 * isso o React não volta a desenhar as linhas todas.
 *
 * O que isto NÃO é: não é guardar nada em lado nenhum. O servidor continua a
 * ler a tabela e a serializá-la a cada pedido — a garantia de frescura é
 * exactamente a mesma de antes. O que se poupa é a viagem de volta.
 *
 * Cuidados deliberados:
 *   · `private` + `Vary: Cookie` — isto são dados de uma sessão autenticada e
 *     nunca podem ser servidos a outra pessoa por uma cache partilhada.
 *   · `no-cache` (≠ `no-store`): o browser pode guardar, mas tem SEMPRE de
 *     revalidar antes de usar. Nunca se mostra uma lista sem confirmar.
 *   · o ETag é calculado DEPOIS da guarda de autenticação, para que um pedido
 *     sem sessão continue a levar 401 sem tocar no repositório.
 */

/** ETag fraco derivado do corpo. Fraco porque a igualdade que interessa é
 *  semântica (o mesmo JSON), não byte-a-byte depois de compressão. */
export function etagFor(body: string): string {
  return `W/"${createHash("sha1").update(body).digest("base64url")}"`;
}

/**
 * Compara o cabeçalho `If-None-Match` com o ETag actual.
 *
 * Aceita a lista separada por vírgulas que o RFC 9110 permite e o curinga `*`,
 * e usa comparação FRACA (ignora o prefixo `W/`) — que é a exigida para GET
 * condicional. Um valor malformado nunca dá 304: na dúvida, envia-se o corpo.
 */
export function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const strip = (s: string) => s.trim().replace(/^W\//, "");
  const wanted = strip(etag);
  for (const candidate of ifNoneMatch.split(",")) {
    const c = candidate.trim();
    if (c === "*") return true;
    if (strip(c) === wanted) return true;
  }
  return false;
}

/**
 * `NextResponse.json(data)` com ETag — e 304 quando o cliente já tem esta
 * versão. Substituto directo nas rotas GET de lista do back office.
 *
 * `validador` existe para as respostas que trazem URLS ASSINADOS. Um URL
 * assinado leva a hora em que foi assinado, portanto MUDA a cada pedido mesmo
 * quando nada mudou — um ETag tirado do corpo nunca voltaria a bater certo e o
 * pedido condicional era teatro. Quem tiver esse problema passa aqui a mesma
 * resposta com os URLs reduzidos ao caminho: é sobre ESSA forma que se decide
 * "isto é a mesma lista", e o corpo enviado continua a ser o de sempre, com
 * assinaturas frescas.
 *
 * Quem usa isto assume uma coisa e tem de a garantir: num 304 o cliente fica
 * com os URLs da resposta ANTERIOR, por isso a cache dele tem de expirar
 * bastante antes da validade das assinaturas (ver `theme-picker-cache.ts`, que
 * deita a entrada fora ao fim de 30 minutos contra 6 horas de validade).
 */
/**
 * 304 ANTES de ler a lista, quando quem chama sabe dizer «nada mudou» com uma
 * leitura barata (auditoria de 13/11, n.º 3).
 *
 * O `jsonWithEtag` decide o 304 sobre o corpo — o que obriga a ler a lista
 * inteira só para concluir que não mudou. Quem tem um `validador` barato (uma
 * contagem e uma data, por exemplo) pergunta aqui primeiro: o ETag é o mesmo
 * que o `jsonWithEtag(request, dados, validador)` daria, portanto um 304 daqui
 * e um 200 de lá falam a mesma língua. `null` quer dizer «lê e responde».
 */
export function naoMudou(request: NextRequest, validador: unknown): NextResponse | null {
  const etag = etagFor(JSON.stringify(validador));
  if (!matchesEtag(request.headers.get("if-none-match"), etag)) return null;
  return new NextResponse(null, {
    status: 304,
    headers: {
      ETag: etag,
      "Cache-Control": "private, no-cache, must-revalidate",
      Vary: "Cookie",
    },
  });
}

export function jsonWithEtag(
  request: NextRequest,
  data: unknown,
  validador?: unknown,
): NextResponse {
  const body = JSON.stringify(data);
  const etag = etagFor(validador === undefined ? body : JSON.stringify(validador));
  const headers = {
    ETag: etag,
    // Pode guardar, mas revalida sempre. Nunca partilhado entre sessões.
    "Cache-Control": "private, no-cache, must-revalidate",
    Vary: "Cookie",
  };

  if (matchesEtag(request.headers.get("if-none-match"), etag)) {
    // 304 não leva corpo — é essa a poupança.
    return new NextResponse(null, { status: 304, headers });
  }

  return new NextResponse(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
