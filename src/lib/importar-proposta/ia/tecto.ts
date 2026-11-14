import "server-only";
import { gravarEstadoSeNaoMudou, lerEstadoComVersao } from "@/lib/app-state";
import { hojeNoEstudio } from "@/lib/fuso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TRAVÃO: NO MÁXIMO {@link MAX_IMPORTACOES_COM_IA_POR_MES} LEITURAS COM IA POR MÊS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Regra de custo (`.claude/rules/custo.md`): «todo o recurso pago por uso tem
 * de ter, no código, um travão». A conta: uma importação típica custa ~0,25 $
 * (ver o relatório no PR); 30 por mês são ~7,5 $ no pior caso — e as
 * propostas antigas são um arquivo finito, lido uma vez cada.
 *
 * O contador vive em `app_state`, uma linha por mês (`importar-com-ia:AAAA-MM`,
 * no fuso do estúdio), e RESERVA-SE antes de chamar: uma importação que falhe
 * a meio já gastou tokens e conta na mesma. A escrita é condicional (versão):
 * dois pedidos ao mesmo tempo não passam os dois com o último lugar.
 *
 * Se o contador não se consegue ler ou gravar, NÃO se chama a IA: sem saber
 * quantas já foram, o travão não trava.
 */
export const MAX_IMPORTACOES_COM_IA_POR_MES = 30;
/** A partir daqui o ecrã avisa que o tecto está perto. */
export const AVISO_A_PARTIR_DE = 24;

export function chaveDoMes(agora = new Date()): string {
  return `importar-com-ia:${hojeNoEstudio(agora).slice(0, 7)}`;
}

export type Reserva =
  | { ok: true; usadas: number; maximo: number }
  | { ok: false; motivo: "tecto" | "sem-contador"; usadas: number | null; maximo: number };

export async function reservarImportacaoComIa(
  agora = new Date(),
  maximo = MAX_IMPORTACOES_COM_IA_POR_MES,
): Promise<Reserva> {
  const chave = chaveDoMes(agora);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let lido: { valor: { usadas: number } | null; versao: string | null };
    try {
      lido = await lerEstadoComVersao<{ usadas: number }>(chave, 3000);
    } catch {
      return { ok: false, motivo: "sem-contador", usadas: null, maximo };
    }
    const usadas = Number(lido.valor?.usadas ?? 0);
    if (!Number.isFinite(usadas))
      return { ok: false, motivo: "sem-contador", usadas: null, maximo };
    if (usadas >= maximo) return { ok: false, motivo: "tecto", usadas, maximo };
    const r = await gravarEstadoSeNaoMudou(chave, { usadas: usadas + 1 }, lido.versao);
    if (r === "gravado") return { ok: true, usadas: usadas + 1, maximo };
    if (r === "falhou") return { ok: false, motivo: "sem-contador", usadas, maximo };
  }
  return { ok: false, motivo: "sem-contador", usadas: null, maximo };
}
