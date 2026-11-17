import "server-only";
import { z } from "zod";
import type { ProposalDoc } from "@/lib/proposal-doc";
import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { esquemaDoDocumentoQueChega } from "@/lib/fronteira/documento-da-proposta";
import { observar } from "@/lib/fronteira/observar";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CORPO DO PEDIDO À ROTA DA PROPOSTA (`proposta-doc`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Etapa 1 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5). Cada campo é
 * opcional e cada um tem a sua tolerância, escrita ao lado — «uma proposta
 * que não segue é um negócio parado»: um campo estranho cai no valor de
 * sempre em vez de parar o envio. O esquema confere em MODO DE OBSERVAR
 * (`fronteira/observar.ts`): diz no registo o que não bate e não recusa nada.
 */
export interface CorpoDoPedido {
  mode?: "preview" | "send";
  doc?: ProposalDoc;
  idioma?: unknown;
  mensagem?: unknown;
  /** O corpo do email reescrito por quem envia — ver `email-da-proposta.ts`.
   *  Ausente em todos os pedidos anteriores a esta caixa existir. */
  corpo?: unknown;
  /** A linha de assunto que o ecrã de envio mostrou. Só conta com `corpo`
   *  — ver o `assuntoEscritoAMao`. */
  assunto?: unknown;
  /** A chave do modelo de que o corpo partiu («registo-formal»), para a
   *  CÓPIA do envio. Não escolhe texto nenhum: o texto é o `corpo`. */
  modelo?: unknown;
  /** «Já vi o que fica cortado, envia à mesma» — ver a pergunta antes do
   *  envio (`perguntas-antes-do-envio.ts`). Só `true` conta: qualquer outra
   *  coisa é «ainda não respondeu». */
  cortesConfirmados?: unknown;
  /** «Já sei que faltam N fotografias, envia à mesma» — ver a pergunta
   *  das fotos em falta (`perguntas-antes-do-envio.ts`). É o NÚMERO que ela viu: um PDF com
   *  mais em falta do que esse pergunta outra vez (`fotosEmFaltaAceites`). */
  fotosEmFaltaConfirmadas?: unknown;
  /**
   * ── POR ONDE É QUE A PROPOSTA SEGUE ────────────────────────────────
   *
   * «Quero que seja possível escolher enviar apenas para o email, apenas
   * para o WhatsApp, ou para os dois.»
   *
   * Só o EMAIL passa por aqui: o WhatsApp não se manda do servidor — abre-se
   * no telemóvel dela, com a mensagem escrita, e é ela que escolhe a quem.
   * Por isso o servidor tem uma pergunta só: **sai email?**
   *
   * Ausente ou qualquer coisa que não seja `false` significa SIM, e é
   * deliberado: todos os pedidos anteriores a esta escolha existir não
   * trazem o campo, e nenhum deles pode deixar de enviar por causa disso.
   * A escolha nova tem de ser explícita para tirar alguma coisa.
   */
  porEmail?: unknown;
  /** Só na pré-visualização: o PDF sai marcado «RASCUNHO» (B1). */
  rascunho?: unknown;
  /** Só no envio: a chave do PDF final que foi visto e confirmado — a que
   *  a pré-visualização devolveu em `X-Chave-Do-Pdf`. */
  pdfVisto?: unknown;
}

/**
 * O corpo que o estúdio manda HOJE. Largo (`looseObject`): um campo a mais
 * não é um desvio. Só a fase seguinte (uma semana sem registos) o pode pôr
 * a recusar.
 */
export const esquemaDoCorpo = z.looseObject({
  mode: z.enum(["preview", "send"]),
  doc: esquemaDoDocumentoQueChega,
  idioma: z.enum(["pt", "en"]).optional(),
  mensagem: z.string().optional(),
  corpo: z.string().optional(),
  assunto: z.string().optional(),
  modelo: z.string().optional(),
  cortesConfirmados: z.boolean().optional(),
  fotosEmFaltaConfirmadas: z.number().nonnegative().optional(),
  porEmail: z.boolean().optional(),
  rascunho: z.boolean().optional(),
  pdfVisto: z.string().optional(),
});

