import "server-only";
import { z } from "zod";
import { getSupabase } from "./supabase";
import { isMissingTable } from "./repository";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CÓDIGOS CURTOS DAS PROPOSTAS, NA TABELA `ligacoes_de_proposta` (P7)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Até 18/11 viviam só no `app_state`, em dois espaços escritos sem transação
 * (o código → a proposta, e a proposta → o seu código atual). Ver
 * db/migracoes/20261118_p7_ligacoes_de_proposta.sql e o P7 de
 * docs/ESTRUTURA-DOS-DADOS.md.
 *
 * Estamos nos tempos (1) e (3) do P7: `proposta-link-curto.ts` escreve nos dois
 * sítios e lê daqui primeiro. O `app_state` continua completo e é a reserva:
 * por isso NADA aqui lança, e `undefined` quer dizer «a tabela não sabe» (sem
 * base, tabela por criar, avaria, ou um código que ainda não foi copiado) —
 * quem chama vai ao `app_state`. Só um resultado da tabela conta como resposta.
 */

/** A forma de `proposals.id`: só esses podem ter linha (chave estrangeira). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uma linha da tabela, validada à entrada da aplicação. */
const linhaSchema = z.object({
  codigo: z.string(),
  proposal_id: z.string(),
  criada_em: z.string(),
  expira_em: z.string().nullable(),
  revogada_em: z.string().nullable(),
});

/** Um código, como a aplicação o usa. */
export interface LigacaoDaTabela {
  codigo: string;
  propostaId: string;
  criadaEm: string;
  expiraEm?: string;
  revogadaEm?: string;
}

const COLUNAS = "codigo, proposal_id, criada_em, expira_em, revogada_em";

function daLinha(dados: unknown): LigacaoDaTabela | undefined {
  const r = linhaSchema.safeParse(dados);
  if (!r.success) {
    log.warn("ligações de proposta: linha com forma inesperada — usa-se o app_state");
    return undefined;
  }
  const l = r.data;
  return {
    codigo: l.codigo,
    propostaId: l.proposal_id,
    criadaEm: l.criada_em,
    ...(l.expira_em ? { expiraEm: l.expira_em } : {}),
    ...(l.revogada_em ? { revogadaEm: l.revogada_em } : {}),
  };
}

function avisarAvaria(onde: string, erro: unknown): void {
  // Uma base onde a migração ainda não correu não é avaria: é o tempo antes.
  if (isMissingTable(erro)) return;
  log.warn(`ligações de proposta: ${onde} falhou — usa-se o app_state`, { erro: String(erro) });
}

/**
 * Grava um código novo e torna-o o atual da proposta, numa transação
 * (`gravar_ligacao_de_proposta`). `true` só se ficou gravado.
 */
export async function gravarLigacaoNaTabela(l: {
  codigo: string;
  propostaId: string;
  criadaEm: string;
  expiraEm: string;
}): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !UUID.test(l.propostaId)) return false;
  try {
    const { data, error } = await sb.rpc("gravar_ligacao_de_proposta", {
      p_codigo: l.codigo,
      p_proposal_id: l.propostaId,
      p_criada_em: l.criadaEm,
      p_expira_em: l.expiraEm,
    });
    if (error) throw error;
    return data === true;
  } catch (e) {
    avisarAvaria("a gravação", e);
    return false;
  }
}

/** O código, se a tabela o tiver. */
export async function lerLigacaoDaTabela(codigo: string): Promise<LigacaoDaTabela | undefined> {
  const sb = getSupabase();
  if (!sb) return undefined;
  try {
    const { data, error } = await sb
      .from("ligacoes_de_proposta")
      .select(COLUNAS)
      .eq("codigo", codigo)
      .maybeSingle();
    if (error) throw error;
    return data ? daLinha(data) : undefined;
  } catch (e) {
    avisarAvaria("a leitura de um código", e);
    return undefined;
  }
}

/** O código atual de uma proposta (o que o próximo envio reaproveita). */
export async function codigoAtualDaTabela(
  propostaId: string,
): Promise<LigacaoDaTabela | undefined> {
  const sb = getSupabase();
  if (!sb || !UUID.test(propostaId)) return undefined;
  try {
    const { data, error } = await sb
      .from("ligacoes_de_proposta")
      .select(COLUNAS)
      .eq("proposal_id", propostaId)
      .eq("atual", true)
      .maybeSingle();
    if (error) throw error;
    return data ? daLinha(data) : undefined;
  } catch (e) {
    avisarAvaria("a leitura do código atual", e);
    return undefined;
  }
}
