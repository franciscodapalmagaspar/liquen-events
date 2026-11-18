import "server-only";
import { log } from "@/lib/logger";
import { documentoCompleto, type CorpoLido } from "./ler-o-corpo";
import { observarOCorpo } from "./esquema-do-corpo";
import { prepararODocumento } from "./documento-do-envio";
import type { DocumentoPreparado } from "./envio-da-proposta";
import { excedeOTecto, MAXIMO_CORPO_ESCRITO } from "@/lib/email-corpo-escrito";
import { paraComRecusa, segue, type Passo } from "./passo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS GUARDAS BARATAS — o que se recusa sem tocar na base nem no PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Etapa 3 do envio (`atender-o-estudio.ts`). A ORDEM é a da rota antiga, e é
 * o retrato da rota (`route.caracterizacao.test.ts`) que a prende:
 *
 *   1. o texto do email grande demais ............. 400
 *   2. o documento sem referência ou sem nomes ..... 400
 *   3. a língua estranha, dita (e cai em português)
 *   4. o documento preparado, e grande demais ...... 413
 *   5. SÓ ENTÃO o corpo vai ao registo do modo de observar
 *
 * O 5 é o último de propósito: o que já foi recusado não vale o trabalho do
 * esquema, e o registo não se enche de corpos que nunca chegaram a contar — a
 * mesma regra da rota do rascunho. `guardas-baratas.test.ts` prende-o.
 *
 * E é ANTES das travas (`travas-do-envio.ts`), também de propósito, e é o que
 * a rota antiga fazia: uma trava recusa o CONTEÚDO do documento (falta o
 * preço, o email do cliente não recebe correio), não a forma do corpo. Um
 * corpo que chega até ali está inteiro e foi mandado a sério — e é a forma
 * dele que o registo quer conhecer.
 */
export function guardasBaratas(
  pedidoId: string,
  corpo: CorpoLido,
  agora: Date,
): Passo<{ doc: DocumentoPreparado; chaveDoQueChegou: string }> {
  // O texto escrito à mão recusa-se por tamanho ANTES de se desenhar o PDF:
  // recusar depois é gastar o desenho por nada. O resto dele (o
  // `{{link_proposta}}`) só se resolve depois de a proposta estar gravada.
  if (excedeOTecto(corpo.textoDoEmail)) {
    return paraComRecusa({
      status: 400,
      corpo: {
        error:
          `O texto do email é demasiado longo (o máximo são ${MAXIMO_CORPO_ESCRITO} caracteres). ` +
          `Encurta-o e volta a enviar — não foi enviado nada.`,
      },
    });
  }
  const completo = documentoCompleto(corpo.doc);
  if (!completo.ok) return paraComRecusa({ status: 400, corpo: { error: completo.error } });
  avisarDoIdiomaDesconhecido(corpo, pedidoId);
  const { chaveDoQueChegou, doc, grandeDemais } = prepararODocumento(
    completo.doc,
    corpo.idioma,
    agora,
  );
  if (grandeDemais) {
    return paraComRecusa({
      status: 413,
      corpo: { error: "Proposta demasiado grande para ser guardada." },
    });
  }
  observarOCorpo(corpo.cru, pedidoId);
  return segue({ doc, chaveDoQueChegou });
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * A LÍNGUA É DO DOCUMENTO QUE SEGUE, NÃO SÓ DESTE CLIQUE
 * ══════════════════════════════════════════════════════════════════════
 *
 * O documento guardado (`doc`) continua a ser um só, em português: a língua
 * não entra lá dentro, é a moldura com que ele é DESENHADO — ver o cabeçalho
 * de `proposal-doc-textos`.
 *
 * Era um parâmetro de desenho e mais nada: desenhava o PDF, nomeava o ficheiro
 * e morria no fim do pedido. Com isso, uma proposta gerada em inglês seguia
 * dentro de um email português, abria numa página de aceite na língua do
 * VISITANTE, e voltava a descarregar-se em português — pelo link do casal e
 * pelo portal. Agora, no ENVIO, fica GRAVADA com a proposta
 * (`proposals.idioma`), e é dela que vivem o email, a página do aceite, o
 * portal e as duas rotas que voltam a desenhar o PDF. Na PRÉ-VISUALIZAÇÃO não
 * se grava nada, porque não há proposta nenhuma.
 *
 * ── PORQUE É QUE UM VALOR ESTRANHO NÃO É UM 400 ───────────────────────
 *
 * Cai em português, como o `mode` cai na pré-visualização: o português é a
 * língua em que a proposta foi ESCRITA (no máximo fica por traduzir, e ela vê
 * isso no PDF), e recusar transformava um erro de quem chama em «não dá para
 * gerar a proposta» — um negócio parado. Mas um valor estranho só pode vir de
 * um cliente avariado, e por isso fica REGISTADO.
 *
 * Diz-se depois de o documento estar completo, como sempre se disse: um
 * pedido sem documento não chega a ser desenhado em língua nenhuma. Um
 * pedido SEM o campo é o caminho de sempre, e não regista nada.
 */
function avisarDoIdiomaDesconhecido(corpo: CorpoLido, pedidoId: string): void {
  if (corpo.idiomaDesconhecido === null) return;
  log.warn("proposta-doc: idioma desconhecido, a desenhar em português", {
    id: pedidoId,
    recebido: String(corpo.idiomaDesconhecido.recebido),
  });
}
