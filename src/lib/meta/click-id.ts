/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O IDENTIFICADOR DO CLIQUE DA META (fbclid → fbc) E O DO BROWSER (fbp)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O equivalente exacto do que `src/lib/ads/click-id.ts` faz para a Google, com
 * três diferenças que interessam:
 *
 *  1. A Meta usa TRÊS valores, não um:
 *       • `fbclid` — o parâmetro que vem no URL do anúncio;
 *       • `fbc`    — o `fbclid` embrulhado no formato que a API aceita;
 *       • `fbp`    — um identificador do BROWSER, criado pelo pixel, que liga
 *                    visitas da mesma pessoa mesmo sem clique nenhum.
 *  2. O `fbp` e o `fbc` NÃO SÃO CIFRADOS. É o erro mais comum nesta
 *     integração: quem cifra tudo por precaução cifra também estes dois e a
 *     correspondência deixa de funcionar por completo. Só os dados pessoais
 *     (email, telefone, nome) vão em SHA-256 — ver `capi.ts`.
 *  3. O `fbp` só existe se o pixel tiver corrido, e o pixel só corre COM
 *     consentimento. Sem consentimento há `fbclid` no URL (que a Meta pôs lá,
 *     não nós) mas não há cookie nenhum, e é por isso que o envio para a Meta
 *     fica todo suspenso — ver `consentimento.ts`.
 *
 * ── O FORMATO DO `fbc` ─────────────────────────────────────────────────────
 *     fb.<índiceDeSubdomínio>.<criadoEm>.<fbclid>
 *
 *   • `fb`                — literal;
 *   • índice de subdomínio — 0 para `com`, 1 para `exemplo.com`, 2 para
 *     `www.exemplo.com`. A documentação da Meta manda usar **1** quando o
 *     valor é construído sem se gravar o cookie `_fbc`, que é exactamente o
 *     nosso caso quando não há consentimento para o pixel;
 *   • criado em            — instante UNIX em MILISSEGUNDOS da primeira vez
 *     que vimos este `fbclid`. Não é a hora do envio: é a hora do clique;
 *   • fbclid               — tal e qual como veio no URL, sem tocar.
 *
 * Quando o pixel correu, o cookie `_fbc` que ele grava já tem esta forma e é
 * ESSE que se usa — é o valor canónico. O construído à mão é o recurso.
 *
 * ── RGPD: NADA SE GRAVA SEM «ACEITAR» (auditoria legal, 17/11) ───────────
 * O `fbclid` é um identificador de publicidade. Gravá-lo no dispositivo
 * (localStorage, cookie) é o acesso ao terminal que a ePrivacy sujeita a
 * consentimento PRÉVIO — e até 17/11 gravava-se logo à chegada, antes de a
 * pessoa escolher. MEDIDO num Chromium: `/s/comporta?fbclid=…` deixava
 * `liquen-meta-click` no localStorage antes de qualquer toque no aviso.
 *
 * Agora:
 *   • sem consentimento, o clique fica SÓ EM MEMÓRIA (`cliqueDestaVisita`),
 *     que morre ao fechar ou recarregar a página;
 *   • se ela aceitar na mesma visita, `aoMudarConsentimento(true)` grava-o
 *     nessa altura, a partir do que ficou em memória;
 *   • se recusar, apaga-se o que houver (memória, localStorage e os cookies
 *     `_fbc`/`_fbp` de uma aceitação anterior) e `lerIdentificadores` devolve
 *     vazio: não viaja no formulário, não fica no pedido, e não chega à Meta
 *     por caminho nenhum (nem pela CAPI do fecho, que lê o que ficou gravado).
 * Ver o cabeçalho de `consentimento.ts`, que explica porque é que não há
 * "meio caminho" legítimo aqui.
 */

import { temConsentimento } from "./consentimento";
import { apagarCookies } from "@/lib/apagar-cookies";

/** Chave no localStorage. Prefixo `liquen-` como o resto do armazenamento. */
export const META_CLICK_KEY = "liquen-meta-click";

/**
 * Quanto tempo se guarda o clique.
 *
 * NÃO é a janela de atribuição da Meta (essa é, por omissão, 7 dias para
 * cliques e 1 dia para visualizações, e configura-se na conta). É o tempo
 * durante o qual vale a pena LEVAR o identificador connosco: um casamento
 * demora meses a fechar, e mandar o `fbc` do clique original junto com a
 * conversão é o que permite à Meta ligá-los se a janela da conta o permitir.
 * Guardar mais do que 90 dias não acrescenta nada e é mais um dado a reter.
 */
export const JANELA_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Índice de subdomínio a usar quando o `fbc` é construído sem cookie.
 * A documentação da Meta manda 1 neste caso.
 */
export const INDICE_SUBDOMINIO = 1;

