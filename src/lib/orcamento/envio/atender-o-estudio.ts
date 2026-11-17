import "server-only";
import type { Quote } from "@/lib/orcamento/types";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { comTrinco } from "@/lib/trinco";
import type { CorpoLido } from "./ler-o-corpo";
import { guardasBaratas } from "./guardas-baratas";
import { travaDoEnvio, travaDoPdfFinal } from "./travas-do-envio";
import { desenharOPdf, type PdfDesenhado } from "./desenhar-o-pdf";
import { desfecho, SEGUE, segue, type Desfecho, type Passo } from "./passo";
import {
  avisarQueSegueComFotosAMenos,
  perguntaDasFotos,
  perguntaDosCortes,
} from "./perguntas-antes-do-envio";
import { cabecalhosDaPreVisualizacao } from "./pre-visualizacao";
import { irmasDoPedido, montarAProposta, comAVersao } from "./a-proposta-que-se-grava";
import { repeticaoDoEnvio } from "./repeticao-do-envio";
import { gravarAProposta } from "./gravar-a-proposta";
import { escreverOEmail } from "./email-da-proposta";
import { mandarOEmail } from "./mandar-o-email";
import { depoisDoEmail } from "./depois-do-email";
import { respostaDoEnvio } from "./resposta-do-envio";
import { comecarAAquecerACapa, prepararAPaginaOnline } from "./visita-do-casal";
import { TECTO_DO_ENVIO_S } from "./orcamento-de-tempo";
import type { EnvioDaProposta } from "./envio-da-proposta";

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
 *  12. o que fica depois ............ `depois-do-email.ts` (e `visita-do-casal.ts`)
 *  13. a resposta ................... `resposta-do-envio.ts`
 *
 * A ordem é a regra: recusa-se tudo o que se pode recusar ANTES de desenhar
 * (um PDF de um minuto que não pode seguir é um minuto deitado fora), e
 * pergunta-se ANTES de gravar e de mandar (é o último instante em que voltar
 * atrás não custa nada).
 *
 * Cada etapa devolve um `Passo` (`passo.ts`): segue, ou pára já com o
 * desfecho — por isso cada linha abaixo é «faz isto; se parou, é essa a
 * resposta». Não conhece o Next: devolve um {@link Desfecho}, e a rota
 * traduz-o em HTTP. O retrato de cada resposta está preso em
 * `route.caracterizacao.test.ts`.
 */
