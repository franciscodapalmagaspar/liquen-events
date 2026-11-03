"use client";

import { esquecerVarreduraFeita, marcarVarreduraFeita, podeVarrer } from "./varredura-espacada";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS PDF DAS PROPOSTAS ANTIGAS AQUECEM ENQUANTO ELA TRABALHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero que a rapidez não seja só nas futuras, mas também nas
 * que já enviei. Caso as pessoas vão ver as propostas outra vez no email mas
 * já esteja muito mais rápido.»
 *
 * ── A CONTA QUE OBRIGA A ISTO ────────────────────────────────────────────
 *
 * O aquecimento nocturno faz seis propostas por noite — viaja dentro da cópia
 * de segurança e trabalha com o que ela lhe deixar do relógio. Com oitenta por
 * aquecer, são duas semanas. Duas semanas em que um casal que reabra um link
 * antigo paga o desenho inteiro atrás de um botão calado.
 *
 * A rota a pedido (`/api/admin/aquecimento-pdf`) faz OITO por chamada, com a
 * função inteira para si. Chamada em cadeia enquanto ela tem o back office
 * aberto: oitenta propostas em uns quinze minutos, e nenhuma delas paga por um
 * casal que abriu o link.
 *
 * ── ISTO É O IRMÃO DA VARREDURA DAS DERIVADAS ────────────────────────────
 *
 * Mesma forma, e de propósito: mesma razão para não ser um `cron` (o plano
 * Hobby da Vercel já tem os dois a que tem direito, e um deploy desta casa já
 * foi recusado por se assumir um plano que não existia), mesmo desenho de um
 * pedido de cada vez, e as mesmas quatro regras.
 *
 * Só que este é MAIS caro por lote — oito documentos de vários megabytes, com
 * o `pdf-lib` e o `sharp` a correr —, e por isso é mais recuado nas duas
 * pontas: espera mais para começar e respira mais entre lotes. Nunca compete
 * com ela, e a fila de propostas antigas não tem pressa nenhuma de minutos.
 *
 * ── E ARRANCA DEPOIS DAS DERIVADAS, NÃO AO MESMO TEMPO ───────────────────
 *
 * As duas varreduras vivem no mesmo back office e pedem ao mesmo servidor. As
 * derivadas são o trabalho que ela VÊ — os quadrados cinzentos da grelha —, e
 * portanto vão à frente. O aquecimento dos PDF é invisível até alguém carregar
 * num botão de um email, e pode esperar um minuto.
 */

/** A resposta do `POST /api/admin/aquecimento-pdf`, no que daqui se lê. */
interface Lote {
  ok?: boolean;
  aquecidas?: number;
  restantes?: number;
  semTempo?: boolean;
}

/**
 * O tecto de lotes por sessão.
 *
 * Oito propostas por lote, portanto vinte lotes são 160 — o dobro da fila que
 * existia quando isto se escreveu. Não é um número para ser atingido: é o
 * travão que impede um erro de contagem do servidor de pôr isto a pedir para
 * sempre.
 */
const TECTO_DE_LOTES = 20;

/**
 * Antes do primeiro lote.
 *
 * Mais recuado do que os 4 s das derivadas por duas razões somadas: o back
 * office tem de assentar, e a varredura das derivadas — que é a que ela VÊ —
 * arranca primeiro e merece o servidor só para si enquanto faz o primeiro lote.
 */
const ESPERA_INICIAL_MS = 45_000;

/**
 * Entre lotes.
 *
 * Um lote pode ocupar uma função durante cinquenta segundos a desenhar. Dez
 * segundos de intervalo dão folga para um gesto dela não ficar atrás de
 * manutenção que ninguém pediu neste instante.
 */
const RESPIRO_MS = 10_000;

/** Já há uma varredura nesta página. Sem isto, dois ecrãs davam duas. */
let aCorrer = false;

/**
 * Faz um lote e devolve o que ele diz. `null` quando não vale a pena insistir
 * — sem sessão (401), sem armazenamento (503), ou uma resposta que não é JSON.
 */
async function umLote(sinal: AbortSignal): Promise<Lote | null> {
  const r = await fetch("/api/admin/aquecimento-pdf", { method: "POST", signal: sinal });
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as Lote | null;
}

/**
 * Vai aquecendo os PDF que faltam, em segundo plano, até não faltar nenhum —
 * ou até deixar de haver progresso.
 *
 * Devolve uma função que interrompe a varredura (para a limpeza do efeito).
 */
export function varrerAquecimentoEmFundo(): () => void {
  if (aCorrer || typeof window === "undefined") return () => {};
  // Já viu tudo aquecido há menos de 12 h, neste navegador: não volta a ler
  // todas as propostas para chegar à mesma resposta (`varredura-espacada.ts`).
  if (!podeVarrer("aquecimento")) return () => {};
  aCorrer = true;
  const controlo = new AbortController();

  void (async () => {
    try {
      await dormir(ESPERA_INICIAL_MS, controlo.signal);
      for (let n = 0; n < TECTO_DE_LOTES; n += 1) {
        if (controlo.signal.aborted) return;
        const lote = await umLote(controlo.signal);
        if (!lote?.ok) return;
        /**
         * Um lote que não aqueceu nada não vai aquecer no seguinte.
         *
         * Com uma excepção que importa distinguir: `semTempo` quer dizer que a
         * função ficou sem relógio, e não que não há trabalho. Nesse caso o
         * lote seguinte arranca com a função inteira outra vez e continua de
         * onde este parou — parar aqui era desistir a meio de uma fila que
         * ainda anda, e exactamente nas propostas mais pesadas, que são as que
         * mais precisam de ser aquecidas em vez de desenhadas à frente de um
         * casal.
         */
        if (!lote.aquecidas && !lote.semTempo) {
          marcarVarreduraFeita("aquecimento");
          return;
        }
        // Não falta nenhuma: acabou, e acabou bem.
        if (!lote.restantes) {
          marcarVarreduraFeita("aquecimento");
          return;
        }
        await dormir(RESPIRO_MS, controlo.signal);
      }
    } catch {
      /**
       * Em silêncio, que é a quarta regra da varredura irmã.
       *
       * Isto é manutenção que ela não pediu neste instante; uma falha aqui não
       * pode aparecer no ecrã nem interromper nada. A próxima entrada no back
       * office volta a tentar, e o aquecimento nocturno continua a correr de
       * qualquer maneira.
       */
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
export function esquecerVarreduraDeAquecimento(): void {
  aCorrer = false;
  esquecerVarreduraFeita("aquecimento");
}
