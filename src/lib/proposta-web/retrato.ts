import "server-only";
import { getState, setState } from "@/lib/app-state";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { log } from "@/lib/logger";
import type { PropostaWeb } from "./modelo";
import { chaveDoGuardado } from "./guardado";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RETRATO DA PÁGINA: A PROPOSTA ONLINE JÁ MONTADA, NUMA LEITURA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (25/10): «quero mesmo que melhores drasticamente a velocidade e rapidez
 * de abertura quando os clientes carregam em ver a proposta online».
 *
 * O `guardado.ts` já poupava o trabalho do motor do PDF. Mas cada visita
 * continuava a:
 *
 *   · carregar o `modelo.ts` — e, com ele, o motor do PDF e o `sharp`. Numa
 *     função acabada de acordar, que é o caso normal (um cliente abre o link
 *     uma vez, e o sítio tem pouco movimento), é o pedaço mais caro de todos;
 *   · ler o conteúdo guardado, e depois, em fila, os endereços guardados das
 *     fotografias, as formas e as pré-visualizações delas, e às vezes gravar.
 *
 * Tudo isto dá SEMPRE o mesmo resultado para a mesma proposta: ela não muda
 * depois de enviada. Por isso a página inteira, pronta a desenhar, fica
 * guardada — em memória e em `app_state` — e uma visita passa a ser uma
 * leitura. O `modelo.ts` só se carrega quando o retrato falta.
 *
 * ── O QUE TORNA UM RETRATO VELHO ──────────────────────────────────────────
 *
 *   · outro documento ou outra língua → outra chave (a impressão do documento
 *     entra nela, como no `guardado.ts`);
 *   · outra maneira de montar a página → outra chave (`VERSAO_DO_RETRATO`).
 *     Uma página desenhada por um código com o retrato de outro código é o
 *     tipo de erro que só se vê no telemóvel do casal. NÃO é a versão
 *     publicada (o `VERCEL_GIT_COMMIT_SHA`): o site publica-se várias vezes
 *     por dia, e cada publicação deitava fora todos os retratos — o casal que
 *     abrisse o email depois dela voltava a esperar os segundos todos. A
 *     versão sobe só quando muda o que entra no retrato, e quem o lembra é o
 *     `retrato.test.ts`, que prende a impressão dos ficheiros que o montam;
 *   · os endereços assinados que leva lá dentro → o retrato deixa de servir
 *     antes do primeiro deles expirar. As fotografias da proposta assinam-se
 *     por dez anos, mas as da biblioteca de temas só por seis horas (ver
 *     `urls-assinados.ts`): um retrato com fotos de temas dura umas horas, e
 *     nunca entrega um endereço morto.
 *
 * ── O ENDEREÇO DO CASAL NÃO ENTRA NO RETRATO ──────────────────────────────
 *
 * As rotas do PDF e das fotografias levam o código do link. O retrato é
 * montado com um marcador no lugar dele, e o marcador troca-se pelo código de
 * quem abre, a cada visita: um retrato serve todos os links da mesma proposta,
 * e o que se aquece no envio é o mesmo que o casal lê.
 */

/** O lugar do código do link, enquanto o retrato está guardado. */
export const LUGAR_DO_CODIGO = "~LIQUEN-CODIGO~";

/** O mais que um retrato vive, mesmo com endereços de dez anos. */
const VIDA_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000;
/** A margem antes do primeiro endereço que expira (a mesma dos temas). */
const MARGEM_MS = 30 * 60 * 1000;

interface Retrato {
  validoAte: number;
  /** A página, em texto: a troca do código faz-se no texto e lê-se uma vez. */
  json: string;
}

const memoria = new Map<string, Retrato>();
const MAXIMO_EM_MEMORIA = 40;

type PropostaParaORetrato = { id: string; doc: ProposalDoc; sentAt?: string; createdAt?: string };

/**
 * Sobe quando muda o que o retrato leva — a forma da `PropostaWeb` ou a
 * maneira de a montar (`modelo.ts`, `mosaico.ts`, `textos-web.ts`,
 * `capa-web.ts`). O
 * `retrato.test.ts` falha se um desses ficheiros mudar sem isto subir.
 */
