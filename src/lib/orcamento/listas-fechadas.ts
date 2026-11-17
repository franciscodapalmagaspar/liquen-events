import { todosOsValores } from "@/lib/todos-os-valores";
import type { MotivoDeRecusa, ProposalStatus, QuoteStatus } from "./types";
import type { VersaoEscolhida } from "./versoes-da-proposta";
import type { TipoModelo } from "@/lib/proposal-templates";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * As listas fechadas do pedido e da proposta, UMA vez cada, presas aos tipos
 * do domínio (`lib/todos-os-valores.ts`: um valor a mais ou a menos não
 * compila).
 *
 * Lidas pelas rotas que decidem (`api/propostas/[id]`, `api/propostas/modelos`,
 * a análise das propostas), pelos esquemas que observam (`lib/fronteira/`,
 * `orcamento/envio/esquema-do-corpo.ts`) e pelas regras que validam o que
 * chega (`ehIdiomaDaProposta`, que a leitura do corpo usa): duas listas para o
 * mesmo estado eram duas regras à espera de discordar. AINDA têm cópias próprias `validation.ts` e
 * `backup-restore.ts` (ambos acima do tecto da catraca: partem-se primeiro —
 * `docs/ESTRUTURA-DO-CODIGO.md`, Parte −1, desvio 7). Quem acrescentar um
 * valor aqui acrescenta-o lá também, até lá.
 * Sem zod e sem servidor — o browser pode lê-las.
 */
export const ESTADOS_DO_PEDIDO = todosOsValores<QuoteStatus>()([
  "pendente",
  "em_revisao",
  "a_preparar",
  "cotado",
  "aceite",
  "rejeitado",
]);

export const ESTADOS_DA_PROPOSTA = todosOsValores<ProposalStatus>()([
  "rascunho",
  "enviada",
  "em_negociacao",
  "aceite",
  "rejeitada",
]);

/** Lista fechada e contável — a razão está em `MotivoDeRecusa`. */
export const MOTIVOS_DE_RECUSA = todosOsValores<MotivoDeRecusa>()([
  "preco",
  "data",
  "escolheram-outro",
  "sem-resposta",
  "outro",
]);

export const VERSOES_ESCOLHIDAS = todosOsValores<VersaoEscolhida>()(["base", "extras"]);

export const TIPOS_DE_MODELO = todosOsValores<TipoModelo>()(["completo", "grupo", "moodboard"]);

export const IDIOMAS_DA_PROPOSTA = todosOsValores<IdiomaDaProposta>()(["pt", "en"]);

/** `true` para o que é mesmo uma das línguas — para validar o que chega de
 *  fora (o corpo do envio, o rascunho, o link do casal). Lê a lista acima: uma
 *  língua nova acrescenta-se uma vez. (`proposal-doc-textos.ts` reexporta-a.) */
export function ehIdiomaDaProposta(v: unknown): v is IdiomaDaProposta {
  return (IDIOMAS_DA_PROPOSTA as readonly unknown[]).includes(v);
}
