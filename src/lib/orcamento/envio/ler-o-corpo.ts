import "server-only";
import type { ProposalDoc } from "@/lib/proposal-doc";
import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  type IdiomaDaProposta,
  type ModoDoPedido,
} from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CORPO DO PEDIDO À ROTA DA PROPOSTA (`proposta-doc`), LIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Etapa 1 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5).
 *
 * A LEITURA tolerante de sempre, campo a campo: o que não tem a forma certa
 * vale «não veio» — «uma proposta que não segue é um negócio parado». Daqui
 * para dentro ninguém volta a perguntar `typeof` (§1.7, «parse, don't
 * validate»). As regras de cada campo são as da rota antiga, uma a uma, e
 * `ler-o-corpo.test.ts` prende-as.
 *
 * Não usa o esquema do corpo (`esquema-do-corpo.ts`), e de propósito: esse só
 * REGISTA o que não bate. Ver o cabeçalho dele.
 */

/** Um texto, ou nada. */
const texto = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Uma contagem que ela viu: um número finito, não negativo — ou nada. */
const contagem = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

/** O que as DUAS portas leem do corpo. */
interface OQueAsDuasPortasLeem {
  /** O corpo tal e qual chegou — só para o registo (`esquema-do-corpo.ts`). */
  cru: unknown;
  /** Ainda por conferir: só {@link documentoCompleto} diz que é um documento. */
  doc: unknown;
  /** A língua do desenho: o que não se reconhece vale português. */
  idioma: IdiomaDaProposta;
  /** O valor estranho que caiu em português, CRU, para o registo — ou `null`.
   *  Cru de propósito: passa a texto só no aviso, depois de o documento estar
   *  completo, como na rota antiga (um valor que nem se converte em texto não
   *  pode rebentar antes do 400). */
  idiomaDesconhecido: { recebido: unknown } | null;
  /** O corpo do EMAIL escrito à mão (o campo `corpo` do protocolo). Lido nas
   *  duas portas: o tecto recusa-o ANTES de desenhar, também na
   *  pré-visualização, como na rota antiga (`guardas-baratas.ts`). */
  textoDoEmail: string | null;
}

/** O corpo de uma PRÉ-VISUALIZAÇÃO. */
export interface CorpoDaPreVisualizacao extends OQueAsDuasPortasLeem {
  modo: Extract<ModoDoPedido, "preview">;
  /** O PDF sai marcado «RASCUNHO» (B1). Só existe aqui: um envio nunca manda
   *  um rascunho ao casal, e o tipo não o deixa dizer. */
  rascunho: boolean;
}

/** O corpo de um ENVIO. */
export interface CorpoDoEnvio extends OQueAsDuasPortasLeem {
  modo: Extract<ModoDoPedido, "send">;
  /** A nota pessoal do passo «Enviar»: um envio nunca pára por ela. */
  mensagem: string;
  /** Só um `false` explícito cala o email (`canal.test.ts`). */
  porEmail: boolean;
  /** O assunto escrito à mão (o campo `assunto`): só conta com o corpo. */
  assuntoDoEmail: string | null;
  /** A chave do modelo de que o corpo partiu, só para a CÓPIA do envio. */
  modelo: string;
  /** A chave do PDF final visto — a que a pré-visualização devolveu. */
  pdfVisto: string | null;
  /** «Já sei que faltam N fotografias»: o NÚMERO que ela viu — ou o `true`
   *  de um separador aberto antes de 17/11, que só vale até ao fim de 18/11
   *  (`fotosEmFaltaAceites`). Qualquer outra coisa é «ainda não respondeu». */
  fotosEmFaltaConfirmadas: number | true | null;
  /** «Já vi o que fica cortado»: só `true` conta. */
  cortesConfirmados: boolean;
}

/**
 * O corpo lido, por porta: o que só o envio lê não existe numa
 * pré-visualização, e o rascunho não existe num envio.
 */
export type CorpoLido = CorpoDaPreVisualizacao | CorpoDoEnvio;

/**
 * A leitura (ver o cabeçalho). Pura.
 *
 * O documento é a excepção, e de propósito: segue o objecto ORIGINAL, sem
 * cópia — a chave do PDF visto calcula-se sobre o documento tal como chegou
 * (`documento-do-envio.ts`), e uma cópia reordenada mudava-a.
 */
export function corpoLido(cru: unknown): CorpoLido {
  const corpo: Record<string, unknown> =
    cru && typeof cru === "object" && !Array.isArray(cru) ? (cru as Record<string, unknown>) : {};
  // A regra da casa (`ehIdiomaDaProposta`), que lê a mesma lista fechada do
  // esquema (`orcamento/listas-fechadas.ts`).
  const idiomaConhecido = ehIdiomaDaProposta(corpo.idioma) ? corpo.idioma : undefined;
  const comum: OQueAsDuasPortasLeem = {
    cru,
    doc: corpo.doc,
    idioma: idiomaConhecido ?? IDIOMA_POR_OMISSAO,
    idiomaDesconhecido:
      corpo.idioma !== undefined && idiomaConhecido === undefined
        ? { recebido: corpo.idioma }
        : null,
    textoDoEmail: texto(corpo.corpo) ?? null,
  };
  // O que não se reconhece vale a pré-visualização — nunca um envio.
  if (corpo.mode !== "send") {
    return { ...comum, modo: "preview", rascunho: corpo.rascunho === true };
  }
  return {
    ...comum,
    modo: "send",
    mensagem: texto(corpo.mensagem)?.trim() ?? "",
    porEmail: corpo.porEmail !== false,
    assuntoDoEmail: texto(corpo.assunto) ?? null,
    modelo: texto(corpo.modelo) ?? "",
    pdfVisto: texto(corpo.pdfVisto) ?? null,
    fotosEmFaltaConfirmadas:
      contagem(corpo.fotosEmFaltaConfirmadas) ??
      (corpo.fotosEmFaltaConfirmadas === true ? true : null),
    cortesConfirmados: corpo.cortesConfirmados === true,
  };
}

/**
 * Lê o corpo do pedido HTTP. Um corpo que não é JSON vale `null`, como sempre
 * valeu (a resposta é o «falta o documento» de {@link documentoCompleto}).
 */
export async function lerOCorpo(request: Request): Promise<CorpoLido> {
  return corpoLido(await request.json().catch(() => null));
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
