import "server-only";
import { getState, setState } from "./app-state";
import { DEFAULT_VALID_DAYS } from "./proposal-doc";

/**
 * PREFERÊNCIAS DO ESTÚDIO — o que ela não quer voltar a escrever.
 *
 * Para já é uma só: os dias de validade. Palavras da missão — «validade com
 * valor por omissão configurável, para eu não escrever 30 sempre».
 *
 * ── Porque é que não é uma constante ──────────────────────────────────────
 * `DEFAULT_VALID_DAYS` está no código, e vale 60 — o máximo da regra dela de
 * 14/10, em que a validade depende de quanto falta para o evento
 * (`diasDeValidadePeloEvento`). Uma preferência guardada passa por cima da
 * regra em todas as propostas novas. Mudar a política da casa para outro número não pode obrigar a
 * um commit e a um deploy: na prática nunca mudaria, e ela continuaria a
 * corrigir o campo à mão em todas as propostas. Daí a preferência guardada,
 * que ganha à constante.
 *
 * A par desta decisão ficou a outra do mesmo documento: a confirmação do
 * número de convidados é pedida até **25 dias** antes da festa
 * (`DIAS_PARA_CONFIRMAR_CONVIDADOS`, em `proposal-doc.ts`). As duas vinham da
 * mesma folha e são as duas dela — ficam ditas juntas para não voltarem a
 * divergir.
 *
 * ── Onde ficam ────────────────────────────────────────────────────────────
 * Em `app_state`, como os rascunhos e os modelos, pela mesma razão: é uma
 * chave para um valor JSON e não obriga a correr SQL à mão numa instalação já
 * a funcionar.
 *
 * ── Nunca lança ───────────────────────────────────────────────────────────
 * Sem base de dados devolve o valor de sempre. Uma preferência que não se
 * consegue ler não pode impedir ninguém de escrever uma proposta.
 */

export interface PreferenciasProposta {
  /** Dias de validade por omissão nas propostas novas. */
  validUntilDays: number;
}

const CHAVE = "proposal-prefs";

/** Um ano é o tecto: acima disso é engano de dedo, não política. */
export const MAX_DIAS = 365;

export const PREFERENCIAS_POR_OMISSAO: PreferenciasProposta = {
  validUntilDays: DEFAULT_VALID_DAYS,
};

function saoValidas(v: unknown): PreferenciasProposta {
  if (!v || typeof v !== "object") return PREFERENCIAS_POR_OMISSAO;
  const dias = (v as PreferenciasProposta).validUntilDays;
  if (typeof dias !== "number" || !Number.isFinite(dias) || dias < 1 || dias > MAX_DIAS) {
    return PREFERENCIAS_POR_OMISSAO;
  }
  return { validUntilDays: Math.round(dias) };
}

export async function lerPreferencias(): Promise<PreferenciasProposta> {
  return saoValidas(await getState<unknown>(CHAVE));
}

export async function gravarPreferencias(
  p: Partial<PreferenciasProposta>,
): Promise<PreferenciasProposta> {
  // Para mudar: uma leitura falhada lança em vez de gravar as de omissão por
  // cima das dela (auditoria de 13/11).
  const atuais = saoValidas(await getState<unknown>(CHAVE, { ouFalha: true }));
  const proximas = saoValidas({ ...atuais, ...p });
  await setState(CHAVE, proximas);
  return proximas;
}
