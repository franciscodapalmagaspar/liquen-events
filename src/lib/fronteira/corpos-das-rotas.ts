import "server-only";
import { z } from "zod";
import {
  esquemaDoDocumentoQueChega,
  esquemaDoGrupoDeServicos,
  esquemaDoMoodBoard,
} from "./documento-da-proposta";
import {
  ESTADOS_DA_PROPOSTA,
  MOTIVOS_DE_RECUSA,
  TIPOS_DE_MODELO,
  VERSOES_ESCOLHIDAS,
} from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CORPOS DAS ROTAS QUE GRAVAM O TRABALHO DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 6 de `docs/ESTRUTURA-DO-CODIGO.md`, ponto 3: «as rotas sem esquema, por
 * ordem de risco (as que escrevem primeiro)». Estas são as que gravam o que a
 * Catarina faz à mão — o rascunho do estúdio, o estado de uma proposta, os
 * modelos de email e os modelos de proposta. (O corpo do envio da proposta
 * vive com a sua etapa, em `orcamento/envio/esquema-do-corpo.ts`.)
 *
 * Todas em MODO DE OBSERVAR (`observar.ts`): a rota continua a decidir com as
 * verificações que já tinha, e o esquema só diz o que não bate. Cada esquema
 * descreve o que o ecrã manda HOJE, com os vazios que ele manda de facto (um
 * `""` para limpar, um `null` para apagar) — a regra de todos os esquemas
 * desta casa está em `observar.ts`, «o que um esquema destes descreve».
 */

/**
 * `PUT /api/orcamento/[id]/proposta-rascunho` — a gravação automática do
 * estúdio (`lib/orcamento/estudio/gravar.ts`) e a importação de propostas.
 * O documento é o do estúdio A MEIO de ser escrito: a referência e os nomes
 * ainda podem não existir.
 */
export const esquemaDoCorpoDoRascunho = z.looseObject({
  doc: esquemaDoDocumentoQueChega.partial({ ref: true, clientNames: true }),
  baseUpdatedAt: z.string().nullable(),
  campos: z.array(z.string()).optional(),
  base: z.looseObject({}).optional(),
});

/** Um texto, ou o vazio/`null` com que o ecrã limpa o campo. */
const textoOuLimpo = z.string().nullable().optional();

/**
 * `PATCH /api/propostas/[id]` — o estado de uma proposta (Propostas,
 * Acompanhamento, Quadro). As listas fechadas são as da rota; o vazio limpa.
 */
export const esquemaDoCorpoDaProposta = z.looseObject({
  status: z.enum(ESTADOS_DA_PROPOSTA).optional(),
  respondedAt: textoOuLimpo,
  followUpAt: textoOuLimpo,
  followUpNote: textoOuLimpo,
  lostReason: z
    .union([z.enum(MOTIVOS_DE_RECUSA), z.literal("")])
    .nullable()
    .optional(),
  lostNote: textoOuLimpo,
  versaoEscolhida: z
    .union([z.enum(VERSOES_ESCOLHIDAS), z.literal("")])
    .nullable()
    .optional(),
  actor: z.string().optional(),
});

/** `POST`/`PUT /api/email-templates` — um modelo de email dela. */
export const esquemaDoCorpoDoModeloDeEmail = z.looseObject({
  key: z.string(),
  name: z.string(),
  subject: z.string(),
  body: z.string().optional(),
});

/**
 * `POST /api/propostas/modelos` — um modelo de proposta: o documento inteiro,
 * um grupo de serviços, ou um mood board.
 */
export const esquemaDoCorpoDoModeloDeProposta = z.looseObject({
  id: z.string().optional(),
  nome: z.string(),
  tipo: z.enum(TIPOS_DE_MODELO),
  origem: z.string().optional(),
  doc: esquemaDoDocumentoQueChega.partial({ ref: true, clientNames: true }).optional(),
  grupo: esquemaDoGrupoDeServicos.optional(),
  moodboard: esquemaDoMoodBoard.optional(),
});