export const VERSAO_DO_RETRATO = 2;

/** `proposta-web:retrato:<proposta>:<impressão>` — com a versão do retrato. */
export function chaveDoRetrato(proposta: PropostaParaORetrato, idioma: IdiomaDaProposta): string {
  return chaveDoGuardado(
    "retrato",
    proposta.id,
    `v${VERSAO_DO_RETRATO}`,
    idioma,
    JSON.stringify(proposta.doc),
  );
}

/**
 * Até quando o retrato serve: antes do primeiro endereço assinado expirar
 * (menos a margem), e nunca mais de `VIDA_MAXIMA_MS`. Os endereços assinados
 * do Supabase levam o `exp` no JWT do parâmetro `token`.
 */
export function validadeDoRetrato(json: string, agora = Date.now()): number {
  let fim = agora + VIDA_MAXIMA_MS;
  for (const m of json.matchAll(/[?&]token=[\w-]+\.([\w-]+)\.[\w-]+/g)) {
    try {
      const meio = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const exp = (JSON.parse(Buffer.from(meio, "base64").toString("utf8")) as { exp?: unknown })
        .exp;
      if (typeof exp === "number" && Number.isFinite(exp))
        fim = Math.min(fim, exp * 1000 - MARGEM_MS);
    } catch {
      /* um token que não se lê não manda na validade; o `urls-assinados` já o recusou */
    }
  }
  return fim;
}

/** O retrato com o código de quem abre no lugar do marcador. */
function revelar(r: Retrato, codigo: string): PropostaWeb {
  return JSON.parse(r.json.split(LUGAR_DO_CODIGO).join(encodeURIComponent(codigo))) as PropostaWeb;
}

function lembrar(chave: string, r: Retrato) {
  memoria.delete(chave);
  memoria.set(chave, r);
  if (memoria.size > MAXIMO_EM_MEMORIA) memoria.delete(memoria.keys().next().value!);
}

const aMontar = new Map<string, Promise<Retrato>>();

/** Monta (pelo `modelo.ts`, só agora carregado) e guarda. */
function montar(
  chave: string,
  proposta: PropostaParaORetrato,
  idioma: IdiomaDaProposta,
): Promise<Retrato> {
  const ja = aMontar.get(chave);
  if (ja) return ja;
  const feito = (async () => {
    const { propostaWeb } = await import("./modelo");
    const dados = await propostaWeb(proposta, LUGAR_DO_CODIGO, idioma);
    const json = JSON.stringify(dados);
    const r: Retrato = { validoAte: validadeDoRetrato(json), json };
    lembrar(chave, r);
    // Esperado de propósito (o mesmo motivo do `guardado.ts`): numa função
    // do servidor, uma escrita por esperar pode ser cortada quando a resposta
    // sai — e é ela que poupa a próxima instância.
    const g = await setState(chave, r).catch(() => null);
    if (!g?.gravado) log.warn("proposta online: o retrato não ficou guardado", { chave });
    return r;
  })();
  aMontar.set(chave, feito);
  feito.finally(() => aMontar.delete(chave)).catch(() => {});
  return feito;
}

/**
 * A proposta online pronta a desenhar: o retrato, se ainda servir; senão,
 * montada agora e guardada para a próxima visita.
 */
export async function retratoDaPropostaWeb(
  proposta: PropostaParaORetrato,
  codigo: string,
  idioma: IdiomaDaProposta,
): Promise<PropostaWeb> {
  const chave = chaveDoRetrato(proposta, idioma);
  const agora = Date.now();

  const emMemoria = memoria.get(chave);
  if (emMemoria && emMemoria.validoAte > agora) return revelar(emMemoria, codigo);

  const lido = await getState<Retrato>(chave).catch(() => null);
  if (lido && typeof lido.json === "string" && lido.validoAte > agora) {
    lembrar(chave, lido);
    return revelar(lido, codigo);
  }

  return revelar(await montar(chave, proposta, idioma), codigo);
}

/** Só para os testes. */
export function esquecerRetratos(): void {
  memoria.clear();
  aMontar.clear();
}
