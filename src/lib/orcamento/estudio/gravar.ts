/*
 * A gravação do rascunho e do preço no servidor, com as repetições e a verdade sobre onde ficou.
 *
 * Saiu tal e qual do `ProposalStudio.tsx` (fase 1 de `docs/ESTRUTURA-DO-CODIGO.md`);
 * o componente reexporta o que já exportava, para nenhum chamador mudar.
 */
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RASCUNHO NO SERVIDOR — E O QUE SE FAZ QUANDO ELE NÃO LÁ CHEGA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta gravação era um `fetch` seco: `if (!res.ok) return`, e um `catch` vazio
 * com o comentário «offline — a cópia local guarda o trabalho até haver rede».
 * A cópia local guarda mesmo — mas só naquele computador. Uma colaboradora
 * montou uma proposta inteira com esta chamada a falhar de cada vez, o
 * indicador a dizer «guardado às 14:32» o tempo todo, e quem a foi abrir noutra
 * máquina encontrou o ecrã vazio.
 *
 * Duas coisas mudam. A primeira é REPETIR: uma gravação que morre por causa de
 * uma ligação que caiu não pode morrer à primeira. É o mesmo desenho de
 * `proposal-storage.descarregar` e da segunda tentativa do envio — tentativas
 * com pausa curta e crescente, e um tecto de tempo por tentativa para um pedido
 * pendurado não segurar o resto. A segunda é DIZER o que aconteceu, que é a
 * parte que faltava por inteiro.
 *
 * O que não se repete: um 4xx (o pedido é que está errado — sessão expirada,
 * rascunho grande demais) e um 503 marcado como `permanente` (a instalação não
 * tem a tabela, ou a chave não a pode escrever). Nesses, tentar outra vez dá
 * exactamente a mesma resposta e só atrasa o aviso.
 */

const GRAVACAO_TENTATIVAS = 3;
const GRAVACAO_PAUSA_MS = 400;
const GRAVACAO_TECTO_MS = 10000;

export type ResultadoDaGravacao =
  | {
      estado: "guardado";
      updatedAt?: string;
      overwrote?: boolean;
      previousBy?: string;
      /**
       * A gaveta onde ficou o trabalho que esta gravação esmagou.
       *
       * ── PORQUE É QUE ISTO ESTAVA A SER DEITADO FORA ─────────────────────
       *
       * O servidor guarda, desde sempre, a versão que ia desaparecer numa
       * chave irmã, e devolve o nome dela aqui. O estúdio lia o `overwrote` e
       * o `previousBy` — e ignorava estes dois. Resultado: o aviso dizia «ficou
       * a tua versão» e mais nada, portanto quem o lia concluía, com toda a
       * razão, que as duas horas da outra pessoa tinham acabado.
       *
       * Não tinham. Estavam guardadas num sítio que nenhuma parte do produto
       * conseguia abrir — a lista de gavetas que a leitura aceita não tinha
       * esta lá dentro. Metade da regra da casa («se falhar, não perder
       * trabalho») cumprida, e a metade que se vê por cumprir.
       */
      resgate?: string;
      /** Quando é que essa versão tinha sido gravada — é a hora que dá à
       *  pessoa a noção do que está em jogo antes de decidir. */
      resgateEm?: string;
      /** O servidor juntou esta gravação com a de outra pessoa, campo a campo
       *  (achado n.º 6 — ver `rascunho-juntar.ts`), e `doc` é como ficou. */
      juntou?: boolean;
      doc?: Record<string, unknown>;
      /**
       * O sítio onde ficou sobrevive a um deploy?
       *
       * ── PORQUE É QUE ISTO NÃO PODE FICAR DE FORA ────────────────────────
       *
       * Há um terceiro desfecho entre «guardado» e «não guardado», e é o que
       * fez desaparecer uma proposta montada: produção sem Supabase escreve o
       * rascunho no `data/app-state.json`, que em Vercel é o disco da função. A
       * escrita ACONTECE — por isso a rota responde 200 e isto não é um
       * `so-local` —, e o próximo deploy apaga-a. A rota diz-o desde sempre
       * (`duradouro: false`, com a frase em `aviso`); era esta leitura que
       * faltava, e sem ela o indicador escrevia «guardado às 14:32» por cima do
       * trabalho de horas de alguém.
       *
       * As fotos em si não se perdem — os bytes estão no bucket. O que se perde
       * é a MONTAGEM: quais entraram, por que ordem, em que mood board.
       *
       * `undefined` quando o servidor não o disse. Só um `false` explícito
       * alarma: inventar um alarme a partir de uma ausência era pôr um aviso
       * permanente em instalações sãs, que é como se ensina a ignorá-lo.
       */
      duradouro?: boolean;
      /** A frase do servidor para o caso de cima — diz o que fazer e nomeia as
       *  variáveis que o resolvem. Vem escrita de lá para não haver duas
       *  versões da mesma verdade. */
      aviso?: string;
      /**
       * O estado do pedido MUDOU com esta gravação (6/11: o primeiro rascunho
       * põe-no em «A preparar proposta»). Só vem quando mudou — o caso normal
       * de um autosave é não vir nada.
       */
      estadoDoPedido?: QuoteStatus;
    }
  /** Não ficou no servidor. O trabalho está no ecrã e na cópia local — e é isso
   *  mesmo que a pessoa tem de ouvir, com estas palavras. */
  | {
      estado: "so-local";
      porque?: string;
      /** O servidor recusou porque a sessão caiu (401) — não é avaria nenhuma:
       *  basta entrar outra vez (achado n.º 34). */
      sessaoExpirada?: boolean;
    };

