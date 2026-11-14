import { resolveProposalMoney, type VatMode } from "../../proposal-doc";
import { round2 } from "../../money";

/**
 * Os valores das linhas como o estúdio os guarda — SEM IVA — a partir do que o
 * documento escreve e do modo (provado pelas contas em `verificar.ts`, ou
 * escolhido por ela no ecrã). Client-safe: o ecrã usa-a quando ela escolhe.
 *
 *  · «acrescer» (os valores do documento são sem IVA): passam tal e qual;
 *  · «incluido» (são com IVA): a base de cada um sai da regra da casa
 *    (`resolveProposalMoney`), e a soma das bases tem de ser a base da soma,
 *    ao cêntimo — duas linhas de 25,00 € com IVA dão 20,33 € + 20,33 € =
 *    40,66 €, mas os 50,00 € são 40,65 € sem IVA. Folga zero: o cêntimo que
 *    sobra (ou falta) vai para a ÚLTIMA linha normal com valor.
 *
 * Valores negativos (descontos) e `null` ficam `null`: o orçamento do estúdio
 * não tem linhas negativas.
 */
export function valoresSemIvaDasLinhas(
  escritos: readonly (number | null)[],
  normais: readonly boolean[],
  modo: VatMode,
  vatRate: number,
): (number | null)[] {
  const limpos = escritos.map((t) => (t !== null && t >= 0 ? t : null));
  if (modo === "acrescer") return limpos.map((t) => (t === null ? null : round2(t)));
  const baseDe = (g: number) =>
    resolveProposalMoney({ totalAmount: g, totalVatMode: "incluido", vatRate }).base;
  const out = limpos.map((t) => (t === null ? null : baseDe(t)));
  const idx = limpos
    .map((t, i) => i)
    .filter((i) => normais[i] && limpos[i] !== null && limpos[i]! > 0);
  if (idx.length) {
    const bruto = round2(idx.reduce((a, i) => a + limpos[i]!, 0));
    const somaDasBases = round2(idx.reduce((a, i) => a + out[i]!, 0));
    const resto = round2(baseDe(bruto) - somaDasBases);
    const ultima = idx[idx.length - 1];
    if (resto !== 0) out[ultima] = round2(out[ultima]! + resto);
  }
  return out;
}
