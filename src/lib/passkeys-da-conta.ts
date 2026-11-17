import "server-only";
import { cortePasskeys, registadaAntesDoCorte } from "./admin-auth";
import { listPasskeysFor, removePasskeyOwnedBy, type Passkey } from "./passkeys-store";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PASSKEYS DE UMA CONTA QUE AINDA VALEM (revisão de 16/11, n.º 2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Redefinir a palavra-passe pela recuperação fecha as passkeys dessa conta
 * registadas antes (`passkeyAindaVale`). Só que elas continuavam na lista, na
 * contagem do tecto de aparelhos e no `excludeCredentials` do registo — e o
 * aparelho, ao ver lá a credencial antiga, recusava registar-se outra vez
 * («já está registado»). Ela ficava sem maneira de voltar a usar o rosto.
 *
 * Aqui separam-se as duas, e as antigas apagam-se à primeira oportunidade (a
 * lista ou o pedido de registo). Já não abrem porta nenhuma, portanto apagá-las
 * não tira nada a ninguém; e um apagamento que falhe fica para a próxima vez.
 *
 * Se o corte não se conseguir ler, NÃO se apaga nada e a lista vem inteira:
 * apagar às cegas podia levar uma passkey boa.
 */
export async function passkeysDaConta(conta: string): Promise<Passkey[]> {
  const todas = await listPasskeysFor(conta);
  const corte = await cortePasskeys(conta);
  if (!corte.ok || corte.desde === null) return todas;
  const desde = corte.desde;

  const antigas = todas.filter((p) => registadaAntesDoCorte(p.createdAt, desde));
  for (const p of antigas) {
    try {
      // Só da própria conta — a mesma verificação de dono de sempre.
      await removePasskeyOwnedBy(p.id, conta);
    } catch (err) {
      log.warn("passkeys: não foi possível apagar uma passkey anterior à recuperação", {
        err: String(err),
      });
    }
  }
  if (antigas.length) {
    log.info("passkeys: apagadas as anteriores à recuperação", { conta, n: antigas.length });
  }
  return todas.filter((p) => !registadaAntesDoCorte(p.createdAt, desde));
}
