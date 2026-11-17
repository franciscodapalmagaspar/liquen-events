import "server-only";
import type { Quote } from "@/lib/orcamento/types";
import { resolveValidUntil } from "@/lib/proposal-doc";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { aquecerDerivadasDaCapa } from "@/lib/derivadas";
import { comTrinco } from "@/lib/trinco";
import type { CorpoLido } from "./ler-o-corpo";
import { guardasBaratas } from "./guardas-baratas";
import { travaDoEnvio, travaDoPdfFinal } from "./travas-do-envio";
import { desenharOPdf, type PdfDesenhado } from "./desenhar-o-pdf";
import {
  avisarQueSegueComFotosAMenos,
  perguntaDasFotos,
  perguntaDosCortes,
} from "./perguntas-antes-do-envio";
import { cabecalhosDaPreVisualizacao } from "./pre-visualizacao";
import {
  irmasDoPedido,
  montarAProposta,
  propostasAnteriores,
  versaoDaProposta,
} from "./a-proposta-que-se-grava";
import { repeticaoDoEnvio } from "./repeticao-do-envio";
import { gravarAProposta } from "./gravar-a-proposta";
import { escreverOEmail } from "./email-da-proposta";
import { mandarOEmail } from "./mandar-o-email";
import { depoisDoEmail } from "./depois-do-email";
import { respostaDoEnvio } from "./resposta-do-envio";
import { TECTO_DO_ENVIO_S } from "./orcamento-de-tempo";
import { recusa } from "./recusa";
import type { Falha, Recusa, RespostaDoEnvio } from "./contrato";
import type { OEnvio } from "./o-envio";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PEDIDO À ROTA DA PROPOSTA, ETAPA A ETAPA (fase 5 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As funções deste ficheiro só dizem a ORDEM; cada etapa vive, com a sua
 * razão por extenso, no seu ficheiro desta pasta:
 *
 *   1. o corpo, lido pela rota ...... `ler-o-corpo.ts` (o registo: `esquema-do-corpo.ts`)
 *   2. o trinco (só no envio) ....... `lib/trinco.ts` (`comTrinco`)
 *   3. as guardas baratas ........... `guardas-baratas.ts` (e `documento-do-envio.ts`)
 *   4. o que trava .................. `travas-do-envio.ts`
 *   5. o desenho, e a 2.ª passagem .. `desenhar-o-pdf.ts` (e `orcamento-de-tempo.ts`)
 *   ── a pré-visualização acaba aqui: responde o PDF (`pre-visualizacao.ts`) ──
 *   6. as duas perguntas ............ `perguntas-antes-do-envio.ts`
 *   7. a linha e a versão ........... `a-proposta-que-se-grava.ts`
 *   8. a repetição .................. `repeticao-do-envio.ts`
 *   9. a gravação ................... `gravar-a-proposta.ts`
 *  10. o email, escrito ............. `email-da-proposta.ts` (e `cartao-do-pdf.ts`)
 *  11. o email, mandado ............. `mandar-o-email.ts`
 *  12. o que fica depois ............ `depois-do-email.ts`
 *  13. a resposta ................... `resposta-do-envio.ts`
 *
 * A ordem é a regra: recusa-se tudo o que se pode recusar ANTES de desenhar
 * (um PDF de um minuto que não pode seguir é um minuto deitado fora), e
 * pergunta-se ANTES de gravar e de mandar (é o último instante em que voltar
 * atrás não custa nada).
 *
 * Não conhece o Next: devolve um {@link Desfecho}, e a rota traduz-o em HTTP.
 * O retrato de cada resposta está preso em `route.caracterizacao.test.ts`.
 */
export type Desfecho =
  | { tipo: "recusa"; recusa: Recusa }
  | { tipo: "falha"; falha: Falha }
  | { tipo: "pdf"; pdf: PdfDesenhado["relatorio"]["pdf"]; cabecalhos: Record<string, string> }
  | { tipo: "envio"; resposta: RespostaDoEnvio };

/**
 * O que a rota dá: o pedido do cliente e o corpo JÁ LIDOS (a rota lê, o
 * domínio decide — Parte 4, lição 9), o relógio, e o que só ela sabe fazer.
 */
export interface Contexto {
  /** O id do PEDIDO do cliente (o `Quote`). */
  pedidoId: string;
  quote: Quote;
  corpo: CorpoLido;
  /** Quantos ms sobram do orçamento deste pedido HTTP (`relogioDoEnvio`). */
  resta: () => number;
  /** Quem carregou em «Enviar» — só se lê no envio. */
  assinatura: () => { nome: string; cargo: string };
  /** Corre trabalho depois de a resposta sair (o `after` do Next). O nome
   *  diz-se no registo se o trabalho falhar. */
  depoisDaResposta: (nome: string, trabalho: () => Promise<void>) => void;
}

const recusado = (r: Recusa): Desfecho => ({ tipo: "recusa", recusa: r });

/**
 * ── DOIS ENVIOS EM VOO AO MESMO TEMPO (auditoria de 13/11, n.º 3) ───────
 *
 * A trava de repetição olha para o que JÁ seguiu. Dois pedidos ao mesmo tempo
 * leem as irmãs antes de qualquer um ter enviado, e nenhum vê o outro: dois
 * emails ao casal. O trinco deixa passar um só envio de cada vez; o segundo
 * ouve que o primeiro ainda está a enviar. Vale o tempo máximo da função e
 * mais uma margem — se ela morrer a meio, vence.
 */
const VALIDADE_DO_TRINCO_MS = (TECTO_DO_ENVIO_S + 15) * 1000;
const A_SER_ENVIADA = recusa(409, {
  error:
    "Esta proposta já está a ser enviada (carregou duas vezes, ou noutro separador). Espere uns segundos: se não aparecer como enviada, volte a carregar em enviar.",
  aEnviar: true,
});

/**
 * O estúdio pediu: pré-visualizar ou enviar. «Pedido», nesta pasta, é sempre o
 * pedido do CLIENTE (`pedidoId`, o `Quote`); o pedido HTTP do estúdio é o `corpo`.
 */
export async function atenderOEstudio(c: Contexto): Promise<Desfecho> {
  if (c.corpo.modo === "preview") return preVisualizar(c);
  const r = await comTrinco(`envio-da-proposta:${c.pedidoId}`, VALIDADE_DO_TRINCO_MS, () =>
    enviar(c),
  );
  return r.ok ? r.valor : recusado(A_SER_ENVIADA);
}

/** Etapas 3 a 5, e o PDF como resposta. */
async function preVisualizar(c: Contexto): Promise<Desfecho> {
  const preparado = await prepararEDesenhar(c);
  if (!preparado.ok) return recusado(preparado.recusa);
  const { envio, desenho, chaveDoQueChegou } = preparado;
  const { pdf, missingImages, truncations } = desenho.relatorio;
  return {
    tipo: "pdf",
    pdf,
    cabecalhos: cabecalhosDaPreVisualizacao({
      idioma: envio.idioma,
      rascunho: c.corpo.rascunho,
      missingImages,
      truncations,
      chaveDoQueChegou,
      pdfDaMemoria: desenho.pdfDaMemoria,
    }),
  };
}

/** Etapas 3 a 13, com o trinco fechado. */
async function enviar(c: Contexto): Promise<Desfecho> {
  const preparado = await prepararEDesenhar(c);
  if (!preparado.ok) return recusado(preparado.recusa);
  const { envio, desenho } = preparado;
  const { pedidoId, quote, doc } = envio;
  const { corpo } = c;
  const { relatorio, pdfDaMemoria } = desenho;
  const { pdf, missingImages, truncations } = relatorio;
  const pergunta =
    perguntaDasFotos(pedidoId, missingImages, corpo.fotosEmFaltaConfirmadas) ??
    perguntaDosCortes(pedidoId, truncations, corpo.cortesConfirmados);
  if (pergunta) return recusado(pergunta);
  avisarQueSegueComFotosAMenos(pedidoId, missingImages);

  // `dinheiroDaProposta` e não `resolveProposalMoney`: quando os valores
  // adicionais somam ao valor escrito, o bruto que fica GRAVADO tem de os
  // trazer. Senão o PDF dizia 3.862,20 € e o sinal continuava a ser calculado
  // sobre 3.690 € — o documento e a cobrança a discordarem em silêncio.
  const dinheiro = dinheiroDaProposta(doc);
  const { irmas, porEnviar } = await irmasDoPedido(pedidoId);
  const linha = montarAProposta({
    ...envio,
    dinheiro,
    // A data que `prepararODocumento` já escreveu no doc (o `resolveValidUntil`
    // devolve-a tal e qual; só calcula quando falta) — o /proposta recusa
    // aceitar uma proposta expirada.
    validUntil: resolveValidUntil(doc),
    pdf,
    porEnviar,
  });
  const anteriores = propostasAnteriores(linha, irmas);
  const proposal = { ...linha, ...versaoDaProposta(linha, anteriores) };
  const repetido = await repeticaoDoEnvio({
    pedidoId,
    proposal,
    irmasAnteriores: anteriores,
    porEmail: corpo.porEmail,
    relatorio,
    pdfBytes: pdf.byteLength,
  });
  if (repetido) return { tipo: "envio", resposta: repetido };

  const gravada = await gravarAProposta(pedidoId, proposal, porEnviar);
  if (!gravada.ok) return { tipo: "falha", falha: gravada.falha };

  const acceptUrl = await enderecoDaProposta(proposal.id, pedidoId);
  const email = await escreverOEmail({
    ...envio,
    mensagem: corpo.mensagem,
    textoDoEmail: corpo.textoDoEmail,
    assuntoDoEmail: corpo.assuntoDoEmail,
    acceptUrl,
    dinheiro,
    assinatura: c.assinatura(),
  });
  /* ── A CAPA FABRICADA ENQUANTO O CORREIO SAI ──────────────────────────
     «Esta foto demora imenso tempo a carregar.» A derivada de 1200 px da capa
     era fabricada pela primeira visita — que numa proposta acabada de enviar é
     a do casal a abrir o email, com um `sharp` a acontecer enquanto eles olham
     para um rectângulo vazio.

     Começa AQUI e é esperada depois do `sendMail`: corre em paralelo com a ida
     ao servidor de correio, portanto não acrescenta praticamente nada ao
     envio. O `.catch` é obrigatório — entre este ponto e o `await` lá em baixo
     há um `await` pelo meio, e uma promessa rejeitada sem tratamento nesse
     intervalo derrubaria o processo. */
  const capaAQuecer = aquecerDerivadasDaCapa(doc.coverImages ?? []).catch(() => 0);
  const saida = await mandarOEmail({
    pedidoId,
    propostaId: proposal.id,
    para: quote.email,
    porEmail: corpo.porEmail,
    email,
    pdf,
    resta: c.resta,
  });
  // A capa, se ainda não estava pronta. Nunca lança e tem tecto próprio: se
  // passou dele, fica para a visita, como era antes.
  await capaAQuecer;
  const depois = await depoisDoEmail({
    ...envio,
    proposal,
    dinheiro,
    emailed: saida.emailed,
    semEmailPorEscolha: saida.semEmailPorEscolha,
    email,
    modelo: corpo.modelo,
    pdf,
  });
  // A proposta online fica pronta já, depois da resposta: o primeiro clique
  // do casal no email não espera pelo motor (`proposta-web/guardado.ts`).
  c.depoisDaResposta("a página online não ficou preparada", async () => {
    const { aquecerPropostaWeb } = await import("@/lib/proposta-web/modelo");
    await aquecerPropostaWeb(proposal.id);
  });
  return {
    tipo: "envio",
    resposta: respostaDoEnvio({
      propostaId: proposal.id,
      acceptUrl,
      saida,
      depois,
      gravada,
      relatorio,
      pdfDaMemoria,
    }),
  };
}

/** Etapas 3 a 5: o que recusa antes de desenhar, e o desenho. */
async function prepararEDesenhar(
  c: Contexto,
): Promise<
  | { ok: false; recusa: Recusa }
  | { ok: true; envio: OEnvio; desenho: PdfDesenhado; chaveDoQueChegou: string }
> {
  const { pedidoId, quote, corpo } = c;
  const guardas = guardasBaratas(pedidoId, corpo);
  if (!guardas.ok) return guardas;
  const { doc, chaveDoQueChegou } = guardas;
  /** O envio, montado UMA vez — cada etapa lê dele o que precisa. */
  const envio: OEnvio = { pedidoId, quote, doc, idioma: corpo.idioma };

  const trava =
    corpo.modo === "send"
      ? await travaDoEnvio({
          ...envio,
          porEmail: corpo.porEmail,
          pdfVisto: corpo.pdfVisto,
          chaveDoQueChegou,
        })
      : corpo.rascunho
        ? null
        : await travaDoPdfFinal(envio);
  if (trava) return { ok: false, recusa: trava };

  const desenho = await desenharOPdf({
    ...envio,
    modo: corpo.modo,
    rascunho: corpo.rascunho,
    chaveDoQueChegou,
    resta: c.resta,
  });
  return { ok: true, envio, desenho, chaveDoQueChegou };
}
