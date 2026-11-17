import type { AccaoDeItem } from "../ui";
import { CaixoteIcon, LapisIcon, RelogioIcon, SetaBaixoIcon, SetaIcon, VistoIcon } from "./icones";
import type { PropsDaLinha } from "./TaskRow.props";

/**
 * As acções do menu «⋯» de uma linha (`TaskRow`), pela ordem do menu. A razão
 * de cada uma está escrita no `TaskRow.tsx`, por cima do `MenuDeAccoes`.
 */
export function accoesDaLinha({
  t,
  arrastavel,
  onEdit,
  onToggle,
  onPrazo,
  onMover,
  onRemove,
}: Pick<
  PropsDaLinha,
  "t" | "arrastavel" | "onEdit" | "onToggle" | "onPrazo" | "onMover" | "onRemove"
>): AccaoDeItem[] {
  return [
    ...(t.done
      ? []
      : [
          {
            id: "editar",
            rotulo: "Editar tarefa",
            icone: LapisIcon,
            onAccao: () => onEdit(t),
          } satisfies AccaoDeItem,
        ]),
    {
      id: "concluir",
      // Um item comutável com o rótulo variável, e nunca dois itens.
      // [APPLE, 9.7]
      rotulo: t.done ? "Voltar a abrir" : "Marcar como concluída",
      icone: VistoIcon,
      onAccao: () => onToggle(t),
    },
    ...(t.done
      ? []
      : (
          [
            { id: "hoje", rotulo: "Hoje", icone: RelogioIcon, quando: "hoje" },
            { id: "amanha", rotulo: "Amanhã", icone: RelogioIcon, quando: "amanha" },
          ] as const
        ).map(
          (a) =>
            ({
              id: a.id,
              rotulo: a.rotulo,
              icone: a.icone,
              onAccao: () => onPrazo(t, a.quando),
            }) satisfies AccaoDeItem,
        )),
    /* ── A ALTERNATIVA AO ARRASTO ─────────────────────────────────
       «Oferece sempre alternativa por menu ou teclado. Arrastar nunca
       é o único caminho.» [APPLE] Só aparecem com a ordenação
       «Manual», que é a única em que reordenar quer dizer alguma
       coisa — noutra ordem, mover uma linha para cima era uma ordem
       que o `sort` seguinte desfazia à frente dela. */
    ...(arrastavel
      ? ([
          {
            id: "subir",
            rotulo: "Mover para cima",
            icone: SetaIcon,
            onAccao: () => onMover(t.id, -1),
          },
          {
            id: "descer",
            rotulo: "Mover para baixo",
            icone: SetaBaixoIcon,
            onAccao: () => onMover(t.id, 1),
          },
        ] satisfies AccaoDeItem[])
      : []),
    {
      id: "eliminar",
      rotulo: "Eliminar",
      icone: CaixoteIcon,
      destrutiva: true,
      onAccao: () => onRemove(t.id),
    },
  ];
}
