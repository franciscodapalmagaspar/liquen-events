import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

/**
 * Remover uma marcação, como ela o faz desde 15/11: o toque na etiqueta abre o
 * DETALHE, e é lá dentro que está «Remover» — que abre a pergunta da casa.
 * Devolve a pergunta (o diálogo «Remover «…» do calendário?»).
 */
export async function abrirAPerguntaPeloDetalhe(
  user: ReturnType<typeof userEvent.setup>,
  marcacao: HTMLElement,
): Promise<HTMLElement> {
  await user.click(marcacao);
  const detalhe = await screen.findByRole("dialog");
  await user.click(within(detalhe).getByRole("button", { name: /^Remover$/ }));
  return screen.findByRole("dialog", { name: /^Remover «.*» do calendário\?$/ });
}
