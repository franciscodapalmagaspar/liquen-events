/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO DA ROTA DA PROPOSTA — O QUE ELA RESPONDE, EM TIPOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Só tipos, de propósito: este ficheiro não importa nada que corra (nem o zod,
 * nem o servidor), por isso o estúdio, que corre no browser, pode lê-lo sem
 * levar um byte a mais. É o que prende os dois lados: renomear
 * `precisaConfirmarFotos` aqui parte a compilação do lado que o lê.
 *
 * (O `ProposalStudio.tsx` ainda lê as respostas à mão; passar a importá-las
 * daqui é da fase em que o estúdio se parte — ver `docs/ESTRUTURA-DO-CODIGO.md`.)
 */
import type { Proposal } from "@/lib/orcamento/types";
import type { Impedimento } from "@/lib/proposal-progress";
import type { RelatorioDoPdf } from "@/lib/proposal-preview-cache";

/** O que o desenho deixou de fora (a sétima foto de um mood board…). */
export type Truncagens = RelatorioDoPdf["truncations"];

/**
 * O corpo de cada recusa, por forma. O estúdio distingue-as pelo campo que
 * cada uma traz (e pelo código HTTP, que vai ao lado na {@link Recusa}).
 */
export type CorpoDaRecusa =
  /** 400, 404, 413, 503: a frase, e mais nada. */
  | { error: string }
  /** 409: outro pedido está a enviar esta proposta neste momento. */
  | { error: string; aEnviar: true }
  /** 422: o que o estúdio também trava (`travas-do-envio.ts`). */
  | { error: string; faltas: Impedimento[] }
  /** 422: o domínio do email do cliente não recebe correio. */
  | { error: string; campo: "email" }
  /** 409: faltam fotografias — uma pergunta, não uma avaria. */
  | { error: string; precisaConfirmarFotos: true; missingImages: number }
  /** 409: o desenho cortou conteúdo — outra pergunta. */
  | { error: string; precisaConfirmarCortes: true; truncations: Truncagens };

/** Uma recusa — o pedido não pode seguir, e é uma DECISÃO: o código HTTP e
 *  o corpo, tal e qual a rota os responde. */
export interface Recusa {
  status: 400 | 404 | 409 | 413 | 422;
  corpo: CorpoDaRecusa;
}

/** Uma falha — a base ou outro serviço não deixou: não é uma decisão sobre
 *  a proposta, e conta-se à parte (métricas, alertas). */
export interface Falha {
  status: 503;
  corpo: { error: string };
}

/**
 * O que um ENVIO responde (200), seja o envio a sério ou uma repetição
 * reconhecida (`repeticao-do-envio.ts`). (A pré-visualização responde o PDF.)
 */
export interface RespostaDoEnvio {
  ok: true;
  id: string;
  /** O correio saiu. */
  emailed: boolean;
  /** Porque é que não saiu, quando foi avaria (e não escolha). */
  emailError?: string;
  /** Não saiu email porque ela escolheu o WhatsApp. */
  semEmailPorEscolha?: true;
  /** O estado em que a proposta FICOU. */
  estado: Proposal["status"];
  estadoError?: string;
  copiaError?: string;
  pedidoError?: string;
  /** O link do casal — só quando a proposta seguiu mesmo. */
  acceptUrl: string | null;
  missingImages: number;
  truncations: Truncagens;
  pdfBytes: number;
  pdfDaMemoria?: true;
  docSaved?: false;
  docError?: string;
  /** Este envio já tinha acontecido há instantes: não se enviou outra vez. */
  repetido?: true;
  repetidoAviso?: string;
}