/** Um `fetch` com tecto de tempo próprio. Sem ele, uma rede que aceita a
 *  ligação e nunca responde deixa a gravação pendurada para sempre — e o
 *  indicador ficaria eternamente em «a guardar…», que é outra maneira de
 *  mentir. */
async function fetchComTecto(url: string, init: RequestInit, ms: number): Promise<Response> {
  const abortador = new AbortController();
  const t = setTimeout(() => abortador.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: abortador.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Grava o rascunho no servidor, repetindo enquanto fizer sentido, e devolve a
 * VERDADE sobre onde ele ficou. Nunca lança.
 */
export async function gravarRascunhoNoServidor(
  quoteId: string,
  corpo: {
    doc: unknown;
    baseUpdatedAt: string | null;
    campos?: string[];
    base?: Record<string, unknown>;
  },
): Promise<ResultadoDaGravacao> {
  let porque: string | undefined;
  let sessaoExpirada = false;
  for (let tentativa = 1; tentativa <= GRAVACAO_TENTATIVAS; tentativa++) {
    try {
      const res = await fetchComTecto(
        `/api/orcamento/${quoteId}/proposta-rascunho`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        },
        GRAVACAO_TECTO_MS,
      );
      const dados = await res.json().catch(() => null);
      if (res.ok) {
        return {
          estado: "guardado",
          updatedAt: typeof dados?.updatedAt === "string" ? dados.updatedAt : undefined,
          overwrote: Boolean(dados?.overwrote),
          previousBy: typeof dados?.previousBy === "string" ? dados.previousBy : undefined,
          resgate: typeof dados?.resgate === "string" ? dados.resgate : undefined,
          resgateEm: typeof dados?.resgateEm === "string" ? dados.resgateEm : undefined,
          juntou: dados?.juntou === true,
          doc:
            dados?.juntou === true && dados.doc && typeof dados.doc === "object"
              ? (dados.doc as Record<string, unknown>)
              : undefined,
          duradouro: typeof dados?.duradouro === "boolean" ? dados.duradouro : undefined,
          aviso: typeof dados?.aviso === "string" ? dados.aviso : undefined,
          estadoDoPedido:
            typeof dados?.estadoDoPedido === "string"
              ? (dados.estadoDoPedido as QuoteStatus)
              : undefined,
        };
      }
      // O 503 da gravação manda `erro` (a frase do motivo); as outras recusas
      // da rota (400, 401, 413, 500) mandam `error`. Só se lia o primeiro, e
      // «Rascunho demasiado grande» nunca chegava ao ecrã (auditoria 13/11,
      // estúdio n.º 16).
      porque =
        typeof dados?.erro === "string"
          ? dados.erro
          : typeof dados?.error === "string"
            ? dados.error
            : undefined;
      sessaoExpirada = res.status === 401;
      // Um 4xx é o pedido que está errado, e repeti-lo dá o mesmo. Um 503
      // `permanente` é a instalação que está incompleta — também dá o mesmo.
      if (res.status < 500 || dados?.permanente === true) break;
    } catch {
      // Rede em baixo, ou o tecto de tempo. É exactamente o caso que a
      // repetição existe para apanhar.
      porque = undefined;
    }
    if (tentativa < GRAVACAO_TENTATIVAS) {
      await new Promise((r) => setTimeout(r, GRAVACAO_PAUSA_MS * tentativa));
    }
  }
  return { estado: "so-local", porque, ...(sessaoExpirada ? { sessaoExpirada } : {}) };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PREÇO QUE FICAVA SÓ NO ESTÚDIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era um `fetch` seco com um `catch` vazio, e o comentário dizia «a
 * gravação seguinte volta a tentar». NÃO HÁ GRAVAÇÃO SEGUINTE: esta chamada só
 * parte quando alguém MEXE no valor. Se a rede piscar na única vez que ela
 * escreve o preço, ninguém volta a tentar nada.
 *
 * O que se via, e está na auditoria da casa (2.3): o Estúdio e o PDF a dizerem
 * 9.500 €, e o cartão do pedido, a margem, as Estatísticas e as facturas a
 * dizerem 8.000 €. Sem aviso nenhum, porque o `catch` estava vazio. É a queixa
 * dela — «o valor enviado para o cliente tem de ser o valor que fica na
 * proposta» — com a causa por baixo.
 *
 * Duas coisas mudam, e são as mesmas do rascunho aqui em cima, de propósito:
 *
 *  · REPETIR. Uma gravação que morre porque a ligação caiu não pode morrer à
 *    primeira. Mesmas tentativas, mesma pausa crescente, mesmo tecto por
 *    tentativa.
 *  · DIZER. Quando nem à terceira chega, o ecrã passa a saber e a mostrar — com
 *    os dois valores à vista e um botão para tentar outra vez.
 *
 * O que NÃO se repete é o mesmo que ali: um 4xx é o pedido que está errado
 * (sessão caída, sobretudo), e repeti-lo dá exactamente a mesma resposta. Aí
 * `valeTentarDeNovo` vem `false` e o ecrã não oferece um botão que não pode
 * funcionar — é a regra que o `AvisoDeFalha` já segue.
 *
 * Nunca lança: quem chama está no meio da escrita de uma proposta.
 */
export type ResultadoDoPreco =
  | {
      estado: "gravado";
      /**
       * O pedido actualizado, para propagar ao resto do ecrã. Falta quando o
       * servidor respondeu 200 com um corpo que não se leu — gravou na mesma,
       * e é isso que decide o estado; o que não há é número novo para
       * espalhar.
       */
      quote?: Quote;
    }
  | { estado: "falhou"; porque?: string; valeTentarDeNovo: boolean };

export async function mandarPrecoAoPedido(
  quoteId: string,
  base: number | null,
): Promise<ResultadoDoPreco> {
  let porque: string | undefined;
  let valeTentarDeNovo = true;
  for (let tentativa = 1; tentativa <= GRAVACAO_TENTATIVAS; tentativa++) {
    try {
      const res = await fetchComTecto(
        `/api/orcamento/${quoteId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // `null` e não `undefined`: apagar o preço tem de chegar ao servidor,
          // e `undefined` desaparece no JSON (o merge parcial mantinha o valor
          // antigo). É a mesma razão que está escrita na Gestão do pedido.
          body: JSON.stringify({ quotedPrice: base }),
        },
        GRAVACAO_TECTO_MS,
      );
      if (res.ok) {
        // Um 200 com corpo ilegível é um 200: o servidor gravou. Insistir aqui
        // punha um alarme vermelho por cima de trabalho que está são — e ela
        // deixava de acreditar no alarme quando ele for verdade.
        const atualizado = (await res.json().catch(() => null)) as Quote | null;
        return atualizado ? { estado: "gravado", quote: atualizado } : { estado: "gravado" };
      } else {
        const dados = await res.json().catch(() => null);
        porque = typeof dados?.error === "string" ? dados.error : undefined;
        if (res.status < 500) {
          valeTentarDeNovo = false;
          break;
        }
      }
    } catch {
      // Rede em baixo, ou o tecto de tempo. É exactamente o caso que a
      // repetição existe para apanhar.
      porque = undefined;
    }
    if (tentativa < GRAVACAO_TENTATIVAS) {
      await new Promise((r) => setTimeout(r, GRAVACAO_PAUSA_MS * tentativa));
    }
  }
  return { estado: "falhou", porque, valeTentarDeNovo };
}
