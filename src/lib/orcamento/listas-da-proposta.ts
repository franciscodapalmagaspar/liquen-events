import { todosOsValores } from "@/lib/fronteira/todos-os-valores";
import type { MotivoDeRecusa, ProposalStatus } from "./types";
import type { VersaoEscolhida } from "./versoes-da-proposta";
import type { TipoModelo } from "@/lib/proposal-templates";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * As listas fechadas da proposta, UMA vez cada, presas aos tipos do domínio
 * (`fronteira/todos-os-valores.ts`: um valor a mais ou a menos não compila).
 *
 * Lidas pelas rotas que decidem (`api/propostas/[id]`) e pelos esquemas que
 * observam (`fronteira/corpos-das-rotas.ts`, `orcamento/envio/corpo-do-pedido.ts`):
 * duas listas para o mesmo estado eram duas regras à espera de discordar.
 * Sem zod e sem servidor — o browser pode lê-las.
 */
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
