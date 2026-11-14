/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A APARÊNCIA — TRÊS ESTADOS, E O CLARO É O DE OMISSÃO (ver mais abaixo)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A Parte 5.3 do `docs/DESIGN-SYSTEM.md` é explícita, e diz também porquê: «a
 * Apple desaconselha uma preferência exclusiva da app; três estados com
 * Automático por omissão é o compromisso correto».
 *
 * ── PORQUÊ UM COOKIE E NÃO O `localStorage` ────────────────────────────────
 *
 * Porque o `localStorage` só existe depois de o JavaScript correr, e a
 * aparência tem de valer no PRIMEIRO PIXEL. Guardada no `localStorage`, o
 * caminho seria: o servidor manda claro, o browser pinta claro, o script lê a
 * preferência e troca para escuro — um clarão branco em cheio nos olhos de
 * quem escolheu escuro, todas as vezes.
 *
 * Um cookie é lido pelo servidor. O `layout.tsx` do grupo `(admin)` põe o
 * atributo no HTML que envia, e o CSS já o encontra lá. Zero clarão, zero
 * script inline a correr antes da pintura.
 *
 * ── E PORQUE É QUE O AUTOMÁTICO NÃO ESCREVE ATRIBUTO NENHUM ───────────────
 *
 * Porque o automático não é uma terceira cor: é a AUSÊNCIA de escolha. O CSS
 * declara `color-scheme: light dark` e o sistema operativo decide; os dois
 * atributos só existem para uma escolha explícita ganhar ao sistema. Escrever
 * `data-aparencia="auto"` seria um estado a mais a ter de ser ignorado em todo
 * o lado.
 *
 * ── E O DE OMISSÃO É O CLARO, E NÃO O AUTOMÁTICO ─────────────────────────
 *
 * Aqui o documento e a dona discordam, e ganha a dona.
 *
 * A Parte 5.3 do `docs/DESIGN-SYSTEM.md` diz, com a Apple atrás: «três estados
 * com Automático por omissão é o compromisso correto». Ela disse, a olhar para
 * o painel já em escuro: **«eu quero o fundo branco atenção!»** — e não é a
 * primeira vez: o `--bo-chao` deste ficheiro passou a branco por um pedido
 * igual, «eu quero branco», e a razão está escrita ao lado dele.
 *
 * Com Automático por omissão, ter o computador em modo escuro ao fim do dia
 * punha-lhe o painel escuro sem ela ter pedido nada. Não é o que ela quer, e
 * quem trabalha aqui todos os dias é ela.
 *
 * Portanto: **sem cookie, o painel é CLARO**. Os três estados continuam todos
 * a existir e o Automático continua a fazer o que promete — é uma escolha, e
 * não a omissão. O escuro fica em Definições → Aparência para quem o quiser.
 */

/**
 * Os três estados. O de omissão (sem cookie) é o `claro` — ver o bloco de cima.
 * O `auto` é o único que não escreve atributo nenhum.
 */
export type Aparencia = "auto" | "claro" | "escuro";

export const APARENCIAS: ReadonlyArray<{ id: Aparencia; rotulo: string }> = [
  { id: "auto", rotulo: "Automático" },
  { id: "claro", rotulo: "Claro" },
  { id: "escuro", rotulo: "Escuro" },
];

/** O nome do cookie. Num sítio só, para o servidor e o cliente não divergirem. */
export const COOKIE_APARENCIA = "bo-aparencia";

/** Um ano. A escolha de aparência não é uma sessão — é uma preferência. */
export const VALIDADE_APARENCIA_S = 60 * 60 * 24 * 365;

/**
 * Lê um valor vindo de fora (cookie, URL, o que for) e devolve sempre um dos
 * três. Qualquer coisa que não reconheça vale `auto`, que é o comportamento
 * correcto para um cookie corrompido ou de uma versão antiga.
 */
export function aparenciaValida(valor: string | undefined | null): Aparencia {
  if (valor === "escuro" || valor === "auto") return valor;
  // Tudo o resto — sem cookie, cookie de uma versão antiga, cookie estragado —
  // dá CLARO. É o de omissão por decisão dela, e é também o comportamento
  // seguro: um valor que não se percebe nunca escurece o painel a ninguém.
  return "claro";
}

/**
 * O que vai para o atributo `data-aparencia`. `undefined` no automático, para
 * o atributo não chegar a existir — ver o bloco de cima.
 */
export function atributoDaAparencia(a: Aparencia): "claro" | "escuro" | undefined {
  return a === "auto" ? undefined : a;
}

/**
 * A escolha gravada, lida do `document.cookie` (ou de um cabeçalho `Cookie`).
 *
 * ── PORQUE É QUE O SEGMENTO NÃO SE LÊ DO ATRIBUTO ─────────────────────────
 * O `EscolherAparencia` lia o `data-aparencia` do elemento — e no Automático
 * esse atributo NÃO EXISTE (ver «PORQUE É QUE O AUTOMÁTICO NÃO ESCREVE
 * ATRIBUTO NENHUM»). Sem atributo, o `aparenciaValida` devolvia o de omissão,
 * `claro`, e as Definições acendiam «Claro» com o painel em Automático
 * (auditoria de 14/11, n.º 5). O cookie é o único sítio onde as três escolhas
 * se distinguem, e é o mesmo que o servidor lê.
 */
export function aparenciaDoCookie(cookies: string | null | undefined): Aparencia {
  for (const par of (cookies ?? "").split(";")) {
    const i = par.indexOf("=");
    if (i < 0) continue;
    if (par.slice(0, i).trim() !== COOKIE_APARENCIA) continue;
    let valor = par.slice(i + 1).trim();
    try {
      valor = decodeURIComponent(valor);
    } catch {
      // Um valor estragado vale o de omissão, como no servidor.
    }
    return aparenciaValida(valor);
  }
  return aparenciaValida(undefined);
}
