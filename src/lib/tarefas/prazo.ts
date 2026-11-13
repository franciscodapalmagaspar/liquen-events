/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PRAZO DE UMA TAREFA É UM DIA — A HORA VAI NO TÍTULO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Confirmar florista amanhã às 10h» gravava `dueDate: "2026-11-13T10:00"`.
 * Tudo o que lê o prazo compara-o como um DIA (`"2026-11-13T10:00" <= hoje`
 * é falso no próprio dia, porque a string é mais comprida): a tarefa saía de
 * «Hoje», caía em «Semana», a linha do pedido mostrava «Invalid Date», e a
 * coluna `tasks.due_date` é `date` — ao recarregar, a hora tinha desaparecido.
 *
 * Sem mexer na base de dados (não há coluna para a hora), a hora fica onde já
 * se guarda texto e onde ela a vê sempre: no TÍTULO, como ela a escreveria —
 * «Confirmar florista às 10h». O prazo fica um dia, igual em todo o lado.
 *
 * Usado no ecrã (`Tarefas.tsx`, ao criar) e na rota (`/api/tarefas`), para um
 * prazo com hora vindo de outro sítio ficar gravado da mesma maneira.
 */

const COM_HORA = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/;

/** «10:00» → «10h», «10:30» → «10h30». */
export function horaPorExtenso(hora: string): string {
  const [h, m] = hora.split(":");
  return m && m !== "00" ? `${Number(h)}h${m}` : `${Number(h)}h`;
}

/** Só o dia de um prazo, com ou sem hora agarrada. */
export function diaDoPrazo(prazo: string | undefined | null): string {
  if (!prazo) return "";
  const m = COM_HORA.exec(prazo);
  return m ? m[1] : prazo;
}

/**
 * O título e o prazo a gravar. Um prazo com hora («2026-11-13T10:00») passa a
 * dia, e a hora junta-se ao título — a não ser que o título já a diga.
 */
export function tituloEPrazo(
  titulo: string,
  prazo: string | undefined | null,
): { title: string; dueDate: string | undefined } {
  if (!prazo) return { title: titulo, dueDate: undefined };
  const m = COM_HORA.exec(prazo);
  if (!m) return { title: titulo, dueDate: prazo };
  const hora = horaPorExtenso(`${m[2]}:${m[3]}`);
  const jaDiz = new RegExp(`(^|\\D)${hora}(?!\\d)`).test(titulo);
  return { title: jaDiz ? titulo : `${titulo} às ${hora}`, dueDate: m[1] };
}
