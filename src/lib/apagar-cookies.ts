/**
 * Apaga cookies de terceiros (Google, Meta) quando a pessoa recusa ou retira o
 * consentimento (auditoria legal, 17/11).
 *
 * Um cookie só se apaga com o MESMO domínio com que foi escrito, e os
 * medidores escrevem no domínio de topo (`.liquen-events.com`). Por isso
 * tenta-se a forma sem domínio, o domínio da página e todos os que ficam acima
 * dele (sem o TLD sozinho); o que não existir é ignorado pelo browser.
 *
 * Nunca lança: sem acesso a cookies, não há nada a apagar.
 */
export function apagarCookies(casa: (nome: string) => boolean): void {
  try {
    const nomes = document.cookie
      .split(";")
      .map((p) => p.split("=")[0]?.trim() ?? "")
      .filter((n) => n && casa(n));
    if (!nomes.length) return;
    const partes = location.hostname.split(".");
    const dominios: (string | null)[] = [null];
    for (let i = 0; i < partes.length - 1; i++) dominios.push(partes.slice(i).join("."));
    for (const nome of nomes) {
      for (const d of dominios) {
        document.cookie = `${nome}=; max-age=0; path=/${d ? `; domain=.${d}` : ""}`;
      }
    }
  } catch {
    /* sem cookies — nada a apagar */
  }
}
