/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O IDENTIFICADOR DO CLIQUE PAGO (GCLID) — A PEÇA QUE LIGA O ANÚNCIO À VENDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sem isto, a Google só sabe que alguém preencheu um formulário. Com isto, a
 * Google sabe QUE CLIQUE gerou o casamento que fechou por 24 000 € — e passa a
 * licitar para casamentos fechados em vez de licitar para formulários
 * preenchidos. É a diferença entre uma conta amadora e uma conta a sério, e é
 * barata: um parâmetro no URL, guardado até o negócio fechar.
 *
 * ── PORQUÊ localStorage E NÃO sessionStorage ───────────────────────────────
 * O ciclo de compra de um casamento é longo. Uma pessoa clica no anúncio em
 * Janeiro, anda a ver o site, volta em Março pelo Instagram e só aí pede
 * orçamento. Em sessionStorage o clique de Janeiro tinha desaparecido e o
 * pedido de Março apareceria como orgânico — a campanha que efectivamente o
 * gerou não levaria crédito nenhum, e o orçamento seria cortado à campanha que
 * está a funcionar.
 *
 * ── PORQUÊ 90 DIAS ─────────────────────────────────────────────────────────
 * É a janela de conversão por omissão do Google Ads. Um GCLID mais velho do
 * que isso é REJEITADO na importação, portanto guardá-lo mais tempo só serviria
 * para enviar linhas que a Google recusa e para nos convencermos de uma
 * atribuição que ela não aceita. Expira aqui, ao ler.
 *
 * ── PRIMEIRO TOQUE, NÃO ÚLTIMO ─────────────────────────────────────────────
 * Se já houver um clique guardado e válido, um clique novo NÃO o substitui. O
 * primeiro clique é o que descobriu a marca; o segundo é muitas vezes uma
 * pesquisa pelo nome "Líquen Events" depois de já nos conhecer — dar-lhe o
 * crédito faria a campanha de marca parecer brilhante e a campanha que faz o
 * trabalho real parecer inútil.
 *
 * ── RGPD: NADA SE GRAVA SEM «ACEITAR» (auditoria legal, 17/11) ───────────
 * O GCLID é um identificador de publicidade: gravá-lo no dispositivo é o
 * acesso ao terminal que a ePrivacy sujeita a consentimento PRÉVIO, e mandá-lo
 * à Google (no formulário e, quando o negócio fecha, na importação das
 * conversões) é medir publicidade, que a política diz que só se faz com
 * consentimento. Até 17/11 ia para o localStorage à chegada — MEDIDO num
 * Chromium: `/?gclid=…` deixava `liquen-ad-click` antes de qualquer escolha.
 *
 * Agora é o mesmo desenho do `fbclid` (`src/lib/meta/click-id.ts`): sem
 * consentimento fica SÓ EM MEMÓRIA; «Aceitar» na mesma visita grava-o
 * (`aoMudarConsentimento`); «Recusar» apaga-o; e `lerClique` não devolve nada
 * sem consentimento — portanto o formulário não o leva e ele não fica no
 * pedido.
 */

import { temConsentimento } from "@/lib/meta/consentimento";

/** Chave no localStorage. Prefixo `liquen-` como o resto do armazenamento. */
export const AD_CLICK_KEY = "liquen-ad-click";

/** Janela de conversão do Google Ads, em milissegundos. */
export const JANELA_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Os três identificadores de clique da Google, por ordem de precedência:
 *  • gclid  — o normal, da Pesquisa e do Shopping.
 *  • gbraid — iOS, tráfego de app, quando não há identificador de utilizador.
 *  • wbraid — iOS, web, idem.
 * Os dois últimos existem porque a partir do iOS 14.5 a Google deixou de poder
 * usar o gclid em parte do tráfego. Uma conta que só capte `gclid` perde
 * silenciosamente a atribuição de uma fatia do tráfego de iPhone — e num
 * mercado de casamentos essa fatia não é pequena.
 */
export const PARAMETROS = ["gclid", "gbraid", "wbraid"] as const;
export type ParametroClique = (typeof PARAMETROS)[number];

export interface CliqueGuardado {
  /** Qual dos três parâmetros foi apanhado. */
  tipo: ParametroClique;
  /** O valor em cru, tal como veio no URL. */
  valor: string;
  /** Quando foi apanhado (ISO). É o "Conversion Time" mínimo na importação. */
  em: string;
  /** Caminho de aterragem, sanitizado. Diz QUE página o clique comprou. */
  pagina?: string;
}

/** Um valor de identificador plausível: só o alfabeto que a Google usa. */
const VALOR_VALIDO = /^[A-Za-z0-9_.-]{8,200}$/;

/**
 * Lê o clique guardado, se existir e ainda estiver dentro da janela.
 * Devolve `null` em qualquer situação anómala — armazenamento bloqueado,
 * JSON corrompido, registo expirado. Nunca lança.
 */
