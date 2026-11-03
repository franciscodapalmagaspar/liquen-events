"use client";

import { esquecerVarreduraFeita, marcarVarreduraFeita, podeVarrer } from "./varredura-espacada";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS VERSÕES LEVES FAZEM-SE SOZINHAS, ENQUANTO ELA TRABALHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, primeiro «eu queria que isto gera-se de forma automatica» e
 * depois, a olhar para um mood board com metade dos quadrados cinzentos, «as
 * fotos demoram imenso tempo a carregar».
 *
 * ── O DEFEITO, COM OS NÚMEROS QUE JÁ ESTAVAM MEDIDOS NA CASA ──────────────
 *
 * Cada célula de uma grelha do estúdio tenta três coisas por ordem:
 *
 *     miniatura (400 px)     20 KB
 *     derivada  (1200 px)  ~200 KB
 *     original  (2200 px)  1099 KB      ← 55× a miniatura
 *
 * «Ausente quer dizer que essa derivada ainda não foi fabricada: a célula cai
 * directa ao original» (`ProposalStudio`). E a fila de `fila-de-imagens.ts`
 * deixa passar TRÊS de cada vez — de propósito, porque sem ela as 24 células
 * repartem o mesmo 4G e acabam todas ao fim de 67,6 s em vez de acabarem umas
 * primeiro. Ou seja: os quadrados cinzentos não são uma avaria da fila, são a
 * fila a fazer o seu trabalho por cima de ficheiros que não deviam ser
 * pedidos.
 *
 * ── PORQUE É QUE A LISTA NÃO ANDAVA ──────────────────────────────────────
 *
 * As fotografias novas já nascem prontas: o navegador fabrica a miniatura, a
 * micro e a de 1200 px no mesmo desenho e sobem com o original. O que ficou
 * para trás — 427 no dia em que isto se escreveu — só tinha dois caminhos:
 *
 *   1. ela carregar no botão «Gerar as versões leves», em Definições;
 *   2. o cron dos lembretes, UMA VEZ POR DIA às 07:00, com os segundos que lhe
 *      sobrassem depois de fazer o trabalho dele (`50_000 - decorrido`).
 *
 * O caminho 1 depende de alguém se lembrar, e «um passo que depende de alguém
 * se lembrar é um passo que um dia não acontece» — está escrito no próprio
 * cron. O caminho 2 apanha as migalhas de um trabalho que é outro.
 *
 * ── PORQUE É QUE ISTO NÃO É UM CRON NOVO ─────────────────────────────────
 *
 * Porque o `vercel.json` tem DOIS crons e ambos são diários, que é exactamente
 * o tecto do plano Hobby da Vercel (dois trabalhos, uma vez por dia). Um
 * terceiro — ou um de hora a hora — arrisca ser recusado no deploy, e trocar
 * fotografias lentas por deploys que não passam não é uma troca.
 *
 * Isto corre no browser dela e não custa rede nenhuma: o trabalho pesado
 * (descarregar, encodar, subir) é do servidor. O que sai daqui é um POST
 * pequeno de cada vez e a resposta é um punhado de números.
 *
 * ── AS QUATRO REGRAS QUE ISTO CUMPRE ─────────────────────────────────────
 *
 * 1. NUNCA COMPETE COM ELA. Um pedido de cada vez, e só começa depois de o
 *    back office ter assentado.
 * 2. PRIMEIRO O QUE SE VÊ. `?papel=essencial` faz só as miniaturas — as que
 *    fazem a grelha cair para o original. O AVIF vem depois, e só depois.
 * 3. PÁRA QUANDO NÃO ANDA. Um lote que não fabrica nada é um lote que não vai
 *    fabricar nada da próxima; insistir seria um ciclo silencioso a gastar
 *    servidor.
 * 4. NUNCA ESTRAGA UM GESTO DELA. Uma falha aqui não aparece no ecrã, não
 *    interrompe nada e não é repetida à força. A contagem verdadeira e o botão
 *    para forçar continuam em Definições, que é onde ela vai quando quer saber.
 */

/** A resposta do `POST /api/admin/derivadas`, no que daqui se lê. */
interface Lote {
  ok?: boolean;
  geradas?: number;
  fotografiasFeitas?: number;
  restantesEssenciais?: number;
  restantes?: number;
  retoma?: unknown;
}

/**
 * O tecto de lotes por sessão.
 *
 * Um lote faz até 200 fotografias (`LOTE_FOTOS` em `lib/derivadas.ts`), portanto
 * trinta lotes são 6000 — catorze vezes a lista que existia. Não é um número
 * para ser atingido: é o travão que impede um erro de contagem do servidor de
 * pôr isto a pedir para sempre.
 */
const TECTO_DE_LOTES = 30;

/** Entre lotes. Dá lugar ao que ela estiver a fazer e não enche a fila do browser. */
const RESPIRO_MS = 1_500;

/** Já há uma varredura nesta página. Sem isto, dois ecrãs davam duas. */
let aCorrer = false;

/**
 * Faz um lote e devolve o que ele diz. `null` quando não vale a pena insistir
 * — sem armazenamento, sem sessão, ou o servidor a responder o que não é JSON.
 */
async function umLote(retoma: unknown, sinal: AbortSignal): Promise<Lote | null> {
  const r = await fetch("/api/admin/derivadas?papel=essencial", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(retoma ? { retoma } : {}),
    signal: sinal,
  });
  // 401 (sessão caiu) e 503 (sem Storage) não são para repetir: são estados,
  // não falhas de rede.
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as Lote | null;
}

/**
 * Vai fabricando as versões leves que faltam, em segundo plano, até não faltar
 * nenhuma — ou até deixar de haver progresso.
 *
 * Devolve uma função que interrompe a varredura (para a limpeza do efeito).
 */
export function varrerDerivadasEmFundo(): () => void {
  if (aCorrer || typeof window === "undefined") return () => {};
  // Já viu tudo feito há menos de 12 h, neste navegador (`varredura-espacada.ts`).
  if (!podeVarrer("derivadas")) return () => {};
  aCorrer = true;
  const controlo = new AbortController();

  void (async () => {
    try {
      // Deixar o back office assentar primeiro: o primeiro desenho dela não
      // divide o servidor com manutenção.
      await dormir(4_000, controlo.signal);
      let retoma: unknown = null;
      for (let n = 0; n < TECTO_DE_LOTES; n += 1) {
        if (controlo.signal.aborted) return;
        const lote = await umLote(retoma, controlo.signal);
        if (!lote?.ok) return;
        // Regra 3: um lote que não fabricou nada não vai fabricar no seguinte.
        if (!lote.fotografiasFeitas || !lote.restantesEssenciais) {
          marcarVarreduraFeita("derivadas");
          return;
        }
        retoma = lote.retoma ?? null;
        await dormir(RESPIRO_MS, controlo.signal);
      }
    } catch {
      // Regra 4: em silêncio. Isto é manutenção que ela não pediu neste
      // instante; a próxima entrada no back office volta a tentar.
    } finally {
      aCorrer = false;
    }
  })();

  return () => {
    controlo.abort();
    aCorrer = false;
  };
}

function dormir(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sinal.aborted) return reject(new Error("interrompido"));
    const t = setTimeout(resolve, ms);
    sinal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("interrompido"));
      },
      { once: true },
    );
  });
}

/** Só para os testes: esquecer que houve uma varredura nesta página. */
export function esquecerVarredura(): void {
  esquecerVarreduraFeita("derivadas");
  aCorrer = false;
}