export type { Desfecho } from "./passo";

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
/** Um objecto novo a cada pedido: ninguém partilha (nem muda) a resposta de outro. */
const aSerEnviada = (): Desfecho =>
  desfecho.recusa(409, {
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
  return r.ok ? r.valor : aSerEnviada();
}

/** Etapas 3 a 5, e o PDF como resposta. O rascunho não trava: é onde ela vê o que falta. */
async function preVisualizar(c: Contexto): Promise<Desfecho> {
  // Se é rascunho, decide-o a LEITURA (`corpoLido`: só na pré-visualização, e
  // só com `true`). Daqui em diante é um valor só, para a trava, o desenho e
  // os cabeçalhos.
  const { rascunho } = c.corpo;
  const preparado = await prepararEDesenhar(c, {
    trava: (envio) => (rascunho ? SEGUE : travaDoPdfFinal(envio)),
    segundaPassagem: false,
    rascunho,
  });
  if (!preparado.segue) return preparado.desfecho;
  const { envio, desenho, chaveDoQueChegou } = preparado.valor;
  const { pdf, missingImages, truncations } = desenho.relatorio;
  return desfecho.pdf(
    pdf,
    cabecalhosDaPreVisualizacao({
      idioma: envio.idioma,
      rascunho,
      missingImages,
      truncations,
      chaveDoQueChegou,
      pdfDaMemoria: desenho.pdfDaMemoria,
    }),
  );
}

/** Etapas 3 a 13, com o trinco fechado. */
async function enviar(c: Contexto): Promise<Desfecho> {
  const { corpo } = c;
  const preparado = await prepararEDesenhar(c, {
    trava: (envio, chaveDoQueChegou) =>
      travaDoEnvio({
        ...envio,
        porEmail: corpo.porEmail,
        pdfVisto: corpo.pdfVisto,
        chaveDoQueChegou,
      }),
    segundaPassagem: true,
    rascunho: false,
  });
  if (!preparado.segue) return preparado.desfecho;
  const { envio, desenho } = preparado.valor;
  const { pedidoId, quote, doc } = envio;
  const { relatorio, pdfDaMemoria } = desenho;
  const { pdf, missingImages, truncations } = relatorio;

  const fotos = perguntaDasFotos(pedidoId, missingImages, corpo.fotosEmFaltaConfirmadas);
  if (!fotos.segue) return fotos.desfecho;
  const cortes = perguntaDosCortes(pedidoId, truncations, corpo.cortesConfirmados);
  if (!cortes.segue) return cortes.desfecho;
  avisarQueSegueComFotosAMenos(pedidoId, missingImages);

  const { irmas, porEnviar } = await irmasDoPedido(pedidoId);
  const linha = montarAProposta({ ...envio, pdf, porEnviar });
  const { proposal, anteriores } = comAVersao(linha, irmas);

  const repetido = await repeticaoDoEnvio({
    pedidoId,
    proposal,
    irmasAnteriores: anteriores,
    porEmail: corpo.porEmail,
    relatorio,
  });
  if (!repetido.segue) return repetido.desfecho;

  const gravacao = await gravarAProposta(pedidoId, proposal, porEnviar);
  if (!gravacao.segue) return gravacao.desfecho;

  const acceptUrl = await enderecoDaProposta(proposal.id, pedidoId);
  const email = await escreverOEmail({
    ...envio,
    mensagem: corpo.mensagem,
    textoDoEmail: corpo.textoDoEmail,
    assuntoDoEmail: corpo.assuntoDoEmail,
    acceptUrl,
    assinatura: c.assinatura(),
  });
  const capa = comecarAAquecerACapa(doc.coverImages);
  const saida = await mandarOEmail({
    pedidoId,
    propostaId: proposal.id,
    para: quote.email,
    porEmail: corpo.porEmail,
    email,
    pdf,
    resta: c.resta,
  });
  await capa;
  const depois = await depoisDoEmail({
    ...envio,
    proposal,
    emailed: saida.emailed,
    semEmailPorEscolha: saida.semEmailPorEscolha,
    email,
    modelo: corpo.modelo,
    pdf,
  });
  prepararAPaginaOnline(proposal.id, c.depoisDaResposta);

  return desfecho.envio(
    respostaDoEnvio({
      propostaId: proposal.id,
      acceptUrl,
      saida,
      depois,
      gravada: gravacao.valor,
      relatorio,
      pdfDaMemoria,
    }),
  );
}

/**
 * O que muda entre as duas portas: a trava, se o desenho pode repetir, e se
 * sai marcado «RASCUNHO» (a pré-visualização passa o que a leitura decidiu; o
 * envio passa sempre `false` — nunca manda um rascunho ao casal, seja o que
 * for que o corpo traga). `portas.test.ts` prende cada uma.
 */
interface Porta {
  trava: (envio: EnvioDaProposta, chaveDoQueChegou: string) => Passo | Promise<Passo>;
  segundaPassagem: boolean;
  rascunho: boolean;
}

/** Etapas 3 a 5: o que recusa antes de desenhar, e o desenho. */
async function prepararEDesenhar(
  c: Contexto,
  porta: Porta,
): Promise<Passo<{ envio: EnvioDaProposta; desenho: PdfDesenhado; chaveDoQueChegou: string }>> {
  const { pedidoId, quote, corpo } = c;
  const guardas = guardasBaratas(pedidoId, corpo);
  if (!guardas.segue) return guardas;
  const { doc, chaveDoQueChegou } = guardas.valor;
  /** O envio, montado UMA vez — cada etapa lê dele o que precisa. */
  const envio: EnvioDaProposta = {
    pedidoId,
    quote,
    doc,
    idioma: corpo.idioma,
  };

  const trava = await porta.trava(envio, chaveDoQueChegou);
  if (!trava.segue) return trava;

  const desenho = await desenharOPdf({
    ...envio,
    segundaPassagem: porta.segundaPassagem,
    rascunho: porta.rascunho,
    chaveDoQueChegou,
    resta: c.resta,
  });
  return segue({ envio, desenho, chaveDoQueChegou });
}