/** O sítio, tal como aparece no registo e na deduplicação. */
export const ONDE_O_CORPO_E_OBSERVADO = "o corpo do POST proposta-doc";

/**
 * O pedido já lido: cada campo com a sua tolerância aplicada UMA vez, aqui —
 * daqui para dentro ninguém volta a perguntar `typeof` (§1.7, «parse, don't
 * validate»). Cada campo diz, ao lado, a regra que o leu; as regras são as de
 * sempre (`route.caracterizacao.test.ts` prova-o resposta a resposta).
 */
export interface PedidoDeProposta {
  /** O que não se reconhece vale a pré-visualização — nunca um envio. */
  modo: "preview" | "send";
  doc: ProposalDoc | undefined;
  /** Ver {@link mensagemDoPedido}. */
  mensagem: string;
  /** Ver a nota do `porEmail`: só um `false` EXPLÍCITO cala o email. */
  porEmail: boolean;
  /** O rascunho só existe na pré-visualização: um envio nunca sai marcado. */
  rascunho: boolean;
  /** Ver {@link idiomaDoCorpo}: o que não se reconhece vale português. */
  idioma: IdiomaDaProposta;
  /** O valor estranho que caiu em português, para o registo — ou `null`. */
  idiomaDesconhecido: string | null;
  /** O corpo e o assunto escritos à mão. Só texto conta (o resto é «não veio»):
   *  o tratamento deles é do `email-corpo-escrito`. */
  corpo: string | null;
  assunto: string | null;
  /** A chave do modelo de que o corpo partiu, só para a cópia; vazia sem ela. */
  modelo: string;
  /** A chave do PDF final visto. Só texto conta. */
  pdfVisto: string | null;
  /** «Já sei que faltam N fotografias»: só um número finito conta. */
  fotosEmFaltaConfirmadas: number | null;
  /** «Já vi o que fica cortado»: só `true` conta. */
  cortesConfirmados: boolean;
}

/**
 * Lê o corpo. Um corpo que não é JSON vale `null`, como sempre valeu (a
 * resposta é o «falta o documento» de {@link porQueEstaIncompleta}). O
 * esquema confere o objecto ORIGINAL, e é dele que se lê — ver `observar`.
 */
export async function lerOPedido(request: Request, id: string): Promise<PedidoDeProposta> {
  const body = (await request.json().catch(() => null)) as CorpoDoPedido | null;
  observar(esquemaDoCorpo, body, ONDE_O_CORPO_E_OBSERVADO, { id });
  return pedidoDoCorpo(body);
}

/** A parte pura de {@link lerOPedido}. */
export function pedidoDoCorpo(body: CorpoDoPedido | null): PedidoDeProposta {
  const modo = body?.mode === "send" ? "send" : "preview";
  const idioma = idiomaDoCorpo(body?.idioma);
  const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const confirmadas = body?.fotosEmFaltaConfirmadas;
  return {
    modo,
    doc: body?.doc,
    mensagem: mensagemDoPedido(body),
    porEmail: body?.porEmail !== false,
    rascunho: modo === "preview" && body?.rascunho === true,
    idioma: idioma ?? IDIOMA_POR_OMISSAO,
    idiomaDesconhecido: idioma === null ? String(body?.idioma) : null,
    corpo: texto(body?.corpo),
    assunto: texto(body?.assunto),
    modelo: texto(body?.modelo) ?? "",
    pdfVisto: texto(body?.pdfVisto),
    fotosEmFaltaConfirmadas:
      typeof confirmadas === "number" && Number.isFinite(confirmadas) ? confirmadas : null,
    cortesConfirmados: body?.cortesConfirmados === true,
  };
}

/**
 * Sem `doc`, sem `ref` ou sem `clientNames` a proposta não se desenha.
 * Devolve a frase do 400, ou `null` quando está tudo.
 */
