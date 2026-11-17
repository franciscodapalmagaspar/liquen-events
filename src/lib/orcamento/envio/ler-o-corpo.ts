import "server-only";
import { z } from "zod";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { IDIOMA_POR_OMISSAO } from "@/lib/proposal-doc-textos";
import { esquemaDoDocumentoQueChega } from "@/lib/fronteira/documento-da-proposta";
import { observar } from "@/lib/fronteira/observar";
import { IDIOMAS_DA_PROPOSTA } from "@/lib/orcamento/listas-fechadas";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CORPO DO PEDIDO À ROTA DA PROPOSTA (`proposta-doc`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Etapa 1 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5).
 *
 * UM esquema só, {@link esquemaDoCorpo}, diz o que o estúdio manda. Dele saem
 * as duas coisas que a rota precisa:
 *
 *  · o REGISTO (modo de observar, `fronteira/observar.ts`, em
 *    {@link observarOCorpo}): o que não bate diz-se, e não se recusa nada;
 *  · a LEITURA ({@link corpoLido}): cada campo é lido pelo SEU pedaço do
 *    esquema, e o que não bate vale «não veio» — a tolerância de sempre, «uma
 *    proposta que não segue é um negócio parado». Daqui para dentro ninguém
 *    volta a perguntar `typeof` (§1.7, «parse, don't validate»).
 *
 * O esquema descreve o que o estúdio manda hoje, como todos os desta casa
 * (`fronteira/observar.ts`, «o que um esquema destes descreve»). Quando o modo
 * de observar acabar, recusar decide-se campo a campo, e as tolerâncias que
 * estão aqui escritas como decisões — a língua estranha cai em português, o
 * modo desconhecido é a pré-visualização — FICAM: não são um 400.
 */

/**
 * O corpo que o estúdio manda HOJE. Largo (`looseObject`): um campo a mais
 * não é um desvio.
 */
export const esquemaDoCorpo = z.looseObject({
  /** O que não se reconhece vale a pré-visualização — nunca um envio. */
  mode: z.enum(["preview", "send"]),
  doc: esquemaDoDocumentoQueChega,
  /** Ver {@link avisarDoIdiomaDesconhecido}: o que não se reconhece vale português. */
  idioma: z.enum(IDIOMAS_DA_PROPOSTA).optional(),
  /** A mensagem pessoal do passo «Enviar» — OPCIONAL A SÉRIO: vazia, só com
   *  espaços ou de um tipo que não é texto, o email sai como saía antes de
   *  esta caixa existir. Um envio nunca pára pela nota de acompanhamento. */
  mensagem: z.string().optional(),
  /** O corpo do email reescrito por quem envia (`email-da-proposta.ts`).
   *  Ausente em todos os pedidos anteriores a esta caixa existir. */
  corpo: z.string().optional(),
  /** A linha de assunto que o ecrã de envio mostrou. Só conta com `corpo`. */
  assunto: z.string().optional(),
  /** A chave do modelo de que o corpo partiu («registo-formal»), para a
   *  CÓPIA do envio. Não escolhe texto nenhum: o texto é o `corpo`. */
  modelo: z.string().optional(),
  /** «Já vi o que fica cortado, envia à mesma» (`perguntas-antes-do-envio.ts`).
   *  Só `true` conta: qualquer outra coisa é «ainda não respondeu». */
  cortesConfirmados: z.boolean().optional(),
  /** «Já sei que faltam N fotografias, envia à mesma». É o NÚMERO que ela viu:
   *  um PDF com mais em falta do que esse pergunta outra vez. */
  fotosEmFaltaConfirmadas: z.number().nonnegative().optional(),
  /**
   * ── POR ONDE É QUE A PROPOSTA SEGUE ────────────────────────────────
   *
   * «Quero que seja possível escolher enviar apenas para o email, apenas
   * para o WhatsApp, ou para os dois.» Só o EMAIL passa por aqui: o WhatsApp
   * abre-se no telemóvel dela. Por isso o servidor tem uma pergunta só:
   * **sai email?**
   *
   * Ausente ou qualquer coisa que não seja `false` significa SIM, e é
   * deliberado: os pedidos anteriores a esta escolha não trazem o campo, e
   * nenhum pode deixar de enviar por causa disso (`canal.test.ts`).
   */
  porEmail: z.boolean().optional(),
  /** Só na pré-visualização: o PDF sai marcado «RASCUNHO» (B1). */
  rascunho: z.boolean().optional(),
  /** Só no envio: a chave do PDF final visto e confirmado — a que a
   *  pré-visualização devolveu em `X-Chave-Do-Pdf`. */
  pdfVisto: z.string().optional(),
});

/** O sítio, tal como aparece no registo e na deduplicação. */
export const ONDE_O_CORPO_E_OBSERVADO = "o corpo do POST proposta-doc";

type Campos = typeof esquemaDoCorpo.shape;

/** O valor de um campo, se bater com o SEU pedaço do esquema; senão `undefined`. */
function lerCampo<K extends keyof Campos>(
  corpo: Record<string, unknown>,
  campo: K,
): z.output<Campos[K]> | undefined {
  const r = esquemaDoCorpo.shape[campo].safeParse(corpo[campo]);
  return r.success ? (r.data as z.output<Campos[K]>) : undefined;
}

/**
 * A leitura tolerante (ver o cabeçalho). Pura.
 *
 * O documento é a excepção, e de propósito: segue o objecto ORIGINAL, não a
 * cópia do zod — a chave do PDF visto calcula-se sobre o documento tal como
 * chegou (`documento-do-envio.ts`), e uma cópia reordenada mudava-a.
 */
export function corpoLido(cru: unknown) {
  const corpo =
    cru && typeof cru === "object" && !Array.isArray(cru) ? (cru as Record<string, unknown>) : {};
  const modo: "preview" | "send" = lerCampo(corpo, "mode") === "send" ? "send" : "preview";
  const idioma = lerCampo(corpo, "idioma");
  return {
    /** O corpo tal e qual chegou — só para {@link observarOCorpo}. */
    cru,
    modo,
    /** Ainda por conferir: só {@link documentoCompleto} diz que é um documento. */
    doc: corpo.doc,
    mensagem: lerCampo(corpo, "mensagem")?.trim() ?? "",
    porEmail: lerCampo(corpo, "porEmail") !== false,
    rascunho: modo === "preview" && lerCampo(corpo, "rascunho") === true,
    idioma: idioma ?? IDIOMA_POR_OMISSAO,
    /** O valor estranho que caiu em português, para o registo — ou `null`. */
    idiomaDesconhecido:
      corpo.idioma !== undefined && idioma === undefined ? String(corpo.idioma) : null,
    /** O corpo e o assunto do EMAIL escritos à mão (os campos `corpo` e
     *  `assunto` do protocolo). */
    textoDoEmail: lerCampo(corpo, "corpo") ?? null,
    assuntoDoEmail: lerCampo(corpo, "assunto") ?? null,
    modelo: lerCampo(corpo, "modelo") ?? "",
    pdfVisto: lerCampo(corpo, "pdfVisto") ?? null,
    fotosEmFaltaConfirmadas: lerCampo(corpo, "fotosEmFaltaConfirmadas") ?? null,
    cortesConfirmados: lerCampo(corpo, "cortesConfirmados") === true,
  };
}

/** O pedido já lido — o tipo sai da leitura, que sai do esquema. */
export type CorpoLido = ReturnType<typeof corpoLido>;

/**
 * Lê o corpo do pedido HTTP. Um corpo que não é JSON vale `null`, como sempre
 * valeu (a resposta é o «falta o documento» de {@link documentoCompleto}).
 */
export async function lerOCorpo(request: Request): Promise<CorpoLido> {
  return corpoLido(await request.json().catch(() => null));
}

/**
 * Confere o corpo contra o esquema, em modo de observar. Chama-se DEPOIS das
 * guardas baratas (trinco, tecto, documento incompleto ou grande demais): o
 * que já vai ser recusado não vale o trabalho — a mesma regra do rascunho.
 */
export function observarOCorpo(corpo: CorpoLido, pedidoId: string): void {
  observar(esquemaDoCorpo, corpo.cru, ONDE_O_CORPO_E_OBSERVADO, { id: pedidoId });
}

/**
 * Sem `doc`, sem `ref` ou sem `clientNames` a proposta não se desenha: o
 * documento, quando está, ou a frase do 400.
 */
export function documentoCompleto(
  cru: unknown,
): { ok: true; doc: ProposalDoc } | { ok: false; error: string } {
  // O que se confere é o que sempre se conferiu (a referência e os nomes); o
  // resto do documento passa como chegou — tolerar é a regra desta rota. Um
  // `doc` que não é objecto («x», 5, `true`) responde o que sempre respondeu:
  // «falta a referência e o nome dos clientes» (ler `.ref` de um texto dá nada).
  const ref = cru ? (cru as { ref?: unknown }).ref : undefined;
  const clientNames = cru ? (cru as { clientNames?: unknown }).clientNames : undefined;
  if (cru && ref && clientNames) return { ok: true, doc: cru as ProposalDoc };
  // Dizer O QUE falta (auditoria de 13/11, estúdio n.º 19): «Proposta
  // incompleta.» sozinho deixava-a a adivinhar.
  const falta = !cru
    ? "o documento"
    : [!ref ? "a referência" : null, !clientNames ? "o nome dos clientes" : null]
        .filter(Boolean)
        .join(" e ");
  return { ok: false, error: `Proposta incompleta: falta ${falta}.` };
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
export function avisarDoIdiomaDesconhecido(corpo: CorpoLido, pedidoId: string): void {
  if (corpo.idiomaDesconhecido === null) return;
  log.warn("proposta-doc: idioma desconhecido, a desenhar em português", {
    id: pedidoId,
    recebido: corpo.idiomaDesconhecido,
  });
}