export function lerClique(agora: number = Date.now()): CliqueGuardado | null {
  // Sem consentimento não há clique para ninguém — nem o guardado de uma
  // aceitação anterior entretanto retirada, nem o que está em memória.
  if (!temConsentimento()) return null;
  return lerGuardado(agora) ?? daMemoria(agora);
}

/**
 * O clique desta visita, em MEMÓRIA: o único sítio onde pode viver sem
 * consentimento. Não toca no dispositivo e morre com a página.
 */
let cliqueDestaVisita: CliqueGuardado | null = null;

function daMemoria(agora: number): CliqueGuardado | null {
  const c = cliqueDestaVisita;
  return c && agora - Date.parse(c.em) <= JANELA_MS ? c : null;
}

/** O que está no localStorage, se existir e estiver dentro da janela. */
function lerGuardado(agora: number): CliqueGuardado | null {
  try {
    const cru = localStorage.getItem(AD_CLICK_KEY);
    if (!cru) return null;
    const c = JSON.parse(cru) as Partial<CliqueGuardado>;
    if (!c || typeof c.valor !== "string" || typeof c.em !== "string") return null;
    if (!PARAMETROS.includes(c.tipo as ParametroClique)) return null;
    if (!VALOR_VALIDO.test(c.valor)) return null;
    const em = Date.parse(c.em);
    if (!Number.isFinite(em)) return null;
    // Expirado: apaga, para não voltar a ser lido nem ocupar espaço.
    if (agora - em > JANELA_MS) {
      localStorage.removeItem(AD_CLICK_KEY);
      return null;
    }
    return {
      tipo: c.tipo as ParametroClique,
      valor: c.valor,
      em: c.em,
      pagina: typeof c.pagina === "string" ? c.pagina : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Apanha o identificador de clique do URL actual e guarda-o, se ainda não
 * houver um válido. Devolve o que ficou guardado (novo ou o que já lá estava),
 * ou `null` se não houver nenhum.
 *
 * `search` e `pagina` são parâmetros em vez de virem de `window` para isto ser
 * testável sem browser — a captura é a peça de que depende toda a medição de
 * receita, e uma peça dessas não pode ser só verificada a olho.
 */
export function capturarClique(
  search: string,
  pagina: string,
  agora: number = Date.now(),
): CliqueGuardado | null {
  const consentido = temConsentimento();
  const existente = consentido ? lerGuardado(agora) : null;
  if (existente) return existente; // primeiro toque vence

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  for (const tipo of PARAMETROS) {
    const valor = params.get(tipo);
    if (!valor || !VALOR_VALIDO.test(valor)) continue;
    const registo: CliqueGuardado = {
      tipo,
      valor,
      em: new Date(agora).toISOString(),
      pagina: pagina.slice(0, 200),
    };
    // Primeiro toque vence também em memória.
    if (!daMemoria(agora)) cliqueDestaVisita = registo;
    if (!consentido) return null;
    return gravar(cliqueDestaVisita ?? registo);
  }
  return null;
}

function gravar(registo: CliqueGuardado): CliqueGuardado {
  try {
    localStorage.setItem(AD_CLICK_KEY, JSON.stringify(registo));
  } catch {
    /* armazenamento cheio ou bloqueado — devolve à mesma, para o formulário
       desta visita ainda conseguir levar o identificador consigo */
  }
  return registo;
}

/**
 * A escolha do aviso de cookies mudou: «Aceitar» grava o clique que ficou em
 * memória desde a entrada (se não houver já um guardado — primeiro toque
 * vence); «Recusar» apaga-o da memória e do dispositivo. Nunca lança.
 */
export function aoMudarConsentimento(aceitou: boolean, agora: number = Date.now()): void {
  if (!aceitou) {
    esquecerClique();
    return;
  }
  const c = daMemoria(agora);
  if (c && !lerGuardado(agora)) gravar(c);
}

/** Apaga o clique da memória e do dispositivo. */
export function esquecerClique(): void {
  cliqueDestaVisita = null;
  try {
    localStorage.removeItem(AD_CLICK_KEY);
  } catch {
    /* sem armazenamento — nada a apagar */
  }
}

/**
 * Forma compacta para viajar dentro do formulário: "gclid:VALOR@2026-07-31T…".
 * Um campo de texto só, em vez de três, porque atravessa uma fronteira (o
 * esquema de validação, a base de dados, o export) e cada campo novo nessa
 * fronteira é mais uma coisa que pode ficar por migrar.
 */
export function serializar(c: CliqueGuardado): string {
  return `${c.tipo}:${c.valor}@${c.em}`;
}

/** Inverso de `serializar`. Devolve `null` se a cadeia não tiver a forma. */
export function desserializar(s: string): CliqueGuardado | null {
  const m = /^(gclid|gbraid|wbraid):([A-Za-z0-9_.-]{8,200})@(.+)$/.exec(s.trim());
  if (!m) return null;
  const em = Date.parse(m[3]);
  if (!Number.isFinite(em)) return null;
  return { tipo: m[1] as ParametroClique, valor: m[2], em: m[3] };
}
