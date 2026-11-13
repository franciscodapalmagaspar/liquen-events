/**
 * ── A ESCOLHA SEGUE A FOTOGRAFIA (auditoria de 13/11, estúdio n.º 8) ───────
 *
 * As fotografias escolhidas para «Mover para…» guardam POSIÇÕES
 * (`página:foto`). Arrastar, reordenar, apagar ou mover mudava as posições, e
 * as escolhas ficavam a apontar para outras fotografias — e «Mover para…»
 * levava as erradas. Cada escolha lembra-se do caminho da fotografia; quando
 * as posições mudam, vai atrás dela, e sai se ela já lá não está.
 */
export function seguirASeleccao(
  seleccionadas: ReadonlySet<string>,
  caminhoDe: ReadonlyMap<string, string>,
  boards: readonly { images: readonly (string | null | undefined)[] }[],
): { novas: Set<string>; caminhos: Map<string, string>; mudou: boolean } {
  const onde = new Map<string, string>();
  boards.forEach((b, bi) =>
    b.images.forEach((p, ii) => {
      if (typeof p === "string" && !onde.has(p)) onde.set(p, `${bi}:${ii}`);
    }),
  );
  const novas = new Set<string>();
  const caminhos = new Map<string, string>();
  let mudou = false;
  for (const k of seleccionadas) {
    const path = caminhoDe.get(k);
    const [b, i] = k.split(":").map(Number);
    if (path && boards[b]?.images[i] === path) {
      novas.add(k);
      caminhos.set(k, path);
      continue;
    }
    mudou = true;
    const nova = path ? onde.get(path) : undefined;
    if (nova && !novas.has(nova)) {
      novas.add(nova);
      caminhos.set(nova, path as string);
    }
  }
  return { novas, caminhos, mudou };
}