export interface CliqueMeta {
  /** O `fbclid` em cru, tal como veio no URL. */
  fbclid: string;
  /** Quando foi visto pela primeira vez (ISO). */
  em: string;
  /** Caminho de aterragem, cortado. Diz QUE variante o clique comprou. */
  pagina?: string;
}

/**
 * Um `fbclid` plausível. A Meta não publica a gramática, e por isso isto é
 * deliberadamente permissivo no conteúdo e restritivo no TAMANHO e no
 * alfabeto: o que se está mesmo a impedir é que um valor absurdo (um script,
 * um caminho, um texto de 4 KB) atravesse o formulário e vá parar à base de
 * dados e a um pedido para fora.
 */
const VALOR_VALIDO = /^[A-Za-z0-9_.-]{6,500}$/;

/**
 * O clique desta visita, em MEMÓRIA. É o único sítio onde o `fbclid` pode
 * viver sem consentimento: não toca no dispositivo e desaparece com a página.
 */
let cliqueDestaVisita: CliqueMeta | null = null;

/** Lê o clique guardado, se existir e ainda estiver dentro da janela. */
export function lerClique(agora: number = Date.now()): CliqueMeta | null {
  // Sem consentimento não se lê o dispositivo para fins de publicidade — nem
  // o que lá tenha ficado de uma aceitação anterior entretanto retirada.
  if (!temConsentimento()) return null;
  try {
    const cru = localStorage.getItem(META_CLICK_KEY);
    if (!cru) return null;
    const c = JSON.parse(cru) as Partial<CliqueMeta>;
    if (!c || typeof c.fbclid !== "string" || typeof c.em !== "string") return null;
    if (!VALOR_VALIDO.test(c.fbclid)) return null;
    const em = Date.parse(c.em);
    if (!Number.isFinite(em)) return null;
    if (agora - em > JANELA_MS) {
      localStorage.removeItem(META_CLICK_KEY);
      return null;
    }
    return {
      fbclid: c.fbclid,
      em: c.em,
      pagina: typeof c.pagina === "string" ? c.pagina : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Apanha o `fbclid` do URL e guarda-o, se ainda não houver um válido.
 *
 * PRIMEIRO TOQUE VENCE, pela mesma razão do lado da Google: o primeiro clique
 * é o que descobriu a marca. Um segundo clique é muitas vezes um anúncio de
 * remarketing a alguém que já nos conhece — dar-lhe o crédito faria a campanha
 * de remarketing parecer brilhante e a campanha que faz o trabalho real
 * parecer inútil, e a decisão seguinte seria cortar o orçamento à que
 * funciona.
 *
 * `search` e `pagina` são parâmetros em vez de virem do `window` para isto ser
 * testável sem browser.
 */
export function capturarClique(
  search: string,
  pagina: string,
  agora: number = Date.now(),
): CliqueMeta | null {
  const existente = lerClique(agora);
  if (existente) return existente;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const fbclid = params.get("fbclid");
  if (!fbclid || !VALOR_VALIDO.test(fbclid)) return null;

  const registo: CliqueMeta = {
    fbclid,
    em: new Date(agora).toISOString(),
    pagina: pagina.slice(0, 200),
  };
  // Primeiro toque vence também em memória: uma navegação dentro da visita
  // com outro `fbclid` não substitui o da entrada.
  // (Um da memória fora da janela já não conta.)
  if (!cliqueDestaVisita || !(agora - Date.parse(cliqueDestaVisita.em) <= JANELA_MS)) {
    cliqueDestaVisita = registo;
  }
  if (!temConsentimento()) return null;
  return gravar(cliqueDestaVisita);
}

/** Grava no localStorage. Só se chama com consentimento. */
function gravar(registo: CliqueMeta): CliqueMeta {
  try {
    localStorage.setItem(META_CLICK_KEY, JSON.stringify(registo));
  } catch {
    /* armazenamento bloqueado (é o caso normal no browser interno em contexto
       particionado) — devolve-se à mesma, para o formulário DESTA visita ainda
       conseguir levar o identificador consigo */
  }
  return registo;
}

/**
 * A escolha do aviso de cookies mudou.
 *
 *   • «Aceitar»: grava o clique que ficou em memória desde a entrada (se o
 *     dispositivo ainda não tiver um válido — primeiro toque vence);
 *   • «Recusar»: apaga tudo o que identifique o clique ou o browser para a
 *     Meta — a memória, o localStorage e os cookies `_fbc`/`_fbp` que o pixel
 *     tenha gravado numa aceitação anterior.
 *
 * E o pixel, se já tiver entrado nesta visita: a API dele tem o seu próprio
 * interruptor (`fbq('consent', 'revoke' | 'grant')`), e sem ele continuava a
 * mandar e a regravar os cookies até recarregar.
 *
 * Chamado pelo aviso de cookies (no momento da escolha, neste separador) e
 * pelo `MetaPixel` (quando a escolha chega de OUTRO separador). Idempotente;
 * nunca lança.
 */
export function aoMudarConsentimento(aceitou: boolean, agora: number = Date.now()): void {
  try {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    fbq?.("consent", aceitou ? "grant" : "revoke");
  } catch {
    /* idem */
  }
  try {
    if (!aceitou) {
      esquecerClique();
      return;
    }
    if (!cliqueDestaVisita || lerClique(agora)) return;
    if (agora - Date.parse(cliqueDestaVisita.em) > JANELA_MS) return;
    gravar(cliqueDestaVisita);
  } catch {
    /* a medição nunca parte a página */
  }
}

/** Apaga o clique da memória e do dispositivo, e os cookies do pixel. */
export function esquecerClique(): void {
  cliqueDestaVisita = null;
  try {
    localStorage.removeItem(META_CLICK_KEY);
  } catch {
    /* sem armazenamento — nada a apagar */
  }
  apagarCookiesDoPixel();
}

/** Os cookies do pixel (`_fbp`, `_fbc`), em todos os domínios onde possam estar. */
function apagarCookiesDoPixel(): void {
  apagarCookies((nome) => nome === "_fbc" || nome === "_fbp");
}

/** Constrói o `fbc` a partir de um clique guardado. */
export function construirFbc(c: CliqueMeta): string {
  const ms = Date.parse(c.em);
  const criadoEm = Number.isFinite(ms) ? ms : Date.now();
  return `fb.${INDICE_SUBDOMINIO}.${criadoEm}.${c.fbclid}`;
}

/**
 * Lê um cookie pelo nome. Devolve "" quando não existe ou quando o acesso a
 * cookies está bloqueado — que é um estado normal, não um erro.
 */
export function lerCookie(nome: string, cookieString?: string): string {
  try {
    const fonte = cookieString ?? document.cookie;
    for (const parte of fonte.split(";")) {
      const i = parte.indexOf("=");
      if (i < 0) continue;
      if (parte.slice(0, i).trim() !== nome) continue;
      return decodeURIComponent(parte.slice(i + 1).trim());
    }
  } catch {
    /* sem cookies — segue sem eles */
  }
  return "";
}

/**
 * Os três identificadores prontos a enviar, lidos do dispositivo.
 *
 * O `fbc` do COOKIE ganha ao construído: quando o pixel correu, foi ele que o
 * gravou, e é o valor que a Meta reconhece sem margem para dúvida. O
 * construído existe para o caso em que o pixel não correu mas o `fbclid`
 * chegou no URL — que é o caso de quem clicou no anúncio e ainda não deu
 * consentimento.
 */
export interface IdentificadoresMeta {
  fbp: string;
  fbc: string;
}

export function lerIdentificadores(agora: number = Date.now()): IdentificadoresMeta {
  // Sem consentimento, nada: nem o cookie de uma aceitação antiga, nem o
  // clique em memória. É isto que impede o `fbc` de ir no formulário, ficar
  // gravado no pedido e chegar à Meta pela CAPI do fecho.
  if (!temConsentimento()) return { fbp: "", fbc: "" };
  const fbp = lerCookie("_fbp");
  const doCookie = lerCookie("_fbc");
  if (doCookie) return { fbp, fbc: doCookie };
  const daMemoria =
    cliqueDestaVisita && agora - Date.parse(cliqueDestaVisita.em) <= JANELA_MS
      ? cliqueDestaVisita
      : null;
  const clique = lerClique(agora) ?? daMemoria;
  return { fbp, fbc: clique ? construirFbc(clique) : "" };
}

/**
 * Forma compacta para viajar dentro do formulário, no mesmo espírito do
 * `serializar` do lado da Google: um campo de texto só, porque cada campo novo
 * atravessa o esquema de validação, a base de dados e o export, e cada um
 * deles é mais uma coisa que pode ficar por migrar.
 *
 *     "fbp=<valor>;fbc=<valor>"
 *
 * Partes vazias são omitidas; sem nenhuma, devolve "".
 */
export function serializar(id: IdentificadoresMeta): string {
  const partes = [];
  if (id.fbp) partes.push(`fbp=${id.fbp}`);
  if (id.fbc) partes.push(`fbc=${id.fbc}`);
  return partes.join(";");
}

/** Inverso de `serializar`. Nunca lança; devolve campos vazios se não bater. */
export function desserializar(s: string): IdentificadoresMeta {
  const id: IdentificadoresMeta = { fbp: "", fbc: "" };
  for (const parte of (s ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    const chave = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (chave === "fbp") id.fbp = valor;
    else if (chave === "fbc") id.fbc = valor;
  }
  return id;
}
