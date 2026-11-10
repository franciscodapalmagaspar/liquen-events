import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS OPÇÕES DOS SENSORES DE ARRASTO, CRIADAS UMA VEZ (10/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «está a travar imenso e super pouco fluido» no «Fazer proposta».
 *
 * `useSensor(MouseSensor, { activationConstraint: { distance: 4 } })` escrito
 * assim cria um objecto de opções NOVO a cada desenho. O `useSensor` do
 * dnd-kit memoriza pelo objecto, o `useSensors` pelo resultado, e o
 * `DndContext` deriva dos sensores os «activators» do contexto interno — que
 * passava, portanto, a ser um contexto NOVO a cada desenho. Cada `useSortable`
 * lê esse contexto, e um contexto novo redesenha todos os que o lêem, por
 * cima de qualquer `memo`: as 96 células de foto de uma proposta com 8 páginas
 * redesenhavam-se a cada letra escrita numa descrição.
 *
 * Os valores são os mesmos de sempre; só deixam de nascer a cada desenho.
 */
export const RATO = { activationConstraint: { distance: 4 } } as const;
export const DEDO = { activationConstraint: { delay: 180, tolerance: 6 } } as const;
export const TECLADO_DE_LISTA = { coordinateGetter: sortableKeyboardCoordinates } as const;
