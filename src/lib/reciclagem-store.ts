import "server-only";
import { createRepository, type Mapper } from "./repository";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RECICLAGEM — onde fica, durante 30 dias, o que se apaga
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10: «tem que haver no site todo, em tudo aquilo que se
 * faz, uma forma de voltar atrás». Para apagar, escolheu «Reciclagem 30 dias»
 * (`docs/TUDO-REVERSIVEL.md`, fase R3).
 *
 * Cada linha é uma coisa apagada: o `retrato` guarda as linhas tal como
 * estavam — a principal e as que caíam com ela — para que «Repor» as grave de
 * volta com o MESMO id. O que se faz com cada tipo vive em `reciclagem.ts`.
 *
 * A tabela nasce de uma migração que ela aprova (`db/migracoes/
 * 20261010_r3_reciclagem.sql`). Até lá, quem chama trata a tabela em falta e
 * apaga como antes.
 */

export interface EntradaDaReciclagem {
  id: string;
  /** O tipo do que se apagou — ver `TIPOS` em `reciclagem.ts`. */
  tipo: string;
  /** O nome que ela reconhece na lista («Prova de bolo»). */
  rotulo: string;
  /** O id do que se apagou — o mesmo com que volta. */
  origemId: string;
  apagadoEm: string;
  apagadoPor?: string;
  /** As linhas apagadas, por grupo, na ordem em que se repõem. */
  retrato: Record<string, unknown>;
  /** Fotografias guardadas na Reciclagem (fase R3b); vazio por agora. */
  ficheiros: unknown[];
}

export const mapper: Mapper<EntradaDaReciclagem> = {
  table: "reciclagem",
  fileName: "reciclagem.json",
  getId: (e) => e.id,
  toRow: (e) => ({
    id: e.id,
    tipo: e.tipo,
    rotulo: e.rotulo,
    origem_id: e.origemId,
    apagado_em: e.apagadoEm,
    apagado_por: e.apagadoPor ?? null,
    retrato: e.retrato,
    ficheiros: e.ficheiros,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    tipo: String(r.tipo ?? ""),
    rotulo: String(r.rotulo ?? ""),
    origemId: String(r.origem_id ?? ""),
    apagadoEm: String(r.apagado_em ?? new Date().toISOString()),
    apagadoPor: typeof r.apagado_por === "string" ? r.apagado_por : undefined,
    retrato:
      r.retrato && typeof r.retrato === "object" ? (r.retrato as Record<string, unknown>) : {},
    ficheiros: Array.isArray(r.ficheiros) ? r.ficheiros : [],
  }),
  order: { column: "apagado_em", ascending: false },
  fileCompare: (a, b) => b.apagadoEm.localeCompare(a.apagadoEm),
};

const repo = createRepository(mapper);

export const listarReciclagem = (): Promise<EntradaDaReciclagem[]> => repo.list();
export const obterDaReciclagem = (id: string): Promise<EntradaDaReciclagem | null> => repo.get(id);
export const guardarNaReciclagem = (e: EntradaDaReciclagem): Promise<void> => repo.create(e);
export const tirarDaReciclagem = (id: string): Promise<void> => repo.remove(id);

/**
 * As entradas de um mesmo `origem_id` — sem ler a tabela inteira, que leva os
 * retratos de todas (revisão de 13/11: cada apagar de pedido lia tudo).
 */
export const entradasDe = (origemId: string): Promise<EntradaDaReciclagem[]> =>
  repo.where("origem_id", origemId, (e) => e.origemId === origemId);

/** Troca o retrato de uma entrada (o de um apagar que parou a meio). */
export const trocarRetrato = (
  id: string,
  retrato: EntradaDaReciclagem["retrato"],
): Promise<EntradaDaReciclagem | null> => repo.update(id, { retrato });

/**
 * Muda o retrato de uma entrada sobre a versão LIDA AGORA (`updateWith`, com o
 * bloqueio optimista). É o que usa quem tem de trocar referências lá dentro —
 * uma foto da Biblioteca que mudou de tema (`theme-materializar.ts`).
 */
export const actualizarRetrato = (
  id: string,
  mutate: (retrato: EntradaDaReciclagem["retrato"]) => EntradaDaReciclagem["retrato"],
): Promise<EntradaDaReciclagem | null> =>
  repo.updateWith(id, (e) => ({ ...e, retrato: mutate(e.retrato) }));
