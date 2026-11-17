import "server-only";
import {
  type ProposalDoc,
  withProposalDefaults,
  resolveValidUntil,
  MAX_PROPOSAL_DOC_BYTES,
} from "@/lib/proposal-doc";
import { chaveDoPdf } from "@/lib/proposal-pdf-cache";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import type { DocumentoPreparado } from "./envio-da-proposta";

/**
 * Etapa 3 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): do documento que
 * chegou ao documento que se desenha. Pura — não lê nem grava nada.
 */
export type { DocumentoPreparado };

export interface DocumentoDoEnvio {
  /** A chave do que foi visto — ver a nota longa em {@link prepararODocumento}. */
  chaveDoQueChegou: string;
  /** O documento com os textos da casa e a validade já escrita lá dentro. */
  doc: DocumentoPreparado;
  /** `true` quando passa o tecto de {@link MAX_PROPOSAL_DOC_BYTES} (→ 413). */
  grandeDemais: boolean;
}

export function prepararODocumento(raw: ProposalDoc, idioma: IdiomaDaProposta): DocumentoDoEnvio {
  /**
   * ── A CHAVE DO QUE FOI VISTO ─────────────────────────────────────────
   *
   * Pedido dela: antes de enviar, alguém tem de VER o PDF final e dizer que
   * está tudo certo. A pré-visualização final devolve esta chave; o envio
   * tem de trazer a mesma. Calcula-se sobre o documento TAL COMO CHEGOU —
   * antes dos textos da casa e da validade que esta rota lhe escreve — e
   * sem as `fotosDeBiblioteca`, que só o envio manda. Mudar uma vírgula
   * depois de ver muda a chave, e o envio é recusado.
   */
  const { fotosDeBiblioteca: _origens, ...semOrigens } = raw;
  const chaveDoQueChegou = chaveDoPdf(semOrigens as ProposalDoc, idioma);

  // Fill the studio's fixed boilerplate (condições, observações, faseamento,
  // cancelamento) + event-token substitution so the UI only sends what varies.
  const doc = withProposalDefaults(raw);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * A VALIDADE CONGELA-SE AQUI, DENTRO DO DOCUMENTO
   * ══════════════════════════════════════════════════════════════════════
   *
   * O estúdio escreve o PRAZO («válida por 60 dias»), não a data. A data era
   * calculada em dois sítios separados — aqui, para a coluna
   * `proposals.valid_until`, e outra vez DENTRO do desenhador
   * (`resolveValidUntil(doc)`, em `proposal-doc-pdf.ts`) — e o desenhador
   * corre outra vez a CADA descarga do PDF pelo link do casal.
   *
   * MEDIDO: proposta enviada a 20-06-2026 grava `valid_until = 2026-08-19`;
   * o mesmo PDF, descarregado pelo link a 20-08-2026, imprime «válida até 19
   * de outubro de 2026». **Mais 61 dias, e mais um por cada dia que passa.**
   * O casal ficava com dois PDF do mesmo documento a dizer coisas
   * diferentes — o anexo do email e o do link —, e a página a marcar
   * «expirada» com um botão ao lado a entregar um PDF que dizia o contrário.
   *
   * A correcção é a mesma que o `kmDeslocacao` já usa e explica: o que é um
   * FACTO deste documento escreve-se DENTRO dele, e a partir daí mudar o
   * relógio deixa de lhe tocar. `resolveValidUntil` honra uma data explícita
   * no `doc`, portanto isto é idempotente: quem redesenhar amanhã, ou daqui
   * a um ano, obtém exactamente a mesma folha.
   *
   * É escrito ANTES de o PDF ser desenhado, de propósito: assim o anexo que
   * segue no email e o documento que fica guardado são o mesmo, por
   * construção, e não por coincidência de terem sido feitos no mesmo minuto.
   */
  const preparado: DocumentoPreparado = Object.assign(doc, { validUntil: resolveValidUntil(doc) });

  // O documento passou a ser GUARDADO (coluna `proposals.doc`), por isso o
  // tamanho deixou de ser um detalhe do pedido e passou a ser uma linha na
  // base de dados e uma linha na cópia de segurança. Medido: 4,3 KB de texto
  // fixo, 18,5 KB no tecto de 80 fotos — 512 KB é ~28× isso, e é o mesmo teto
  // que o rascunho já recusava. Recusa-se ANTES de desenhar o PDF: um
  // documento absurdo não vale o trabalho de sharp/pdf-lib.
  const grandeDemais = JSON.stringify(preparado).length > MAX_PROPOSAL_DOC_BYTES;

  return { chaveDoQueChegou, doc: preparado, grandeDemais };
}
