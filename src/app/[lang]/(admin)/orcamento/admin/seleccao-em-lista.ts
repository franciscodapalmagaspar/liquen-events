/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESCOLHER VÁRIAS LINHAS COM ⇧ E ⌘ — A REGRA, SEM ECRÃ (BO 4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É a mesma regra que a grelha dos Temas já segue (`toggleAt`, em `Temas.tsx`),
 * tirada para fora para as Tarefas a poderem usar sem a escrever outra vez:
 *
 *  · clique com ⌘ (ou Ctrl), ou clique em modo de selecção: soma ou tira ESTA
 *    linha, e mais nenhuma;
 *  · ⇧+clique: estende da última linha tocada (a âncora) até esta. O sentido
 *    — marcar ou desmarcar — é o que a linha clicada vai passar a ser, que é
 *    o que qualquer gestor de ficheiros faz.
 *
 * A ordem é a do ECRÃ (as linhas à vista, de cima para baixo): um intervalo
 * entre duas linhas tem de apanhar as que estão entre elas no que se vê, e não
 * na ordem em que a lista veio do servidor.
 */
export function seleccionarComModificadores(
  antes: ReadonlySet<string>,
  ordem: readonly string[],
  id: string,
  ancora: string | null,
  estender: boolean,
): Set<string> {
  const depois = new Set(antes);
  const ate = ordem.indexOf(id);
  const de = ancora === null ? -1 : ordem.indexOf(ancora);
  if (estender && de >= 0 && ate >= 0 && de !== ate) {
    const ligar = !antes.has(id);
    for (let i = Math.min(de, ate); i <= Math.max(de, ate); i++) {
      if (ligar) depois.add(ordem[i]);
      else depois.delete(ordem[i]);
    }
    return depois;
  }
  if (depois.has(id)) depois.delete(id);
  else depois.add(id);
  return depois;
}
