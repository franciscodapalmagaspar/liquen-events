import "server-only";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { IDIOMA_POR_OMISSAO } from "@/lib/proposal-doc-textos";
import { ehIdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

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

/**
 * A leitura (ver o cabeçalho). Pura.
 *
 * O documento é a excepção, e de propósito: segue o objecto ORIGINAL, sem
 * cópia — a chave do PDF visto calcula-se sobre o documento tal como chegou
 * (`documento-do-envio.ts`), e uma cópia reordenada mudava-a.
 */
export function corpoLido(cru: unknown) {
  const corpo: Record<string, unknown> =
    cru && typeof cru === "object" && !Array.isArray(cru) ? (cru as Record<string, unknown>) : {};
  /** O que não se reconhece vale a pré-visualização — nunca um envio. */
  const modo: "preview" | "send" = corpo.mode === "send" ? "send" : "preview";
  // A regra da casa (`ehIdiomaDaProposta`), que lê a mesma lista fechada do
  // esquema (`orcamento/listas-fechadas.ts`).
  const idiomaConhecido = ehIdiomaDaProposta(corpo.idioma) ? corpo.idioma : undefined;
  return {
    /** O corpo tal e qual chegou — só para o registo (`esquema-do-corpo.ts`). */
    cru,
    modo,
    /** Ainda por conferir: só {@link documentoCompleto} diz que é um documento. */
    doc: corpo.doc,
    /** A nota pessoal do passo «Enviar»: um envio nunca pára por ela. */
    mensagem: texto(corpo.mensagem)?.trim() ?? "",
    /** Só um `false` explícito cala o email (`canal.test.ts`). */
    porEmail: corpo.porEmail !== false,
    /** Só na pré-visualização: o PDF sai marcado «RASCUNHO» (B1). */
    rascunho: modo === "preview" && corpo.rascunho === true,
    /** A língua do desenho: o que não se reconhece vale português. */
    idioma: idiomaConhecido ?? IDIOMA_POR_OMISSAO,
    /** O valor estranho que caiu em português, CRU, para o registo — ou
     *  `null`. Cru de propósito: passa a texto só no aviso, depois de o
     *  documento estar completo, como na rota antiga (um valor que nem se
     *  converte em texto não pode rebentar antes do 400). */
    idiomaDesconhecido:
      corpo.idioma !== undefined && idiomaConhecido === undefined
        ? { recebido: corpo.idioma }
        : null,
    /** O corpo e o assunto do EMAIL escritos à mão (os campos `corpo` e
     *  `assunto` do protocolo); o assunto só conta com o corpo. */
    textoDoEmail: texto(corpo.corpo) ?? null,
    assuntoDoEmail: texto(corpo.assunto) ?? null,
    /** A chave do modelo de que o corpo partiu, só para a CÓPIA do envio. */
    modelo: texto(corpo.modelo) ?? "",
    /** A chave do PDF final visto — a que a pré-visualização devolveu. */
    pdfVisto: texto(corpo.pdfVisto) ?? null,
    /** «Já sei que faltam N fotografias»: o NÚMERO que ela viu. */
    fotosEmFaltaConfirmadas: contagem(corpo.fotosEmFaltaConfirmadas) ?? null,
    /** «Já vi o que fica cortado»: só `true` conta. */
    cortesConfirmados: corpo.cortesConfirmados === true,
  };
}

/** O corpo já lido — o tipo sai da leitura. */
export type CorpoLido = ReturnType<typeof corpoLido>;

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