export function porQueEstaIncompleta(raw: ProposalDoc | undefined): string | null {
  if (raw && raw.ref && raw.clientNames) return null;
  // Dizer O QUE falta (auditoria de 13/11, estúdio n.º 19): «Proposta
  // incompleta.» sozinho deixava-a a adivinhar.
  const falta = !raw
    ? "o documento"
    : [!raw.ref ? "a referência" : null, !raw.clientNames ? "o nome dos clientes" : null]
        .filter(Boolean)
        .join(" e ");
  return `Proposta incompleta: falta ${falta}.`;
}

/**
 * A mensagem pessoal do passo «Enviar» do estúdio. OPCIONAL A SÉRIO: vazia,
 * só com espaços, ou de um tipo que não é texto (um cliente avariado), o
 * email sai exactamente como saía antes de esta caixa existir. Um envio
 * nunca pode parar por causa da nota de acompanhamento — ver o cabeçalho
 * deste ficheiro: uma proposta que não segue é um negócio parado.
 */
function mensagemDoPedido(body: CorpoDoPedido | null): string {
  return typeof body?.mensagem === "string" ? body.mensagem.trim() : "";
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * A LÍNGUA É DO DOCUMENTO QUE SEGUE, NÃO SÓ DESTE CLIQUE
 * ══════════════════════════════════════════════════════════════════════
 *
 * O documento guardado (`doc`) continua a ser um só, em português: a língua
 * não entra lá dentro, é a moldura com que ele é DESENHADO — ver o
 * cabeçalho de `proposal-doc-textos`.
 *
 * O que mudou é o que acontece a esta variável a seguir. Era um parâmetro
 * de desenho e mais nada: desenhava o PDF, nomeava o ficheiro e morria no
 * fim do pedido. Com isso, uma proposta gerada em inglês seguia dentro de
 * um email português, abria numa página de aceite na língua do VISITANTE, e
 * voltava a descarregar-se em português — pelo link do casal e pelo portal.
 * Agora, no ENVIO, fica GRAVADA com a proposta (`proposals.idioma`), e é
 * dela que vivem o email, a página do aceite, o portal e as duas rotas que
 * voltam a desenhar o PDF.
 *
 * Na PRÉ-VISUALIZAÇÃO não se grava nada, porque não há proposta nenhuma:
 * é um PDF para ela ver, e volta a gerar-se daqui a dez segundos.
 *
 * ── PORQUE É QUE UM VALOR ESTRANHO NÃO É UM 400 ───────────────────────
 *
 * Cai em português, que é a mesma escolha que esta rota já faz com o
 * `mode`: o que não se reconhece vale o valor por omissão. As razões, por
 * ordem de peso:
 *
 * · O português é a língua em que a proposta foi ESCRITA. Cair nele é cair
 *   no documento que sempre saiu — nada fica mal traduzido, no máximo fica
 *   por traduzir, e ela vê isso no PDF que abre a seguir.
 * · Recusar transformava um erro de quem chama em «não dá para gerar a
 *   proposta» — exactamente a avaria que o cabeçalho da rota conta.
 *   Uma moldura em português nunca vale um negócio parado.
 * · Um valor estranho só pode vir de um cliente avariado (o estúdio manda
 *   sempre "pt" ou "en"), e por isso fica REGISTADO: cair calado seria
 *   esconder essa avaria para sempre.
 *
 * Um pedido SEM o campo não é um valor estranho — é o caminho de sempre, e
 * não regista nada.
 */
function idiomaDoCorpo(idioma: unknown): IdiomaDaProposta | null {
  if (idioma === undefined) return IDIOMA_POR_OMISSAO;
  return ehIdiomaDaProposta(idioma) ? idioma : null;
}

/**
 * Diz no registo a língua estranha que caiu em português. Chama-se depois de o
 * documento estar completo, como sempre se chamou: um pedido sem documento não
 * chega a ser desenhado em língua nenhuma.
 */
export function avisarDoIdiomaDesconhecido(pedido: PedidoDeProposta, id: string): void {
  if (pedido.idiomaDesconhecido === null) return;
  log.warn("proposta-doc: idioma desconhecido, a desenhar em português", {
    id,
    recebido: pedido.idiomaDesconhecido,
  });
}
