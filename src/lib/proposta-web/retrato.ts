import "server-only";
import { after } from "next/server";
import { getState, setState } from "@/lib/app-state";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { log } from "@/lib/logger";
import type { PropostaWeb } from "./modelo";
import { chaveDoGuardado } from "./guardado";
import {
  assinarFotosDeTema,
  temAssinaturasPorFazer,
  tirarAssinaturasDeTema,
} from "./assinaturas-do-retrato";

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
 *     por dez anos. As da biblioteca de temas só por seis horas — e por isso,
 *     desde 28/10, NÃO ficam no retrato: fica o caminho, e assinam-se ao ler
 *     (`assinaturas-do-retrato.ts`). Antes, um retrato com fotos de temas
 *     durava umas horas, e a visita seguinte esperava a página toda outra vez.
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
export const VERSAO_DO_RETRATO = 5;

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

/** A página com o código de quem abre no lugar do marcador. */
function revelar(json: string, codigo: string): PropostaWeb {
  return JSON.parse(json.split(LUGAR_DO_CODIGO).join(encodeURIComponent(codigo))) as PropostaWeb;
}

/**
 * O retrato com as fotos de tema assinadas, por chave: uma visita a seguir à
 * outra não volta a assinar. `fonte` é o retrato de onde saiu — se ele mudar,
 * isto deixa de servir.
 */
const assinadosEmMemoria = new Map<string, { fonte: string; json: string; validoAte: number }>();

/** O retrato pronto a revelar, ou `null` se as fotos de tema não se assinaram. */
async function comAsFotosAssinadas(chave: string, r: Retrato): Promise<string | null> {
  if (!temAssinaturasPorFazer(r.json)) return r.json;
  const agora = Date.now();
  const ja = assinadosEmMemoria.get(chave);
  if (ja && ja.fonte === r.json && ja.validoAte > agora) return ja.json;
  const json = await assinarFotosDeTema(r.json).catch(() => null);
  if (!json) return null;
  lembrarAssinado(chave, r.json, json);
  return json;
}

function lembrarAssinado(chave: string, fonte: string, json: string) {
  assinadosEmMemoria.delete(chave);
  assinadosEmMemoria.set(chave, { fonte, json, validoAte: validadeDoRetrato(json) });
  if (assinadosEmMemoria.size > MAXIMO_EM_MEMORIA)
    assinadosEmMemoria.delete(assinadosEmMemoria.keys().next().value!);
}

/**
 * Faltando menos do que isto para o retrato expirar, a visita é servida com
 * ele e a página volta a montar-se depois da resposta — o casal seguinte já
 * apanha o novo, e ninguém espera pela montagem.
 */
const REFAZER_ANTES_MS = 24 * 60 * 60 * 1000;

function lembrar(chave: string, r: Retrato) {
  memoria.delete(chave);
  memoria.set(chave, r);
  if (memoria.size > MAXIMO_EM_MEMORIA) memoria.delete(memoria.keys().next().value!);
}

/** O que fica guardado, e a mesma página já com tudo assinado (para já). */
interface Montado {
  guardado: Retrato;
  vivo: string;
}

const aMontar = new Map<string, Promise<Montado>>();

/**
 * Segura um trabalho depois da resposta: numa função do servidor, o que fica a
 * correr quando a página sai é cortado, a não ser que vá pelo `after()`. Fora
 * de um pedido (os testes, um guião) o `after()` recusa — e aí o trabalho corre
 * sozinho, que é o que se quer.
 */
function segurarDepoisDaResposta(trabalho: Promise<unknown>): void {
  try {
    after(() => trabalho);
  } catch {
    /* fora de um pedido */
  }
}

/**
 * Monta (pelo `modelo.ts`, só agora carregado) e guarda.
 *
 * Se a capa em AVIF ainda estava por fazer (`capa-web.ts`), a página sai com a
 * capa de sempre e a fabricação continua depois da resposta; quando acaba, a
 * página volta a montar-se UMA vez — já com a AVIF — e o retrato novo fica no
 * lugar do outro. Sem isto o retrato sem AVIF servia horas, e a AVIF só se via
 * quando ele expirasse.
 *
 * Guarda-se sem as assinaturas das fotos de tema (ficam os caminhos); a página
 * desta visita sai com elas, tal como vieram da montagem.
 */
function montar(
  chave: string,
  proposta: PropostaParaORetrato,
  idioma: IdiomaDaProposta,
  refazerDepoisDaCapa = true,
): Promise<Montado> {
  const ja = aMontar.get(chave);
  if (ja) return ja;
  const feito = (async () => {
    const { propostaWeb } = await import("./modelo");
    let capaPorFazer: Promise<number> | undefined;
    const dados = await propostaWeb(proposta, LUGAR_DO_CODIGO, idioma, (p) => {
      capaPorFazer = p;
    });
    const vivo = JSON.stringify(dados);
    const json = tirarAssinaturasDeTema(vivo);
    const r: Retrato = { validoAte: validadeDoRetrato(json), json };
    lembrar(chave, r);
    lembrarAssinado(chave, json, vivo);
    // Esperado de propósito (o mesmo motivo do `guardado.ts`): numa função
    // do servidor, uma escrita por esperar pode ser cortada quando a resposta
    // sai — e é ela que poupa a próxima instância.
    const g = await setState(chave, r).catch(() => null);
    if (!g?.gravado) log.warn("proposta online: o retrato não ficou guardado", { chave });
    if (capaPorFazer) {
      segurarDepoisDaResposta(
        capaPorFazer
          .then((feitas) => {
            if (feitas > 0 && refazerDepoisDaCapa) {
              // Esta montagem já acabou; não é ela que a seguinte reaproveita.
              if (aMontar.get(chave) === feito) aMontar.delete(chave);
              return montar(chave, proposta, idioma, false);
            }
            if (feitas === 0) log.warn("proposta online: a capa em AVIF não se fez", { chave });
          })
          .catch(() => {}),
      );
    }
    return { guardado: r, vivo };
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

  /** Serve um retrato válido; `null` se as fotos de tema não se assinaram. */
  const servir = async (r: Retrato): Promise<PropostaWeb | null> => {
    const json = await comAsFotosAssinadas(chave, r);
    if (!json) return null;
    if (r.validoAte - agora < REFAZER_ANTES_MS) {
      segurarDepoisDaResposta(montar(chave, proposta, idioma).catch(() => {}));
    }
    return revelar(json, codigo);
  };

  const emMemoria = memoria.get(chave);
  if (emMemoria && emMemoria.validoAte > agora) {
    const pagina = await servir(emMemoria);
    if (pagina) return pagina;
  } else {
    const lido = await getState<Retrato>(chave).catch(() => null);
    if (lido && typeof lido.json === "string" && lido.validoAte > agora) {
      lembrar(chave, lido);
      const pagina = await servir(lido);
      if (pagina) return pagina;
    }
  }

  return revelar((await montar(chave, proposta, idioma)).vivo, codigo);
}

/** Só para os testes. */
export function esquecerRetratos(): void {
  memoria.clear();
  assinadosEmMemoria.clear();
  aMontar.clear();
}
